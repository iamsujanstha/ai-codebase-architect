import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import axios from 'axios';
import { createHmac, randomBytes } from 'crypto';
import { FilterQuery, Model, Types } from 'mongoose';
import Stripe from 'stripe';
import { Product, ProductDocument } from '../catalog/schemas/product.schema';
import { PostgresService } from '../database/postgres.service';
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
  QuotedLineItem,
} from './interfaces/payment-quote.interface';
import { Order, OrderDocument } from './schemas/order.schema';
import { MailService } from '../mail/mail.service';
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
} from '../common/utils/circuit-breaker.util';
import { retryWithBackoff } from '../common/utils/retry.util';

interface PricedCartLine {
  productId: string;
  slug: string;
  name: string;
  quantity: number;
  unitAmountUsd: number;
  unitAmountNpr: number | null;
}

interface QuoteBreakdown {
  currency: string;
  subtotal: number;
  taxAmount: number;
  serviceCharge: number;
  deliveryCharge: number;
  total: number;
}

interface EsewaSuccessPayload {
  transaction_code?: string;
  status?: string;
  total_amount?: number | string;
  transaction_uuid?: string;
  product_code?: string;
  signed_field_names?: string;
  signature?: string;
}

// The payment service is the orchestration layer for commerce payments.
// It does not trust client-side prices, quantities, or provider callbacks blindly.
//
// Production best-practice themes reflected here:
// - server-side pricing
// - provider-specific order snapshots
// - webhook verification
// - signed callback verification
// - consistent internal order state no matter which provider is used
//
// PHASE 2 IMPROVEMENTS:
// - Circuit breaker for Stripe API (prevents cascading failures)
// - Retry with exponential backoff (handles transient errors)
// - Fail fast when Stripe is down (better UX)
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly frontendPublicUrl =
    process.env.FRONTEND_PUBLIC_URL ?? 'http://localhost:8080';
  private readonly backendPublicUrl =
    process.env.BACKEND_PUBLIC_URL ?? 'http://localhost:3000';
  private readonly stripeAutomaticTaxEnabled =
    (process.env.STRIPE_AUTOMATIC_TAX_ENABLED ?? 'false') === 'true';
  private readonly stripeShippingFeeUsd = Number(
    process.env.STRIPE_SHIPPING_FEE_USD ?? '0',
  );
  private readonly esewaTaxAmountNpr = Number(
    process.env.ESEWA_TAX_AMOUNT_NPR ?? '0',
  );
  private readonly esewaServiceChargeNpr = Number(
    process.env.ESEWA_SERVICE_CHARGE_NPR ?? '0',
  );
  private readonly esewaDeliveryChargeNpr = Number(
    process.env.ESEWA_DELIVERY_CHARGE_NPR ?? '0',
  );
  private readonly esewaProductCode = process.env.ESEWA_PRODUCT_CODE ?? '';
  private readonly esewaSecretKey = process.env.ESEWA_SECRET_KEY ?? '';
  private readonly esewaFormUrl =
    process.env.ESEWA_FORM_URL ??
    'https://rc-epay.esewa.com.np/api/epay/main/v2/form';
  private readonly esewaStatusCheckUrl =
    process.env.ESEWA_STATUS_CHECK_URL ??
    'https://rc.esewa.com.np/api/epay/transaction/status/';
  private readonly stripeWebhookSecret =
    process.env.STRIPE_WEBHOOK_SECRET ?? '';
  private readonly stripeClient: Stripe | null;

  /**
   * PHASE 2: Circuit breaker for Stripe API calls
   *
   * Why: Stripe API failures should not cascade to entire system
   * Threshold: 3 failures (payments are critical, fail fast)
   * Reset: 60 seconds (give Stripe time to recover)
   *
   * Behavior:
   * - First 3 Stripe failures: Try normally (with retry)
   * - After 3 failures: Circuit opens
   * - While open: Reject immediately (no timeout wait)
   * - After 60s: Try one request (half-open)
   * - If success: Circuit closes
   * - If failure: Circuit opens again
   */
  private readonly stripeCircuitBreaker = new CircuitBreaker({
    name: 'stripe-api',
    failureThreshold: 3,
    resetTimeout: 60000,
  });

  /**
   * PHASE 2: Circuit breaker for eSewa API calls
   *
   * Threshold: 5 failures (less critical, more tolerant)
   * Reset: 120 seconds (longer recovery time)
   */
  private readonly esewaCircuitBreaker = new CircuitBreaker({
    name: 'esewa-api',
    failureThreshold: 5,
    resetTimeout: 120000,
  });

  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Order.name)
    private readonly orderModel: Model<OrderDocument>,
    private readonly mailService: MailService,
    @Optional()
    private readonly postgresService?: PostgresService,
  ) {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? '';
    this.stripeClient = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
  }

  async getQuote(
    request: PaymentQuoteRequestDto,
  ): Promise<PaymentQuoteResponse> {
    const pricedCart = await this.buildPricedCart(request.items);
    const stripeQuote = this.buildStripeQuote(pricedCart);
    const esewaQuote = this.buildEsewaQuote(pricedCart);

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
    if (!this.stripeClient) {
      throw new BadRequestException(
        'Stripe is not configured. Add STRIPE_SECRET_KEY to enable this provider.',
      );
    }

    const pricedCart = await this.buildPricedCart(request.items);
    const quote = this.buildStripeQuote(pricedCart);

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
      /**
       * PHASE 2: Circuit breaker + retry for Stripe API calls
       *
       * Flow:
       * 1. Check circuit state (closed/open/half-open)
       * 2. If open: Throw immediately (fail fast)
       * 3. If closed/half-open: Execute with retry
       * 4. Retry up to 3 times with exponential backoff (100ms → 200ms → 400ms)
       * 5. If all retries fail: Circuit breaker counts as 1 failure
       * 6. After 3 failures: Circuit opens
       *
       * Benefits:
       * - Transient errors: Recovered by retry (user doesn't see error)
       * - Sustained outage: Circuit opens (fail fast, no timeout wait)
       * - Better UX: "Payment system unavailable, try again in 1 minute"
       */
      const stripeSession = await this.stripeCircuitBreaker.execute(
        async () => {
          return await retryWithBackoff(
            async () => {
              return await this.stripeClient!.checkout.sessions.create(
                {
                  mode: 'payment',
                  client_reference_id: order.orderNumber,
                  customer_creation: 'always',
                  customer_email: request.customer.email,
                  billing_address_collection: 'auto',
                  phone_number_collection: {
                    enabled: true,
                  },
                  automatic_tax: {
                    enabled: this.stripeAutomaticTaxEnabled,
                  },
                  success_url: `${this.frontendPublicUrl}/checkout/result?provider=stripe&orderNumber=${encodeURIComponent(order.orderNumber)}&session_id={CHECKOUT_SESSION_ID}`,
                  cancel_url: `${this.frontendPublicUrl}/checkout/result?provider=stripe&orderNumber=${encodeURIComponent(order.orderNumber)}&status=canceled`,
                  line_items: this.buildStripeLineItems(pricedCart, quote),
                  metadata: {
                    orderNumber: order.orderNumber,
                    customerEmail: request.customer.email,
                    paymentProvider: PaymentProvider.STRIPE,
                  },
                  payment_intent_data: {
                    metadata: {
                      orderNumber: order.orderNumber,
                      paymentProvider: PaymentProvider.STRIPE,
                    },
                  },
                  expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
                },
                {
                  idempotencyKey: `order-${order.orderNumber}`,
                },
              );
            },
            {
              maxRetries: 3,
              initialDelay: 100,
              context: 'stripe-checkout-session',
              shouldRetry: (error, attempt) => {
                // Retry on network errors
                if (
                  error.code === 'ECONNREFUSED' ||
                  error.code === 'ETIMEDOUT'
                ) {
                  return true;
                }
                // Retry on Stripe rate limit
                if (error.type === 'StripeRateLimitError') {
                  return true;
                }
                // Retry on Stripe API errors (but not card errors)
                if (error.type === 'StripeAPIError') {
                  return true;
                }
                // Don't retry card errors (user needs to fix)
                if (error.type === 'StripeCardError') {
                  return false;
                }
                // Don't retry invalid request (our bug, not transient)
                if (error.type === 'StripeInvalidRequestError') {
                  return false;
                }
                return false;
              },
            },
          );
        },
      );

      order.providerMetadata.stripeCheckoutSessionId = stripeSession.id;
      order.history.push({
        status: OrderStatus.PENDING_PAYMENT,
        note: 'Stripe Checkout Session created.',
        changedAt: new Date(),
      });
      await order.save();

      if (!stripeSession.url) {
        throw new InternalServerErrorException(
          'Stripe returned a checkout session without a redirect URL.',
        );
      }

      return {
        orderNumber: order.orderNumber,
        checkoutUrl: stripeSession.url,
      };
    } catch (error) {
      await this.markOrderAsFailed(
        order.orderNumber,
        'Stripe session creation failed before redirect.',
      );

      // Circuit breaker open: Return user-friendly error
      if (error instanceof CircuitBreakerOpenError) {
        this.logger.error({
          event: 'stripe_circuit_open',
          orderNumber: order.orderNumber,
          message: 'Stripe circuit breaker is open - service appears down',
        });
        throw new ServiceUnavailableException(
          'Payment system is temporarily unavailable. Please try again in 1 minute.',
        );
      }

      this.logger.error(
        'Stripe checkout session creation failed.',
        error instanceof Error ? error.stack : String(error),
      );
      throw new InternalServerErrorException(
        'The server could not create a Stripe checkout session.',
      );
    }
  }

  async createEsewaCheckout(
    request: CreatePaymentSessionDto,
    userId?: string,
  ): Promise<EsewaCheckoutResponse> {
    const pricedCart = await this.buildPricedCart(request.items);
    const quote = this.buildEsewaQuote(pricedCart);

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

    const fields = {
      amount: this.formatEsewaAmount(quote.subtotal),
      tax_amount: this.formatEsewaAmount(quote.taxAmount),
      total_amount: this.formatEsewaAmount(quote.total),
      transaction_uuid: order.orderNumber,
      product_code: this.esewaProductCode,
      product_service_charge: this.formatEsewaAmount(quote.serviceCharge),
      product_delivery_charge: this.formatEsewaAmount(quote.deliveryCharge),
      success_url: `${this.backendPublicUrl}/payments/esewa/success?orderNumber=${encodeURIComponent(order.orderNumber)}`,
      failure_url: `${this.backendPublicUrl}/payments/esewa/failure?orderNumber=${encodeURIComponent(order.orderNumber)}`,
      signed_field_names: 'total_amount,transaction_uuid,product_code',
      signature: this.generateEsewaSignature({
        total_amount: this.formatEsewaAmount(quote.total),
        transaction_uuid: order.orderNumber,
        product_code: this.esewaProductCode,
      }),
    };

    order.providerMetadata.esewaTransactionUuid = order.orderNumber;
    order.history.push({
      status: OrderStatus.PENDING_PAYMENT,
      note: 'eSewa payment redirect prepared.',
      changedAt: new Date(),
    });
    await order.save();

    return {
      orderNumber: order.orderNumber,
      actionUrl: this.esewaFormUrl,
      method: 'POST',
      fields,
    };
  }

  async handleStripeWebhook(
    rawBody: Buffer | undefined,
    stripeSignature: string | undefined,
  ): Promise<{ received: true }> {
    if (!this.stripeClient || !this.stripeWebhookSecret) {
      throw new BadRequestException(
        'Stripe webhook handling requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.',
      );
    }

    if (!rawBody || !stripeSignature) {
      throw new BadRequestException(
        'Stripe webhook signature verification requires the raw body and Stripe-Signature header.',
      );
    }

    let event: Stripe.Event;

    try {
      event = this.stripeClient.webhooks.constructEvent(
        rawBody,
        stripeSignature,
        this.stripeWebhookSecret,
      );
    } catch (error) {
      this.logger.warn(
        `Stripe webhook signature verification failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new BadRequestException('Invalid Stripe webhook signature.');
    }

    // PHASE 1 CRITICAL FIX: Webhook Deduplication
    // Stripe may send the same webhook multiple times (network retry, failover)
    // Use Stripe event ID as idempotency key to prevent duplicate processing
    const idempotencyKey = `stripe_webhook:${event.id}`;
    const isDuplicate = await this.checkWebhookIdempotency(idempotencyKey);

    if (isDuplicate) {
      this.logger.log({
        event: 'webhook_duplicate_ignored',
        stripeEventId: event.id,
        stripeEventType: event.type,
        message: 'Duplicate webhook ignored (already processed)',
      });
      return { received: true }; // Return success (idempotent)
    }

    // Mark as processing (atomic operation prevents race condition)
    await this.markWebhookAsProcessing(idempotencyKey);

    try {
      switch (event.type) {
        case 'checkout.session.completed':
        case 'checkout.session.async_payment_succeeded': {
          const session = event.data.object;
          await this.syncOrderWithStripeSession(session);
          break;
        }
        case 'checkout.session.async_payment_failed': {
          const session = event.data.object;
          await this.markOrderAsFailed(
            this.extractOrderNumberFromStripeSession(session),
            'Stripe reported that the asynchronous payment failed.',
          );
          break;
        }
        case 'checkout.session.expired': {
          const session = event.data.object;
          const orderNumber = this.extractOrderNumberFromStripeSession(session);
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
          // Unknown event type, log but don't fail
          this.logger.log({
            event: 'webhook_unknown_type',
            stripeEventId: event.id,
            stripeEventType: event.type,
          });
          break;
      }

      // Mark as successfully processed
      await this.markWebhookAsProcessed(idempotencyKey);
    } catch (error) {
      // If processing fails, remove the idempotency key so Stripe can retry
      await this.removeWebhookIdempotency(idempotencyKey);
      throw error; // Let Stripe know to retry
    }

    return { received: true };
  }

  async syncStripeSessionStatus(
    checkoutSessionId: string,
    requestedOrderNumber?: string,
  ): Promise<StripeSessionStatusResponse> {
    if (!this.stripeClient) {
      throw new BadRequestException('Stripe is not configured.');
    }

    const session =
      await this.stripeClient.checkout.sessions.retrieve(checkoutSessionId);

    const orderNumber =
      requestedOrderNumber || this.extractOrderNumberFromStripeSession(session);

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

  async getOrdersForUser(userId: string): Promise<OrderSummaryResponse[]> {
    if (this.postgresService?.isReady()) {
      const numericUserId = parseInt(userId, 10);
      if (!isNaN(numericUserId)) {
        try {
          const pgRes = await this.postgresService.query(
            `SELECT o.*, 
                    COALESCE(json_agg(json_build_object(
                      'productId', oi.product_id::text,
                      'name', oi.name,
                      'quantity', oi.quantity,
                      'unitAmount', oi.price,
                      'lineTotal', oi.subtotal,
                      'currency', 'USD'
                    )) FILTER (WHERE oi.id IS NOT NULL), '[]') as items
             FROM orders o
             LEFT JOIN order_items oi ON oi.order_id = o.id
             WHERE o.user_id = $1
             GROUP BY o.id
             ORDER BY o.created_at DESC
             LIMIT 100`,
            [numericUserId],
          );
          if (pgRes.rows.length > 0) {
            return pgRes.rows.map((row) => ({
              orderNumber: row.order_number,
              status: row.status,
              paymentProvider: row.payment_method || 'stripe',
              customer: {
                fullName: 'Customer',
                email: '',
                phone: undefined,
                addressLine1: undefined,
                city: undefined,
                country: undefined,
              },
              items: row.items || [],
              pricing: {
                currency: 'USD',
                subtotal: parseFloat(row.total_amount) || 0,
                taxAmount: 0,
                serviceCharge: 0,
                deliveryCharge: 0,
                total: parseFloat(row.total_amount) || 0,
              },
              createdAt: row.created_at,
              updatedAt: row.updated_at,
            }));
          }
        } catch (err) {
          this.logger.warn(
            `Failed to fetch orders from Postgres: ${(err as any)?.message}`,
          );
        }
      }
    }

    const query: any = {
      $or: [{ userId }],
    };
    if (Types.ObjectId.isValid(userId)) {
      query.$or.push({ userId: new Types.ObjectId(userId) });
    }

    const orders = await this.orderModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .exec();

    return orders.map((order) => this.mapOrderSummary(order));
  }

  async handleEsewaSuccessRedirect(
    orderNumber: string,
    query: Record<string, string | undefined>,
  ): Promise<string> {
    const order = await this.getOrderByOrderNumber(orderNumber);
    const encodedPayload = query.data ?? this.extractEsewaEncodedPayload(query);

    if (!encodedPayload) {
      await this.markOrderAsFailed(
        orderNumber,
        'eSewa returned without an encoded success payload.',
      );
      return this.buildFrontendResultUrl(
        orderNumber,
        PaymentProvider.ESEWA,
        'failed',
      );
    }

    const successPayload = this.parseEsewaSuccessPayload(encodedPayload);
    const verifiedLocally =
      successPayload.signature &&
      successPayload.signed_field_names &&
      this.verifyEsewaSignature(
        successPayload,
        successPayload.signed_field_names,
      );

    if (!verifiedLocally) {
      await this.markOrderAsFailed(
        orderNumber,
        'The eSewa success callback signature could not be verified.',
      );
      return this.buildFrontendResultUrl(
        orderNumber,
        PaymentProvider.ESEWA,
        'failed',
      );
    }

    const statusResponse = await this.queryEsewaStatus({
      transactionUuid:
        successPayload.transaction_uuid ||
        order.providerMetadata.esewaTransactionUuid,
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

      return this.buildFrontendResultUrl(
        order.orderNumber,
        PaymentProvider.ESEWA,
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

    return this.buildFrontendResultUrl(
      order.orderNumber,
      PaymentProvider.ESEWA,
      mappedStatus === OrderStatus.PENDING_PAYMENT ? 'pending' : 'failed',
    );
  }

  async handleEsewaFailureRedirect(orderNumber: string): Promise<string> {
    await this.updateOrderStatus(
      orderNumber,
      OrderStatus.CANCELED,
      'Customer returned from eSewa without completing payment.',
    );

    return this.buildFrontendResultUrl(
      orderNumber,
      PaymentProvider.ESEWA,
      'failed',
    );
  }

  private async buildPricedCart(
    items: Array<{ productId: string; quantity: number }>,
  ): Promise<PricedCartLine[]> {
    const normalizedItems = this.mergeDuplicateCartItems(items);
    const requestedIds = normalizedItems.map((item) => item.productId);

    // If Neon PostgreSQL is available, query Postgres products table
    if (this.postgresService?.isReady()) {
      try {
        const intIds = requestedIds
          .map((id) => parseInt(id, 10))
          .filter((id) => !isNaN(id));

        if (intIds.length > 0) {
          const pgRes = await this.postgresService.query(
            `SELECT * FROM products WHERE id = ANY($1::int[])`,
            [intIds],
          );

          if (pgRes.rows.length === normalizedItems.length) {
            const productMap = new Map(
              pgRes.rows.map((r) => [String(r.id), r] as const),
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
        }
      } catch (err: any) {
        this.logger.warn(
          `PostgreSQL cart lookup: ${err.message}. Trying Mongo fallback.`,
        );
      }
    }

    const validMongoIds = requestedIds.filter((id) =>
      Types.ObjectId.isValid(id),
    );
    const products =
      validMongoIds.length > 0
        ? await this.productModel
            .find({
              _id: { $in: validMongoIds },
            } as FilterQuery<ProductDocument>)
            .lean()
        : [];

    if (products.length !== normalizedItems.length) {
      throw new BadRequestException(
        'One or more cart items are no longer available in the catalog.',
      );
    }

    const productMap = new Map(
      products.map((product) => [String(product._id), product] as const),
    );

    return normalizedItems.map((item) => {
      const product = productMap.get(item.productId);

      if (!product) {
        throw new BadRequestException(
          'A requested cart item could not be found in the catalog.',
        );
      }

      if (product.inventoryCount < item.quantity) {
        throw new BadRequestException(
          `${product.name} only has ${product.inventoryCount} units left in stock.`,
        );
      }

      return {
        productId: String(product._id),
        slug: product.slug,
        name: product.name,
        quantity: item.quantity,
        unitAmountUsd: product.price,
        unitAmountNpr: product.nprPrice ?? null,
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

  private buildStripeQuote(pricedCart: PricedCartLine[]): ProviderQuote {
    const subtotal = pricedCart.reduce(
      (total, item) => total + item.unitAmountUsd * item.quantity,
      0,
    );
    const breakdown = this.buildBreakdown({
      currency: 'USD',
      subtotal,
      taxAmount: 0,
      serviceCharge: 0,
      deliveryCharge: this.stripeShippingFeeUsd,
      total: 0,
    });

    return {
      provider: PaymentProvider.STRIPE,
      displayName: 'Stripe Checkout',
      enabled: Boolean(this.stripeClient),
      reasonUnavailable: this.stripeClient
        ? undefined
        : 'Add STRIPE_SECRET_KEY to enable hosted Stripe Checkout.',
      currency: breakdown.currency,
      subtotal: breakdown.subtotal,
      taxAmount: breakdown.taxAmount,
      serviceCharge: breakdown.serviceCharge,
      deliveryCharge: breakdown.deliveryCharge,
      total: breakdown.total,
      note: 'Stripe redirects customers to a hosted Checkout page. Payment confirmation is finalized server-side through signed webhooks.',
    };
  }

  private buildEsewaQuote(pricedCart: PricedCartLine[]): ProviderQuote {
    const productsMissingNprPricing = pricedCart.filter(
      (item) => item.unitAmountNpr === null,
    );

    if (productsMissingNprPricing.length > 0) {
      return {
        provider: PaymentProvider.ESEWA,
        displayName: 'eSewa ePay',
        enabled: false,
        reasonUnavailable:
          'One or more products are missing NPR pricing, so eSewa cannot price this cart safely.',
        currency: 'NPR',
        subtotal: 0,
        taxAmount: 0,
        serviceCharge: 0,
        deliveryCharge: 0,
        total: 0,
        note: 'eSewa requires merchant-signed NPR totals, so prices must be explicit rather than converted loosely at checkout time.',
      };
    }

    const subtotal = pricedCart.reduce(
      (total, item) => total + (item.unitAmountNpr ?? 0) * item.quantity,
      0,
    );
    const breakdown = this.buildBreakdown({
      currency: 'NPR',
      subtotal,
      taxAmount: this.esewaTaxAmountNpr,
      serviceCharge: this.esewaServiceChargeNpr,
      deliveryCharge: this.esewaDeliveryChargeNpr,
      total: 0,
    });
    const configured = Boolean(this.esewaProductCode && this.esewaSecretKey);

    return {
      provider: PaymentProvider.ESEWA,
      displayName: 'eSewa ePay',
      enabled: configured,
      reasonUnavailable: configured
        ? undefined
        : 'Add ESEWA_PRODUCT_CODE and ESEWA_SECRET_KEY to enable merchant-signed eSewa redirects.',
      currency: breakdown.currency,
      subtotal: breakdown.subtotal,
      taxAmount: breakdown.taxAmount,
      serviceCharge: breakdown.serviceCharge,
      deliveryCharge: breakdown.deliveryCharge,
      total: breakdown.total,
      note: 'eSewa uses a signed form POST and a server-side status verification call before the order is marked paid.',
    };
  }

  private buildBreakdown(input: QuoteBreakdown): QuoteBreakdown {
    const rounded = {
      currency: input.currency,
      subtotal: this.roundToCurrency(input.subtotal),
      taxAmount: this.roundToCurrency(input.taxAmount),
      serviceCharge: this.roundToCurrency(input.serviceCharge),
      deliveryCharge: this.roundToCurrency(input.deliveryCharge),
      total: 0,
    };

    rounded.total = this.roundToCurrency(
      rounded.subtotal +
        rounded.taxAmount +
        rounded.serviceCharge +
        rounded.deliveryCharge,
    );

    return rounded;
  }

  private buildStripeLineItems(
    pricedCart: PricedCartLine[],
    quote: ProviderQuote,
  ): Stripe.Checkout.SessionCreateParams.LineItem[] {
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
      pricedCart.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: 'usd',
          unit_amount: this.toStripeMinorUnits(item.unitAmountUsd),
          product_data: {
            name: item.name,
            metadata: {
              productId: item.productId,
              slug: item.slug,
            },
          },
        },
      }));

    if (quote.deliveryCharge > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: this.toStripeMinorUnits(quote.deliveryCharge),
          product_data: {
            name: 'Shipping',
            description: 'Merchant-managed shipping and handling',
          },
        },
      });
    }

    return lineItems;
  }

  private async createOrderSnapshot(
    provider: PaymentProvider,
    customer: CheckoutCustomerDto,
    pricedCart: PricedCartLine[],
    quote: ProviderQuote,
    userId?: string,
  ): Promise<OrderDocument> {
    const orderNumber = this.generateOrderNumber();

    const orderDoc = await this.orderModel.create({
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
            : item.unitAmountNpr,
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
    });

    // Also persist order to Neon PostgreSQL
    if (this.postgresService?.isReady()) {
      try {
        let numericUserId: number | null = null;
        if (userId && !isNaN(parseInt(userId, 10))) {
          numericUserId = parseInt(userId, 10);
        } else {
          const userRes = await this.postgresService.query(
            `SELECT id FROM users WHERE email = $1 LIMIT 1`,
            [customer.email.toLowerCase()],
          );
          if (userRes.rows.length > 0) {
            numericUserId = userRes.rows[0].id;
          }
        }

        const pgOrderRes = await this.postgresService.query(
          `INSERT INTO orders (user_id, order_number, total_amount, status, payment_method, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
           RETURNING id`,
          [
            numericUserId,
            orderNumber,
            quote.total,
            'pending',
            provider.toLowerCase(),
          ],
        );

        const pgOrderId = pgOrderRes.rows[0]?.id;
        if (pgOrderId) {
          for (const item of pricedCart) {
            const intProdId = parseInt(item.productId, 10);
            const unitPrice =
              provider === PaymentProvider.STRIPE
                ? item.unitAmountUsd
                : (item.unitAmountNpr ?? 0);
            await this.postgresService.query(
              `INSERT INTO order_items (order_id, product_id, name, price, quantity)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                pgOrderId,
                !isNaN(intProdId) ? intProdId : null,
                item.name,
                unitPrice,
                item.quantity,
              ],
            );
          }
          this.logger.log(
            `✅ Order ${orderNumber} persisted to Neon PostgreSQL (ID: ${pgOrderId})`,
          );
        }
      } catch (err: any) {
        this.logger.warn(
          `Could not save order snapshot to Neon PostgreSQL: ${err.message}`,
        );
      }
    }

    return orderDoc;
  }

  private async syncOrderWithStripeSession(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const orderNumber = this.extractOrderNumberFromStripeSession(session);

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

  private extractOrderNumberFromStripeSession(
    session: Stripe.Checkout.Session,
  ): string | null {
    return session.metadata?.orderNumber ?? session.client_reference_id ?? null;
  }

  private async markOrderAsPaid(
    orderNumber: string,
    options: {
      providerReference?: string | null;
      paymentReference?: string | null;
      providerMetadata?: Partial<Order['providerMetadata']>;
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
    await order.save();

    // Sync paid status and decrement inventory in Neon PostgreSQL
    if (this.postgresService?.isReady()) {
      try {
        await this.postgresService.query(
          `UPDATE orders SET status = 'paid', payment_intent_id = $1, updated_at = NOW() WHERE order_number = $2`,
          [
            options.paymentReference ?? options.providerReference ?? null,
            orderNumber,
          ],
        );
        for (const item of order.items) {
          const intId = parseInt(item.productId, 10);
          if (!isNaN(intId)) {
            await this.postgresService.query(
              `UPDATE products SET stock = GREATEST(0, stock - $1), updated_at = NOW() WHERE id = $2`,
              [item.quantity, intId],
            );
          }
        }
        this.logger.log(
          `✅ Order ${orderNumber} updated to paid in Neon PostgreSQL`,
        );
      } catch (pgErr: any) {
        this.logger.warn(
          `Could not update order status in Neon PostgreSQL: ${pgErr.message}`,
        );
      }
    }

    // Send confirmation email to the customer.
    // We await it properly so errors surface in logs instead of being silently swallowed.
    // The email goes to the customer snapshot email on the order (which is the
    // logged-in user's email, since checkout requires authentication).
    try {
      await this.mailService.sendOrderConfirmation(order);
    } catch (emailError) {
      // Email failure must never roll back a confirmed payment — log and continue.
      this.logger.error(
        `Order ${orderNumber} was paid but confirmation email failed: ` +
          (emailError instanceof Error
            ? emailError.message
            : String(emailError)),
      );
    }
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
      return;
    }

    order.status = status;
    if (status !== OrderStatus.PAID) {
      order.failureReason = note;
    }
    if (providerReference !== undefined) {
      order.providerReference = providerReference;
    }
    if (paymentReference !== undefined) {
      order.paymentReference = paymentReference;
    }
    order.history.push({
      status,
      note,
      changedAt: new Date(),
    });
    await order.save();
  }

  private async queryEsewaStatus(input: {
    transactionUuid: string | null;
    totalAmount: string;
  }): Promise<{ status: string; ref_id?: string | null }> {
    if (!input.transactionUuid) {
      throw new BadRequestException(
        'eSewa transaction verification is missing the transaction UUID.',
      );
    }

    const url = `${this.esewaStatusCheckUrl}?product_code=${encodeURIComponent(this.esewaProductCode)}&total_amount=${encodeURIComponent(input.totalAmount)}&transaction_uuid=${encodeURIComponent(input.transactionUuid)}`;

    const { data } = await axios.get<{
      status: string;
      ref_id?: string | null;
    }>(url, {
      timeout: 15000,
    });

    return data;
  }

  private parseEsewaSuccessPayload(
    encodedPayload: string,
  ): EsewaSuccessPayload {
    try {
      const decodedJson = Buffer.from(encodedPayload, 'base64').toString(
        'utf-8',
      );
      return JSON.parse(decodedJson) as EsewaSuccessPayload;
    } catch (error) {
      throw new BadRequestException(
        `eSewa returned an unreadable success payload: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private extractEsewaEncodedPayload(
    query: Record<string, string | undefined>,
  ): string | undefined {
    const candidateKeys = ['data', 'payload', 'response'];

    for (const key of candidateKeys) {
      if (query[key]) {
        return query[key];
      }
    }

    return undefined;
  }

  private generateEsewaSignature(payload: {
    total_amount: string;
    transaction_uuid: string;
    product_code: string;
  }): string {
    const message = `total_amount=${payload.total_amount},transaction_uuid=${payload.transaction_uuid},product_code=${payload.product_code}`;
    return createHmac('sha256', this.esewaSecretKey)
      .update(message)
      .digest('base64');
  }

  private verifyEsewaSignature(
    payload: EsewaSuccessPayload,
    signedFieldNames: string,
  ): boolean {
    if (!payload.signature) {
      return false;
    }

    const signedFields = signedFieldNames
      .split(',')
      .map((field) => field.trim())
      .filter(Boolean);

    const message = signedFields
      .map(
        (fieldName) =>
          `${fieldName}=${(payload as Record<string, unknown>)[fieldName] ?? ''}`,
      )
      .join(',');

    const expectedSignature = createHmac('sha256', this.esewaSecretKey)
      .update(message)
      .digest('base64');

    return expectedSignature === payload.signature;
  }

  private buildFrontendResultUrl(
    orderNumber: string,
    provider: PaymentProvider,
    status: 'success' | 'failed' | 'pending',
  ): string {
    return `${this.frontendPublicUrl}/checkout/result?provider=${provider}&orderNumber=${encodeURIComponent(orderNumber)}&status=${status}`;
  }

  private async getOrderByOrderNumber(
    orderNumber: string,
  ): Promise<OrderDocument> {
    const order = await this.orderModel.findOne({ orderNumber });

    if (!order) {
      throw new NotFoundException(
        `Order with number "${orderNumber}" was not found.`,
      );
    }

    return order;
  }

  private mapOrderSummary(order: OrderDocument): OrderSummaryResponse {
    // `createdAt` is injected by Mongoose `timestamps: true`. Access it via
    // the document's plain object representation to avoid `.get()` failing on
    // lean results or when the field hasn't been hydrated yet.
    const rawDoc = order.toObject ? order.toObject() : (order as any);
    const createdAtRaw: unknown = rawDoc.createdAt;
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
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
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

  private toStripeMinorUnits(amount: number): number {
    return Math.round(amount * 100);
  }

  private roundToCurrency(amount: number): number {
    return Math.round(amount * 100) / 100;
  }

  private formatEsewaAmount(amount: number): string {
    const normalized = this.roundToCurrency(amount);
    return Number.isInteger(normalized)
      ? String(normalized)
      : normalized.toFixed(2);
  }

  /**
   * PHASE 1: Webhook Idempotency Helpers
   *
   * These methods prevent duplicate webhook processing using MongoDB as storage.
   *
   * CRITICAL: Stripe may send the same webhook multiple times due to:
   * - Network retry (if we respond with 5xx or timeout)
   * - Stripe failover (server restarts)
   * - Manual replay (in Stripe dashboard)
   *
   * We use Stripe event ID as idempotency key because:
   * - It's unique per event
   * - It's stable (same event always has same ID)
   * - It's provided by Stripe (we don't generate it)
   *
   * Flow:
   * 1. Webhook arrives with event.id = "evt_abc123"
   * 2. Check if evt_abc123 exists in idempotency collection
   * 3. If exists: Return success (already processed)
   * 4. If not: Process and store evt_abc123
   *
   * Race condition handling:
   * - Multiple webhook deliveries arrive simultaneously
   * - Both try to insert same event ID
   * - MongoDB unique index ensures only one succeeds
   * - Loser gets duplicate key error → treated as already processed
   *
   * TTL: 72 hours (Stripe retries for 3 days)
   * After 72 hours, MongoDB automatically deletes the record.
   */

  private async checkWebhookIdempotency(key: string): Promise<boolean> {
    try {
      const collection = this.orderModel.db.collection('webhook_idempotency');
      const existing = await collection.findOne({ key });
      return !!existing;
    } catch (error) {
      this.logger.error({
        event: 'webhook_idempotency_check_failed',
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      // Fail open: If check fails, allow webhook to process
      // Better to risk duplicate than block legitimate webhook
      return false;
    }
  }

  private async markWebhookAsProcessing(key: string): Promise<void> {
    try {
      const collection = this.orderModel.db.collection('webhook_idempotency');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 72); // 72 hours TTL

      await collection.insertOne({
        key,
        status: 'processing',
        createdAt: new Date(),
        expiresAt,
      });

      // Ensure TTL index exists
      await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

      // Ensure unique index on key
      await collection.createIndex({ key: 1 }, { unique: true });
    } catch (error) {
      // If duplicate key error, webhook is already being processed
      if ((error as any).code === 11000) {
        this.logger.log({
          event: 'webhook_concurrent_processing_detected',
          key,
        });
        throw new ConflictException('Webhook is already being processed');
      }

      this.logger.error({
        event: 'webhook_idempotency_insert_failed',
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - allow processing to continue
    }
  }

  private async markWebhookAsProcessed(key: string): Promise<void> {
    try {
      const collection = this.orderModel.db.collection('webhook_idempotency');
      await collection.updateOne(
        { key },
        {
          $set: {
            status: 'processed',
            processedAt: new Date(),
          },
        },
      );

      this.logger.log({
        event: 'webhook_processed',
        key,
      });
    } catch (error) {
      this.logger.error({
        event: 'webhook_idempotency_update_failed',
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - webhook was processed successfully
    }
  }

  private async removeWebhookIdempotency(key: string): Promise<void> {
    try {
      const collection = this.orderModel.db.collection('webhook_idempotency');
      await collection.deleteOne({ key });

      this.logger.log({
        event: 'webhook_idempotency_removed',
        key,
        reason: 'Processing failed, allowing Stripe to retry',
      });
    } catch (error) {
      this.logger.error({
        event: 'webhook_idempotency_removal_failed',
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
