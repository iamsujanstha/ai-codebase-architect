import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp, {
  type ChannelModel,
  type ConfirmChannel,
  type ConsumeMessage,
} from 'amqplib';
import {
  RABBITMQ_DEFAULTS,
  RABBITMQ_TOPOLOGY,
} from './rabbitmq.constants';
import type { EventEnvelope } from '../contracts/event-envelope.interface';
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
  private readonly handlers = new Map<string, EventHandler>();
  private connection: ChannelModel | null = null;
  private channel: ConfirmChannel | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private isConnecting = false;

  /**
   * Initializes adapter with the broker connection URL.
   * Why needed: Allows configuring the broker endpoint via environment variables (RABBITMQ_URL).
   */
  constructor(config: ConfigService) {
    this.url = config.get<string>('RABBITMQ_URL') ?? 'amqp://localhost:5672';
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
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
    } catch {
      // Ignored during shutdown
    } finally {
      this.channel = null;
      this.connection = null;
    }
  }

  /**
   * Health probe method indicating whether the broker connection and channel are ready.
   * Why needed: Queried by health checks (/health) and publishers before dispatching events.
   */
  isAvailable(): boolean {
    return this.channel !== null && this.connection !== null;
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
    if (this.channel) {
      void this.startConsumer(this.channel, eventType);
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
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not available');
    }

    const content = Buffer.from(JSON.stringify(event));
    return new Promise((resolve, reject) => {
      this.channel!.publish(
        RABBITMQ_TOPOLOGY.exchanges.events,
        event.eventType,
        content,
        {
          persistent: true,
          contentType: 'application/json',
          messageId: String(event.eventId),
          timestamp: Date.now(),
          type: event.eventType,
        },
        (error) => {
          if (error) {
            reject(
              error instanceof Error ? error : new Error(String(error)),
            );
          } else {
            resolve();
          }
        },
      );
    });
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
        this.logger.error({ event: 'rabbitmq_connection_error', error: err.message });
      });
      this.connection.on('close', () => {
        this.logger.warn({ event: 'rabbitmq_connection_closed' });
        this.channel = null;
        this.connection = null;
        this.scheduleReconnect();
      });

      this.channel = await this.connection.createConfirmChannel();
      await this.assertTopology(this.channel);

      // Start consumers for all registered handlers
      for (const eventType of this.handlers.keys()) {
        await this.startConsumer(this.channel, eventType);
      }

      this.logger.log({ event: 'rabbitmq_connected' });
    } catch (error: unknown) {
      this.logger.error({
        event: 'rabbitmq_connect_failed',
        error: error instanceof Error ? error.message : String(error),
      });
      this.scheduleReconnect();
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Asserts durable exchanges, queues, and routing bindings.
   * Why needed: Ensures that RabbitMQ exchanges and queues exist prior to message publishing
   * and consumption, and configures native dead-lettering (DLX) for failed messages.
   *
   * @param channel Active confirm channel
   */
  private async assertTopology(channel: ConfirmChannel): Promise<void> {
    // 1. Assert exchanges: topic exchange for domain events, direct exchange for dead letters
    await channel.assertExchange(RABBITMQ_TOPOLOGY.exchanges.events, 'topic', { durable: true });
    await channel.assertExchange(RABBITMQ_TOPOLOGY.exchanges.deadLetter, 'direct', { durable: true });

    // 2. Assert Dead Letter Queue and bind to dead-letter exchange
    await channel.assertQueue(RABBITMQ_TOPOLOGY.queues.orderPaidDeadLetter, { durable: true });
    await channel.bindQueue(
      RABBITMQ_TOPOLOGY.queues.orderPaidDeadLetter,
      RABBITMQ_TOPOLOGY.exchanges.deadLetter,
      RABBITMQ_TOPOLOGY.routingKeys.orderPaid,
    );

    // 3. Assert Primary Order-Paid Queue (matching existing broker queue declaration)
    await channel.assertQueue(RABBITMQ_TOPOLOGY.queues.orderPaid, {
      durable: true,
    });

    await channel.bindQueue(
      RABBITMQ_TOPOLOGY.queues.orderPaid,
      RABBITMQ_TOPOLOGY.exchanges.events,
      RABBITMQ_TOPOLOGY.routingKeys.orderPaid,
    );

    await channel.prefetch(RABBITMQ_DEFAULTS.prefetch);
  }

  /**
   * Binds an AMQP consumer to the queue for a given event type.
   * Why needed: Starts pulling messages from the broker queue and forwards them to processMessage.
   *
   * @param channel Active confirm channel
   * @param _eventType Event type string being consumed
   */
  private async startConsumer(channel: ConfirmChannel, _eventType: string): Promise<void> {
    const queue = RABBITMQ_TOPOLOGY.queues.orderPaid;
    await channel.consume(
      queue,
      (message) => {
        if (!message) return;
        void this.processMessage(channel, message);
      },
      { noAck: false },
    );
  }

  /**
   * Processes an incoming AMQP message and manages acknowledgements.
   * Why needed: Parses JSON, validates registered handlers, catches handler errors,
   * ACKs on successful execution, and NACKs with requeue=false to route unhandled/failed
   * messages to the Dead Letter Queue (DLQ).
   *
   * @param channel Active confirm channel
   * @param message Raw consume message from amqplib
   */
  private async processMessage(
    channel: ConfirmChannel,
    message: ConsumeMessage,
  ): Promise<void> {
    const messageId = message.properties.messageId ?? 'unknown';

    try {
      const event = JSON.parse(message.content.toString('utf8')) as EventEnvelope;
      const handler = this.handlers.get(event.eventType);

      if (!handler) {
        this.logger.warn({
          event: 'rabbitmq_no_handler_registered',
          eventType: event.eventType,
          messageId,
        });
        await this.forwardToDeadLetter(channel, message);
        return;
      }

      await handler(event);
      channel.ack(message);
      this.logger.log({ event: 'rabbitmq_message_acknowledged', messageId });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({
        event: 'rabbitmq_message_processing_failed',
        messageId,
        error: errorMessage,
      });
      await this.forwardToDeadLetter(channel, message);
    }
  }

  /**
   * Forwards failed or unroutable messages to the dead-letter exchange and ACKs the original message.
   * Why needed: Routes failed messages into the dead-letter queue without requiring
   * immutable x-dead-letter-exchange arguments on the existing queue.
   *
   * @param channel Active confirm channel
   * @param message Raw consume message to forward
   */
  private async forwardToDeadLetter(
    channel: ConfirmChannel,
    message: ConsumeMessage,
  ): Promise<void> {
    try {
      await new Promise<void>((resolve, reject) => {
        channel.publish(
          RABBITMQ_TOPOLOGY.exchanges.deadLetter,
          RABBITMQ_TOPOLOGY.routingKeys.orderPaid,
          message.content,
          {
            persistent: true,
            contentType: message.properties.contentType,
            messageId: message.properties.messageId,
            timestamp: Date.now(),
          },
          (err) => (err ? reject(err) : resolve()),
        );
      });
    } catch (error: unknown) {
      this.logger.error({
        event: 'rabbitmq_dead_letter_publish_failed',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      channel.ack(message);
    }
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
