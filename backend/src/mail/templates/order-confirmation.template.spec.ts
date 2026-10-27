import type { OrderConfirmationEmail } from '../interfaces/order-confirmation.interface';
import { buildOrderConfirmationHtml } from './order-confirmation.template';

describe('buildOrderConfirmationHtml', () => {
  it('renders line prices and the complete order total', () => {
    const order: OrderConfirmationEmail = {
      orderNumber: 'ORDER-42',
      paymentProvider: 'stripe',
      paymentReference: 'payment-42',
      paidAt: '2026-10-28T00:00:00.000Z',
      customer: {
        fullName: 'Avery Customer',
        email: 'avery@example.test',
      },
      items: [
        {
          name: 'Architecture Guide',
          quantity: 2,
          unitAmount: 12.5,
          lineTotal: 25,
          currency: 'USD',
        },
      ],
      pricing: {
        currency: 'USD',
        subtotal: 25,
        taxAmount: 2,
        serviceCharge: 1,
        deliveryCharge: 3,
        total: 31,
      },
    };

    const html = buildOrderConfirmationHtml(
      order,
      'https://store.example.test',
    );

    expect(html).toContain('$12.50');
    expect(html).toContain('$25.00');
    expect(html).toContain('$31.00');
    expect(html).not.toContain('undefined');
  });

  it('escapes customer and product text before inserting it into HTML', () => {
    const order: OrderConfirmationEmail = {
      orderNumber: 'ORDER-42',
      paymentProvider: 'stripe',
      paymentReference: null,
      paidAt: '2026-10-28T00:00:00.000Z',
      customer: {
        fullName: '<script>alert(1)</script>',
        email: 'avery@example.test',
      },
      items: [
        {
          name: '<img src=x onerror=alert(1)>',
          quantity: 1,
          unitAmount: 1,
          lineTotal: 1,
          currency: 'USD',
        },
      ],
      pricing: {
        currency: 'USD',
        subtotal: 1,
        taxAmount: 0,
        serviceCharge: 0,
        deliveryCharge: 0,
        total: 1,
      },
    };

    const html = buildOrderConfirmationHtml(
      order,
      'https://store.example.test',
    );

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });
});
