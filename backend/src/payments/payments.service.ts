/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import Stripe from 'stripe';
import {
  IPaymentsRepository,
  PAYMENTS_REPOSITORY_TOKEN,
} from './repositories/payments.repository.interface';
import { CheckoutCustomerDto } from './dto/checkout-customer.dto';
import { CreatePaymentSessionDto } from './dto/create-payment-session.dto';
import { PaymentQuoteRequestDto } from './dto/payment-quote-request.dto';
import { OrderStatus } from './enums/order-status.enum';
import { PaymentProvider } from './enums/payment-provider.enum';
import {
  CreateStripeCheckoutSessionResponse,
  EsewaCheckoutResponse,
} from './interfaces/checkout-session.interface';
import {
  OrderSummaryResponse,
  StripeSessionStatusResponse,
} from './interfaces/order-response.interface';
import {
  PaymentQuoteResponse,
  ProviderQuote,
} from './interfaces/payment-quote.interface';
import {
  ESEWA_PROVIDER_TOKEN,
  IEsewaProvider,
  IStripeProvider,
  PricedCartLine,
  STRIPE_PROVIDER_TOKEN,
} from './interfaces/payment-provider.interface';
import { MailService } from '../mail/mail.service';

export interface ProviderMetadata {
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  esewaTransactionUuid?: string | null;
  esewaTransactionCode?: string | null;
  esewaReferenceId?: string | null;
  [key: string]: string | number | boolean | null | undefined;
}

export interface OrderRecord {
  orderNumber: string;
  userId?: string | null;
  paymentProvider: PaymentProvider;
  status: OrderStatus;
  customer: {
    fullName: string;
    email: string;
    phone?: string | null;
    addressLine1?: string | null;
    city?: string | null;
    country?: string | null;
  };
  items: Array<{
    productId: string;
    slug: string;
    name: string;
    quantity: number;
    unitAmount: number;
    lineTotal: number;
    currency: string;
  }>;
  pricing: {
    currency: string;
    subtotal: number;
    taxAmount: number;
    serviceCharge: number;
    deliveryCharge: number;
    total: number;
  };
  providerMetadata: ProviderMetadata;
  history: Array<{
    status: OrderStatus;
    note: string;
    changedAt: Date;
  }>;
  failureReason?: string | null;
  providerReference?: string | null;
  paymentReference?: string | null;
  paidAt?: Date | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

/**
 * PaymentsService — Domain Workflow Orchestrator
 *
 * Responsibilities:
 * - Server-side cart validation and catalog pricing
 * - Order snapshot creation and atomic state management
 * - Delegation to dedicated payment provider adapters (StripeProvider, EsewaProvider)
 * - Atomic transactional outbox dispatch for payment side-effects
 * - Order retrieval and purchase history queries
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(PAYMENTS_REPOSITORY_TOKEN)
    private readonly paymentsRepo: IPaymentsRepository,
    @Inject(STRIPE_PROVIDER_TOKEN)
    private readonly stripeProvider: IStripeProvider,
    @Inject(ESEWA_PROVIDER_TOKEN)
    private readonly esewaProvider: IEsewaProvider,
    private readonly mailService: MailService,
  ) {}

  async getQuote(
    request: PaymentQuoteRequestDto,
  ): Promise<PaymentQuoteResponse> {
    const pricedCart = await this.buildPricedCart(request.items);
    const stripeQuote = this.stripeProvider.buildQuote(pricedCart);
    const esewaQuote = this.esewaProvider.buildQuote(pricedCart);

    return {
      items: pricedCart.map((item) => ({
        productId: item.productId,
        slug: item.slug,
        name: item.name,
        quantity: item.quantity,
        unitAmount: item.unitAmountUsd,
        lineTotal: item.unitAmountUsd * item.quantity,
      })),
      providers: [stripeQuote, esewaQuote],
    };
  }

  async createStripeCheckoutSession(
    request: CreatePaymentSessionDto,
    userId?: string,
  ): Promise<CreateStripeCheckoutSessionResponse> {
    const pricedCart = await this.buildPricedCart(request.items);
    const quote = this.stripeProvider.buildQuote(pricedCart);

    if (!quote.enabled) {
      throw new BadRequestException(
        quote.reasonUnavailable ?? 'Stripe is not currently available.',
      );
    }

    const order = await this.createOrderSnapshot(
      PaymentProvider.STRIPE,
      request.customer,
      pricedCart,
      quote,
      userId,
    );

    try {
      const response = await this.stripeProvider.createCheckoutSession({
        orderNumber: order.orderNumber,
        customerEmail: request.customer.email,
        pricedCart,
        quote,
      });

      await this.paymentsRepo.updateOrderStatus(
        order.orderNumber,
        'pending',
        response.orderNumber,
      );

      return response;
    } catch (error) {
      await this.markOrderAsFailed(
        order.orderNumber,
        'Stripe session creation failed before redirect.',
      );
      throw error;
    }
  }

  async createEsewaCheckout(
    request: CreatePaymentSessionDto,
    userId?: string,
  ): Promise<EsewaCheckoutResponse> {
    const pricedCart = await this.buildPricedCart(request.items);
    const quote = this.esewaProvider.buildQuote(pricedCart);

    if (!quote.enabled) {
      throw new BadRequestException(
        quote.reasonUnavailable ?? 'eSewa is not currently available.',
      );
    }

    const order = await this.createOrderSnapshot(
      PaymentProvider.ESEWA,
      request.customer,
      pricedCart,
      quote,
      userId,
    );

    const checkoutResponse = this.esewaProvider.createCheckout({
      orderNumber: order.orderNumber,
      quote,
    });

    await this.paymentsRepo.updateOrderStatus(
      order.orderNumber,
      'pending',
      order.orderNumber,
    );

    return checkoutResponse;
  }

  async handleStripeWebhook(
    rawBody: Buffer | undefined,
    stripeSignature: string | undefined,
  ): Promise<{ received: true }> {
    const event = this.stripeProvider.constructWebhookEvent(
      rawBody,
      stripeSignature,
    );

    // Webhook Deduplication via Idempotency Key
    const idempotencyKey = `stripe_webhook:${event.id}`;
    const isDuplicate = await this.checkWebhookIdempotency(idempotencyKey);

    if (isDuplicate) {
      this.logger.log({
        event: 'webhook_duplicate_ignored',
        stripeEventId: event.id,
        stripeEventType: event.type,
        message: 'Duplicate webhook ignored (already processed)',
      });
      return { received: true };
    }

    await this.markWebhookAsProcessing(idempotencyKey);

    try {
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
          const session = event.data.object as Stripe.Checkout.Session;
          await this.syncOrderWithStripeSession(session);
          break;
        }
        case 'checkout.session.async_payment_failed': {
          const session = event.data.object as Stripe.Checkout.Session;
          await this.markOrderAsFailed(
            this.stripeProvider.extractOrderNumber(session),
            'Stripe reported that the asynchronous payment failed.',
          );
          break;
        }
        case 'checkout.session.expired': {
          const session = event.data.object as Stripe.Checkout.Session;
          const orderNumber = this.stripeProvider.extractOrderNumber(session);
          if (orderNumber) {
            await this.updateOrderStatus(
              orderNumber,
              OrderStatus.EXPIRED,
              'Stripe Checkout session expired before payment completion.',
            );
          }
          break;
        }
        default:
          this.logger.log({
            event: 'webhook_unknown_type',
            stripeEventId: event.id,
            stripeEventType: event.type,
          });
          break;
      }

      await this.markWebhookAsProcessed(idempotencyKey);
    } catch (error) {
      await this.removeWebhookIdempotency(idempotencyKey);
      throw error;
    }

    return { received: true };
  }

  async syncStripeSessionStatus(
    checkoutSessionId: string,
    requestedOrderNumber?: string,
  ): Promise<StripeSessionStatusResponse> {
    const session =
      await this.stripeProvider.retrieveSession(checkoutSessionId);

    const orderNumber =
      requestedOrderNumber ||
      this.stripeProvider.extractOrderNumber(session);

    if (!orderNumber) {
      throw new NotFoundException(
        'The Stripe session did not include an order reference.',
      );
    }

    if (session.payment_status === 'paid') {
      await this.syncOrderWithStripeSession(session);
    } else if (session.status === 'expired') {
      await this.updateOrderStatus(
        orderNumber,
        OrderStatus.EXPIRED,
        'Stripe session was retrieved as expired.',
      );
    }

    const order = await this.getOrderByOrderNumber(orderNumber);

    return {
      order: this.mapOrderSummary(order),
      checkoutSessionId,
      sessionStatus: session.status ?? null,
      paymentStatus: session.payment_status ?? null,
    };
  }

  async getOrderSummary(orderNumber: string): Promise<OrderSummaryResponse> {
    const order = await this.getOrderByOrderNumber(orderNumber);
    return this.mapOrderSummary(order);
  }

  async getOrdersForUser(
    userId?: string,
    userEmail?: string,
  ): Promise<OrderSummaryResponse[]> {
    const rows = await this.paymentsRepo.findOrdersByUserIdOrEmail(
      userId,
      userEmail,
    );

    return rows.map((order) => {
      const items = (order.order_items || []).map((oi: any) => ({
        productId: String(oi.product_id),
        slug: (oi.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: oi.name,
        quantity: oi.quantity,
        unitAmount: Number(oi.price),
        lineTotal: Number(oi.subtotal),
        currency: 'USD',
      }));

      const total = Number(order.total_amount);
      const createdAtRaw = order.created_at;
      const createdAt =
        createdAtRaw instanceof Date
          ? createdAtRaw.toISOString()
          : typeof createdAtRaw === 'string'
            ? createdAtRaw
            : new Date().toISOString();

      return {
        orderNumber: order.order_number,
        status:
          order.status === 'paid'
            ? OrderStatus.PAID
            : order.status === 'failed'
              ? OrderStatus.FAILED
              : OrderStatus.PENDING_PAYMENT,
        paymentProvider:
          order.payment_method?.toUpperCase() === 'ESEWA'
            ? PaymentProvider.ESEWA
            : PaymentProvider.STRIPE,
        customer: {
          fullName: order.users?.name || order.users?.email || 'Customer',
          email: order.users?.email || '',
        },
        pricing: {
          currency: 'USD',
          subtotal: total,
          taxAmount: 0,
          serviceCharge: 0,
          deliveryCharge: 0,
          total,
        },
        items,
        paymentReference: order.payment_intent_id ?? undefined,
        createdAt,
      };
    });
  }

  async getPurchasedProductsForUser(
    userId?: string,
    userEmail?: string,
  ): Promise<{
    productIds: string[];
    items: Array<{
      productId: string;
      name: string;
      slug: string;
      purchasedAt: string;
      orderNumber: string;
    }>;
    totalOrders: number;
  }> {
    const orders = await this.getOrdersForUser(userId, userEmail);
    const paidOrders = orders.filter((o) => o.status === OrderStatus.PAID);

    const seenIds = new Set<string>();
    const items: Array<{
      productId: string;
      name: string;
      slug: string;
      purchasedAt: string;
      orderNumber: string;
    }> = [];

    for (const order of paidOrders) {
      for (const item of order.items) {
        if (!seenIds.has(item.productId)) {
          seenIds.add(item.productId);
          items.push({
            productId: item.productId,
            name: item.name,
            slug: item.slug,
            purchasedAt: order.createdAt,
            orderNumber: order.orderNumber,
          });
        }
      }
    }

    return {
      productIds: Array.from(seenIds),
      items,
      totalOrders: orders.length,
    };
  }

  async handleEsewaSuccessRedirect(
    orderNumber: string,
    query: Record<string, string | undefined>,
  ): Promise<string> {
    const order = await this.getOrderByOrderNumber(orderNumber);
    const verification = this.esewaProvider.verifyCallbackPayload(query);

    if (!verification.verified || !verification.payload) {
      await this.markOrderAsFailed(
        orderNumber,
        verification.failureReason ??
          'The eSewa success callback signature could not be verified.',
      );
      return this.esewaProvider.buildFrontendResultUrl(orderNumber, 'failed');
    }

    const successPayload = verification.payload;
    const statusResponse = await this.esewaProvider.queryStatus({
      transactionUuid:
        (successPayload.transaction_uuid ||
          order.providerMetadata.esewaTransactionUuid) ??
        null,
      totalAmount: String(successPayload.total_amount ?? order.pricing.total),
    });

    if (statusResponse.status === 'COMPLETE') {
      await this.markOrderAsPaid(order.orderNumber, {
        providerReference:
          statusResponse.ref_id ?? successPayload.transaction_code,
        paymentReference:
          successPayload.transaction_code ?? statusResponse.ref_id,
        providerMetadata: {
          esewaTransactionUuid:
            successPayload.transaction_uuid ??
            order.providerMetadata.esewaTransactionUuid,
          esewaTransactionCode: successPayload.transaction_code ?? null,
          esewaReferenceId: statusResponse.ref_id ?? null,
        },
        note: 'eSewa status check confirmed a complete payment.',
      });

      return this.esewaProvider.buildFrontendResultUrl(
        order.orderNumber,
        'success',
      );
    }

    const mappedStatus =
      statusResponse.status === 'CANCELED'
        ? OrderStatus.CANCELED
        : statusResponse.status === 'PENDING' ||
            statusResponse.status === 'AMBIGUOUS'
          ? OrderStatus.PENDING_PAYMENT
          : OrderStatus.FAILED;

    await this.updateOrderStatus(
      order.orderNumber,
      mappedStatus,
      `eSewa status check returned ${statusResponse.status}.`,
      statusResponse.ref_id ?? null,
      successPayload.transaction_code ?? null,
    );

    return this.esewaProvider.buildFrontendResultUrl(
      order.orderNumber,
      mappedStatus === OrderStatus.PENDING_PAYMENT ? 'pending' : 'failed',
    );
  }

  async handleEsewaFailureRedirect(orderNumber: string): Promise<string> {
    await this.updateOrderStatus(
      orderNumber,
      OrderStatus.CANCELED,
      'Customer returned from eSewa without completing payment.',
    );

    return this.esewaProvider.buildFrontendResultUrl(orderNumber, 'failed');
  }

  private async buildPricedCart(
    items: Array<{ productId: string; quantity: number }>,
  ): Promise<PricedCartLine[]> {
    const normalizedItems = this.mergeDuplicateCartItems(items);
    const requestedIds = normalizedItems.map((item) => item.productId);

    const intIds = requestedIds
      .map((id) => parseInt(id, 10))
      .filter((id) => !isNaN(id));

    const products = await this.paymentsRepo.findProductsByIds(intIds);

    if (products.length !== normalizedItems.length) {
      throw new BadRequestException(
        'One or more cart items are no longer available in the catalog.',
      );
    }

    const productMap = new Map(
      products.map((r) => [String(r.id), r] as const),
    );

    return normalizedItems.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new BadRequestException(
          'A requested cart item could not be found in the catalog.',
        );
      }
      const price = Number(product.price) || 0;
      const stock = product.stock ?? 50;

      if (stock < item.quantity) {
        throw new BadRequestException(
          `${product.name} only has ${stock} units left in stock.`,
        );
      }

      const slug = (product.name || `product-${product.id}`)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      return {
        productId: String(product.id),
        slug,
        name: product.name,
        quantity: item.quantity,
        unitAmountUsd: price,
        unitAmountNpr: Math.round(price * 135),
      };
    });
  }

  private mergeDuplicateCartItems(
    items: Array<{ productId: string; quantity: number }>,
  ): Array<{ productId: string; quantity: number }> {
    const mergedItems = new Map<string, number>();

    for (const item of items) {
      mergedItems.set(
        item.productId,
        (mergedItems.get(item.productId) ?? 0) + item.quantity,
      );
    }

    return Array.from(mergedItems.entries()).map(([productId, quantity]) => ({
      productId,
      quantity,
    }));
  }

  private async createOrderSnapshot(
    provider: PaymentProvider,
    customer: CheckoutCustomerDto,
    pricedCart: PricedCartLine[],
    quote: ProviderQuote,
    userId?: string,
  ): Promise<OrderRecord> {
    const orderNumber = this.generateOrderNumber();
    let numericUserId: number | null = null;
    if (userId && /^\d+$/.test(userId)) {
      numericUserId = parseInt(userId, 10);
    } else {
      const user = await this.paymentsRepo.findOrCreateCustomer(
        customer.email,
        customer.fullName,
      );
      numericUserId = user.id;
    }

    if (!numericUserId) {
      numericUserId = await this.paymentsRepo.getFirstUserId();
    }

    await this.paymentsRepo.createOrderSnapshot({
      userId: numericUserId,
      orderNumber,
      totalAmount: quote.total,
      status: 'pending',
      paymentMethod: provider.toLowerCase(),
      items: pricedCart.map((item) => {
        const intProdId = parseInt(item.productId, 10);
        return {
          productId: !isNaN(intProdId) ? intProdId : 1,
          name: item.name,
          price:
            provider === PaymentProvider.STRIPE
              ? item.unitAmountUsd
              : (item.unitAmountNpr ?? 0),
          quantity: item.quantity,
        };
      }),
    });

    const snapshot: OrderRecord = {
      orderNumber,
      userId: userId ?? null,
      paymentProvider: provider,
      status: OrderStatus.PENDING_PAYMENT,
      customer: {
        fullName: customer.fullName,
        email: customer.email.toLowerCase(),
        phone: customer.phone ?? null,
        addressLine1: customer.addressLine1 ?? null,
        city: customer.city ?? null,
        country: customer.country ?? null,
      },
      items: pricedCart.map((item) => ({
        productId: item.productId,
        slug: item.slug,
        name: item.name,
        quantity: item.quantity,
        unitAmount:
          provider === PaymentProvider.STRIPE
            ? item.unitAmountUsd
            : (item.unitAmountNpr ?? 0),
        lineTotal:
          (provider === PaymentProvider.STRIPE
            ? item.unitAmountUsd
            : (item.unitAmountNpr ?? 0)) * item.quantity,
        currency: quote.currency,
      })),
      pricing: {
        currency: quote.currency,
        subtotal: quote.subtotal,
        taxAmount: quote.taxAmount,
        serviceCharge: quote.serviceCharge,
        deliveryCharge: quote.deliveryCharge,
        total: quote.total,
      },
      providerMetadata: {},
      history: [
        {
          status: OrderStatus.PENDING_PAYMENT,
          note: `Order created for ${provider} checkout.`,
          changedAt: new Date(),
        },
      ],
    };

    return snapshot;
  }

  private async syncOrderWithStripeSession(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const orderNumber = this.stripeProvider.extractOrderNumber(session);

    if (!orderNumber) {
      this.logger.warn(
        `Stripe session ${session.id} was missing metadata.orderNumber/client_reference_id.`,
      );
      return;
    }

    if (session.payment_status === 'paid') {
      await this.markOrderAsPaid(orderNumber, {
        providerReference: session.id,
        paymentReference:
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : null,
        providerMetadata: {
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId:
            typeof session.payment_intent === 'string'
              ? session.payment_intent
              : null,
        },
        note: 'Stripe webhook confirmed the Checkout Session as paid.',
      });
    }
  }

  private async markOrderAsPaid(
    orderNumber: string,
    options: {
      providerReference?: string | null;
      paymentReference?: string | null;
      providerMetadata?: ProviderMetadata;
      note: string;
    },
  ): Promise<void> {
    const order = await this.getOrderByOrderNumber(orderNumber);

    if (order.status === OrderStatus.PAID) {
      return;
    }

    order.status = OrderStatus.PAID;
    order.paidAt = new Date();
    order.failureReason = null;
    order.providerReference =
      options.providerReference ?? order.providerReference;
    order.paymentReference = options.paymentReference ?? order.paymentReference;

    if (options.providerMetadata) {
      order.providerMetadata = {
        ...order.providerMetadata,
        ...options.providerMetadata,
      };
    }

    order.history.push({
      status: OrderStatus.PAID,
      note: options.note,
      changedAt: new Date(),
    });

    // Transactional Outbox Pattern: Atomic Order State + Outbox Event Commit
    await this.paymentsRepo.markOrderAsPaidAtomic({
      orderNumber,
      paymentIntentId:
        order.paymentReference ??
        order.providerReference ??
        order.providerMetadata?.stripeCheckoutSessionId ??
        null,
      outboxEvent: {
        aggregateId: orderNumber,
        aggregateType: 'Order',
        eventType: 'order.paid',
        payload: {
          orderNumber,
          userId: order.userId,
          provider: order.paymentProvider,
          providerReference: order.providerReference ?? null,
          paymentReference: order.paymentReference ?? null,
          providerMetadata: order.providerMetadata,
          customerEmail: order.customer.email,
          customerName: order.customer.fullName,
          pricingTotal: order.pricing.total,
          pricingCurrency: order.pricing.currency,
          items: order.items.map((i) => ({
            productId: i.productId,
            name: i.name,
            quantity: i.quantity,
          })),
          note: options.note,
        },
        nextAttemptAt: new Date(),
      },
    });

    this.logger.log({
      event: 'order_paid_committed',
      orderNumber,
      message: 'Order status and outbox event committed atomically',
    });

    // Fast-path best-effort side-effects: inventory decrement
    setImmediate(async () => {
      try {
        const stockItems = order.items
          .map((item) => ({
            productId: parseInt(item.productId, 10),
            quantity: item.quantity,
          }))
          .filter((item) => !isNaN(item.productId));

        await this.paymentsRepo.decrementProductStock(stockItems);
        this.logger.log(
          `✅ Inventory decremented for order ${orderNumber} (fast path)`,
        );
      } catch (pgErr: unknown) {
        const message = pgErr instanceof Error ? pgErr.message : String(pgErr);
        this.logger.warn(
          `Inventory fast-path failed for ${orderNumber}, OutboxWorker will retry: ${message}`,
        );
      }
    });

    // Fast-path best-effort side-effects: confirmation email
    setImmediate(async () => {
      try {
        await this.mailService.sendOrderConfirmation(order);
      } catch (emailError) {
        this.logger.warn(
          `Email fast-path failed for ${orderNumber}, OutboxWorker will retry: ` +
            (emailError instanceof Error
              ? emailError.message
              : String(emailError)),
        );
      }
    });
  }

  private async markOrderAsFailed(
    orderNumber: string | null,
    failureReason: string,
  ): Promise<void> {
    if (!orderNumber) {
      return;
    }

    await this.updateOrderStatus(
      orderNumber,
      OrderStatus.FAILED,
      failureReason,
    );
  }

  private async updateOrderStatus(
    orderNumber: string,
    status: OrderStatus,
    note: string,
    providerReference?: string | null,
    paymentReference?: string | null,
  ): Promise<void> {
    const order = await this.getOrderByOrderNumber(orderNumber);

    if (order.status === OrderStatus.PAID && status !== OrderStatus.PAID) {
      this.logger.warn(
        `Attempted to change order ${orderNumber} status from PAID to ${status}. Update rejected.`,
      );
      return;
    }

    order.status = status;
    order.providerReference = providerReference ?? order.providerReference;
    order.paymentReference = paymentReference ?? order.paymentReference;

    if (status === OrderStatus.FAILED) {
      order.failureReason = note;
    }

    order.history.push({
      status,
      note,
      changedAt: new Date(),
    });

    const dbStatus =
      status === OrderStatus.PAID
        ? 'paid'
        : status === OrderStatus.FAILED
          ? 'failed'
          : 'pending';

    const ref = paymentReference ?? providerReference ?? null;
    await this.paymentsRepo.updateOrderStatus(orderNumber, dbStatus, ref);
  }

  private async getOrderByOrderNumber(
    orderNumber: string,
  ): Promise<OrderRecord> {
    const order = await this.paymentsRepo.findOrderByOrderNumber(orderNumber);

    if (!order) {
      throw new NotFoundException(
        `Order with number "${orderNumber}" was not found.`,
      );
    }

    const items = (order.order_items || []).map(
      (oi: {
        product_id: any;
        name: string;
        quantity: any;
        price: any;
        subtotal: any;
      }) => ({
        productId: String(oi.product_id),
        slug: oi.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: oi.name,
        quantity: oi.quantity,
        unitAmount: Number(oi.price),
        lineTotal: Number(oi.subtotal),
        currency: 'USD',
      }),
    );

    const total = Number(order.total_amount);

    const snapshot: OrderRecord = {
      orderNumber: order.order_number,
      userId: String(order.user_id),
      paymentProvider:
        order.payment_method?.toUpperCase() === 'ESEWA'
          ? PaymentProvider.ESEWA
          : PaymentProvider.STRIPE,
      status:
        order.status === 'paid'
          ? OrderStatus.PAID
          : order.status === 'failed'
            ? OrderStatus.FAILED
            : OrderStatus.PENDING_PAYMENT,
      customer: {
        fullName: order.users?.name || order.users?.email || 'Customer',
        email: order.users?.email || '',
        phone: null,
      },
      items,
      pricing: {
        currency: 'USD',
        subtotal: total,
        taxAmount: 0,
        serviceCharge: 0,
        deliveryCharge: 0,
        total,
      },
      providerMetadata: {},
      history: [],
      paymentReference: order.payment_intent_id ?? undefined,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    };

    return snapshot;
  }

  private mapOrderSummary(order: OrderRecord): OrderSummaryResponse {
    const createdAtRaw = order.createdAt;
    const createdAt =
      createdAtRaw instanceof Date
        ? createdAtRaw.toISOString()
        : typeof createdAtRaw === 'string'
          ? createdAtRaw
          : new Date().toISOString();

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      paymentProvider: order.paymentProvider,
      customer: {
        fullName: order.customer.fullName,
        email: order.customer.email,
        phone: order.customer.phone ?? undefined,
      },
      pricing: {
        currency: order.pricing.currency,
        subtotal: order.pricing.subtotal,
        taxAmount: order.pricing.taxAmount,
        serviceCharge: order.pricing.serviceCharge,
        deliveryCharge: order.pricing.deliveryCharge,
        total: order.pricing.total,
      },
      items: order.items.map((item) => ({
        productId: item.productId,
        slug: item.slug,
        name: item.name,
        quantity: item.quantity,
        unitAmount: item.unitAmount,
        lineTotal: item.lineTotal,
        currency: item.currency,
      })),
      providerReference: order.providerReference,
      paymentReference: order.paymentReference,
      failureReason: order.failureReason,
      createdAt,
    };
  }

  private generateOrderNumber(): string {
    const now = new Date();
    const datePart = `${now.getUTCFullYear().toString().slice(-2)}${String(
      now.getUTCMonth() + 1,
    ).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const randomSuffix = randomBytes(3).toString('hex').toUpperCase();
    return `ACL-${datePart}-${randomSuffix}`;
  }

  private async checkWebhookIdempotency(key: string): Promise<boolean> {
    return this.paymentsRepo.checkIdempotencyKey(key);
  }

  private async markWebhookAsProcessing(key: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72);
    await this.paymentsRepo.createIdempotencyKey(key, expiresAt);
  }

  private async markWebhookAsProcessed(key: string): Promise<void> {
    await this.paymentsRepo.markIdempotencyKeyProcessed(key);
  }

  private async removeWebhookIdempotency(key: string): Promise<void> {
    await this.paymentsRepo.deleteIdempotencyKey(key);
  }
}
