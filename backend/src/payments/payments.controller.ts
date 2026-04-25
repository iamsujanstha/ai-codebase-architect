import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  RawBody,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { CreatePaymentSessionDto } from './dto/create-payment-session.dto';
import { PaymentQuoteRequestDto } from './dto/payment-quote-request.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('quote')
  async getQuote(@Body() request: PaymentQuoteRequestDto) {
    return this.paymentsService.getQuote(request);
  }

  @Post('stripe/checkout-session')
  async createStripeCheckoutSession(@Body() request: CreatePaymentSessionDto) {
    return this.paymentsService.createStripeCheckoutSession(request);
  }

  @Post('stripe/webhook')
  async handleStripeWebhook(
    @RawBody() rawBody: Buffer | undefined,
    @Headers('stripe-signature') stripeSignature: string | undefined,
  ) {
    return this.paymentsService.handleStripeWebhook(rawBody, stripeSignature);
  }

  @Get('stripe/session-status')
  async getStripeSessionStatus(
    @Query('sessionId') sessionId: string,
    @Query('orderNumber') orderNumber?: string,
  ) {
    return this.paymentsService.syncStripeSessionStatus(sessionId, orderNumber);
  }

  @Post('esewa/initiate')
  async initiateEsewaCheckout(@Body() request: CreatePaymentSessionDto) {
    return this.paymentsService.createEsewaCheckout(request);
  }

  @Get('esewa/success')
  async handleEsewaSuccess(
    @Query('orderNumber') orderNumber: string,
    @Query() query: Record<string, string | undefined>,
    @Res() response: Response,
  ) {
    const redirectUrl = await this.paymentsService.handleEsewaSuccessRedirect(
      orderNumber,
      query,
    );

    return response.redirect(302, redirectUrl);
  }

  @Get('esewa/failure')
  async handleEsewaFailure(
    @Query('orderNumber') orderNumber: string,
    @Res() response: Response,
  ) {
    const redirectUrl =
      await this.paymentsService.handleEsewaFailureRedirect(orderNumber);

    return response.redirect(302, redirectUrl);
  }

  @Get('orders/:orderNumber')
  async getOrder(@Param('orderNumber') orderNumber: string) {
    return this.paymentsService.getOrderSummary(orderNumber);
  }
}
