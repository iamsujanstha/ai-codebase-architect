import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EVENT_PUBLISHER_TOKEN } from '../messaging/contracts/event-publisher.interface';
import type { IEventPublisher } from '../messaging/contracts/event-publisher.interface';
import type { EventEnvelope } from '../messaging/contracts/event-envelope.interface';
import { ORDER_PAID_EVENT_TYPE } from '../messaging/contracts/event-types';
import { ORDER_PAID_SCHEMA_VERSION } from './interfaces/order-paid-event.constants';
import {
  IPaymentsRepository,
  PAYMENTS_REPOSITORY_TOKEN,
} from './repositories/payments.repository.interface';

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisher.name);
  private static readonly POLL_INTERVAL_MS = 5_000;
  private static readonly PROCESSING_LEASE_MS = 5 * 60 * 1_000;
  private static readonly BATCH_SIZE = 10;
  private static readonly BACKOFF_BASE_MS = 1_000;
  private static readonly BACKOFF_JITTER_RATIO = 0.2;

  private pollTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isShuttingDown = false;
  private activePollCompletion: Promise<void> | null = null;
  private resolveActivePoll: (() => void) | null = null;

  constructor(
    @Inject(PAYMENTS_REPOSITORY_TOKEN)
    private readonly paymentsRepo: IPaymentsRepository,
    @Inject(EVENT_PUBLISHER_TOKEN)
    private readonly eventPublisher: IEventPublisher,
  ) {}

  onModuleInit(): void {
    this.logger.log('Outbox publisher started');
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
      OutboxPublisher.POLL_INTERVAL_MS,
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
    } catch (error: unknown) {
      this.logger.error({
        event: 'outbox_poll_error',
        error: error instanceof Error ? error.message : String(error),
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
      OutboxPublisher.BATCH_SIZE,
      now,
      new Date(now.getTime() - OutboxPublisher.PROCESSING_LEASE_MS),
    );

    if (events.length === 0) return;
    this.logger.debug({ event: 'outbox_batch_claimed', count: events.length });

    for (const event of events) await this.publishEvent(event);
  }

  private async publishEvent(event: {
    id: number;
    aggregate_id: string;
    event_type: string;
    payload: unknown;
    created_at: Date | string;
    attempts: number;
    max_attempts: number;
    claim_token: string;
  }): Promise<void> {
    try {
      if (event.event_type !== ORDER_PAID_EVENT_TYPE) {
        throw new Error(
          `No RabbitMQ route for event type: ${event.event_type}`,
        );
      }

      const envelope: EventEnvelope = {
        eventId: event.id,
        eventType: event.event_type,
        aggregateId: event.aggregate_id,
        schemaVersion: ORDER_PAID_SCHEMA_VERSION,
        occurredAt: new Date(event.created_at).toISOString(),
        payload: event.payload,
      };
      await this.eventPublisher.publish(envelope);
      await this.paymentsRepo.markOutboxEventPublished(
        event.id,
        event.claim_token,
      );

      this.logger.log({
        event: 'outbox_event_published',
        eventId: event.id,
        eventType: event.event_type,
        aggregateId: event.aggregate_id,
        attempt: event.attempts,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const isDead = event.attempts >= event.max_attempts;

      if (isDead) {
        await this.paymentsRepo.deadLetterOutboxEvent(
          event.id,
          event.claim_token,
          message,
        );
        this.logger.error({
          event: 'outbox_event_dead_lettered',
          eventId: event.id,
          eventType: event.event_type,
          aggregateId: event.aggregate_id,
          attempts: event.attempts,
          lastError: message,
          action: 'MANUAL_INTERVENTION_REQUIRED',
        });
        return;
      }

      const exponentialBackoffMs =
        OutboxPublisher.BACKOFF_BASE_MS * 2 ** (event.attempts - 1);
      const jitterMs = Math.floor(
        exponentialBackoffMs *
          OutboxPublisher.BACKOFF_JITTER_RATIO *
          Math.random(),
      );
      const backoffMs = exponentialBackoffMs - jitterMs;
      const nextAttemptAt = new Date(Date.now() + backoffMs);
      await this.paymentsRepo.scheduleOutboxEventRetry(
        event.id,
        event.claim_token,
        nextAttemptAt,
        message,
      );
      this.logger.warn({
        event: 'outbox_event_retry_scheduled',
        eventId: event.id,
        eventType: event.event_type,
        aggregateId: event.aggregate_id,
        attempt: event.attempts,
        nextAttemptAt: nextAttemptAt.toISOString(),
        error: message,
      });
    }
  }
}
