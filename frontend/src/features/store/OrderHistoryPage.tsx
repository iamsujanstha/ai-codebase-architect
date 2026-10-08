import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchMyOrders } from '@/core/api/paymentApi';
import { useAuth } from '@/features/auth/AuthContext';
import type { OrderSummaryResponse, OrderSummaryItem } from '@/core/types/payment';
import type { OrderStatus, PaymentProvider } from '@/core/types/payment-literals';
import { formatCurrency } from '@/shared/utils/formatCurrency';

// ─── helpers ────────────────────────────────────────────────────────────────

const STATUS_META: Record<
  OrderStatus,
  { label: string; icon: string; cls: string }
> = {
  paid:            { label: 'Paid',     icon: '✓', cls: 'oh-status--paid' },
  pending_payment: { label: 'Pending',  icon: '⏳', cls: 'oh-status--pending' },
  failed:          { label: 'Failed',   icon: '✕', cls: 'oh-status--failed' },
  canceled:        { label: 'Canceled', icon: '✕', cls: 'oh-status--failed' },
  expired:         { label: 'Expired',  icon: '⏱', cls: 'oh-status--failed' },
};

function fmt(date: string) {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function fmtFull(date: string) {
  return new Date(date).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── sub-components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status] ?? { label: status, icon: '•', cls: '' };
  return (
    <span className={`oh-badge ${meta.cls}`}>
      <span className="oh-badge__icon">{meta.icon}</span>
      {meta.label}
    </span>
  );
}

function ProviderLogo({ provider }: { provider: PaymentProvider }) {
  if (provider === 'stripe') {
    return (
      <span className="oh-provider oh-provider--stripe">
        <svg width="38" height="16" viewBox="0 0 60 25" fill="none" aria-label="Stripe">
          <path d="M27.5 7.2c0-1.3 1-1.8 2.7-1.8 2.4 0 5.5.7 7.9 2V2.1C35.7.8 33.3.2 30.2.2c-5.5 0-9.2 2.9-9.2 7.7 0 7.5 10.3 6.3 10.3 9.5 0 1.5-1.3 2-3.1 2-2.7 0-6.1-.9-8.8-2.5v5.4c3 1.3 6 1.8 8.8 1.8 5.7 0 9.6-2.8 9.6-7.7-.1-8.1-10.3-6.6-10.3-9.2z" fill="currentColor"/>
          <path d="M0 8.5l.4-2.3H5V2.4L10.7 1v5.2h5.8v4.6h-5.8v7.1c0 2 .9 2.8 2.5 2.8 1.1 0 2.2-.3 3.2-.8v4.4c-1.2.6-2.7 1-4.6 1C7.2 25.3 4.5 23 4.5 18v-7.5H0V8.5z" fill="currentColor"/>
        </svg>
      </span>
    );
  }
  return (
    <span className="oh-provider oh-provider--esewa">
      eSewa
    </span>
  );
}

function OrderItemRow({ item }: { item: OrderSummaryItem }) {
  return (
    <div className="oh-item-row">
      <div className="oh-item-row__info">
        <span className="oh-item-row__name">{item.name}</span>
        <span className="oh-item-row__qty">× {item.quantity}</span>
      </div>
      <div className="oh-item-row__prices">
        <span className="oh-item-row__unit">
          {formatCurrency(item.unitAmount, item.currency)} each
        </span>
        <strong className="oh-item-row__total">
          {formatCurrency(item.lineTotal, item.currency)}
        </strong>
      </div>
    </div>
  );
}

function PricingRow({
  label,
  value,
  currency,
  bold,
}: {
  label: string;
  value: number;
  currency: string;
  bold?: boolean;
}) {
  return (
    <div className={`oh-pricing-row${bold ? ' oh-pricing-row--total' : ''}`}>
      <span>{label}</span>
      <span>{formatCurrency(value, currency)}</span>
    </div>
  );
}

function OrderCard({
  order,
  expanded,
  onToggle,
}: {
  order: OrderSummaryResponse;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { pricing, items } = order;
  const previewItems = items.slice(0, 2);
  const extraCount = items.length - previewItems.length;

  return (
    <article className={`oh-card${expanded ? ' oh-card--expanded' : ''}`}>
      {/* ── card header ── */}
      <button
        className="oh-card__header"
        onClick={onToggle}
        aria-expanded={expanded}
        type="button"
      >
        <div className="oh-card__header-left">
          <div className="oh-card__order-id">
            <span className="oh-card__order-label">Order</span>
            <span className="oh-card__order-num">#{order.orderNumber}</span>
          </div>
          <div className="oh-card__meta">
            <span className="oh-card__date">{fmt(order.createdAt)}</span>
            <span className="oh-card__sep">·</span>
            <ProviderLogo provider={order.paymentProvider} />
          </div>
        </div>

        <div className="oh-card__header-right">
          <div className="oh-card__total-block">
            <span className="oh-card__total-label">Total</span>
            <strong className="oh-card__total-value">
              {formatCurrency(pricing.total, pricing.currency)}
            </strong>
          </div>
          <StatusBadge status={order.status} />
          <span className="oh-card__chevron" aria-hidden>
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </button>

      {/* ── collapsed preview ── */}
      {!expanded && (
        <div className="oh-card__preview">
          {previewItems.map((item) => (
            <span key={item.productId} className="oh-card__preview-item">
              {item.name} × {item.quantity}
            </span>
          ))}
          {extraCount > 0 && (
            <span className="oh-card__preview-more">+{extraCount} more</span>
          )}
        </div>
      )}

      {/* ── expanded detail ── */}
      {expanded && (
        <div className="oh-card__detail">
          {/* items */}
          <section className="oh-detail-section">
            <h3 className="oh-detail-section__title">Items</h3>
            <div className="oh-item-list">
              {items.map((item) => (
                <OrderItemRow key={item.productId} item={item} />
              ))}
            </div>
          </section>

          {/* pricing breakdown */}
          <section className="oh-detail-section">
            <h3 className="oh-detail-section__title">Pricing</h3>
            <div className="oh-pricing-breakdown">
              <PricingRow label="Subtotal"       value={pricing.subtotal}       currency={pricing.currency} />
              {pricing.taxAmount > 0 && (
                <PricingRow label="Tax"           value={pricing.taxAmount}      currency={pricing.currency} />
              )}
              {pricing.serviceCharge > 0 && (
                <PricingRow label="Service charge" value={pricing.serviceCharge} currency={pricing.currency} />
              )}
              {pricing.deliveryCharge > 0 && (
                <PricingRow label="Delivery"      value={pricing.deliveryCharge} currency={pricing.currency} />
              )}
              <PricingRow label="Total" value={pricing.total} currency={pricing.currency} bold />
            </div>
          </section>

          {/* customer */}
          <section className="oh-detail-section">
            <h3 className="oh-detail-section__title">Delivered to</h3>
            <div className="oh-customer-block">
              <p className="oh-customer-name">{order.customer.fullName}</p>
              <p className="oh-customer-email">{order.customer.email}</p>
              {order.customer.phone && (
                <p className="oh-customer-phone">{order.customer.phone}</p>
              )}
            </div>
          </section>

          {/* timestamps */}
          <section className="oh-detail-section oh-detail-section--timestamps">
            <div className="oh-ts-row">
              <span>Placed</span>
              <strong>{fmtFull(order.createdAt)}</strong>
            </div>
            {order.paidAt && (
              <div className="oh-ts-row">
                <span>Paid</span>
                <strong>{fmtFull(order.paidAt)}</strong>
              </div>
            )}
            {order.failureReason && (
              <div className="oh-ts-row oh-ts-row--error">
                <span>Reason</span>
                <strong>{order.failureReason}</strong>
              </div>
            )}
          </section>

          {/* actions */}
          <div className="oh-card__actions">
            <Link
              className="secondary-link-button"
              to={`/checkout/result?orderNumber=${encodeURIComponent(order.orderNumber)}&provider=${order.paymentProvider}`}
            >
              Full receipt →
            </Link>
            {order.status !== 'paid' && (
              <Link className="primary-button" to="/checkout">
                Retry payment
              </Link>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

// ─── skeleton loader ─────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="oh-card oh-card--skeleton" aria-hidden>
      <div className="oh-skeleton oh-skeleton--header" />
      <div className="oh-skeleton oh-skeleton--line" />
      <div className="oh-skeleton oh-skeleton--line oh-skeleton--short" />
    </div>
  );
}

// ─── empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="oh-empty">
      <div className="oh-empty__icon" aria-hidden>🛍️</div>
      <h2 className="oh-empty__title">No orders yet</h2>
      <p className="oh-empty__body">
        When you complete a purchase it will appear here with full details and
        payment status.
      </p>
      <Link className="primary-button" to="/">
        Start shopping
      </Link>
    </div>
  );
}

// ─── stats bar ───────────────────────────────────────────────────────────────

function StatsBar({ orders }: { orders: OrderSummaryResponse[] }) {
  const paid    = orders.filter((o) => o.status === 'paid').length;
  const pending = orders.filter((o) => o.status === 'pending_payment').length;
  const totalSpend = orders
    .filter((o) => o.status === 'paid')
    .reduce((sum, o) => sum + o.pricing.total, 0);

  // Only show spend if all paid orders share the same currency (keep it simple)
  const currencies = [...new Set(orders.filter((o) => o.status === 'paid').map((o) => o.pricing.currency))];
  const spendLabel =
    currencies.length === 1
      ? formatCurrency(totalSpend, currencies[0])
      : `${paid} paid`;

  return (
    <div className="oh-stats">
      <div className="oh-stat">
        <span className="oh-stat__value">{orders.length}</span>
        <span className="oh-stat__label">Total orders</span>
      </div>
      <div className="oh-stat">
        <span className="oh-stat__value oh-stat__value--green">{paid}</span>
        <span className="oh-stat__label">Completed</span>
      </div>
      {pending > 0 && (
        <div className="oh-stat">
          <span className="oh-stat__value oh-stat__value--amber">{pending}</span>
          <span className="oh-stat__label">Pending</span>
        </div>
      )}
      {paid > 0 && (
        <div className="oh-stat">
          <span className="oh-stat__value">{spendLabel}</span>
          <span className="oh-stat__label">Total spent</span>
        </div>
      )}
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export function OrderHistoryPage(): JSX.Element {
  const { user } = useAuth();
  const [orders, setOrders]       = useState<OrderSummaryResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchMyOrders()
      .then((data) => { if (alive) setOrders(data); })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : 'Failed to load orders.'); })
      .finally(() => { if (alive) setIsLoading(false); });
    return () => { alive = false; };
  }, []);

  function toggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="oh-page">
      {/* ── page header ── */}
      <header className="oh-page-header">
        <div className="oh-page-header__text">
          <p className="section-kicker">My Account</p>
          <h1 className="oh-page-header__title">Order History</h1>
          {user && (
            <p className="oh-page-header__sub">
              Signed in as <strong>{user.email}</strong>
            </p>
          )}
        </div>
        <Link className="secondary-link-button" to="/">
          Continue shopping
        </Link>
      </header>

      {/* ── stats ── */}
      {!isLoading && !error && orders.length > 0 && (
        <StatsBar orders={orders} />
      )}

      {/* ── content ── */}
      <div className="oh-content">
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : error ? (
          <div className="thread-banner error" style={{ marginTop: 0 }}>{error}</div>
        ) : orders.length === 0 ? (
          <EmptyState />
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.orderNumber}
              order={order}
              expanded={expandedId === order.orderNumber}
              onToggle={() => toggle(order.orderNumber)}
            />
          ))
        )}
      </div>
    </div>
  );
}
