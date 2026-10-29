import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { MailSendOptions } from './interfaces/mail-send-options.interface';
import type { OrderConfirmationEmail } from './interfaces/order-confirmation.interface';
import { buildOrderConfirmationHtml } from './templates/order-confirmation.template';
import { buildPasswordResetHtml } from './templates/password-reset.template';

const SMTP_CONNECTION_TIMEOUT_MILLISECONDS = 10_000;
const SMTP_GREETING_TIMEOUT_MILLISECONDS = 10_000;
const SMTP_SOCKET_TIMEOUT_MILLISECONDS = 30_000;

/**
 * MailService — thin orchestration layer.
 *
 * SRP: this class only knows how to send mail.
 *      What the mail looks like lives in /templates.
 *      How amounts/dates are formatted lives in /helpers.
 *
 * OCP: adding a new email type means adding a new template file and a new
 *      public method here — existing code is never touched.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly fromAddress: string;
  private readonly frontendUrl: string;

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>('MAIL_HOST');
    const port = Number(config.get<string>('MAIL_PORT') ?? '587');
    const user = config.get<string>('MAIL_USER');
    const pass = config.get<string>('MAIL_PASS');

    this.fromAddress =
      config.get<string>('MAIL_FROM') ??
      '"Atlas Commerce Lab" <noreply@atlascommerce.dev>';

    this.frontendUrl =
      config.get<string>('FRONTEND_PUBLIC_URL') ?? 'http://localhost:8080';

    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // 465 = implicit TLS, 587 = STARTTLS
        connectionTimeout: SMTP_CONNECTION_TIMEOUT_MILLISECONDS,
        greetingTimeout: SMTP_GREETING_TIMEOUT_MILLISECONDS,
        socketTimeout: SMTP_SOCKET_TIMEOUT_MILLISECONDS,
        auth: user && pass ? { user, pass } : undefined,
        tls: { rejectUnauthorized: true },
      });

      // Fail fast at startup — surface misconfiguration before the first real send.
      this.transporter.verify((err: Error | null) => {
        if (err) {
          this.logger.error(
            `SMTP verification failed for ${host}:${port} — ${err.message}. ` +
              'Check MAIL_HOST / MAIL_PORT / MAIL_USER / MAIL_PASS in .env.',
          );
        } else {
          this.logger.log(
            `SMTP ready ✓ → ${host}:${port} (from: ${this.fromAddress})`,
          );
        }
      });
    } else {
      this.transporter = null;
      this.logger.warn(
        'MAIL_HOST not configured — emails will be printed to the console.',
      );
    }
  }

  // ── public API ────────────────────────────────────────────────────────────

  /**
   * Sends the paid-order receipt through SMTP or logs a local development preview.
   * @throws SMTP transport errors to the calling workflow.
   */
  async sendOrderConfirmation(order: OrderConfirmationEmail): Promise<void> {
    await this.send({
      to: order.customer.email,
      subject: `Order confirmed — #${order.orderNumber}`,
      html: buildOrderConfirmationHtml(order, this.frontendUrl),
    });
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetLink = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await this.send({
      to: email,
      subject: 'Reset your Atlas Commerce Lab password',
      html: buildPasswordResetHtml(resetLink),
    });
  }

  // ── private transport ─────────────────────────────────────────────────────

  private async send(options: MailSendOptions): Promise<void> {
    if (this.transporter) {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      this.logger.log(
        `Email sent to=${options.to} subject="${options.subject}"`,
      );
      return;
    }
    // WHY: Local development remains usable without configuring an SMTP server.
    this.logger.log('┌── MOCK EMAIL ──────────────────────────────────');
    this.logger.log(`│  To:      ${options.to}`);
    this.logger.log(`│  Subject: ${options.subject}`);
    this.logger.log('│  Set MAIL_HOST in .env to send real emails.');
    this.logger.log('└────────────────────────────────────────────────');
  }
}
