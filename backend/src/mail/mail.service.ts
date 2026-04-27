import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

// ─── helpers ────────────────────────────────────────────────────────────────

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toFixed(2)}`;
  }
}

function formatDate(date: Date | string | null | undefined): string {
  const d = date ? new Date(date) : new Date();
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function providerLabel(provider: string): string {
  switch (provider?.toLowerCase()) {
    case 'stripe': return 'Stripe';
    case 'esewa':  return 'eSewa';
    default:       return provider ?? 'Online';
  }
}

// ─── email templates ─────────────────────────────────────────────────────────

function buildOrderConfirmationHtml(order: any, frontendUrl: string): string {
  const currency   = order.pricing?.currency ?? 'USD';
  const paidAt     = order.paidAt ? formatDate(order.paidAt) : formatDate(new Date());
  const provider   = providerLabel(order.paymentProvider);
  const orderUrl   = `${frontendUrl}/checkout/result?orderNumber=${encodeURIComponent(order.orderNumber)}&provider=${order.paymentProvider}`;

  const itemRows: string = (order.items ?? [])
    .map(
      (item: any) => `
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #f0f0f0;vertical-align:top;">
          <span style="font-weight:600;color:#111827;font-size:14px;">${item.name}</span>
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid #f0f0f0;text-align:center;color:#6b7280;font-size:14px;vertical-align:top;">
          ${item.quantity}
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid #f0f0f0;text-align:right;color:#6b7280;font-size:14px;vertical-align:top;">
          ${formatAmount(item.unitAmount, item.currency ?? currency)}
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;color:#111827;font-size:14px;vertical-align:top;">
          ${formatAmount(item.lineTotal, item.currency ?? currency)}
        </td>
      </tr>`,
    )
    .join('');

  const pricingRows: string = [
    { label: 'Subtotal',       value: order.pricing?.subtotal,       show: true },
    { label: 'Tax',            value: order.pricing?.taxAmount,      show: (order.pricing?.taxAmount ?? 0) > 0 },
    { label: 'Service charge', value: order.pricing?.serviceCharge,  show: (order.pricing?.serviceCharge ?? 0) > 0 },
    { label: 'Delivery',       value: order.pricing?.deliveryCharge, show: (order.pricing?.deliveryCharge ?? 0) > 0 },
  ]
    .filter((r) => r.show)
    .map(
      (r) => `
      <tr>
        <td style="padding:6px 0;color:#6b7280;font-size:14px;">${r.label}</td>
        <td style="padding:6px 0;text-align:right;color:#374151;font-size:14px;">${formatAmount(r.value ?? 0, currency)}</td>
      </tr>`,
    )
    .join('');

  const addressLines = [
    order.customer?.addressLine1,
    order.customer?.city,
    order.customer?.country,
  ]
    .filter(Boolean)
    .join(', ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Order Confirmed — ${order.orderNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <!-- wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- ── header ── -->
          <tr>
            <td style="background:linear-gradient(135deg,#1d4ed8 0%,#7c3aed 100%);border-radius:16px 16px 0 0;padding:40px 40px 32px;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.7);">
                Atlas Commerce Lab
              </p>
              <h1 style="margin:0 0 8px;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">
                Order Confirmed ✓
              </h1>
              <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.85);">
                Your payment was received and your order is on its way.
              </p>
            </td>
          </tr>

          <!-- ── order badge ── -->
          <tr>
            <td style="background:#ffffff;padding:0 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:24px 0;border-bottom:1px solid #f0f0f0;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">Order number</p>
                          <p style="margin:0;font-size:20px;font-weight:800;color:#111827;font-family:'SF Mono','Fira Code',monospace;letter-spacing:0.02em;">#${order.orderNumber}</p>
                        </td>
                        <td align="right">
                          <span style="display:inline-block;background:#d1fae5;color:#065f46;font-size:13px;font-weight:700;padding:6px 14px;border-radius:999px;border:1px solid #a7f3d0;">
                            ✓ &nbsp;Paid
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── greeting ── -->
          <tr>
            <td style="background:#ffffff;padding:24px 40px 0;">
              <p style="margin:0 0 8px;font-size:16px;color:#374151;">
                Hi <strong style="color:#111827;">${order.customer?.fullName ?? 'there'}</strong>,
              </p>
              <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.6;">
                Thank you for your purchase! We've received your payment via
                <strong style="color:#374151;">${provider}</strong> and your order has been confirmed.
                Here's a summary of what you ordered.
              </p>
            </td>
          </tr>

          <!-- ── items table ── -->
          <tr>
            <td style="background:#ffffff;padding:24px 40px 0;">
              <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:#9ca3af;">Items ordered</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0f0f0;border-radius:10px;overflow:hidden;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th style="padding:12px 16px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #f0f0f0;">Product</th>
                    <th style="padding:12px 16px;text-align:center;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #f0f0f0;">Qty</th>
                    <th style="padding:12px 16px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #f0f0f0;">Unit price</th>
                    <th style="padding:12px 16px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #f0f0f0;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- ── pricing breakdown ── -->
          <tr>
            <td style="background:#ffffff;padding:20px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0f0f0;border-radius:10px;overflow:hidden;padding:16px 20px;" bgcolor="#f9fafb">
                <tr><td colspan="2" style="padding:16px 20px 8px;">
                  <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:#9ca3af;">Pricing breakdown</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    ${pricingRows}
                    <tr>
                      <td colspan="2" style="padding:10px 0 0;border-top:2px solid #e5e7eb;"></td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:16px;font-weight:800;color:#111827;">Total charged</td>
                      <td style="padding:4px 0;text-align:right;font-size:16px;font-weight:800;color:#1d4ed8;">${formatAmount(order.pricing?.total ?? 0, currency)}</td>
                    </tr>
                  </table>
                </td></tr>
              </table>
            </td>
          </tr>

          <!-- ── order details grid ── -->
          <tr>
            <td style="background:#ffffff;padding:20px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <!-- delivery info -->
                  <td width="48%" style="vertical-align:top;padding-right:8px;">
                    <div style="background:#f9fafb;border:1px solid #f0f0f0;border-radius:10px;padding:16px 18px;">
                      <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:#9ca3af;">Delivered to</p>
                      <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#111827;">${order.customer?.fullName ?? ''}</p>
                      <p style="margin:0 0 2px;font-size:13px;color:#6b7280;">${order.customer?.email ?? ''}</p>
                      ${order.customer?.phone ? `<p style="margin:0 0 2px;font-size:13px;color:#6b7280;">${order.customer.phone}</p>` : ''}
                      ${addressLines ? `<p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${addressLines}</p>` : ''}
                    </div>
                  </td>
                  <!-- payment info -->
                  <td width="4%"></td>
                  <td width="48%" style="vertical-align:top;padding-left:8px;">
                    <div style="background:#f9fafb;border:1px solid #f0f0f0;border-radius:10px;padding:16px 18px;">
                      <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:#9ca3af;">Payment details</p>
                      <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#111827;">${provider}</p>
                      <p style="margin:0 0 2px;font-size:13px;color:#6b7280;">Paid on ${paidAt}</p>
                      ${order.paymentReference ? `<p style="margin:4px 0 0;font-size:11px;color:#9ca3af;font-family:monospace;">Ref: ${order.paymentReference}</p>` : ''}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── CTA button ── -->
          <tr>
            <td style="background:#ffffff;padding:28px 40px 0;text-align:center;">
              <a href="${orderUrl}"
                 style="display:inline-block;background:linear-gradient(135deg,#1d4ed8 0%,#7c3aed 100%);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px;letter-spacing:0.01em;">
                View Order Details →
              </a>
            </td>
          </tr>

          <!-- ── divider ── -->
          <tr>
            <td style="background:#ffffff;padding:32px 40px 0;">
              <hr style="border:none;border-top:1px solid #f0f0f0;margin:0;" />
            </td>
          </tr>

          <!-- ── help section ── -->
          <tr>
            <td style="background:#ffffff;padding:24px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:top;padding-right:16px;">
                    <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#374151;">Need help?</p>
                    <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
                      If you have any questions about your order, reply to this email or visit our
                      <a href="${frontendUrl}/chat" style="color:#1d4ed8;text-decoration:none;font-weight:500;">AI concierge</a>
                      for instant support.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── footer ── -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e1b4b 0%,#1e3a5f 100%);border-radius:0 0 16px 16px;padding:28px 40px;text-align:center;">
              <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#ffffff;">Atlas Commerce Lab</p>
              <p style="margin:0 0 16px;font-size:12px;color:rgba(255,255,255,0.5);">
                Production-style ecommerce · Powered by NestJS &amp; MongoDB
              </p>
              <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.35);line-height:1.6;">
                You received this email because a purchase was made using your account.<br/>
                This is an automated message — please do not reply directly.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

function buildPasswordResetHtml(resetLink: string, frontendUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Reset your password</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
          <tr>
            <td style="background:linear-gradient(135deg,#1d4ed8 0%,#7c3aed 100%);border-radius:16px 16px 0 0;padding:36px 40px 28px;text-align:center;">
              <p style="margin:0 0 6px;font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.7);">Atlas Commerce Lab</p>
              <h1 style="margin:0;font-size:24px;font-weight:800;color:#ffffff;">Reset your password</h1>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:32px 40px;border-radius:0 0 16px 16px;">
              <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
                We received a request to reset the password for your account. Click the button below to choose a new password.
              </p>
              <p style="margin:0 0 24px;font-size:13px;color:#9ca3af;">
                This link expires in <strong style="color:#374151;">1 hour</strong>. If you didn't request a reset, you can safely ignore this email.
              </p>
              <div style="text-align:center;margin-bottom:28px;">
                <a href="${resetLink}"
                   style="display:inline-block;background:linear-gradient(135deg,#1d4ed8 0%,#7c3aed 100%);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px;">
                  Reset Password →
                </a>
              </div>
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;line-height:1.6;">
                Or copy this link into your browser:<br/>
                <span style="color:#6b7280;word-break:break-all;">${resetLink}</span>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── service ─────────────────────────────────────────────────────────────────

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly fromAddress: string;
  private readonly frontendUrl: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('MAIL_HOST');
    const port = Number(this.configService.get<string>('MAIL_PORT') ?? '587');
    const user = this.configService.get<string>('MAIL_USER');
    const pass = this.configService.get<string>('MAIL_PASS');

    this.fromAddress =
      this.configService.get<string>('MAIL_FROM') ??
      '"Atlas Commerce Lab" <noreply@atlascommerce.dev>';

    this.frontendUrl =
      this.configService.get<string>('FRONTEND_PUBLIC_URL') ??
      'http://localhost:8080';

    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        // port 465 = implicit TLS, port 587 = STARTTLS (Gmail standard)
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
        // Required for Gmail — rejects self-signed certs but allows Gmail's real cert
        tls: { rejectUnauthorized: true },
      });

      // Verify the connection immediately so misconfiguration is caught at startup
      // rather than silently failing on the first real email.
      this.transporter.verify((err: Error | null) => {
        if (err) {
          this.logger.error(
            `Mail transport verification FAILED for ${host}:${port} — ${err.message}. ` +
            `Check MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS in your .env file.`,
          );
        } else {
          this.logger.log(`Mail transport verified ✓ → ${host}:${port} (from: ${this.fromAddress})`);
        }
      });
    } else {
      this.logger.warn(
        'MAIL_HOST not set — emails will be printed to the console instead of sent.',
      );
    }
  }

  // ── order confirmation ────────────────────────────────────────────────────

  async sendOrderConfirmation(order: any): Promise<void> {
    const to      = order.customer?.email as string;
    const subject = `Order confirmed — #${order.orderNumber}`;
    const html    = buildOrderConfirmationHtml(order, this.frontendUrl);

    await this.send({ to, subject, html });
  }

  // ── password reset ────────────────────────────────────────────────────────

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetLink =
      `${this.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const subject = 'Reset your Atlas Commerce Lab password';
    const html    = buildPasswordResetHtml(resetLink, this.frontendUrl);

    await this.send({ to: email, subject, html });
  }

  // ── internal send helper ─────────────────────────────────────────────────

  private async send(options: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from: this.fromAddress,
          to: options.to,
          subject: options.subject,
          html: options.html,
        });
        this.logger.log(
          `Email sent ✓ → ${options.to} | "${options.subject}" | messageId: ${info.messageId}`,
        );
      } catch (err: unknown) {
        // Log the full error so SMTP auth failures, TLS errors etc. are visible
        const message = err instanceof Error ? err.message : String(err);
        const code    = (err as any)?.code ?? '';
        const response = (err as any)?.response ?? '';
        this.logger.error(
          `Failed to send email to ${options.to}: ${message}` +
          (code     ? ` [code: ${code}]`         : '') +
          (response ? ` [smtp response: ${response}]` : ''),
        );
      }
    } else {
      this.logger.log('┌─────────────────────────────────────────────────');
      this.logger.log('│ MOCK EMAIL (MAIL_HOST not configured)');
      this.logger.log(`│ To:      ${options.to}`);
      this.logger.log(`│ Subject: ${options.subject}`);
      this.logger.log('│ Set MAIL_HOST/MAIL_USER/MAIL_PASS in .env to send real emails');
      this.logger.log('└─────────────────────────────────────────────────');
    }
  }
}
