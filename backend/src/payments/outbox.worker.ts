import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import type { OrderConfirmationEmail } from '../mail/interfaces/order-confirmation.interface';
import {
  IPaymentsRepository,
  PAYMENTS_REPOSITORY_TOKEN,
} from './repositories/payments.repository.interface';

// WHY: Durable claims survive process exit; in-memory retries do not.
@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private static readonly POLL_INTERVAL_MS = 5_000;
  private static readonly PROCESSING_LEASE_MS = 5 * 60 * 1_000;
  private static readonly BATCH_SIZE = 10;
  private static readonly BACKOFF_BASE_MS = 1_000;

  private pollTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isShuttingDown = false;
  private activePollCompletion: Promise<void> | null = null;
  private resolveActivePoll: (() => void) | null = null;

  constructor(
    @Inject(PAYMENTS_REPOSITORY_TOKEN)
    private readonly paymentsRepo: IPaymentsRepository,
    private readonly mailService: MailService,
  ) {}

  onModuleInit(): void {
    this.logger.log('OutboxWorker started');
    this.schedulePoll();
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    await this.activePollCompletion;
  }

  private schedulePoll(): void {
    if (this.isShuttingDown) return;
    this.pollTimer = setTimeout(
      () => void this.poll(),
      OutboxWorker.POLL_INTERVAL_MS,
    );
  }

  private async poll(): Promise<void> {
    if (this.isRunning) {
      this.schedulePoll();
      return;
    }
    if (this.isShuttingDown) return;

    this.isRunning = true;
    this.activePollCompletion = new Promise<void>((resolve) => {
      this.resolveActivePoll = resolve;
    });
    try {
      await this.processBatch();
    } catch (err) {
      this.logger.error({
        event: 'outbox_poll_error',
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.isRunning = false;
      this.resolveActivePoll?.();
      this.resolveActivePoll = null;
      this.activePollCompletion = null;
      this.schedulePoll();
    }
  }

  private async processBatch(): Promise<void> {
    const now = new Date();
    const events = await this.paymentsRepo.claimPendingOutboxEvents(
      OutboxWorker.BATCH_SIZE,
      now,
      new Date(now.getTime() - OutboxWorker.PROCESSING_LEASE_MS),
    );

    if (events.length === 0) return;

    this.logger.debug({ event: 'outbox_batch_claimed', count: events.length });

    for (const event of events) {
      await this.processEvent(event);
    }
  }

  private async processEvent(event: {
    id: number;
    aggregate_id: string;
    event_type: string;
    payload: unknown;
    attempts: number;
    max_attempts: number;
    claim_token: string;
  }): Promise<void> {
    try {
      await this.dispatch(
        event.id,
        event.event_type,
        event.aggregate_id,
        event.payload,
      );

      await this.paymentsRepo.markOutboxEventProcessed(
        event.id,
        event.claim_token,
      );

      this.logger.log({
        event: 'outbox_event_processed',
        eventType: event.event_type,
        aggregateId: event.aggregate_id,
        attempt: event.attempts,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isDead = event.attempts >= event.max_attempts;

      if (isDead) {
        await this.paymentsRepo.deadLetterOutboxEvent(
          event.id,
          event.claim_token,
          message,
        );

        // ALERT: dead-lettered payment events require manual investigation.
        this.logger.error({
          event: 'outbox_event_dead_lettered',
          eventType: event.event_type,
          aggregateId: event.aggregate_id,
          attempts: event.attempts,
          lastError: message,
          action: 'MANUAL_INTERVENTION_REQUIRED',
        });
      } else {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        const backoffMs =
          OutboxWorker.BACKOFF_BASE_MS * 2 ** (event.attempts - 1);
        const nextAttemptAt = new Date(Date.now() + backoffMs);

        await this.paymentsRepo.scheduleOutboxEventRetry(
          event.id,
          event.claim_token,
          nextAttemptAt,
          message,
        );

        this.logger.warn({
          event: 'outbox_event_retry_scheduled',
          eventType: event.event_type,
          aggregateId: event.aggregate_id,
          attempt: event.attempts,
          nextAttemptAt: nextAttemptAt.toISOString(),
          error: message,
        });
      }
    }
  }

  private async dispatch(
    eventId: number,
    eventType: string,
    aggregateId: string,
    payload: unknown,
  ): Promise<void> {
    switch (eventType) {
      case 'order.paid':
        await this.handleOrderPaid(
          eventId,
          aggregateId,
          payload as OrderPaidPayload,
        );
        break;

      default:
        throw new Error(`No handler for event type: ${eventType}`);
    }
  }

  private async handleOrderPaid(
    eventId: number,
    orderNumber: string,
    payload: OrderPaidPayload,
  ): Promise<void> {
    const orderConfirmation: OrderConfirmationEmail = {
      orderNumber,
      paymentProvider: payload.provider,
      paymentReference: payload.paymentReference,
      paidAt: payload.paidAt,
      customer: payload.customer,
      pricing: payload.pricing,
      items: payload.items,
    };
    this.logger.log({ event: 'outbox_handling_order_paid', orderNumber });

    // WHY: Commit the marker with stock changes to prevent duplicate decrements.
    if (payload.items.length > 0) {
      const stockItems = payload.items
        .map((item) => ({
          productId: Number.parseInt(item.productId, 10),
          quantity: item.quantity,
        }))
        .filter((item) => Number.isFinite(item.productId));

      await this.paymentsRepo.decrementProductStock(eventId, stockItems);
    }

    await this.mailService.sendOrderConfirmation(orderConfirmation);
  }
}

interface OrderPaidPayload {
  orderNumber: string;
  provider: string;
  providerReference: string | null;
  paymentReference: string | null;
  paidAt: string;
  customer: OrderConfirmationEmail['customer'];
  pricing: OrderConfirmationEmail['pricing'];
  items: Array<{
    productId: string;
    name: string;
    quantity: number;
    unitAmount: number;
    lineTotal: number;
    currency: string;
  }>;
  note: string;
}
