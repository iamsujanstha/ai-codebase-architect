import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ORDER_PAID_EVENT_TYPE,
  InvalidEventError,
  type EventEnvelope,
} from '../messaging/contracts';
import { ORDER_PAID_SCHEMA_VERSION } from './interfaces/order-paid-event.constants';
import { MailService } from '../mail/mail.service';
import type { OrderConfirmationEmail } from '../mail/interfaces/order-confirmation.interface';
import {
  IPaymentsRepository,
  PAYMENTS_REPOSITORY_TOKEN,
} from './repositories/payments.repository.interface';

/**
 * Payload contract received within the order.paid event envelope.
 */
export interface OrderPaidPayload {
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

/**
 * Domain consumer responsible for processing order payment side-effects.
 *
 * Why needed:
 * Isolates non-critical asynchronous side-effects (stock decrement and email delivery)
 * away from the critical payment webhook path, allowing them to run reliably in worker processes.
 */
@Injectable()
export class OrderPaidConsumer {
  private readonly logger = new Logger(OrderPaidConsumer.name);

  /**
   * Injects domain repository and mailing service dependencies.
   * Why needed: Enables database operations (stock updates) and external mail delivery.
   */
  constructor(
    @Inject(PAYMENTS_REPOSITORY_TOKEN)
    private readonly paymentsRepo: IPaymentsRepository,
    private readonly mailService: MailService,
  ) {}

  /**
   * Applies order-paid effects from the event envelope.
   *
   * Why needed:
   * 1. Validates event type and schema version to prevent processing unsupported contracts.
   * 2. Decrements product inventory idempotently using eventId.
   * 3. Sends confirmation email to the customer with invoice details.
   *
   * @param event The generic event envelope received from RabbitMQ
   * @throws InvalidEventError when event type, version, or payload fails validation
   */
  async handle(event: EventEnvelope): Promise<void> {
    if (
      event.eventType !== ORDER_PAID_EVENT_TYPE ||
      event.schemaVersion !== ORDER_PAID_SCHEMA_VERSION
    ) {
      throw new InvalidEventError('Unsupported order-paid event version or type');
    }

    const payload = this.parsePayload(event.payload);
    const orderNumber = event.aggregateId;
    const stockItems = (payload.items ?? []).map((item) => ({
      productId: Number(item.productId),
      quantity: item.quantity,
    }));

    // Step 1: Idempotently decrement inventory stock in the database
    if (stockItems.length > 0) {
      await this.paymentsRepo.decrementProductStock(event.eventId, stockItems);
    }

    // Step 2: Send customer order confirmation email via SMTP
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

  /**
   * Validates and casts raw payload object.
   *
   * Why needed: Ensures runtime safety so malformed or empty payloads are rejected
   * early before accessing nested properties.
   *
   * @param payload Raw payload from event envelope
   * @throws InvalidEventError if payload is null or not an object
   */
  private parsePayload(payload: unknown): OrderPaidPayload {
    if (!payload || typeof payload !== 'object') {
      throw new InvalidEventError('Order-paid event payload must be an object');
    }
    return payload as OrderPaidPayload;
  }
}
