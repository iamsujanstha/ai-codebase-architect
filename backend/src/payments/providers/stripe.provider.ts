import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { CreateStripeCheckoutSessionResponse } from '../interfaces/checkout-session.interface';
import {
  IStripeProvider,
  PricedCartLine,
  QuoteBreakdown,
} from '../interfaces/payment-provider.interface';
import { ProviderQuote } from '../interfaces/payment-quote.interface';
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
} from '../../common/utils/circuit-breaker.util';
import { retryWithBackoff } from '../../common/utils/retry.util';

@Injectable()
export class StripeProvider implements IStripeProvider {
  readonly provider = PaymentProvider.STRIPE;
  private readonly logger = new Logger(StripeProvider.name);

  private readonly frontendPublicUrl =
    process.env.FRONTEND_PUBLIC_URL ?? 'http://localhost:8080';
  private readonly stripeAutomaticTaxEnabled =
    (process.env.STRIPE_AUTOMATIC_TAX_ENABLED ?? 'false') === 'true';
  private readonly stripeShippingFeeUsd = Number(
    process.env.STRIPE_SHIPPING_FEE_USD ?? '0',
  );
  private readonly stripeWebhookSecret =
    process.env.STRIPE_WEBHOOK_SECRET ?? '';
  private readonly stripeClient: Stripe | null;

  /**
   * Circuit breaker for Stripe API calls
   * Threshold: 3 failures
   * Reset: 60 seconds
   */
  private readonly stripeCircuitBreaker = new CircuitBreaker({
    name: 'stripe-api',
    failureThreshold: 3,
    resetTimeout: 60000,
  });

  constructor() {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? '';
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

  async createCheckoutSession(input: {
    orderNumber: string;
    customerEmail: string;
    pricedCart: PricedCartLine[];
    quote: ProviderQuote;
  }): Promise<CreateStripeCheckoutSessionResponse> {
    if (!this.stripeClient) {
      throw new BadRequestException(
        'Stripe is not configured. Add STRIPE_SECRET_KEY to enable this provider.',
      );
    }

    try {
      const stripeSession = await this.stripeCircuitBreaker.execute(
        async () => {
          return await retryWithBackoff(
            async () => {
              return await this.stripeClient!.checkout.sessions.create(
                {
                  mode: 'payment',
                  client_reference_id: input.orderNumber,
                  customer_creation: 'always',
                  customer_email: input.customerEmail,
                  billing_address_collection: 'auto',
                  phone_number_collection: {
                    enabled: true,
                  },
                  automatic_tax: {
                    enabled: this.stripeAutomaticTaxEnabled,
                  },
                  success_url: `${this.frontendPublicUrl}/checkout/result?provider=stripe&orderNumber=${encodeURIComponent(input.orderNumber)}&session_id={CHECKOUT_SESSION_ID}`,
                  cancel_url: `${this.frontendPublicUrl}/checkout/result?provider=stripe&orderNumber=${encodeURIComponent(input.orderNumber)}&status=canceled`,
                  line_items: this.buildStripeLineItems(
                    input.pricedCart,
                    input.quote,
                  ),
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
                  expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
                },
                {
                  idempotencyKey: `order-${input.orderNumber}`,
                },
              );
            },
            {
              maxRetries: 3,
              initialDelay: 100,
              context: 'stripe-checkout-session',
              shouldRetry: (error: unknown) => {
                const err = error as { code?: string; type?: string };
                if (err?.code === 'ECONNREFUSED' || err?.code === 'ETIMEDOUT') {
                  return true;
                }
                if (err?.type === 'StripeRateLimitError') {
                  return true;
                }
                if (err?.type === 'StripeAPIError') {
                  return true;
                }
                if (err?.type === 'StripeCardError') {
                  return false;
                }
                if (err?.type === 'StripeInvalidRequestError') {
                  return false;
                }
                return false;
              },
            },
          );
        },
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
      if (error instanceof CircuitBreakerOpenError) {
        this.logger.error({
          event: 'stripe_circuit_open',
          orderNumber: input.orderNumber,
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

  constructWebhookEvent(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): Stripe.Event {
    if (!this.stripeClient || !this.stripeWebhookSecret) {
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
      return this.stripeClient.webhooks.constructEvent(
        rawBody,
        signature,
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
  }

  async retrieveSession(
    sessionId: string,
  ): Promise<Stripe.Checkout.Session> {
    if (!this.stripeClient) {
      throw new BadRequestException('Stripe is not configured.');
    }

    return this.stripeClient.checkout.sessions.retrieve(sessionId);
  }

  extractOrderNumber(session: Stripe.Checkout.Session): string | null {
    return session.metadata?.orderNumber ?? session.client_reference_id ?? null;
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

  private toStripeMinorUnits(amount: number): number {
    return Math.round(amount * 100);
  }

  private roundToCurrency(amount: number): number {
    return Math.round(amount * 100) / 100;
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
}
