import { Global, Module } from '@nestjs/common';
import { EVENT_CONSUMER_TOKEN } from '../contracts/event-consumer.interface';
import { EVENT_PUBLISHER_TOKEN } from '../contracts/event-publisher.interface';
import { RabbitMqEventAdapter } from './rabbitmq-event.adapter';

@Global()
@Module({
  providers: [
    RabbitMqEventAdapter,
    { provide: EVENT_PUBLISHER_TOKEN, useExisting: RabbitMqEventAdapter },
    { provide: EVENT_CONSUMER_TOKEN, useExisting: RabbitMqEventAdapter },
  ],
  exports: [EVENT_PUBLISHER_TOKEN, EVENT_CONSUMER_TOKEN],
})
export class RabbitMqModule {}
