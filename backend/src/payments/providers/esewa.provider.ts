import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios from 'axios';
import { createHmac } from 'crypto';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { EsewaCheckoutResponse } from '../interfaces/checkout-session.interface';
import {
  EsewaSuccessPayload,
  IEsewaProvider,
  PricedCartLine,
  QuoteBreakdown,
} from '../interfaces/payment-provider.interface';
import { ProviderQuote } from '../interfaces/payment-quote.interface';
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
} from '../../common/utils/circuit-breaker.util';

@Injectable()
export class EsewaProvider implements IEsewaProvider {
  readonly provider = PaymentProvider.ESEWA;
  private readonly logger = new Logger(EsewaProvider.name);

  private readonly frontendPublicUrl =
    process.env.FRONTEND_PUBLIC_URL ?? 'http://localhost:8080';
  private readonly backendPublicUrl =
    process.env.BACKEND_PUBLIC_URL ?? 'http://localhost:3000';
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

  /**
   * Circuit breaker for eSewa API calls
   * Threshold: 5 failures
   * Reset: 120 seconds
   */
  private readonly esewaCircuitBreaker = new CircuitBreaker({
    name: 'esewa-api',
    failureThreshold: 5,
    resetTimeout: 120000,
  });

  buildQuote(pricedCart: PricedCartLine[]): ProviderQuote {
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

  createCheckout(input: {
    orderNumber: string;
    quote: ProviderQuote;
  }): EsewaCheckoutResponse {
    const fields = {
      amount: this.formatEsewaAmount(input.quote.subtotal),
      tax_amount: this.formatEsewaAmount(input.quote.taxAmount),
      total_amount: this.formatEsewaAmount(input.quote.total),
      transaction_uuid: input.orderNumber,
      product_code: this.esewaProductCode,
      product_service_charge: this.formatEsewaAmount(input.quote.serviceCharge),
      product_delivery_charge: this.formatEsewaAmount(
        input.quote.deliveryCharge,
      ),
      success_url: `${this.backendPublicUrl}/payments/esewa/success?orderNumber=${encodeURIComponent(input.orderNumber)}`,
      failure_url: `${this.backendPublicUrl}/payments/esewa/failure?orderNumber=${encodeURIComponent(input.orderNumber)}`,
      signed_field_names: 'total_amount,transaction_uuid,product_code',
      signature: this.generateEsewaSignature({
        total_amount: this.formatEsewaAmount(input.quote.total),
        transaction_uuid: input.orderNumber,
        product_code: this.esewaProductCode,
      }),
    };

    return {
      orderNumber: input.orderNumber,
      actionUrl: this.esewaFormUrl,
      method: 'POST',
      fields,
    };
  }

  verifyCallbackPayload(query: Record<string, string | undefined>): {
    verified: boolean;
    payload?: EsewaSuccessPayload;
    failureReason?: string;
  } {
    const encodedPayload = query.data ?? this.extractEsewaEncodedPayload(query);

    if (!encodedPayload) {
      return {
        verified: false,
        failureReason: 'eSewa returned without an encoded success payload.',
      };
    }

    let successPayload: EsewaSuccessPayload;
    try {
      successPayload = this.parseEsewaSuccessPayload(encodedPayload);
    } catch (error) {
      return {
        verified: false,
        failureReason:
          error instanceof Error ? error.message : String(error),
      };
    }

    const verifiedLocally =
      Boolean(successPayload.signature) &&
      Boolean(successPayload.signed_field_names) &&
      this.verifyEsewaSignature(
        successPayload,
        successPayload.signed_field_names!,
      );

    if (!verifiedLocally) {
      return {
        verified: false,
        payload: successPayload,
        failureReason:
          'The eSewa success callback signature could not be verified.',
      };
    }

    return {
      verified: true,
      payload: successPayload,
    };
  }

  async queryStatus(input: {
    transactionUuid: string | null;
    totalAmount: string;
  }): Promise<{ status: string; ref_id?: string | null }> {
    if (!input.transactionUuid) {
      throw new BadRequestException(
        'eSewa transaction verification is missing the transaction UUID.',
      );
    }

    try {
      return await this.esewaCircuitBreaker.execute(async () => {
        const url = `${this.esewaStatusCheckUrl}?product_code=${encodeURIComponent(this.esewaProductCode)}&total_amount=${encodeURIComponent(input.totalAmount)}&transaction_uuid=${encodeURIComponent(input.transactionUuid!)}`;

        const { data } = await axios.get<{
          status: string;
          ref_id?: string | null;
        }>(url, {
          timeout: 15000,
        });

        return data;
      });
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        this.logger.error({
          event: 'esewa_circuit_open',
          transactionUuid: input.transactionUuid,
          message: 'eSewa circuit breaker is open - service appears down',
        });
        throw new ServiceUnavailableException(
          'eSewa verification service is temporarily unavailable. Please try again later.',
        );
      }
      throw error;
    }
  }

  buildFrontendResultUrl(
    orderNumber: string,
    status: 'success' | 'failed' | 'pending',
  ): string {
    return `${this.frontendPublicUrl}/checkout/result?provider=${PaymentProvider.ESEWA}&orderNumber=${encodeURIComponent(orderNumber)}&status=${status}`;
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

    const rawPayload = payload as Record<string, string | number | undefined>;
    const message = signedFields
      .map((fieldName) => {
        const val = rawPayload[fieldName];
        return `${fieldName}=${val !== undefined && val !== null ? String(val) : ''}`;
      })
      .join(',');

    const expectedSignature = createHmac('sha256', this.esewaSecretKey)
      .update(message)
      .digest('base64');

    return expectedSignature === payload.signature;
  }

  private formatEsewaAmount(amount: number): string {
    const normalized = this.roundToCurrency(amount);
    return Number.isInteger(normalized)
      ? String(normalized)
      : normalized.toFixed(2);
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
