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

/**
 * RabbitMQ adapter implementing both publishing (IEventPublisher)
 * and event consumption (IEventConsumer) for the NestJS application.
 *
 * Why needed:
 * Acts as the transport layer bridging domain events (like OrderPaid)
 * with the AMQP message broker, supporting publisher confirms,
 * dead-letter queue routing, and self-healing reconnections.
 */
@Injectable()
export class RabbitMqEventAdapter
  implements IEventPublisher, IEventConsumer, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RabbitMqEventAdapter.name);
  private readonly url: string;
  private readonly queueType: 'classic' | 'quorum';
  private readonly handlers = new Map<string, EventHandler>();
  private connection: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  private consumingChannel: ConfirmChannel | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly returnedPublishes = new Set<string>();
  private isShuttingDown = false;
  private isConnecting = false;
  private isReady = false;

  /**
   * Initializes adapter with the broker connection URL.
   * Why needed: Allows configuring the broker endpoint via environment variables (RABBITMQ_URL).
   */
  constructor(config: ConfigService) {
    this.url = config.get<string>('RABBITMQ_URL') ?? 'amqp://localhost:5672';
    const queueType = config.get<string>('RABBITMQ_QUEUE_TYPE') ?? 'classic';
    if (queueType !== 'classic' && queueType !== 'quorum') {
      throw new Error('RABBITMQ_QUEUE_TYPE must be classic or quorum');
    }
    this.queueType = queueType;
  }

  /**
   * NestJS lifecycle hook called when the hosting module has initialized.
   * Why needed: Kicks off asynchronous connection to the RabbitMQ broker on boot without blocking startup.
   */
  onModuleInit(): void {
    void this.connect();
  }

  /**
   * NestJS lifecycle hook called during application shutdown.
   * Why needed: Cleans up active reconnect timers and closes channels/connections
   * gracefully to avoid unclosed sockets, connection leaks, or lost messages.
   */
  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.isReady = false;
    try {
      await this.channel?.close();
    } catch {
      // The connection close below still releases the channel if it cannot close cleanly.
    }
    try {
      await this.connection?.close();
    } catch {
      // The broker may already have closed the connection.
    } finally {
      this.channel = null;
      this.consumingChannel = null;
      this.connection = null;
    }
  }

  /**
   * Health probe method indicating whether the broker connection and channel are ready.
   * Why needed: Queried by health checks (/health) and publishers before dispatching events.
   */
  isAvailable(): boolean {
    return this.isReady && this.channel !== null && this.connection !== null;
  }

  /**
   * Registers a domain event handler callback for a specific event type.
   * Why needed: Allows modular consumers to register event listeners dynamically
   * without coupling domain logic to AMQP channel or queue mechanics.
   *
   * @param eventType Domain event type identifier (e.g. 'order.paid')
   * @param handler Async callback to execute when an event is received
   */
  registerHandler(eventType: string, handler: EventHandler): void {
    this.handlers.set(eventType, handler);
    if (this.isReady && this.channel) {
      void this.startConsumer(this.channel).catch((error: unknown) => {
        this.logger.error({
          event: 'rabbitmq_consumer_start_failed',
          eventType,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }
  }

  /**
   * Publishes an event envelope to the topic exchange using publisher confirms.
   * Why needed: Guarantees that the message is durably written to the broker before
   * acknowledging success back to the caller (e.g. OutboxPublisher).
   *
   * @param event Standardized event envelope containing metadata and payload
   * @throws Error when the channel is disconnected or publishing is rejected
   */
  async publish(event: EventEnvelope): Promise<void> {
    if (!this.isReady || !this.channel) {
      throw new Error('RabbitMQ channel is not available');
    }

    const content = Buffer.from(JSON.stringify(event));
    await this.publishWithConfirm(
      this.channel,
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

  /**
   * Establishes the TCP connection and confirm channel with RabbitMQ.
   * Why needed: Manages the connection lifecycle, binds connection error/close handlers,
   * declares the required topology (exchanges/queues), and attaches registered consumers.
   */
  private async connect(): Promise<void> {
    if (this.isShuttingDown || this.isConnecting || this.connection) return;
    this.isConnecting = true;

    try {
      this.connection = await amqp.connect(this.url);
      this.connection.on('error', (err: Error) => {
        this.logger.error({
          event: 'rabbitmq_connection_error',
          error: err.message,
        });
      });
      this.connection.on('close', () => {
        this.logger.warn({ event: 'rabbitmq_connection_closed' });
        this.channel = null;
        this.consumingChannel = null;
        this.connection = null;
        this.isReady = false;
        this.scheduleReconnect();
      });

      this.channel = await this.connection.createConfirmChannel();
      const channel = this.channel;
      channel.on('return', (message: Message) => {
        const correlationId: unknown = message.properties.correlationId;
        if (typeof correlationId === 'string') {
          this.returnedPublishes.add(correlationId);
        }
      });
      channel.on('error', (error: Error) => {
        this.logger.error({
          event: 'rabbitmq_channel_error',
          error: error.message,
        });
      });
      channel.on('close', () => {
        this.returnedPublishes.clear();
        if (this.channel !== channel || this.isShuttingDown) return;

        this.logger.warn({ event: 'rabbitmq_channel_closed' });
        this.channel = null;
        this.consumingChannel = null;
        this.isReady = false;
        const connection = this.connection;
        this.connection = null;
        if (connection) {
          void connection
            .close()
            .catch(() => undefined)
            .finally(() => this.scheduleReconnect());
        } else {
          this.scheduleReconnect();
        }
      });
      await this.assertTopology(this.channel);
      this.isReady = true;

      if (this.handlers.size > 0) await this.startConsumer(this.channel);

      this.logger.log({ event: 'rabbitmq_connected' });
    } catch (error: unknown) {
      this.logger.error({
        event: 'rabbitmq_connect_failed',
        error: error instanceof Error ? error.message : String(error),
      });
      const channel = this.channel;
      const connection = this.connection;
      this.channel = null;
      this.consumingChannel = null;
      this.connection = null;
      this.isReady = false;
      try {
        await channel?.close();
      } catch {
        // The channel may already be closed after a connection or topology failure.
      }
      try {
        await connection?.close();
      } catch {
        // The connection may already be closed after a broker failure.
      }
      this.scheduleReconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Asserts durable exchanges, queues, and routing bindings.
   * Why needed: Publishers and consumers must agree on durable destinations and retry routes.
   *
   * @param channel Active confirm channel
   */
  private async assertTopology(channel: ConfirmChannel): Promise<void> {
    // Declare all destinations before consumers start so publishers cannot race topology setup.
    await channel.assertExchange(RABBITMQ_TOPOLOGY.exchanges.events, 'topic', {
      durable: true,
    });
    await channel.assertExchange(
      RABBITMQ_TOPOLOGY.exchanges.deadLetter,
      'direct',
      { durable: true },
    );

    await channel.assertQueue(RABBITMQ_TOPOLOGY.queues.orderPaidDeadLetter, {
      durable: true,
      arguments:
        this.queueType === 'quorum' ? { 'x-queue-type': 'quorum' } : {},
    });
    await channel.bindQueue(
      RABBITMQ_TOPOLOGY.queues.orderPaidDeadLetter,
      RABBITMQ_TOPOLOGY.exchanges.deadLetter,
      RABBITMQ_TOPOLOGY.routingKeys.orderPaid,
    );

    await channel.assertQueue(RABBITMQ_TOPOLOGY.queues.orderPaid, {
      durable: true,
      arguments:
        this.queueType === 'quorum' ? { 'x-queue-type': 'quorum' } : {},
    });

    await channel.bindQueue(
      RABBITMQ_TOPOLOGY.queues.orderPaid,
      RABBITMQ_TOPOLOGY.exchanges.events,
      RABBITMQ_TOPOLOGY.routingKeys.orderPaid,
    );

    for (const retryQueue of RABBITMQ_TOPOLOGY.queues.orderPaidRetries) {
      await channel.assertQueue(retryQueue.name, {
        durable: true,
        arguments: {
          ...(this.queueType === 'quorum'
            ? {
                'x-queue-type': 'quorum',
                'x-dead-letter-strategy': 'at-least-once',
                'x-overflow': 'reject-publish',
              }
            : {}),
          'x-message-ttl': retryQueue.delayMs,
          'x-dead-letter-exchange': RABBITMQ_TOPOLOGY.exchanges.events,
          'x-dead-letter-routing-key': RABBITMQ_TOPOLOGY.routingKeys.orderPaid,
        },
      });
    }

    await channel.prefetch(RABBITMQ_DEFAULTS.prefetch);
  }

  /**
   * Binds an AMQP consumer to the queue for a given event type.
   * Why needed: Starts pulling messages from the broker queue and forwards them to processMessage.
   *
   * @param channel Active confirm channel
   */
  private async startConsumer(channel: ConfirmChannel): Promise<void> {
    if (this.consumingChannel === channel) return;
    const queue = RABBITMQ_TOPOLOGY.queues.orderPaid;
    this.consumingChannel = channel;
    try {
      await channel.consume(
        queue,
        (message) => {
          if (!message) return;
          void this.processMessage(channel, message);
        },
        { noAck: false },
      );
    } catch (error: unknown) {
      if (this.consumingChannel === channel) this.consumingChannel = null;
      throw error;
    }
  }

  /**
   * Processes an incoming AMQP message and manages acknowledgements.
   * Why needed: Invalid messages go to the DLQ; transient handler failures use delayed
   * retries; the delivery is acknowledged only after the next durable handoff succeeds.
   *
   * @param channel Active confirm channel
   * @param message Raw consume message from amqplib
   */
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
      let parsedMessage: unknown;
      try {
        parsedMessage = JSON.parse(message.content.toString('utf8'));
      } catch {
        throw new InvalidEventError('Message body is not valid JSON');
      }
      if (!isEventEnvelope(parsedMessage)) {
        throw new InvalidEventError(
          'Message does not match the event envelope',
        );
      }
      const event = parsedMessage;
      const handler = this.handlers.get(event.eventType);

      if (!handler) {
        throw new InvalidEventError(
          `No handler registered for event type: ${event.eventType}`,
        );
      }

      await handler(event);
      channel.ack(message);
      this.logger.log({ event: 'rabbitmq_message_acknowledged', messageId });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error({
        event: 'rabbitmq_message_processing_failed',
        messageId,
        error: errorMessage,
      });
      if (error instanceof InvalidEventError) {
        await this.forwardToDeadLetter(channel, message);
      } else {
        await this.retryOrDeadLetter(channel, message);
      }
    }
  }

  /**
   * Acknowledges the original only after the dead-letter publish is confirmed and routed.
   *
   * @param channel Active confirm channel
   * @param message Raw consume message to forward
   */
  private async forwardToDeadLetter(
    channel: ConfirmChannel,
    message: ConsumeMessage,
  ): Promise<void> {
    try {
      await this.publishWithConfirm(
        channel,
        RABBITMQ_TOPOLOGY.exchanges.deadLetter,
        RABBITMQ_TOPOLOGY.routingKeys.orderPaid,
        message.content,
        this.copyMessageProperties(message),
      );
      channel.ack(message);
    } catch (error: unknown) {
      this.logger.error({
        event: 'rabbitmq_dead_letter_publish_failed',
        error: error instanceof Error ? error.message : String(error),
        messageId:
          typeof message.properties.messageId === 'string'
            ? message.properties.messageId
            : 'unknown',
        action: 'CLOSE_CHANNEL_TO_REQUEUE_ORIGINAL',
      });
      // The original must remain unacked unless the DLQ confirms it was routed.
      await channel.close().catch(() => undefined);
    }
  }

  private async retryOrDeadLetter(
    channel: ConfirmChannel,
    message: ConsumeMessage,
  ): Promise<void> {
    const messageId =
      typeof message.properties.messageId === 'string'
        ? message.properties.messageId
        : 'unknown';
    const currentAttempt = this.getDeliveryAttempt(message);
    if (currentAttempt >= RABBITMQ_DEFAULTS.maxDeliveryAttempts) {
      await this.forwardToDeadLetter(channel, message);
      return;
    }

    const retryQueues = RABBITMQ_TOPOLOGY.queues.orderPaidRetries;
    const retryQueue =
      retryQueues[Math.min(currentAttempt - 1, retryQueues.length - 1)];
    const headers = {
      ...message.properties.headers,
      'x-delivery-attempt': currentAttempt + 1,
    };

    try {
      await this.publishWithConfirm(
        channel,
        '',
        retryQueue.name,
        message.content,
        this.copyMessageProperties(message, headers),
      );
      channel.ack(message);
      this.logger.warn({
        event: 'rabbitmq_retry_scheduled',
        messageId,
        attempt: currentAttempt + 1,
        retryQueue: retryQueue.name,
        delayMs: retryQueue.delayMs,
      });
    } catch (publishError: unknown) {
      this.logger.error({
        event: 'rabbitmq_retry_publish_failed',
        messageId,
        attempt: currentAttempt,
        error:
          publishError instanceof Error
            ? publishError.message
            : String(publishError),
      });
      await this.requeueAfterHandoffFailure(channel, message);
    }
  }

  private getDeliveryAttempt(message: ConsumeMessage): number {
    const attempt: unknown = message.properties.headers?.['x-delivery-attempt'];
    return typeof attempt === 'number' &&
      Number.isInteger(attempt) &&
      attempt > 0
      ? attempt
      : 1;
  }

  private copyMessageProperties(
    message: ConsumeMessage,
    headers = message.properties.headers,
  ): Options.Publish {
    return {
      persistent: true,
      contentType:
        typeof message.properties.contentType === 'string'
          ? message.properties.contentType
          : undefined,
      messageId:
        typeof message.properties.messageId === 'string'
          ? message.properties.messageId
          : undefined,
      timestamp: Date.now(),
      type:
        typeof message.properties.type === 'string'
          ? message.properties.type
          : undefined,
      headers,
    };
  }

  private async requeueAfterHandoffFailure(
    channel: ConfirmChannel,
    message: ConsumeMessage,
  ): Promise<void> {
    try {
      channel.nack(message, false, true);
    } catch (error: unknown) {
      this.logger.error({
        event: 'rabbitmq_requeue_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      // Closing the channel avoids an immediate nack/requeue hot loop.
      await channel.close().catch(() => undefined);
    }
  }

  private async publishWithConfirm(
    channel: ConfirmChannel,
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: Options.Publish,
  ): Promise<void> {
    const correlationId = randomUUID();
    await new Promise<void>((resolve, reject) => {
      channel.publish(
        exchange,
        routingKey,
        content,
        { ...options, mandatory: true, correlationId },
        (error) => {
          const wasReturned = this.returnedPublishes.delete(correlationId);
          if (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
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

  /**
   * Schedules an automatic reconnection attempt after a delay.
   * Why needed: Provides self-healing resilience when RabbitMQ restarts or network drops occur,
   * without blocking process execution.
   */
  private scheduleReconnect(): void {
    if (this.isShuttingDown || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, RABBITMQ_DEFAULTS.reconnectDelayMs);
    this.reconnectTimer.unref();
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
