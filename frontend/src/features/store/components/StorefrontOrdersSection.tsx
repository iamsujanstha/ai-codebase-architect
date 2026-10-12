import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, ArrowRight, CheckCircle2, Clock, XCircle, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import type { OrderSummaryResponse } from '@/core/types/payment';
import { formatCurrency } from '@/shared/utils/formatCurrency';
import { ROUTES } from '@/app/constants/routes';

interface StorefrontOrdersSectionProps {
  orders: OrderSummaryResponse[];
  isLoading: boolean;
  isLoggedIn: boolean;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; bg: string; text: string }
> = {
  paid: {
    label: 'Paid',
    icon: <CheckCircle2 size={13} />,
    bg: 'rgba(16, 185, 129, 0.15)',
    text: '#10b981',
  },
  completed: {
    label: 'Completed',
    icon: <CheckCircle2 size={13} />,
    bg: 'rgba(16, 185, 129, 0.15)',
    text: '#10b981',
  },
  pending_payment: {
    label: 'Pending',
    icon: <Clock size={13} />,
    bg: 'rgba(245, 158, 11, 0.15)',
    text: '#f59e0b',
  },
  pending: {
    label: 'Pending',
    icon: <Clock size={13} />,
    bg: 'rgba(245, 158, 11, 0.15)',
    text: '#f59e0b',
  },
  canceled: {
    label: 'Canceled',
    icon: <XCircle size={13} />,
    bg: 'rgba(239, 68, 68, 0.15)',
    text: '#ef4444',
  },
  failed: {
    label: 'Failed',
    icon: <XCircle size={13} />,
    bg: 'rgba(239, 68, 68, 0.15)',
    text: '#ef4444',
  },
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function StorefrontOrdersSection({
  orders,
  isLoading,
  isLoggedIn,
}: StorefrontOrdersSectionProps): JSX.Element | null {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // If not logged in, show an inviting prompt to sign in and view past purchases
  if (!isLoggedIn) {
    return (
      <div
        style={{
          margin: '0 0 24px',
          padding: '16px 20px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, rgba(255, 56, 92, 0.04), rgba(0, 229, 153, 0.04))',
          border: '1px solid var(--line, rgba(0,0,0,0.08))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'var(--soft, #f7f7f7)',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--brand, #ff385c)',
            }}
          >
            <ShoppingBag size={18} />
          </div>
          <div>
            <span style={{ fontWeight: 600, fontSize: '14px', display: 'block' }}>
              Have you made previous purchases?
            </span>
            <span style={{ fontSize: '12px', color: 'var(--mute, #6a6a6a)' }}>
              Sign in to view your orders, receipts, and easily reorder items.
            </span>
          </div>
        </div>
        <Link
          to={ROUTES.LOGIN}
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--brand, #ff385c)',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          Sign in <ArrowRight size={14} />
        </Link>
      </div>
    );
  }

  // If logged in but no orders, don't show an intrusive block
  if (!isLoading && orders.length === 0) {
    return null;
  }

  const recentOrders = orders.slice(0, 3);

  return (
    <section
      aria-label="Recent Purchases & Orders"
      style={{
        margin: '0 0 32px',
        borderRadius: '20px',
        background: 'var(--soft, #f7f7f7)',
        border: '1px solid var(--line, rgba(0, 0, 0, 0.08))',
        padding: '20px 24px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: isCollapsed ? '0' : '18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              display: 'grid',
              placeItems: 'center',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
            }}
          >
            <ShoppingBag size={18} />
          </div>
          <div>
            <h2
              style={{
                fontSize: '16px',
                fontWeight: 700,
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              Your Orders &amp; Purchases
              {orders.length > 0 && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#10b981',
                  }}
                >
                  {orders.length}
                </span>
              )}
            </h2>
            <span style={{ fontSize: '12px', color: 'var(--mute, #6a6a6a)' }}>
              Track shipments, review items, and manage fulfillment receipts
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link
            to={ROUTES.ORDERS}
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--brand, #ff385c)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            View all ({orders.length}) <ArrowRight size={14} />
          </Link>

          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            aria-label={isCollapsed ? 'Expand orders' : 'Collapse orders'}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--mute, #6a6a6a)',
              display: 'flex',
              alignItems: 'center',
              padding: '4px',
              cursor: 'pointer',
            }}
          >
            {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
        </div>
      </div>

      {/* Orders Grid / Cards */}
      {!isCollapsed && (
        <div>
          {isLoading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--mute, #6a6a6a)', fontSize: '13px' }}>
              Loading your orders…
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '16px',
              }}
            >
              {recentOrders.map((order) => {
                const statusMeta = STATUS_CONFIG[order.status.toLowerCase()] ?? {
                  label: order.status,
                  icon: <CheckCircle2 size={13} />,
                  bg: 'rgba(107, 114, 128, 0.15)',
                  text: '#6b7280',
                };

                const itemCount = order.items.reduce((sum, it) => sum + it.quantity, 0);

                return (
                  <article
                    key={order.orderNumber}
                    style={{
                      background: 'var(--bg, #ffffff)',
                      borderRadius: '16px',
                      border: '1px solid var(--line, rgba(0,0,0,0.06))',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    }}
                  >
                    {/* Card Top: Order Number & Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            fontSize: '13px',
                            color: 'var(--ink, #222222)',
                          }}
                        >
                          #{order.orderNumber}
                        </span>
                        <div style={{ fontSize: '11px', color: 'var(--mute, #6a6a6a)', marginTop: '2px' }}>
                          {formatDate(order.createdAt)}
                        </div>
                      </div>

                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: statusMeta.bg,
                          color: statusMeta.text,
                        }}
                      >
                        {statusMeta.icon}
                        {statusMeta.label}
                      </span>
                    </div>

                    {/* Items preview */}
                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        background: 'var(--soft, #f7f7f7)',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {order.items.slice(0, 2).map((item) => (
                          <div
                            key={item.productId}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              color: 'var(--ink, #222)',
                            }}
                          >
                            <span
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '180px',
                                fontWeight: 500,
                              }}
                            >
                              {item.name}
                            </span>
                            <span style={{ color: 'var(--mute, #6a6a6a)', fontWeight: 600 }}>
                              ×{item.quantity}
                            </span>
                          </div>
                        ))}
                        {order.items.length > 2 && (
                          <span style={{ fontSize: '11px', color: 'var(--mute, #6a6a6a)', fontStyle: 'italic' }}>
                            +{order.items.length - 2} more item{order.items.length - 2 === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card Bottom: Total, Provider & Link */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: 'auto',
                        paddingTop: '6px',
                      }}
                    >
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--mute, #6a6a6a)', display: 'block' }}>
                          Total ({itemCount} {itemCount === 1 ? 'item' : 'items'})
                        </span>
                        <strong style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink, #222)' }}>
                          {formatCurrency(order.pricing.total, order.pricing.currency)}
                        </strong>
                      </div>

                      <Link
                        to={`/checkout/result?orderNumber=${encodeURIComponent(order.orderNumber)}&provider=${order.paymentProvider.toLowerCase()}`}
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--ink, #222)',
                          background: 'var(--soft, #f7f7f7)',
                          border: '1px solid var(--line, rgba(0,0,0,0.1))',
                          borderRadius: '8px',
                          padding: '6px 10px',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        Receipt <ExternalLink size={11} />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
