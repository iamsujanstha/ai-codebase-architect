import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service';
import {
  STRIPE_PROVIDER_TOKEN,
  ESEWA_PROVIDER_TOKEN,
  IStripeProvider,
  IEsewaProvider,
} from './interfaces/payment-provider.interface';
import {
  IPaymentsRepository,
  PAYMENTS_REPOSITORY_TOKEN,
} from './repositories/payments.repository.interface';
import { MailService } from '../mail/mail.service';
import { PaymentProvider } from './enums/payment-provider.enum';

describe('Payments Provider Adapter Pattern', () => {
  let paymentsService: PaymentsService;
  let mockPaymentsRepo: Partial<IPaymentsRepository>;
  let mockStripeProvider: Partial<IStripeProvider>;
  let mockEsewaProvider: Partial<IEsewaProvider>;
  let mockMailService: Partial<MailService>;

  beforeEach(async () => {
    mockPaymentsRepo = {
      findProductsByIds: jest.fn().mockResolvedValue([
        { id: 1, name: 'AI Architecture Pro', price: 99, stock: 10 },
      ]),
      findOrCreateCustomer: jest.fn().mockResolvedValue({ id: 10, email: 'arch@elite.io' }),
      getFirstUserId: jest.fn().mockResolvedValue(10),
      createOrderSnapshot: jest.fn().mockResolvedValue({ id: 100 }),
      updateOrderStatus: jest.fn().mockResolvedValue(undefined),
      findOrderByOrderNumber: jest.fn().mockResolvedValue({
        id: 100,
        order_number: 'ACL-261027-ABC123',
        user_id: 10,
        total_amount: 99,
        status: 'pending',
        payment_method: 'STRIPE',
        order_items: [],
        users: { name: 'Lead Architect', email: 'arch@elite.io' },
      }),
      markOrderAsPaidAtomic: jest.fn().mockResolvedValue(undefined),
      decrementProductStock: jest.fn().mockResolvedValue(undefined),
    };

    mockStripeProvider = {
      provider: PaymentProvider.STRIPE,
      buildQuote: jest.fn().mockReturnValue({
        provider: PaymentProvider.STRIPE,
        displayName: 'Stripe Checkout',
        enabled: true,
        currency: 'USD',
        subtotal: 99,
        taxAmount: 0,
        serviceCharge: 0,
        deliveryCharge: 0,
        total: 99,
        note: 'Hosted checkout',
      }),
      createCheckoutSession: jest.fn().mockResolvedValue({
        orderNumber: 'ACL-261027-ABC123',
        checkoutUrl: 'https://checkout.stripe.com/pay/cs_test_mock',
      }),
      constructWebhookEvent: jest.fn(),
      retrieveSession: jest.fn(),
      extractOrderNumber: jest.fn(),
    };

    mockEsewaProvider = {
      provider: PaymentProvider.ESEWA,
      buildQuote: jest.fn().mockReturnValue({
        provider: PaymentProvider.ESEWA,
        displayName: 'eSewa ePay',
        enabled: true,
        currency: 'NPR',
        subtotal: 13365,
        taxAmount: 0,
        serviceCharge: 0,
        deliveryCharge: 0,
        total: 13365,
        note: 'eSewa ePay',
      }),
      createCheckout: jest.fn().mockReturnValue({
        orderNumber: 'ACL-261027-ABC123',
        actionUrl: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
        method: 'POST',
        fields: {
          total_amount: '13365',
          transaction_uuid: 'ACL-261027-ABC123',
          product_code: 'EPAYTEST',
          signature: 'mock_signature',
        },
      }),
      verifyCallbackPayload: jest.fn(),
      queryStatus: jest.fn(),
      buildFrontendResultUrl: jest.fn().mockReturnValue('http://localhost:8080/checkout/result?provider=esewa&orderNumber=ACL-261027-ABC123&status=success'),
    };

    mockMailService = {
      sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: PAYMENTS_REPOSITORY_TOKEN,
          useValue: mockPaymentsRepo,
        },
        {
          provide: STRIPE_PROVIDER_TOKEN,
          useValue: mockStripeProvider,
        },
        {
          provide: ESEWA_PROVIDER_TOKEN,
          useValue: mockEsewaProvider,
        },
        {
          provide: MailService,
          useValue: mockMailService,
        },
      ],
    }).compile();

    paymentsService = module.get<PaymentsService>(PaymentsService);
  });

  it('should be defined', () => {
    expect(paymentsService).toBeDefined();
  });

  it('should orchestrate getQuote by querying providers and catalog repository', async () => {
    const quote = await paymentsService.getQuote({
      items: [{ productId: '1', quantity: 1 }],
    });

    expect(mockPaymentsRepo.findProductsByIds).toHaveBeenCalledWith([1]);
    expect(mockStripeProvider.buildQuote).toHaveBeenCalled();
    expect(mockEsewaProvider.buildQuote).toHaveBeenCalled();
    expect(quote.items.length).toBe(1);
    expect(quote.providers.length).toBe(2);
  });

  it('should orchestrate createStripeCheckoutSession by delegating to StripeProvider and creating snapshot', async () => {
    const session = await paymentsService.createStripeCheckoutSession(
      {
        customer: {
          fullName: 'Senior Architect',
          email: 'arch@elite.io',
        },
        items: [{ productId: '1', quantity: 1 }],
      },
      '10',
    );

    expect(mockPaymentsRepo.createOrderSnapshot).toHaveBeenCalled();
    expect(mockStripeProvider.createCheckoutSession).toHaveBeenCalled();
    expect(mockPaymentsRepo.updateOrderStatus).toHaveBeenCalledWith(
      expect.any(String),
      'pending',
      session.orderNumber,
    );
    expect(session.checkoutUrl).toBe('https://checkout.stripe.com/pay/cs_test_mock');
  });

  it('should orchestrate createEsewaCheckout by delegating to EsewaProvider and creating snapshot', async () => {
    const session = await paymentsService.createEsewaCheckout(
      {
        customer: {
          fullName: 'Senior Architect',
          email: 'arch@elite.io',
        },
        items: [{ productId: '1', quantity: 1 }],
      },
      '10',
    );

    expect(mockPaymentsRepo.createOrderSnapshot).toHaveBeenCalled();
    expect(mockEsewaProvider.createCheckout).toHaveBeenCalled();
    expect(mockPaymentsRepo.updateOrderStatus).toHaveBeenCalled();
    expect(session.method).toBe('POST');
    expect(session.fields.product_code).toBe('EPAYTEST');
  });
});
