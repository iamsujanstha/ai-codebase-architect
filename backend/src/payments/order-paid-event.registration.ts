import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  EVENT_CONSUMER_TOKEN,
  ORDER_PAID_EVENT_TYPE,
  type IEventConsumer,
} from '../messaging/contracts';
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
