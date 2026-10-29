import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EventEnvelope } from '../messaging/contracts/event-envelope.interface';
import { InvalidEventError } from '../messaging/contracts/invalid-event.error';
import { ORDER_PAID_EVENT_TYPE } from '../messaging/contracts/event-types';
import { ORDER_PAID_SCHEMA_VERSION } from './interfaces/order-paid-event.constants';
import { MailService } from '../mail/mail.service';
import type { OrderConfirmationEmail } from '../mail/interfaces/order-confirmation.interface';
import {
  IPaymentsRepository,
  PAYMENTS_REPOSITORY_TOKEN,
} from './repositories/payments.repository.interface';

interface OrderPaidPayload {
  provider: string;
  providerReference: string | null;
  paymentReference: string | null;
  paidAt: string;
  customer: OrderConfirmationEmail['customer'];
  pricing: OrderConfirmationEmail['pricing'];
  items: Array<{
    productId: string;
    quantity: number;
    name: string;
    unitAmount: number;
    lineTotal: number;
    currency: string;
  }>;
}

@Injectable()
export class OrderPaidConsumer {
  private readonly logger = new Logger(OrderPaidConsumer.name);

  constructor(
    @Inject(PAYMENTS_REPOSITORY_TOKEN)
    private readonly paymentsRepo: IPaymentsRepository,
    private readonly mailService: MailService,
  ) {}

  /**
   * Applies order-paid effects from the transport-neutral event contract.
   * @throws InvalidEventError when the event cannot be handled as order.paid.
   */
  async handle(event: EventEnvelope): Promise<void> {
    if (
      event.eventType !== ORDER_PAID_EVENT_TYPE ||
      event.schemaVersion !== ORDER_PAID_SCHEMA_VERSION
    ) {
      throw new InvalidEventError('Unsupported order-paid event version');
    }
    const payload = this.parseOrderPaidPayload(event.payload);
    const orderNumber = event.aggregateId;
    const stockItems = payload.items.map((item) => ({
      productId: Number(item.productId),
      quantity: item.quantity,
    }));

    if (stockItems.length > 0) {
      await this.paymentsRepo.decrementProductStock(event.eventId, stockItems);
    }

    await this.mailService.sendOrderConfirmation({
      orderNumber,
      paymentProvider: payload.provider,
      paymentReference: payload.paymentReference,
      paidAt: payload.paidAt,
      customer: payload.customer,
      pricing: payload.pricing,
      items: payload.items,
    });

    this.logger.log({
      event: 'order_paid_effects_completed',
      eventId: event.eventId,
      orderNumber,
    });
  }

  private parseOrderPaidPayload(payload: unknown): OrderPaidPayload {
    if (!isOrderPaidPayload(payload)) {
      throw new InvalidEventError('Order-paid event payload failed validation');
    }
    return payload;
  }
}

function isOrderPaidPayload(value: unknown): value is OrderPaidPayload {
  if (typeof value !== 'object' || value === null) return false;
  const payload = value as Record<string, unknown>;
  return (
    typeof payload.provider === 'string' &&
    (typeof payload.providerReference === 'string' ||
      payload.providerReference === null) &&
    (typeof payload.paymentReference === 'string' ||
      payload.paymentReference === null) &&
    typeof payload.paidAt === 'string' &&
    isCustomer(payload.customer) &&
    isPricing(payload.pricing) &&
    Array.isArray(payload.items) &&
    payload.items.every(isOrderPaidItem)
  );
}

function isCustomer(
  value: unknown,
): value is OrderConfirmationEmail['customer'] {
  return (
    isObject(value) &&
    typeof value.fullName === 'string' &&
    typeof value.email === 'string'
  );
}

function isPricing(value: unknown): value is OrderConfirmationEmail['pricing'] {
  return (
    isObject(value) &&
    typeof value.currency === 'string' &&
    typeof value.subtotal === 'number' &&
    typeof value.taxAmount === 'number' &&
    typeof value.serviceCharge === 'number' &&
    typeof value.deliveryCharge === 'number' &&
    typeof value.total === 'number'
  );
}

function isOrderPaidItem(value: unknown): boolean {
  if (!isObject(value)) return false;
  return (
    typeof value.productId === 'string' &&
    /^\d+$/.test(value.productId) &&
    Number.isSafeInteger(Number(value.productId)) &&
    Number(value.productId) > 0 &&
    Number.isSafeInteger(value.quantity) &&
    Number(value.quantity) > 0 &&
    typeof value.name === 'string' &&
    typeof value.unitAmount === 'number' &&
    Number.isFinite(value.unitAmount) &&
    typeof value.lineTotal === 'number' &&
    Number.isFinite(value.lineTotal) &&
    typeof value.currency === 'string'
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
