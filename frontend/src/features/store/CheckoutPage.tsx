import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/core/api/aiApi';
import {
  createEsewaCheckout,
  createStripeCheckoutSession,
  requestPaymentQuote,
} from '@/core/api/paymentApi';
import type {
  CheckoutCustomerInput,
  PaymentQuoteResponse,
} from '@/core/types/payment';
import type { PaymentProvider } from '@/core/types/payment-literals';
import { useCart } from '@/features/store/CartContext';
import { useAuth } from '@/features/auth/AuthContext';
import { formatCurrency } from '@/shared/utils/formatCurrency';

const CUSTOMER_STORAGE_KEY = 'atlas-commerce-lab:checkout-customer';

function loadStoredCustomer(
  userEmail?: string,
  userName?: string,
): CheckoutCustomerInput {
  const defaults: CheckoutCustomerInput = {
    fullName: userName ?? '',
    email: userEmail ?? '',
    phone: '',
    addressLine1: '',
    city: '',
    country: 'Nepal',
  };

  if (typeof window === 'undefined') return defaults;

  try {
    const rawValue = window.localStorage.getItem(CUSTOMER_STORAGE_KEY);
    if (!rawValue) return defaults;

    const stored = JSON.parse(rawValue) as CheckoutCustomerInput;
    return {
      ...stored,
      // Always override with the logged-in user's email so the order
      // confirmation is guaranteed to reach the right inbox.
      email: userEmail ?? stored.email,
      fullName: stored.fullName || userName || '',
    };
  } catch {
    return defaults;
  }
}

function isValidCustomer(customer: CheckoutCustomerInput): boolean {
  return (
    customer.fullName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())
  );
}

export function CheckoutPage(): JSX.Element {
  const { items } = useCart();
  const { user } = useAuth();
  const [customer, setCustomer] = useState<CheckoutCustomerInput>(() =>
    loadStoredCustomer(user?.email, user?.name),
  );
  const [quote, setQuote] = useState<PaymentQuoteResponse | null>(null);
  const [selectedProvider, setSelectedProvider] =
    useState<PaymentProvider>('stripe');
  const [isLoadingQuote, setIsLoadingQuote] = useState(true);
  const [isSubmittingProvider, setIsSubmittingProvider] =
    useState<PaymentProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep the email field in sync if the user logs in after the page mounts
  useEffect(() => {
    if (user?.email) {
      setCustomer((prev) => ({
        ...prev,
        email: user.email,
        fullName: prev.fullName || user.name || '',
      }));
    }
  }, [user?.email, user?.name]);

  const checkoutItems = useMemo(
    () =>
      items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    [items],
  );

  useEffect(() => {
    window.localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(customer));
  }, [customer]);

  useEffect(() => {
    let isMounted = true;

    async function loadQuote() {
      if (checkoutItems.length === 0) {
        setQuote(null);
        setIsLoadingQuote(false);
        return;
      }

      setIsLoadingQuote(true);
      setError(null);

      try {
        const nextQuote = await requestPaymentQuote(checkoutItems);

        if (!isMounted) {
          return;
        }

        setQuote(nextQuote);

        const firstEnabledProvider = nextQuote.providers.find(
          (provider) => provider.enabled,
        );
        if (firstEnabledProvider) {
          setSelectedProvider(firstEnabledProvider.provider);
        }
      } catch (caughtError) {
        if (!isMounted) {
          return;
        }

        setError(
          caughtError instanceof ApiError
            ? caughtError.message
            : 'The checkout page could not load payment pricing.',
        );
      } finally {
        if (isMounted) {
          setIsLoadingQuote(false);
        }
      }
    }

    void loadQuote();

    return () => {
      isMounted = false;
    };
  }, [checkoutItems]);

  const selectedQuote = quote?.providers.find(
    (provider) => provider.provider === selectedProvider,
  );

  async function handleStripeCheckout() {
    setIsSubmittingProvider('stripe');
    setError(null);

    try {
      const response = await createStripeCheckoutSession({
        items: checkoutItems,
        customer,
      });

      window.location.assign(response.checkoutUrl);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : 'Stripe checkout could not be started.',
      );
      setIsSubmittingProvider(null);
    }
  }

  async function handleEsewaCheckout() {
    setIsSubmittingProvider('esewa');
    setError(null);

    try {
      const response = await createEsewaCheckout({
        items: checkoutItems,
        customer,
      });

      const formElement = document.createElement('form');
      formElement.method = response.method;
      formElement.action = response.actionUrl;
      formElement.style.display = 'none';

      Object.entries(response.fields).forEach(([key, value]) => {
        const inputElement = document.createElement('input');
        inputElement.type = 'hidden';
        inputElement.name = key;
        inputElement.value = value;
        formElement.appendChild(inputElement);
      });

      document.body.appendChild(formElement);
      formElement.submit();
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : 'eSewa checkout could not be started.',
      );
      setIsSubmittingProvider(null);
    }
  }

  if (items.length === 0) {
    return (
      <section className="checkout-empty panel-surface">
        <p className="section-kicker">Checkout</p>
        <h1>Your cart is empty</h1>
        <p>
          Add a few products first, then come back here to launch the real Stripe
          or eSewa payment flow.
        </p>
        <Link className="primary-button" to="/">
          Back to storefront
        </Link>
      </section>
    );
  }

  return (
    <div className="checkout-page">
      <div className="checkout-heading">
        <div>
          <p className="section-kicker">Production-grade payments</p>
          <h1>Review your order and choose a provider</h1>
          <p>
            Prices are recalculated server-side before every payment attempt so the
            browser never becomes the source of truth for order totals.
          </p>
        </div>
        <Link className="secondary-link-button" to="/">
          Continue shopping
        </Link>
      </div>

      <div className="checkout-layout">
        <section className="checkout-form-panel panel-surface">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Customer details</p>
              <h2>Contact information</h2>
            </div>
          </div>

          <div className="checkout-form-grid">
            <label className="checkout-field">
              <span>Full name</span>
              <input
                value={customer.fullName}
                onChange={(event) =>
                  setCustomer((currentValue) => ({
                    ...currentValue,
                    fullName: event.target.value,
                  }))
                }
                placeholder="Avery Chen"
              />
            </label>

            <label className="checkout-field">
              <span>Email address</span>
              <input
                value={customer.email}
                onChange={(event) =>
                  setCustomer((currentValue) => ({
                    ...currentValue,
                    email: event.target.value,
                  }))
                }
                placeholder="avery@example.com"
                type="email"
                readOnly={Boolean(user?.email)}
                style={user?.email ? { opacity: 0.7, cursor: 'not-allowed' } : undefined}
                title={user?.email ? 'Email is taken from your account' : undefined}
              />
              {user?.email && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Order confirmation will be sent to your account email
                </span>
              )}
            </label>

            <label className="checkout-field">
              <span>Phone</span>
              <input
                value={customer.phone ?? ''}
                onChange={(event) =>
                  setCustomer((currentValue) => ({
                    ...currentValue,
                    phone: event.target.value,
                  }))
                }
                placeholder="+977 98XXXXXXXX"
              />
            </label>

            <label className="checkout-field">
              <span>Address line 1</span>
              <input
                value={customer.addressLine1 ?? ''}
                onChange={(event) =>
                  setCustomer((currentValue) => ({
                    ...currentValue,
                    addressLine1: event.target.value,
                  }))
                }
                placeholder="Jhamsikhel, Ward 3"
              />
            </label>

            <label className="checkout-field">
              <span>City</span>
              <input
                value={customer.city ?? ''}
                onChange={(event) =>
                  setCustomer((currentValue) => ({
                    ...currentValue,
                    city: event.target.value,
                  }))
                }
                placeholder="Lalitpur"
              />
            </label>

            <label className="checkout-field">
              <span>Country</span>
              <input
                value={customer.country ?? ''}
                onChange={(event) =>
                  setCustomer((currentValue) => ({
                    ...currentValue,
                    country: event.target.value,
                  }))
                }
                placeholder="Nepal"
              />
            </label>
          </div>

          <div className="section-heading checkout-provider-heading">
            <div>
              <p className="section-kicker">Payment methods</p>
              <h2>Provider selection</h2>
            </div>
          </div>

          <div className="provider-card-grid">
            {(quote?.providers ?? []).map((provider) => (
              <button
                key={provider.provider}
                type="button"
                className={`provider-card ${selectedProvider === provider.provider ? 'selected' : ''} ${!provider.enabled ? 'disabled' : ''}`}
                onClick={() => setSelectedProvider(provider.provider)}
                disabled={!provider.enabled}
              >
                <div className="provider-card-header">
                  <div>
                    <strong>{provider.displayName}</strong>
                    <span>{provider.currency}</span>
                  </div>
                  <span className={`provider-status ${provider.enabled ? 'enabled' : 'disabled'}`}>
                    {provider.enabled ? 'Ready' : 'Needs setup'}
                  </span>
                </div>

                <p>{provider.note}</p>

                <div className="provider-total">
                  {formatCurrency(provider.total, provider.currency)}
                </div>

                {provider.reasonUnavailable ? (
                  <div className="provider-warning">{provider.reasonUnavailable}</div>
                ) : null}
              </button>
            ))}
          </div>

          {error ? <div className="thread-banner error">{error}</div> : null}

          <div className="checkout-submit-panel">
            {selectedProvider === 'stripe' ? (
              <button
                className="primary-button payment-submit-button"
                type="button"
                disabled={
                  !isValidCustomer(customer) ||
                  !selectedQuote?.enabled ||
                  isSubmittingProvider !== null
                }
                onClick={() => {
                  void handleStripeCheckout();
                }}
              >
                {isSubmittingProvider === 'stripe'
                  ? 'Redirecting to Stripe...'
                  : 'Pay with Stripe'}
              </button>
            ) : (
              <button
                className="primary-button payment-submit-button"
                type="button"
                disabled={
                  !isValidCustomer(customer) ||
                  !selectedQuote?.enabled ||
                  isSubmittingProvider !== null
                }
                onClick={() => {
                  void handleEsewaCheckout();
                }}
              >
                {isSubmittingProvider === 'esewa'
                  ? 'Redirecting to eSewa...'
                  : 'Pay with eSewa'}
              </button>
            )}

            {!isValidCustomer(customer) && items.length > 0 && (
              <p className="checkout-validation-error">
                Please provide a valid <strong>Full Name</strong> and <strong>Email</strong> to enable payment.
              </p>
            )}


            <p className="checkout-note">
              Real providers require a publicly reachable backend for callbacks.
              For local testing, Stripe CLI or a tunnel such as ngrok is still the
              normal workflow.
            </p>
          </div>
        </section>

        <aside className="checkout-summary-panel panel-surface">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Order summary</p>
              <h2>Server-priced cart</h2>
            </div>
            {isLoadingQuote ? (
              <span className="status-chip">Refreshing</span>
            ) : selectedQuote ? (
              <span className="status-chip">{selectedQuote.currency}</span>
            ) : null}
          </div>

          <div className="checkout-item-list">
            {(quote?.items ?? []).map((item) => (
              <div key={item.productId} className="checkout-item-row">
                <div>
                  <strong>{item.name}</strong>
                  <span>Qty {item.quantity}</span>
                </div>
                <strong>
                  {formatCurrency(
                    item.lineTotal,
                    selectedQuote?.currency ?? 'USD',
                  )}
                </strong>
              </div>
            ))}
          </div>

          {selectedQuote ? (
            <div className="checkout-totals">
              <div className="checkout-total-row">
                <span>Subtotal</span>
                <strong>
                  {formatCurrency(selectedQuote.subtotal, selectedQuote.currency)}
                </strong>
              </div>
              <div className="checkout-total-row">
                <span>Tax</span>
                <strong>
                  {formatCurrency(selectedQuote.taxAmount, selectedQuote.currency)}
                </strong>
              </div>
              <div className="checkout-total-row">
                <span>Service charge</span>
                <strong>
                  {formatCurrency(
                    selectedQuote.serviceCharge,
                    selectedQuote.currency,
                  )}
                </strong>
              </div>
              <div className="checkout-total-row">
                <span>Delivery</span>
                <strong>
                  {formatCurrency(
                    selectedQuote.deliveryCharge,
                    selectedQuote.currency,
                  )}
                </strong>
              </div>
              <div className="checkout-total-row final">
                <span>Total</span>
                <strong>
                  {formatCurrency(selectedQuote.total, selectedQuote.currency)}
                </strong>
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
