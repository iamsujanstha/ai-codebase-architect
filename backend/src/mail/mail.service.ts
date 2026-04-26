import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: any;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('MAIL_HOST');
    const port = this.configService.get<number>('MAIL_PORT');
    const user = this.configService.get<string>('MAIL_USER');
    const pass = this.configService.get<string>('MAIL_PASS');

    if (host && port) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
      });
      this.logger.log(`Mail service initialized with host: ${host}`);
    } else {
      this.logger.warn('Mail service not fully configured. Emails will be logged to console instead.');
    }
  }

  async sendOrderConfirmation(order: any): Promise<void> {
    const subject = `Order Confirmation - ${order.orderNumber}`;
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #333;">Thank you for your order!</h2>
        <p>Hi ${order.customer.fullName},</p>
        <p>Your order <strong>${order.orderNumber}</strong> has been successfully placed and paid.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background: #f8f8f8;">
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #ddd;">Item</th>
              <th style="padding: 10px; text-align: center; border-bottom: 2px solid #ddd;">Qty</th>
              <th style="padding: 10px; text-align: right; border-bottom: 2px solid #ddd;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${order.items.map((item: any) => `
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name}</td>
                <td style="padding: 10px; text-align: center; border-bottom: 1px solid #eee;">${item.quantity}</td>
                <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">${item.currency} ${item.unitAmount}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div style="text-align: right; font-size: 18px; font-weight: bold; margin-top: 20px;">
          Total: ${order.pricing.currency} ${order.pricing.total}
        </div>
        
        <p style="margin-top: 40px; color: #777; font-size: 14px;">
          If you have any questions, feel free to contact our support.
        </p>
      </div>
    `;

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: this.configService.get<string>('MAIL_FROM') || '"AI Commerce Platform" <noreply@example.com>',
          to: order.customer.email,
          subject,
          html,
        });
        this.logger.log(`Order confirmation email sent to ${order.customer.email}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to send order confirmation email: ${message}`);
      }
    } else {

      this.logger.log('--- MOCK EMAIL START ---');
      this.logger.log(`To: ${order.customer.email}`);
      this.logger.log(`Subject: ${subject}`);
      this.logger.log('Body: (HTML content skipped in console)');
      this.logger.log('--- MOCK EMAIL END ---');
    }
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetLink = `http://localhost:5173/reset-password?token=${token}`;
    const subject = 'Password Reset Request';
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>You requested a password reset. Click the button below to set a new password:</p>
        <a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background: #3b82f6; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px;">Reset Password</a>
        <p style="margin-top: 20px; color: #777; font-size: 14px;">If you did not request this, please ignore this email.</p>
      </div>
    `;

    if (this.transporter) {
      await this.transporter.sendMail({
        from: this.configService.get<string>('MAIL_FROM') || '"AI Commerce Platform" <noreply@example.com>',
        to: email,
        subject,
        html,
      });
    } else {
      this.logger.log(`--- MOCK PASSWORD RESET EMAIL to ${email} ---`);
      this.logger.log(`Reset link: ${resetLink}`);
    }
  }
}
