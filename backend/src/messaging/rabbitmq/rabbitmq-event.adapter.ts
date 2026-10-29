import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp, {
  type Channel,
  type ChannelModel,
  type ConfirmChannel,
  type ConsumeMessage,
  type Options,
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
import { InvalidEventError } from '../contracts/invalid-event.error';
import { ORDER_PAID_EVENT_TYPE } from '../contracts/event-types';
import { PermanentRabbitMqMessageError } from './rabbitmq.errors';

const RETRY_ATTEMPT_HEADER = 'x-retry-attempt';
const SCHEMA_VERSION_HEADER = 'x-schema-version';

@Injectable()
export class RabbitMqEventAdapter
  implements IEventPublisher, IEventConsumer, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RabbitMqEventAdapter.name);
  private readonly url: string;
  private readonly queueType: string;
  private readonly handlers = new Map<string, EventHandler>();
  private connection: ChannelModel | null = null;
  private publisherChannel: ConfirmChannel | null = null;
  private consumerChannel: Channel | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectionAttempt: Promise<void> | null = null;
  private consumerStartChannel: Channel | null = null;
  private consumerTag: string | null = null;
  private activeMessageCount = 0;
  private activeMessagesDrained: (() => void) | null = null;
  private reconnectAttempt = 0;
  private isShuttingDown = false;

  constructor(config: ConfigService) {
    this.url = config.get<string>('RABBITMQ_URL') ?? 'amqp://localhost:5672';
    this.queueType = config.get<string>('RABBITMQ_QUEUE_TYPE') ?? 'classic';
    if (this.queueType !== 'classic' && this.queueType !== 'quorum') {
      throw new Error('RABBITMQ_QUEUE_TYPE must be classic or quorum');
    }
  }

  onModuleInit(): void {
    void this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    await this.stopConsumerAndDrain();
    await this.closeConnection();
  }

  isAvailable(): boolean {
    return this.publisherChannel !== null && this.consumerChannel !== null;
  }

  registerHandler(eventType: string, handler: EventHandler): void {
    if (eventType !== ORDER_PAID_EVENT_TYPE) {
      throw new Error(
        `RabbitMQ has no queue binding for event type: ${eventType}`,
      );
    }
    this.handlers.set(eventType, handler);
    if (this.consumerChannel) {
      void this.startOrderPaidConsumer(this.consumerChannel).catch(
        (error: unknown) => {
          this.logger.error({
            event: 'rabbitmq_consumer_start_failed',
            error: error instanceof Error ? error.message : String(error),
          });
        },
      );
    }
  }

  async publish(event: EventEnvelope): Promise<void> {
    const content = Buffer.from(JSON.stringify(event));
    if (content.byteLength > RABBITMQ_DEFAULTS.maxMessageBytes) {
      throw new Error('Event exceeds the configured message size limit');
    }

    const channel = this.publisherChannel;
    if (!channel) throw new Error('RabbitMQ publisher is not connected');

    const routingKey = this.getRoutingKey(event.eventType);
    await this.publishConfirmed(
      channel,
      RABBITMQ_TOPOLOGY.exchanges.events,
      routingKey,
      content,
      {
        contentType: 'application/json',
        deliveryMode: 2,
        messageId: String(event.eventId),
        timestamp: Date.now(),
        type: event.eventType,
        headers: { [SCHEMA_VERSION_HEADER]: event.schemaVersion },
      },
    );
  }

  private async connect(): Promise<void> {
    if (this.connection || this.connectionAttempt || this.isShuttingDown)
      return;

    this.connectionAttempt = this.openConnection();
    try {
      await this.connectionAttempt;
    } finally {
      this.connectionAttempt = null;
    }
  }

  private async openConnection(): Promise<void> {
    try {
      const brokerUrl = new URL(this.url);
      if (!brokerUrl.searchParams.has('heartbeat')) {
        brokerUrl.searchParams.set(
          'heartbeat',
          String(RABBITMQ_DEFAULTS.heartbeatSeconds),
        );
      }
      const connection = await amqp.connect(brokerUrl.toString(), {
        timeout: RABBITMQ_DEFAULTS.connectTimeoutMs,
      });
      this.connection = connection;
      connection.on('error', (error: Error) => {
        this.logger.error({
          event: 'rabbitmq_connection_error',
          error: error.message,
        });
      });
      connection.on('close', () => {
        if (this.connection !== connection) return;
        this.logger.warn({ event: 'rabbitmq_connection_closed' });
        this.clearChannels();
        this.scheduleReconnect();
      });

      const [publisherChannel, consumerChannel] = await Promise.all([
        connection.createConfirmChannel(),
        connection.createChannel(),
      ]);
      this.publisherChannel = publisherChannel;
      this.consumerChannel = consumerChannel;
      consumerChannel.on('close', () => {
        if (this.connection !== connection) return;
        this.logger.warn({ event: 'rabbitmq_consumer_channel_closed' });
        void this.closeConnection();
        this.scheduleReconnect();
      });
      publisherChannel.on('close', () => {
        if (this.connection !== connection) return;
        this.logger.warn({ event: 'rabbitmq_publisher_channel_closed' });
        void this.closeConnection();
        this.scheduleReconnect();
      });
      await this.assertTopology(publisherChannel, consumerChannel);
      await this.startOrderPaidConsumer(consumerChannel);
      this.reconnectAttempt = 0;
      this.logger.log({
        event: 'rabbitmq_connected',
        queueType: this.queueType,
      });
    } catch (error: unknown) {
      this.logger.error({
        event: 'rabbitmq_connect_failed',
        error: error instanceof Error ? error.message : String(error),
      });
      await this.closeConnection();
      this.scheduleReconnect();
    }
  }

  private async assertTopology(
    publisherChannel: ConfirmChannel,
    consumerChannel: Channel,
  ): Promise<void> {
    await publisherChannel.assertExchange(
      RABBITMQ_TOPOLOGY.exchanges.events,
      'topic',
      { durable: true },
    );
    await publisherChannel.assertExchange(
      RABBITMQ_TOPOLOGY.exchanges.retry,
      'direct',
      { durable: true },
    );
    await publisherChannel.assertExchange(
      RABBITMQ_TOPOLOGY.exchanges.deadLetter,
      'direct',
      { durable: true },
    );

    const durableQueueOptions = {
      durable: true,
      arguments: { 'x-queue-type': this.queueType },
    };
    await consumerChannel.assertQueue(
      RABBITMQ_TOPOLOGY.queues.orderPaid,
      durableQueueOptions,
    );
    await consumerChannel.bindQueue(
      RABBITMQ_TOPOLOGY.queues.orderPaid,
      RABBITMQ_TOPOLOGY.exchanges.events,
      RABBITMQ_TOPOLOGY.routingKeys.orderPaid,
    );
    await consumerChannel.assertQueue(
      RABBITMQ_TOPOLOGY.queues.orderPaidDeadLetter,
      durableQueueOptions,
    );
    await consumerChannel.bindQueue(
      RABBITMQ_TOPOLOGY.queues.orderPaidDeadLetter,
      RABBITMQ_TOPOLOGY.exchanges.deadLetter,
      RABBITMQ_TOPOLOGY.routingKeys.orderPaid,
    );

    for (const retryTier of RABBITMQ_TOPOLOGY.retryTiers) {
      await consumerChannel.assertQueue(retryTier.queue, {
        ...durableQueueOptions,
        arguments: {
          'x-queue-type': this.queueType,
          'x-message-ttl': retryTier.ttlMs,
          'x-dead-letter-exchange': RABBITMQ_TOPOLOGY.exchanges.events,
          'x-dead-letter-routing-key': RABBITMQ_TOPOLOGY.routingKeys.orderPaid,
        },
      });
      await consumerChannel.bindQueue(
        retryTier.queue,
        RABBITMQ_TOPOLOGY.exchanges.retry,
        retryTier.routingKey,
      );
    }

    await consumerChannel.prefetch(RABBITMQ_DEFAULTS.prefetch);
  }

  private async startOrderPaidConsumer(channel: Channel): Promise<void> {
    const handler = this.handlers.get(ORDER_PAID_EVENT_TYPE);
    if (!handler || this.consumerStartChannel === channel) return;
    this.consumerStartChannel = channel;
    try {
      const consumer = await channel.consume(
        RABBITMQ_TOPOLOGY.queues.orderPaid,
        (message) => {
          if (!message) return;
          this.activeMessageCount += 1;
          void this.processMessage(channel, message).finally(() => {
            this.activeMessageCount -= 1;
            if (this.activeMessageCount === 0) {
              this.activeMessagesDrained?.();
              this.activeMessagesDrained = null;
            }
          });
        },
        { noAck: false },
      );
      this.consumerTag = consumer.consumerTag;
    } catch (error: unknown) {
      this.consumerStartChannel = null;
      throw error;
    }
  }

  private async processMessage(
    channel: Channel,
    message: ConsumeMessage,
  ): Promise<void> {
    const messageId = getMessageId(message);
    try {
      if (message.content.byteLength > RABBITMQ_DEFAULTS.maxMessageBytes) {
        throw new PermanentRabbitMqMessageError(
          'RabbitMQ message exceeds the configured message size limit',
        );
      }
      const event = this.parseEnvelope(message.content);
      const handler = this.handlers.get(event.eventType);
      if (!handler) {
        throw new PermanentRabbitMqMessageError(
          `No consumer registered for event type: ${event.eventType}`,
        );
      }
      try {
        await handler(event);
      } catch (error: unknown) {
        if (error instanceof InvalidEventError) {
          throw new PermanentRabbitMqMessageError(error.message);
        }
        throw error;
      }
      if (this.acknowledge(channel, message)) {
        this.logger.log({ event: 'rabbitmq_message_acknowledged', messageId });
      }
    } catch (error: unknown) {
      const retryAttempt = this.getRetryAttempt(message);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      try {
        if (
          error instanceof PermanentRabbitMqMessageError ||
          retryAttempt + 1 >= RABBITMQ_DEFAULTS.maxDeliveryAttempts
        ) {
          await this.publishConfirmed(
            this.requirePublisherChannel(),
            RABBITMQ_TOPOLOGY.exchanges.deadLetter,
            RABBITMQ_TOPOLOGY.routingKeys.orderPaid,
            message.content,
            this.copyProperties(message, retryAttempt),
          );
          this.acknowledge(channel, message);
          this.logger.error({
            event: 'rabbitmq_message_dead_lettered',
            messageId,
            deliveryAttempt: retryAttempt + 1,
            error: errorMessage,
          });
          return;
        }

        const retryTier =
          RABBITMQ_TOPOLOGY.retryTiers[
            Math.min(retryAttempt, RABBITMQ_TOPOLOGY.retryTiers.length - 1)
          ];
        await this.publishConfirmed(
          this.requirePublisherChannel(),
          RABBITMQ_TOPOLOGY.exchanges.retry,
          retryTier.routingKey,
          message.content,
          this.copyProperties(message, retryAttempt),
        );
        this.acknowledge(channel, message);
        this.logger.warn({
          event: 'rabbitmq_message_retry_scheduled',
          messageId,
          deliveryAttempt: retryAttempt + 1,
          retryQueue: retryTier.queue,
          error: errorMessage,
        });
      } catch (publishError: unknown) {
        this.logger.error({
          event: 'rabbitmq_retry_publish_failed',
          messageId,
          error:
            publishError instanceof Error
              ? publishError.message
              : String(publishError),
        });
        this.rejectForRedelivery(channel, message);
      }
    }
  }

  private getRetryAttempt(message: ConsumeMessage): number {
    const headers = getMessageHeaders(message);
    const header: unknown = headers[RETRY_ATTEMPT_HEADER];
    return typeof header === 'number' && Number.isInteger(header) && header >= 0
      ? header
      : 0;
  }

  private getRoutingKey(eventType: string): string {
    if (eventType === ORDER_PAID_EVENT_TYPE) {
      return RABBITMQ_TOPOLOGY.routingKeys.orderPaid;
    }
    throw new Error(`RabbitMQ has no routing key for event type: ${eventType}`);
  }

  private parseEnvelope(content: Buffer): EventEnvelope {
    let value: unknown;
    try {
      value = JSON.parse(content.toString('utf8')) as unknown;
    } catch {
      throw new PermanentRabbitMqMessageError(
        'RabbitMQ message is not valid JSON',
      );
    }
    if (!isEventEnvelope(value)) {
      throw new PermanentRabbitMqMessageError(
        'RabbitMQ message has an unsupported event envelope',
      );
    }
    return value;
  }

  private copyProperties(
    message: ConsumeMessage,
    retryAttempt: number,
  ): Options.Publish {
    const headers = getMessageHeaders(message);
    return {
      contentType: getStringProperty(message.properties.contentType),
      contentEncoding: getStringProperty(message.properties.contentEncoding),
      deliveryMode: 2,
      messageId: getStringProperty(message.properties.messageId),
      correlationId: getStringProperty(message.properties.correlationId),
      type: getStringProperty(message.properties.type),
      timestamp: Date.now(),
      headers: {
        ...headers,
        [RETRY_ATTEMPT_HEADER]: retryAttempt + 1,
      },
    };
  }

  private publishConfirmed(
    channel: ConfirmChannel,
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: Options.Publish,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let wasReturned = false;
      let isConfirmed = false;
      let isDrained = true;
      let publishError: Error | null = null;
      const onReturn = (message: ConsumeMessage) => {
        if (message.properties.messageId === options.messageId)
          wasReturned = true;
      };
      channel.on('return', onReturn);
      const finish = () => {
        if (publishError) {
          channel.removeListener('return', onReturn);
          reject(publishError);
          return;
        }
        if (!isConfirmed || !isDrained) return;
        channel.removeListener('return', onReturn);
        if (wasReturned) {
          reject(
            new Error(
              `RabbitMQ did not route message ${options.messageId ?? ''}`,
            ),
          );
          return;
        }
        resolve();
      };
      const accepted = channel.publish(
        exchange,
        routingKey,
        content,
        { ...options, mandatory: true },
        (error: unknown) => {
          publishError =
            error instanceof Error
              ? error
              : error === null || error === undefined
                ? null
                : new Error('RabbitMQ publish failed with a non-Error value');
          isConfirmed = true;
          finish();
        },
      );
      if (!accepted) {
        isDrained = false;
        channel.once('drain', () => {
          isDrained = true;
          finish();
        });
      }
    });
  }

  private acknowledge(channel: Channel, message: ConsumeMessage): boolean {
    try {
      channel.ack(message);
      return true;
    } catch (error: unknown) {
      this.logger.warn({
        event: 'rabbitmq_ack_failed_channel_closed',
        messageId: getMessageId(message),
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private rejectForRedelivery(channel: Channel, message: ConsumeMessage): void {
    try {
      channel.nack(message, false, true);
    } catch (error: unknown) {
      this.logger.warn({
        event: 'rabbitmq_nack_failed_channel_closed',
        messageId: getMessageId(message),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private requirePublisherChannel(): ConfirmChannel {
    if (!this.publisherChannel)
      throw new Error('RabbitMQ publisher is not connected');
    return this.publisherChannel;
  }

  private scheduleReconnect(): void {
    if (this.isShuttingDown || this.reconnectTimer) return;
    const exponent = Math.min(
      this.reconnectAttempt,
      RABBITMQ_DEFAULTS.reconnect.maxExponent,
    );
    const exponentialDelay = Math.min(
      RABBITMQ_DEFAULTS.reconnect.baseDelayMs * 2 ** exponent,
      RABBITMQ_DEFAULTS.reconnect.maxDelayMs,
    );
    const jitter = Math.floor(
      exponentialDelay * RABBITMQ_DEFAULTS.reconnect.jitterRatio * Math.random(),
    );
    const delay = exponentialDelay - jitter;
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
    this.reconnectTimer.unref();
  }

  private async closeConnection(): Promise<void> {
    const connection = this.connection;
    this.clearChannels();
    this.connection = null;
    if (connection) {
      try {
        await connection.close();
      } catch {
        this.logger.debug({ event: 'rabbitmq_connection_already_closed' });
      }
    }
  }

  private clearChannels(): void {
    this.publisherChannel = null;
    this.consumerChannel = null;
    this.consumerStartChannel = null;
    this.consumerTag = null;
  }

  private async stopConsumerAndDrain(): Promise<void> {
    const channel = this.consumerChannel;
    if (channel && this.consumerTag) {
      try {
        await channel.cancel(this.consumerTag);
      } catch (error: unknown) {
        this.logger.warn({
          event: 'rabbitmq_consumer_cancel_failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (this.activeMessageCount === 0) return;

    await Promise.race([
      new Promise<void>((resolve) => {
        this.activeMessagesDrained = resolve;
      }),
      new Promise<void>((resolve) => {
        const timeout = setTimeout(
          resolve,
          RABBITMQ_DEFAULTS.shutdownDrainMs,
        );
        timeout.unref();
      }),
    ]);
  }
}

function getMessageId(message: ConsumeMessage): string {
  return getStringProperty(message.properties.messageId) ?? 'missing';
}

function getStringProperty(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getMessageHeaders(message: ConsumeMessage): Record<string, unknown> {
  const headers: unknown = message.properties.headers;
  if (
    typeof headers !== 'object' ||
    headers === null ||
    Array.isArray(headers)
  ) {
    return {};
  }
  return headers as Record<string, unknown>;
}

function isEventEnvelope(value: unknown): value is EventEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(event.eventId) &&
    Number(event.eventId) > 0 &&
    typeof event.eventType === 'string' &&
    typeof event.aggregateId === 'string' &&
    event.aggregateId.length > 0 &&
    Number.isSafeInteger(event.schemaVersion) &&
    Number(event.schemaVersion) > 0 &&
    typeof event.occurredAt === 'string' &&
    'payload' in event
  );
}
