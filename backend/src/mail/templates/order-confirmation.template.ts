import {
  formatAmount,
  formatDate,
  providerLabel,
} from '../helpers/mail-format.helper';
import type { OrderConfirmationEmail } from '../interfaces/order-confirmation.interface';

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]);
}

/**
 * Renders receipt HTML without side effects.
 * @param order Persisted receipt snapshot.
 * @param frontendUrl Public storefront origin used for links.
 * @returns Email-safe HTML markup.
 */
export function buildOrderConfirmationHtml(
  order: OrderConfirmationEmail,
  frontendUrl: string,
): string {
  const currency = order.pricing.currency;
  const paidAt = formatDate(order.paidAt);
  const provider = escapeHtml(providerLabel(order.paymentProvider));
  const orderNumber = escapeHtml(order.orderNumber);
  const orderUrl = escapeHtml(
    `${frontendUrl}/checkout/result?orderNumber=${encodeURIComponent(order.orderNumber)}&provider=${encodeURIComponent(order.paymentProvider)}`,
  );
  const customerName = escapeHtml(order.customer.fullName);
  const customerEmail = escapeHtml(order.customer.email);
  const customerPhone = order.customer.phone
    ? escapeHtml(order.customer.phone)
    : '';
  const paymentReference = order.paymentReference
    ? escapeHtml(order.paymentReference)
    : '';

  const itemRows = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid #f0f0f0;vertical-align:top;">
          <span style="font-weight:600;color:#111827;font-size:14px;">${escapeHtml(item.name)}</span>
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid #f0f0f0;text-align:center;color:#6b7280;font-size:14px;vertical-align:top;">
          ${item.quantity}
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid #f0f0f0;text-align:right;color:#6b7280;font-size:14px;vertical-align:top;">
          ${escapeHtml(formatAmount(item.unitAmount, item.currency))}
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;color:#111827;font-size:14px;vertical-align:top;">
          ${escapeHtml(formatAmount(item.lineTotal, item.currency))}
        </td>
      </tr>`,
    )
    .join('');

  const pricingRows = [
    { label: 'Subtotal', value: order.pricing.subtotal, show: true },
    {
      label: 'Tax',
      value: order.pricing.taxAmount,
      show: order.pricing.taxAmount > 0,
    },
    {
      label: 'Service charge',
      value: order.pricing.serviceCharge,
      show: order.pricing.serviceCharge > 0,
    },
    {
      label: 'Delivery',
      value: order.pricing.deliveryCharge,
      show: order.pricing.deliveryCharge > 0,
    },
  ]
    .filter((r) => r.show)
    .map(
      (r) => `
      <tr>
        <td style="padding:6px 0;color:#6b7280;font-size:14px;">${r.label}</td>
        <td style="padding:6px 0;text-align:right;color:#374151;font-size:14px;">${escapeHtml(formatAmount(r.value, currency))}</td>
      </tr>`,
    )
    .join('');

  const addressLines = [
    order.customer.addressLine1,
    order.customer.city,
    order.customer.country,
  ]
    .filter(Boolean)
    .join(', ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>Order Confirmed — ${orderNumber}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <tr>
            <td style="background:linear-gradient(135deg,#1d4ed8 0%,#7c3aed 100%);border-radius:16px 16px 0 0;padding:40px 40px 32px;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.7);">Atlas Commerce Lab</p>
              <h1 style="margin:0 0 8px;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">Order Confirmed ✓</h1>
              <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.85);">Your payment was received and your order is on its way.</p>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:0 40px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:24px 0;border-bottom:1px solid #f0f0f0;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td>
                          <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">Order number</p>
                          <p style="margin:0;font-size:20px;font-weight:800;color:#111827;font-family:'SF Mono','Fira Code',monospace;">#${orderNumber}</p>
                        </td>
                        <td align="right">
                          <span style="display:inline-block;background:#d1fae5;color:#065f46;font-size:13px;font-weight:700;padding:6px 14px;border-radius:999px;border:1px solid #a7f3d0;">✓ &nbsp;Paid</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:24px 40px 0;">
              <p style="margin:0 0 8px;font-size:16px;color:#374151;">Hi <strong style="color:#111827;">${customerName}</strong>,</p>
              <p style="margin:0;font-size:15px;color:#6b7280;line-height:1.6;">
                Thank you for your purchase! We've received your payment via
                <strong style="color:#374151;">${provider}</strong> and your order has been confirmed.
              </p>
            </td>
          </tr>

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
                <tbody>${itemRows}</tbody>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:20px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0f0f0;border-radius:10px;overflow:hidden;" bgcolor="#f9fafb">
                <tr><td style="padding:16px 20px 8px;">
                  <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:#9ca3af;">Pricing breakdown</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    ${pricingRows}
                    <tr><td colspan="2" style="padding:10px 0 0;border-top:2px solid #e5e7eb;"></td></tr>
                    <tr>
                      <td style="padding:4px 0;font-size:16px;font-weight:800;color:#111827;">Total charged</td>
                      <td style="padding:4px 0;text-align:right;font-size:16px;font-weight:800;color:#1d4ed8;">${escapeHtml(formatAmount(order.pricing.total, currency))}</td>
                    </tr>
                  </table>
                </td></tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:20px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="48%" style="vertical-align:top;padding-right:8px;">
                    <div style="background:#f9fafb;border:1px solid #f0f0f0;border-radius:10px;padding:16px 18px;">
                      <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:#9ca3af;">Delivered to</p>
                      <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#111827;">${customerName}</p>
                      <p style="margin:0 0 2px;font-size:13px;color:#6b7280;">${customerEmail}</p>
                      ${customerPhone ? `<p style="margin:0 0 2px;font-size:13px;color:#6b7280;">${customerPhone}</p>` : ''}
                      ${addressLines ? `<p style="margin:4px 0 0;font-size:13px;color:#6b7280;">${escapeHtml(addressLines)}</p>` : ''}
                    </div>
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="vertical-align:top;padding-left:8px;">
                    <div style="background:#f9fafb;border:1px solid #f0f0f0;border-radius:10px;padding:16px 18px;">
                      <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:#9ca3af;">Payment details</p>
                      <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#111827;">${provider}</p>
                      <p style="margin:0 0 2px;font-size:13px;color:#6b7280;">Paid on ${paidAt}</p>
                      ${paymentReference ? `<p style="margin:4px 0 0;font-size:11px;color:#9ca3af;font-family:monospace;">Ref: ${paymentReference}</p>` : ''}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:28px 40px 0;text-align:center;">
              <a href="${orderUrl}" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8 0%,#7c3aed 100%);color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:10px;">
                View Order Details →
              </a>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:32px 40px 0;">
              <hr style="border:none;border-top:1px solid #f0f0f0;margin:0;" />
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:24px 40px;">
              <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#374151;">Need help?</p>
              <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6;">
                Questions about your order? Visit our
              <a href="${escapeHtml(`${frontendUrl}/chat`)}" style="color:#1d4ed8;text-decoration:none;font-weight:500;">AI concierge</a>
                for instant support.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:linear-gradient(135deg,#1e1b4b 0%,#1e3a5f 100%);border-radius:0 0 16px 16px;padding:28px 40px;text-align:center;">
              <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#ffffff;">Atlas Commerce Lab</p>
              <p style="margin:0 0 16px;font-size:12px;color:rgba(255,255,255,0.5);">Production-style ecommerce · Powered by NestJS &amp; MongoDB</p>
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
