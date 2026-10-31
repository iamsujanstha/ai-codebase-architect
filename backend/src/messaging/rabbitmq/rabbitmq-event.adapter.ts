import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import amqp, {
  type ChannelModel,
  type ConfirmChannel,
  type ConsumeMessage,
  type Message,
  type Options,
} from 'amqplib';
import { RABBITMQ_DEFAULTS, RABBITMQ_TOPOLOGY } from './rabbitmq.constants';
import type { EventEnvelope } from '../contracts/event-envelope.interface';
import { InvalidEventError } from '../contracts/invalid-event.error';
import type {
  EventHandler,
  IEventConsumer,
} from '../contracts/event-consumer.interface';
import type { IEventPublisher } from '../contracts/event-publisher.interface';

@Injectable()
export class RabbitMqEventAdapter
  implements IEventPublisher, IEventConsumer, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RabbitMqEventAdapter.name);
  private readonly url: string;
  private readonly queueType: 'classic' | 'quorum';
  private readonly handlers = new Map<string, EventHandler>();
  private readonly returnedPublishes = new Set<string>();

  private connection: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private isConnecting = false;

  constructor(config: ConfigService) {
    this.url = config.get<string>('RABBITMQ_URL') ?? 'amqp://localhost:5672';
    const queueType = config.get<string>('RABBITMQ_QUEUE_TYPE') ?? 'classic';
    if (queueType !== 'classic' && queueType !== 'quorum') {
      throw new Error('RABBITMQ_QUEUE_TYPE must be classic or quorum');
    }
    this.queueType = queueType;
  }

  onModuleInit(): void {
    void this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    await this.cleanup();
  }

  isAvailable(): boolean {
    return this.connection !== null && this.channel !== null;
  }

  registerHandler(eventType: string, handler: EventHandler): void {
    this.handlers.set(eventType, handler);
    if (this.channel) {
      void this.consumeQueue(this.channel);
    }
  }

  async publish(event: EventEnvelope): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not available');
    }

    const content = Buffer.from(JSON.stringify(event));
    await this.publishWithConfirm(
      RABBITMQ_TOPOLOGY.exchanges.events,
      event.eventType,
      content,
      {
        persistent: true,
        contentType: 'application/json',
        messageId: String(event.eventId),
        timestamp: Date.now(),
        type: event.eventType,
        headers: { 'x-delivery-attempt': 1 },
      },
    );
  }

  private async connect(): Promise<void> {
    if (this.isShuttingDown || this.isConnecting || this.connection) return;
    this.isConnecting = true;

    try {
      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createConfirmChannel();

      this.connection.on('error', (err: Error) =>
        this.logger.error({
          event: 'rabbitmq_connection_error',
          error: err.message,
        }),
      );
      this.connection.on('close', () =>
        this.handleDisconnect('connection_closed'),
      );

      this.channel.on('error', (err: Error) =>
        this.logger.error({
          event: 'rabbitmq_channel_error',
          error: err.message,
        }),
      );
      this.channel.on('close', () => this.handleDisconnect('channel_closed'));

      this.channel.on('return', (message: Message) => {
        const correlationId: unknown = message.properties.correlationId;
        if (typeof correlationId === 'string') {
          this.returnedPublishes.add(correlationId);
        }
      });

      await this.assertTopology(this.channel);

      if (this.handlers.size > 0) {
        await this.consumeQueue(this.channel);
      }

      this.logger.log({ event: 'rabbitmq_connected' });
    } catch (error: unknown) {
      this.logger.error({
        event: 'rabbitmq_connect_failed',
        error: error instanceof Error ? error.message : String(error),
      });
      await this.cleanup();
      this.scheduleReconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  private handleDisconnect(reason: string): void {
    if (this.isShuttingDown) return;
    this.logger.warn({ event: `rabbitmq_${reason}` });
    void this.cleanup().then(() => this.scheduleReconnect());
  }

  private async cleanup(): Promise<void> {
    this.returnedPublishes.clear();
    const channel = this.channel;
    const connection = this.connection;
    this.channel = null;
    this.connection = null;

    try {
      await channel?.close();
    } catch {
      // Channel already closed
    }

    try {
      await connection?.close();
    } catch {
      // Connection already closed
    }
  }

  private scheduleReconnect(): void {
    if (this.isShuttingDown || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, RABBITMQ_DEFAULTS.reconnectDelayMs);
    this.reconnectTimer.unref();
  }

  private getQueueArgs(
    extraArgs: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      ...(this.queueType === 'quorum' ? { 'x-queue-type': 'quorum' } : {}),
      ...extraArgs,
    };
  }

  private async assertTopology(channel: ConfirmChannel): Promise<void> {
    await channel.assertExchange(RABBITMQ_TOPOLOGY.exchanges.events, 'topic', {
      durable: true,
    });
    await channel.assertExchange(
      RABBITMQ_TOPOLOGY.exchanges.deadLetter,
      'direct',
      { durable: true },
    );

    // Dead letter queue
    await channel.assertQueue(RABBITMQ_TOPOLOGY.queues.orderPaidDeadLetter, {
      durable: true,
      arguments: this.getQueueArgs(),
    });
    await channel.bindQueue(
      RABBITMQ_TOPOLOGY.queues.orderPaidDeadLetter,
      RABBITMQ_TOPOLOGY.exchanges.deadLetter,
      RABBITMQ_TOPOLOGY.routingKeys.orderPaid,
    );

    // Primary consumption queue
    await channel.assertQueue(RABBITMQ_TOPOLOGY.queues.orderPaid, {
      durable: true,
      arguments: this.getQueueArgs(),
    });
    await channel.bindQueue(
      RABBITMQ_TOPOLOGY.queues.orderPaid,
      RABBITMQ_TOPOLOGY.exchanges.events,
      RABBITMQ_TOPOLOGY.routingKeys.orderPaid,
    );

    // Exponential retry queues
    for (const retryQueue of RABBITMQ_TOPOLOGY.queues.orderPaidRetries) {
      await channel.assertQueue(retryQueue.name, {
        durable: true,
        arguments: this.getQueueArgs({
          ...(this.queueType === 'quorum'
            ? {
                'x-dead-letter-strategy': 'at-least-once',
                'x-overflow': 'reject-publish',
              }
            : {}),
          'x-message-ttl': retryQueue.delayMs,
          'x-dead-letter-exchange': RABBITMQ_TOPOLOGY.exchanges.events,
          'x-dead-letter-routing-key': RABBITMQ_TOPOLOGY.routingKeys.orderPaid,
        }),
      });
    }

    await channel.prefetch(RABBITMQ_DEFAULTS.prefetch);
  }

  private async consumeQueue(channel: ConfirmChannel): Promise<void> {
    await channel.consume(
      RABBITMQ_TOPOLOGY.queues.orderPaid,
      (msg) => {
        if (msg) void this.processMessage(channel, msg);
      },
      { noAck: false },
    );
  }

  private async processMessage(
    channel: ConfirmChannel,
    message: ConsumeMessage,
  ): Promise<void> {
    const messageId =
      typeof message.properties.messageId === 'string'
        ? message.properties.messageId
        : 'unknown';

    if (message.content.length > RABBITMQ_DEFAULTS.maxMessageBytes) {
      this.logger.warn({
        event: 'rabbitmq_message_too_large',
        messageId,
        bytes: message.content.length,
        limit: RABBITMQ_DEFAULTS.maxMessageBytes,
      });
      await this.forwardToDeadLetter(channel, message);
      return;
    }

    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(message.content.toString('utf8'));
      } catch {
        throw new InvalidEventError('Message body is not valid JSON');
      }

      if (!isEventEnvelope(parsed)) {
        throw new InvalidEventError(
          'Message does not match the event envelope',
        );
      }

      const handler = this.handlers.get(parsed.eventType);
      if (!handler) {
        throw new InvalidEventError(
          `No handler registered for event type: ${parsed.eventType}`,
        );
      }

      await handler(parsed);
      channel.ack(message);
      this.logger.log({ event: 'rabbitmq_message_acknowledged', messageId });
    } catch (error: unknown) {
      this.logger.error({
        event: 'rabbitmq_message_processing_failed',
        messageId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof InvalidEventError) {
        await this.forwardToDeadLetter(channel, message);
      } else {
        await this.retryOrDeadLetter(channel, message);
      }
    }
  }

  private async forwardToDeadLetter(
    channel: ConfirmChannel,
    message: ConsumeMessage,
  ): Promise<void> {
    try {
      await this.publishWithConfirm(
        RABBITMQ_TOPOLOGY.exchanges.deadLetter,
        RABBITMQ_TOPOLOGY.routingKeys.orderPaid,
        message.content,
        this.toPublishOptions(message),
      );
      channel.ack(message);
    } catch (error: unknown) {
      this.logger.error({
        event: 'rabbitmq_dead_letter_publish_failed',
        error: error instanceof Error ? error.message : String(error),
      });
      await channel.close().catch(() => undefined);
    }
  }

  private async retryOrDeadLetter(
    channel: ConfirmChannel,
    message: ConsumeMessage,
  ): Promise<void> {
    const currentAttempt = this.getDeliveryAttempt(message);
    if (currentAttempt >= RABBITMQ_DEFAULTS.maxDeliveryAttempts) {
      await this.forwardToDeadLetter(channel, message);
      return;
    }

    const retryQueues = RABBITMQ_TOPOLOGY.queues.orderPaidRetries;
    const retryQueue =
      retryQueues[Math.min(currentAttempt - 1, retryQueues.length - 1)];
    const existingHeaders = (message.properties.headers ?? {}) as Record<
      string,
      unknown
    >;
    const headers: Record<string, unknown> = {
      ...existingHeaders,
      'x-delivery-attempt': currentAttempt + 1,
    };

    try {
      await this.publishWithConfirm(
        '',
        retryQueue.name,
        message.content,
        this.toPublishOptions(message, headers),
      );
      channel.ack(message);
      this.logger.warn({
        event: 'rabbitmq_retry_scheduled',
        messageId:
          typeof message.properties.messageId === 'string'
            ? message.properties.messageId
            : 'unknown',
        attempt: currentAttempt + 1,
        retryQueue: retryQueue.name,
        delayMs: retryQueue.delayMs,
      });
    } catch (error: unknown) {
      this.logger.error({
        event: 'rabbitmq_retry_publish_failed',
        messageId:
          typeof message.properties.messageId === 'string'
            ? message.properties.messageId
            : 'unknown',
        error: error instanceof Error ? error.message : String(error),
      });
      try {
        channel.nack(message, false, true);
      } catch {
        // Channel already broken
      } finally {
        await channel.close().catch(() => undefined);
      }
    }
  }

  private getDeliveryAttempt(message: ConsumeMessage): number {
    const headers = message.properties.headers;
    const attempt: unknown = headers?.['x-delivery-attempt'];
    return typeof attempt === 'number' &&
      Number.isInteger(attempt) &&
      attempt > 0
      ? attempt
      : 1;
  }

  private toPublishOptions(
    message: ConsumeMessage,
    headers: Record<string, unknown> = message.properties.headers ?? {},
  ): Options.Publish {
    const props = message.properties;
    return {
      persistent: true,
      contentType:
        typeof props.contentType === 'string' ? props.contentType : undefined,
      messageId:
        typeof props.messageId === 'string' ? props.messageId : undefined,
      timestamp: Date.now(),
      type: typeof props.type === 'string' ? props.type : undefined,
      headers,
    };
  }

  private async publishWithConfirm(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: Options.Publish,
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not available');
    }

    const correlationId = randomUUID();
    await new Promise<void>((resolve, reject) => {
      this.channel!.publish(
        exchange,
        routingKey,
        content,
        { ...options, mandatory: true, correlationId },
        (error: unknown) => {
          const wasReturned = this.returnedPublishes.delete(correlationId);
          if (error) {
            reject(
              error instanceof Error
                ? error
                : new Error(
                    typeof error === 'string'
                      ? error
                      : 'RabbitMQ publish failed',
                  ),
            );
          } else if (wasReturned) {
            reject(
              new Error(
                `RabbitMQ did not route message to ${exchange}/${routingKey}`,
              ),
            );
          } else {
            resolve();
          }
        },
      );
    });
  }
}

function isEventEnvelope(value: unknown): value is EventEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.eventId === 'number' &&
    typeof event.eventType === 'string' &&
    typeof event.aggregateId === 'string' &&
    typeof event.schemaVersion === 'number' &&
    typeof event.occurredAt === 'string' &&
    'payload' in event
  );
}
