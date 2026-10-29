import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  EVENT_CONSUMER_TOKEN,
  IEventConsumer,
} from '../messaging/contracts/event-consumer.interface';
import { ORDER_PAID_EVENT_TYPE } from '../messaging/contracts/event-types';
import { OrderPaidConsumer } from './order-paid.consumer';

@Injectable()
export class OrderPaidEventRegistration implements OnModuleInit {
  constructor(
    @Inject(EVENT_CONSUMER_TOKEN)
    private readonly eventConsumer: IEventConsumer,
    private readonly orderPaidConsumer: OrderPaidConsumer,
  ) {}

  onModuleInit(): void {
    this.eventConsumer.registerHandler(ORDER_PAID_EVENT_TYPE, (event) =>
      this.orderPaidConsumer.handle(event),
    );
  }
}
