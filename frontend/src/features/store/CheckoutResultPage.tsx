import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError } from '@/core/api/aiApi';
import {
  fetchOrderSummary,
  fetchStripeSessionStatus,
} from '@/core/api/paymentApi';
import type { OrderSummaryResponse } from '@/core/types/payment';
import { useCart } from '@/features/store/CartContext';
import { useAuth } from '@/features/auth/AuthContext';
import { formatCurrency } from '@/shared/utils/formatCurrency';

function getStatusCopy(status: string | null): {
  title: string;
  description: string;
} {
  switch (status) {
    case 'paid':
      return {
        title: 'Payment confirmed',
        description:
          'The order has been marked paid on the backend and is safe to treat as a successful checkout.',
      };
    case 'pending_payment':
      return {
        title: 'Payment still pending',
        description:
          'The provider redirect happened, but the final server-side confirmation is still pending.',
      };
    case 'canceled':
    case 'failed':
    case 'expired':
      return {
        title: 'Payment not completed',
        description:
          'The order was not completed successfully. You can review the order and try another payment method.',
      };
    default:
      return {
        title: 'Checking payment status',
        description:
          'The page is reconciling the payment provider response with the backend order record.',
      };
  }
}

export function CheckoutResultPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const { clearCart } = useCart();
  const { user } = useAuth();
  const [order, setOrder] = useState<OrderSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const clearCartOnceRef = useRef(false);

  const orderNumber = searchParams.get('orderNumber');
  const stripeSessionId = searchParams.get('session_id');
  const provider = searchParams.get('provider');

  useEffect(() => {
    let isMounted = true;

    async function loadResult() {
      if (!orderNumber) {
        setError('The checkout result page did not receive an order number.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        if (provider === 'stripe' && stripeSessionId) {
          const response = await fetchStripeSessionStatus({
            sessionId: stripeSessionId,
            orderNumber,
          });

          if (isMounted) {
            setOrder(response.order);
          }
        } else {
          const response = await fetchOrderSummary(orderNumber);
          if (isMounted) {
            setOrder(response);
          }
        }
      } catch (caughtError) {
        if (!isMounted) {
          return;
        }

        setError(
          caughtError instanceof ApiError
            ? caughtError.message
            : 'The app could not reconcile the payment result.',
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadResult();

    return () => {
      isMounted = false;
    };
  }, [orderNumber, provider, stripeSessionId]);

  useEffect(() => {
    if (order?.status === 'paid' && !clearCartOnceRef.current) {
      clearCart();
      clearCartOnceRef.current = true;
    }
  }, [clearCart, order?.status]);

  const statusCopy = useMemo(
    () => getStatusCopy(order?.status ?? null),
    [order?.status],
  );

  return (
    <div className="checkout-result-page">
      <section className="checkout-result-card panel-surface">
        <p className="section-kicker">Checkout status</p>
        <h1>{statusCopy.title}</h1>
        <p className="checkout-result-copy">{statusCopy.description}</p>

        {isLoading ? (
          <div className="loading-panel">Reconciling payment result...</div>
        ) : error ? (
          <div className="thread-banner error">{error}</div>
        ) : order ? (
          <>
            <div className={`result-status-pill ${order.status}`}>
              {order.status.replace('_', ' ')}
            </div>

            <div className="result-grid">
              <article className="result-section">
                <h2>Order</h2>
                <div className="result-kv-list">
                  <div>
                    <span>Order number</span>
                    <strong>{order.orderNumber}</strong>
                  </div>
                  <div>
                    <span>Provider</span>
                    <strong>{order.paymentProvider}</strong>
                  </div>
                  <div>
                    <span>Total</span>
                    <strong>
                      {formatCurrency(order.pricing.total, order.pricing.currency)}
                    </strong>
                  </div>
                  <div>
                    <span>Created</span>
                    <strong>
                      {new Date(order.createdAt).toLocaleString()}
                    </strong>
                  </div>
                  {order.paidAt ? (
                    <div>
                      <span>Paid at</span>
                      <strong>{new Date(order.paidAt).toLocaleString()}</strong>
                    </div>
                  ) : null}
                </div>
              </article>

              <article className="result-section">
                <h2>Customer</h2>
                <div className="result-kv-list">
                  <div>
                    <span>Name</span>
                    <strong>{order.customer.fullName}</strong>
                  </div>
                  <div>
                    <span>Email</span>
                    <strong>{order.customer.email}</strong>
                  </div>
                  {order.customer.phone ? (
                    <div>
                      <span>Phone</span>
                      <strong>{order.customer.phone}</strong>
                    </div>
                  ) : null}
                  {order.failureReason ? (
                    <div>
                      <span>Latest failure</span>
                      <strong>{order.failureReason}</strong>
                    </div>
                  ) : null}
                </div>
              </article>
            </div>

            <article className="result-section">
              <h2>Items</h2>
              <div className="result-order-item-list">
                {order.items.map((item) => (
                  <div key={`${item.productId}-${item.slug}`} className="result-order-item">
                    <div>
                      <strong>{item.name}</strong>
                      <span>
                        Qty {item.quantity} · {formatCurrency(item.unitAmount, item.currency)} each
                      </span>
                    </div>
                    <strong>{formatCurrency(item.lineTotal, item.currency)}</strong>
                  </div>
                ))}
              </div>
            </article>

            <div className="checkout-result-actions">
              <Link className="primary-button" to="/">
                Back to storefront
              </Link>
              {order.status !== 'paid' ? (
                <Link className="secondary-link-button" to="/checkout">
                  Try payment again
                </Link>
              ) : (
                <Link className="secondary-link-button" to="/chat">
                  Open AI concierge
                </Link>
              )}
            </div>

            {/* Sign-in nudge for unauthenticated users who land here via payment redirect */}
            {!user && order.status === 'paid' && (
              <div className="result-signin-nudge">
                <p>
                  <strong>Want to track this order?</strong> Sign in to save it to your order history.
                </p>
                <Link
                  className="primary-button"
                  to={`/login?redirect=/orders`}
                >
                  Sign in to view order history
                </Link>
              </div>
            )}

            {user && order.status === 'paid' && (
              <div className="result-signin-nudge result-signin-nudge--success">
                <p>
                  ✓ This order has been saved to your account.
                </p>
                <Link className="secondary-link-button" to="/orders">
                  View all orders →
                </Link>
              </div>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}
