import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
} from '../../common/utils/circuit-breaker.util';
import { retryWithBackoff } from '../../common/utils/retry.util';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { CreateStripeCheckoutSessionResponse } from '../interfaces/checkout-session.interface';
import {
  IStripeProvider,
  PricedCartLine,
  QuoteBreakdown,
} from '../interfaces/payment-provider.interface';
import { ProviderQuote } from '../interfaces/payment-quote.interface';

const DEFAULT_FRONTEND_PUBLIC_URL = 'http://localhost:8080';
const STRIPE_CURRENCY = 'usd';
const MINOR_UNITS_PER_USD = 100;
const CHECKOUT_SESSION_LIFETIME_SECONDS = 30 * 60;
const STRIPE_RETRY_LIMIT = 3;
const STRIPE_RETRY_INITIAL_DELAY_MS = 100;
const STRIPE_CIRCUIT_FAILURE_THRESHOLD = 3;
const STRIPE_CIRCUIT_RESET_TIMEOUT_MS = 60_000;
const STRIPE_CHECKOUT_RETRY_CONTEXT = 'stripe-checkout-session';
const STRIPE_CHECKOUT_IDEMPOTENCY_PREFIX = 'order-';

const RETRYABLE_NETWORK_ERROR_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT']);
const RETRYABLE_STRIPE_ERROR_TYPES = new Set([
  'StripeRateLimitError',
  'StripeAPIError',
]);

interface CreateCheckoutSessionInput {
  orderNumber: string;
  customerEmail: string;
  pricedCart: PricedCartLine[];
  quote: ProviderQuote;
}

interface StripeErrorDetails {
  code?: unknown;
  type?: unknown;
}

@Injectable()
export class StripeProvider implements IStripeProvider {
  readonly provider = PaymentProvider.STRIPE;

  private readonly logger = new Logger(StripeProvider.name);
  private readonly frontendPublicUrl: string;
  private readonly automaticTaxEnabled: boolean;
  private readonly shippingFeeUsd: number;
  private readonly stripeWebhookSecret: string;
  private readonly stripeClient: Stripe | null;
  private readonly stripeCircuitBreaker = new CircuitBreaker({
    name: 'stripe-api',
    failureThreshold: STRIPE_CIRCUIT_FAILURE_THRESHOLD,
    resetTimeout: STRIPE_CIRCUIT_RESET_TIMEOUT_MS,
  });

  constructor(config: ConfigService) {
    this.frontendPublicUrl =
      config.get<string>('FRONTEND_PUBLIC_URL') ?? DEFAULT_FRONTEND_PUBLIC_URL;
    this.automaticTaxEnabled =
      config.get<string>('STRIPE_AUTOMATIC_TAX_ENABLED') === 'true';
    this.shippingFeeUsd = Number(
      config.get<string>('STRIPE_SHIPPING_FEE_USD') ?? '0',
    );
    this.stripeWebhookSecret =
      config.get<string>('STRIPE_WEBHOOK_SECRET') ?? '';

    const stripeSecretKey = config.get<string>('STRIPE_SECRET_KEY') ?? '';
    this.stripeClient = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
  }

  buildQuote(pricedCart: PricedCartLine[]): ProviderQuote {
    const subtotal = pricedCart.reduce(
      (total, item) => total + item.unitAmountUsd * item.quantity,
      0,
    );
    const breakdown = this.buildBreakdown({
      currency: 'USD',
      subtotal,
      taxAmount: 0,
      serviceCharge: 0,
      deliveryCharge: this.shippingFeeUsd,
      total: 0,
    });
    const isConfigured = this.stripeClient !== null;

    return {
      provider: PaymentProvider.STRIPE,
      displayName: 'Stripe Checkout',
      enabled: isConfigured,
      reasonUnavailable: isConfigured
        ? undefined
        : 'Add STRIPE_SECRET_KEY to enable hosted Stripe Checkout.',
      ...breakdown,
      note: 'Stripe redirects customers to a hosted Checkout page. Payment confirmation is finalized server-side through signed webhooks.',
    };
  }

  async createCheckoutSession(
    input: CreateCheckoutSessionInput,
  ): Promise<CreateStripeCheckoutSessionResponse> {
    const stripeClient = this.requireStripeClient();

    try {
      const stripeSession = await this.stripeCircuitBreaker.execute(() =>
        retryWithBackoff(
          () =>
            stripeClient.checkout.sessions.create(
              this.buildCheckoutSessionParams(input),
              {
                idempotencyKey: `${STRIPE_CHECKOUT_IDEMPOTENCY_PREFIX}${input.orderNumber}`,
              },
            ),
          {
            maxRetries: STRIPE_RETRY_LIMIT,
            initialDelay: STRIPE_RETRY_INITIAL_DELAY_MS,
            context: STRIPE_CHECKOUT_RETRY_CONTEXT,
            shouldRetry: isRetryableStripeError,
          },
        ),
      );

      if (!stripeSession.url) {
        throw new InternalServerErrorException(
          'Stripe returned a checkout session without a redirect URL.',
        );
      }

      return {
        orderNumber: input.orderNumber,
        checkoutUrl: stripeSession.url,
      };
    } catch (error) {
      this.throwCheckoutError(error, input.orderNumber);
    }
  }

  constructWebhookEvent(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Stripe.Event {
    const stripeClient = this.requireStripeClient(
      'Stripe webhook handling requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.',
    );

    if (!this.stripeWebhookSecret) {
      throw new BadRequestException(
        'Stripe webhook handling requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.',
      );
    }

    if (!rawBody || !signature) {
      throw new BadRequestException(
        'Stripe webhook signature verification requires the raw body and Stripe-Signature header.',
      );
    }

    try {
      return stripeClient.webhooks.constructEvent(
        rawBody,
        signature,
        this.stripeWebhookSecret,
      );
    } catch (error) {
      this.logger.warn(
        `Stripe webhook signature verification failed: ${getErrorMessage(error)}`,
      );
      throw new BadRequestException('Invalid Stripe webhook signature.');
    }
  }

  retrieveSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    return this.requireStripeClient().checkout.sessions.retrieve(sessionId);
  }

  extractOrderNumber(session: Stripe.Checkout.Session): string | null {
    return session.metadata?.orderNumber ?? session.client_reference_id ?? null;
  }

  private requireStripeClient(message = 'Stripe is not configured.'): Stripe {
    if (!this.stripeClient) {
      throw new BadRequestException(message);
    }

    return this.stripeClient;
  }

  private buildCheckoutSessionParams(
    input: CreateCheckoutSessionInput,
  ): Stripe.Checkout.SessionCreateParams {
    return {
      mode: 'payment',
      client_reference_id: input.orderNumber,
      customer_creation: 'always',
      customer_email: input.customerEmail,
      billing_address_collection: 'auto',
      phone_number_collection: { enabled: true },
      automatic_tax: { enabled: this.automaticTaxEnabled },
      success_url: this.buildCheckoutResultUrl(input.orderNumber, {
        sessionIdPlaceholder: true,
      }),
      cancel_url: this.buildCheckoutResultUrl(input.orderNumber, {
        canceled: true,
      }),
      line_items: this.buildStripeLineItems(input.pricedCart, input.quote),
      metadata: {
        orderNumber: input.orderNumber,
        customerEmail: input.customerEmail,
        paymentProvider: PaymentProvider.STRIPE,
      },
      payment_intent_data: {
        metadata: {
          orderNumber: input.orderNumber,
          paymentProvider: PaymentProvider.STRIPE,
        },
      },
      expires_at:
        Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_LIFETIME_SECONDS,
    };
  }

  private buildCheckoutResultUrl(
    orderNumber: string,
    options: { sessionIdPlaceholder?: boolean; canceled?: boolean },
  ): string {
    const resultUrl = new URL('/checkout/result', this.frontendPublicUrl);
    resultUrl.searchParams.set('provider', 'stripe');
    resultUrl.searchParams.set('orderNumber', orderNumber);

    if (options.sessionIdPlaceholder) {
      resultUrl.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
    }

    if (options.canceled) {
      resultUrl.searchParams.set('status', 'canceled');
    }

    return resultUrl
      .toString()
      .replace('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}');
  }

  private buildStripeLineItems(
    pricedCart: PricedCartLine[],
    quote: ProviderQuote,
  ): Stripe.Checkout.SessionCreateParams.LineItem[] {
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
      pricedCart.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: STRIPE_CURRENCY,
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
          currency: STRIPE_CURRENCY,
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

  private toStripeMinorUnits(amount: number): number {
    return Math.round(amount * MINOR_UNITS_PER_USD);
  }

  private roundToCurrency(amount: number): number {
    return Math.round(amount * MINOR_UNITS_PER_USD) / MINOR_UNITS_PER_USD;
  }

  private buildBreakdown(input: QuoteBreakdown): QuoteBreakdown {
    const subtotal = this.roundToCurrency(input.subtotal);
    const taxAmount = this.roundToCurrency(input.taxAmount);
    const serviceCharge = this.roundToCurrency(input.serviceCharge);
    const deliveryCharge = this.roundToCurrency(input.deliveryCharge);

    return {
      currency: input.currency,
      subtotal,
      taxAmount,
      serviceCharge,
      deliveryCharge,
      total: this.roundToCurrency(
        subtotal + taxAmount + serviceCharge + deliveryCharge,
      ),
    };
  }

  private throwCheckoutError(error: unknown, orderNumber: string): never {
    if (error instanceof CircuitBreakerOpenError) {
      this.logger.error({
        event: 'stripe_circuit_open',
        orderNumber,
        message: 'Stripe circuit breaker is open - service appears down',
      });
      throw new ServiceUnavailableException(
        'Payment system is temporarily unavailable. Please try again in 1 minute.',
      );
    }

    if (error instanceof ServiceUnavailableException) {
      throw error;
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

function isRetryableStripeError(error: unknown): boolean {
  if (!isStripeErrorDetails(error)) {
    return false;
  }

  return (
    (typeof error.code === 'string' &&
      RETRYABLE_NETWORK_ERROR_CODES.has(error.code)) ||
    (typeof error.type === 'string' &&
      RETRYABLE_STRIPE_ERROR_TYPES.has(error.type))
  );
}

function isStripeErrorDetails(error: unknown): error is StripeErrorDetails {
  return typeof error === 'object' && error !== null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
