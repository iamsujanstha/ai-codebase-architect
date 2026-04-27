import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchMyOrders } from '@/core/api/paymentApi';
import type { OrderSummaryResponse } from '@/core/types/payment';
import { formatCurrency } from '@/shared/utils/formatCurrency';

function statusLabel(status: string): string {
  switch (status) {
    case 'paid': return 'Paid';
    case 'pending_payment': return 'Pending';
    case 'failed': return 'Failed';
    case 'canceled': return 'Canceled';
    case 'expired': return 'Expired';
    default: return status;
  }
}

function statusClass(status: string): string {
  switch (status) {
    case 'paid': return 'order-status-paid';
    case 'pending_payment': return 'order-status-pending';
    case 'failed':
    case 'canceled':
    case 'expired': return 'order-status-failed';
    default: return '';
  }
}

export function OrderHistoryPage(): JSX.Element {
  const [orders, setOrders] = useState<OrderSummaryResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetchMyOrders()
      .then((data) => {
        if (isMounted) setOrders(data);
      })
      .catch((err) => {
        if (isMounted) setError(err instanceof Error ? err.message : 'Failed to load orders.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => { isMounted = false; };
  }, []);

  if (isLoading) {
    return (
      <section className="order-history-page panel-surface">
        <p className="section-kicker">My Account</p>
        <h1>Order History</h1>
        <p className="loading-hint">Loading your orders…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="order-history-page panel-surface">
        <p className="section-kicker">My Account</p>
        <h1>Order History</h1>
        <div className="thread-banner error">{error}</div>
      </section>
    );
  }

  if (orders.length === 0) {
    return (
      <section className="order-history-page panel-surface">
        <p className="section-kicker">My Account</p>
        <h1>Order History</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '1rem' }}>
          You haven't placed any orders yet.
        </p>
        <Link className="primary-button" to="/" style={{ marginTop: '1.5rem', display: 'inline-block' }}>
          Start shopping
        </Link>
      </section>
    );
  }

  return (
    <section className="order-history-page">
      <div className="checkout-heading">
        <div>
          <p className="section-kicker">My Account</p>
          <h1>Order History</h1>
          <p>{orders.length} order{orders.length !== 1 ? 's' : ''} placed</p>
        </div>
        <Link className="secondary-link-button" to="/">Continue shopping</Link>
      </div>

      <div className="order-history-list">
        {orders.map((order) => (
          <div key={order.orderNumber} className="order-history-card panel-surface">
            <div className="order-history-card-header">
              <div>
                <p className="order-number">#{order.orderNumber}</p>
                <p className="order-date">
                  {new Date(order.createdAt).toLocaleDateString(undefined, {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </p>
              </div>
              <span className={`status-chip ${statusClass(order.status)}`}>
                {statusLabel(order.status)}
              </span>
            </div>

            <div className="order-history-items">
              {order.items.map((item) => (
                <div key={item.productId} className="order-history-item-row">
                  <span>{item.name} × {item.quantity}</span>
                  <span>{formatCurrency(item.lineTotal, item.currency)}</span>
                </div>
              ))}
            </div>

            <div className="order-history-card-footer">
              <div className="order-history-totals">
                <span>Total</span>
                <strong>
                  {formatCurrency(order.pricing.total, order.pricing.currency)}
                </strong>
              </div>
              <div className="order-history-meta">
                <span className="order-provider">{order.paymentProvider}</span>
                {order.paidAt && (
                  <span className="order-paid-at">
                    Paid {new Date(order.paidAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              <Link
                className="secondary-link-button"
                to={`/checkout/result?orderNumber=${encodeURIComponent(order.orderNumber)}&provider=${order.paymentProvider}`}
              >
                View details →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
