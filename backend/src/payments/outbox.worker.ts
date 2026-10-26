import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import {
  IPaymentsRepository,
  PAYMENTS_REPOSITORY_TOKEN,
} from './repositories/payments.repository.interface';

/**
 * OutboxWorker — Guaranteed at-least-once delivery of payment side-effects.
 *
 * WHY THIS EXISTS:
 * ─────────────────────────────────────────────────────────────────────────
 * The outbox pattern solves the dual-write problem in distributed systems.
 *
 * Without it, markOrderAsPaid() did:
 *   1. UPDATE orders SET status = 'paid'  ← commits to Postgres
 *   2. UPDATE products SET stock = ...    ← separate call, can fail
 *   3. sendOrderConfirmation()            ← external SMTP, can fail
 *
 * If step 2 or 3 failed after step 1 committed, the payment was confirmed
 * but the customer never got an email and inventory was never decremented.
 * Silent, unrecoverable data loss.
 *
 * With the outbox pattern:
 *   Step 1 + writing to outbox_events happen in ONE Prisma transaction.
 *   This worker then executes steps 2 and 3 with retry, independently.
 *   If they fail, this worker retries up to max_attempts times.
 *   If they permanently fail, the event is dead-lettered and alerted.
 *
 * DELIVERY GUARANTEE:
 *   At-least-once. Side effects (email, inventory) may fire more than once
 *   if the worker crashes mid-flight after executing but before marking
 *   as processed. All side-effects MUST be idempotent.
 *
 * POLLING vs STREAMING:
 *   We poll Postgres every 5 seconds using SKIP LOCKED instead of Kafka/BullMQ.
 *   This is the right call at current scale. Kafka adds infra overhead that
 *   is not justified until we need cross-service event replay or >100k events/day.
 *   See: docs/architecture/adr/013-outbox-pattern-for-payment-events.md
 */
@Injectable()
export class OutboxWorker implements OnModuleInit {
  private readonly logger = new Logger(OutboxWorker.name);
  private readonly POLL_INTERVAL_MS = 5_000;
  private readonly BATCH_SIZE = 10;
  private readonly BACKOFF_BASE_MS = 1_000; // 1s → 2s → 4s → 8s → 16s

  private pollTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    @Inject(PAYMENTS_REPOSITORY_TOKEN)
    private readonly paymentsRepo: IPaymentsRepository,
    private readonly mailService: MailService,
  ) {}

  onModuleInit(): void {
    this.logger.log('OutboxWorker started — polling every 5s');
    this.schedulePoll();
  }

  private schedulePoll(): void {
    this.pollTimer = setTimeout(() => void this.poll(), this.POLL_INTERVAL_MS);
  }

  private async poll(): Promise<void> {
    if (this.isRunning) {
      this.schedulePoll();
      return;
    }

    this.isRunning = true;
    try {
      await this.processBatch();
    } catch (err) {
      this.logger.error({
        event: 'outbox_poll_error',
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.isRunning = false;
      this.schedulePoll();
    }
  }

  private async processBatch(): Promise<void> {
    const now = new Date();
    const events = await this.paymentsRepo.claimPendingOutboxEvents(
      this.BATCH_SIZE,
      now,
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
  }): Promise<void> {
    await this.paymentsRepo.markOutboxEventProcessing(event.id);

    try {
      await this.dispatch(event.event_type, event.aggregate_id, event.payload);

      await this.paymentsRepo.markOutboxEventProcessed(
        event.id,
        event.attempts + 1,
      );

      this.logger.log({
        event: 'outbox_event_processed',
        eventType: event.event_type,
        aggregateId: event.aggregate_id,
        attempt: event.attempts + 1,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const nextAttempt = event.attempts + 1;
      const isDead = nextAttempt >= event.max_attempts;

      if (isDead) {
        await this.paymentsRepo.deadLetterOutboxEvent(
          event.id,
          nextAttempt,
          message,
        );

        // ALERT: dead-lettered payment events require manual investigation.
        this.logger.error({
          event: 'outbox_event_dead_lettered',
          eventType: event.event_type,
          aggregateId: event.aggregate_id,
          attempts: nextAttempt,
          lastError: message,
          action: 'MANUAL_INTERVENTION_REQUIRED',
        });
      } else {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        const backoffMs = this.BACKOFF_BASE_MS * Math.pow(2, event.attempts);
        const nextAttemptAt = new Date(Date.now() + backoffMs);

        await this.paymentsRepo.scheduleOutboxEventRetry(
          event.id,
          nextAttempt,
          nextAttemptAt,
          message,
        );

        this.logger.warn({
          event: 'outbox_event_retry_scheduled',
          eventType: event.event_type,
          aggregateId: event.aggregate_id,
          attempt: nextAttempt,
          nextAttemptAt: nextAttemptAt.toISOString(),
          error: message,
        });
      }
    }
  }

  /**
   * Dispatch routes event_type to its handler.
   *
   * IDEMPOTENCY CONTRACT:
   * Every handler MUST be safe to call more than once for the same event.
   * The outbox guarantees at-least-once delivery, not exactly-once.
   */
  private async dispatch(
    eventType: string,
    aggregateId: string,
    payload: unknown,
  ): Promise<void> {
    switch (eventType) {
      case 'order.paid':
        await this.handleOrderPaid(
          aggregateId,
          payload as OrderPaidPayload,
        );
        break;

      default:
        throw new Error(`No handler for event type: ${eventType}`);
    }
  }

  private async handleOrderPaid(
    orderNumber: string,
    payload: OrderPaidPayload,
  ): Promise<void> {
    this.logger.log({ event: 'outbox_handling_order_paid', orderNumber });

    // 1. Decrement inventory (idempotent via GREATEST(0, ...))
    if (payload.items?.length) {
      const stockItems = payload.items
        .map((item) => ({
          productId: parseInt(item.productId, 10),
          quantity: item.quantity,
        }))
        .filter((item) => !isNaN(item.productId));

      await this.paymentsRepo.decrementProductStock(stockItems);
    }

    // 2. Send confirmation email
    if (payload.customerEmail) {
      await this.mailService.sendOrderConfirmation({
        orderNumber,
        customer: {
          email: payload.customerEmail,
          name: payload.customerName,
        },
        pricing: {
          total: payload.pricingTotal,
          currency: payload.pricingCurrency,
        },
        items: payload.items,
        paymentProvider: payload.provider,
        paidAt: new Date(),
      });
    }
  }
}

interface OrderPaidPayload {
  orderNumber: string;
  userId: string | null;
  provider: string;
  providerReference: string | null;
  paymentReference: string | null;
  customerEmail: string;
  customerName: string;
  pricingTotal: number;
  pricingCurrency: string;
  items: Array<{ productId: string; name: string; quantity: number }>;
  note: string;
}
