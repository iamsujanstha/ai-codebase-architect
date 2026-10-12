import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingBag,
  ArrowRight,
  CheckCircle2,
  Clock,
  XCircle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Search,
  ExternalLink,
  Package,
  RotateCcw,
  DollarSign,
  Layers,
} from 'lucide-react';
import { fetchMyOrders } from '@/core/api/paymentApi';
import { useCart } from '@/features/store/CartContext';
import { useToastContext } from '@/shared/contexts/ToastContext';
import type { OrderSummaryResponse, OrderSummaryItem } from '@/core/types/payment';
import type { PaymentProvider } from '@/core/types/payment-literals';
import type { CatalogProduct } from '@/core/types/catalog';
import { formatCurrency } from '@/shared/utils/formatCurrency';

// ─── Status Config ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; bg: string; text: string; border: string }
> = {
  paid: {
    label: 'Paid & Verified',
    icon: <CheckCircle2 size={13} />,
    bg: 'rgba(16, 185, 129, 0.12)',
    text: '#10b981',
    border: 'rgba(16, 185, 129, 0.25)',
  },
  completed: {
    label: 'Completed',
    icon: <CheckCircle2 size={13} />,
    bg: 'rgba(16, 185, 129, 0.12)',
    text: '#10b981',
    border: 'rgba(16, 185, 129, 0.25)',
  },
  pending_payment: {
    label: 'Pending Payment',
    icon: <Clock size={13} />,
    bg: 'rgba(245, 158, 11, 0.12)',
    text: '#f59e0b',
    border: 'rgba(245, 158, 11, 0.25)',
  },
  pending: {
    label: 'Pending',
    icon: <Clock size={13} />,
    bg: 'rgba(245, 158, 11, 0.12)',
    text: '#f59e0b',
    border: 'rgba(245, 158, 11, 0.25)',
  },
  canceled: {
    label: 'Canceled',
    icon: <XCircle size={13} />,
    bg: 'rgba(239, 68, 68, 0.12)',
    text: '#ef4444',
    border: 'rgba(239, 68, 68, 0.25)',
  },
  failed: {
    label: 'Payment Failed',
    icon: <XCircle size={13} />,
    bg: 'rgba(239, 68, 68, 0.12)',
    text: '#ef4444',
    border: 'rgba(239, 68, 68, 0.25)',
  },
};

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

// ─── Provider Logo ───────────────────────────────────────────────────────────

function ProviderBadge({ provider }: { provider: PaymentProvider | string }) {
  const isStripe = provider?.toLowerCase() === 'stripe';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 8px',
        borderRadius: '6px',
        fontSize: '11px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        background: isStripe ? 'rgba(99, 91, 255, 0.12)' : 'rgba(96, 187, 70, 0.12)',
        color: isStripe ? '#635bff' : '#60bb46',
        border: `1px solid ${isStripe ? 'rgba(99, 91, 255, 0.25)' : 'rgba(96, 187, 70, 0.25)'}`,
      }}
    >
      {isStripe ? 'Stripe Checkout' : 'eSewa ePay'}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function OrderHistoryPage(): JSX.Element {
  const { addItem } = useCart();
  const { showToast } = useToastContext();

  const [orders, setOrders] = useState<OrderSummaryResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [activeTab, setActiveTab] = useState<'all' | 'paid' | 'pending' | 'other'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);

  const loadOrders = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchMyOrders();
      setOrders(data);
      // Automatically expand first order for immediate inspection
      if (data.length > 0) {
        setExpandedOrders(new Set([data[0].orderNumber]));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadOrders();
  }, []);

  const toggleExpand = (orderNumber: string) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderNumber)) {
        next.delete(orderNumber);
      } else {
        next.add(orderNumber);
      }
      return next;
    });
  };

  const handleCopyOrderNumber = (orderNumber: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(orderNumber);
    setCopiedOrderId(orderNumber);
    showToast(`Copied order #${orderNumber}`);
    setTimeout(() => setCopiedOrderId(null), 2000);
  };

  const handleBuyAgain = (item: OrderSummaryItem) => {
    addItem({
      id: item.productId,
      name: item.name,
      price: item.unitAmount,
      slug: item.slug || `product-${item.productId}`,
      subtitle: item.name,
      shortDescription: item.name,
      description: item.name,
      currency: item.currency || 'USD',
      rating: 4.8,
      reviewCount: 1,
      inventoryCount: 50,
      compareAtPrice: null,
      badge: 'Purchased',
      tags: [],
      visual: {
        gradientFrom: '#10b981',
        gradientTo: '#059669',
        accent: '#10b981',
        glyph: '🛍️',
      },
      specs: [],
      bestSeller: false,
      featured: false,
      unitAmountNpr: Math.round(item.unitAmount * 135),
    } as unknown as CatalogProduct);
    showToast(`Added ${item.name} to cart`);
  };

  // Filtered Orders
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Tab filter
      if (activeTab === 'paid') {
        if (order.status !== 'paid' && (order.status as string) !== 'completed') return false;
      } else if (activeTab === 'pending') {
        if (order.status !== 'pending_payment' && (order.status as string) !== 'pending') return false;
      } else if (activeTab === 'other') {
        if (order.status === 'paid' || (order.status as string) === 'completed' || order.status === 'pending_payment' || (order.status as string) === 'pending') {
          return false;
        }
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesNum = order.orderNumber.toLowerCase().includes(query);
        const matchesItem = order.items.some((it) => it.name.toLowerCase().includes(query));
        return matchesNum || matchesItem;
      }

      return true;
    });
  }, [orders, activeTab, searchQuery]);

  // Summary Metrics
  const paidCount = orders.filter((o) => o.status === 'paid' || (o.status as string) === 'completed').length;
  const pendingCount = orders.filter((o) => o.status === 'pending_payment' || (o.status as string) === 'pending').length;
  const totalSpend = orders
    .filter((o) => o.status === 'paid' || (o.status as string) === 'completed')
    .reduce((sum, o) => sum + o.pricing.total, 0);
  const totalItemsCount = orders.reduce((sum, o) => sum + o.items.reduce((s, it) => s + it.quantity, 0), 0);

  return (
    <div
      style={{
        maxWidth: '1100px',
        margin: '0 auto',
        padding: '32px 24px 80px',
      }}
    >
      {/* ─── Hero Header ─── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '20px',
          marginBottom: '28px',
        }}
      >
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              background: 'linear-gradient(135deg, rgba(255, 56, 92, 0.12), rgba(0, 229, 153, 0.12))',
              color: 'var(--brand, #ff385c)',
              marginBottom: '10px',
            }}
          >
            <ShoppingBag size={13} />
            Customer Portal
          </div>
          <h1
            style={{
              fontSize: '28px',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: '0 0 6px',
              color: 'var(--ink, #111)',
            }}
          >
            My Orders &amp; Purchases
          </h1>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--mute, #6a6a6a)' }}>
            Review past purchases, download itemized receipts, and verify payment settlements.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={loadOrders}
            className="chip"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 500,
            }}
          >
            <RotateCcw size={14} /> Refresh
          </button>
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--brand, #ff385c)',
              color: '#ffffff',
              padding: '8px 16px',
              borderRadius: '999px',
              fontWeight: 600,
              fontSize: '13px',
              textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(255, 56, 92, 0.3)',
            }}
          >
            Continue Shopping <ArrowRight size={14} />
          </Link>
        </div>
      </div>

      {/* ─── Stats Grid (4 Metric Cards) ─── */}
      {!isLoading && !error && orders.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          {/* Total Orders Card */}
          <div
            style={{
              padding: '18px 20px',
              borderRadius: '16px',
              background: 'var(--soft, #f7f7f7)',
              border: '1px solid var(--line, rgba(0,0,0,0.06))',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'rgba(59, 130, 246, 0.12)',
                color: '#3b82f6',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <ShoppingBag size={20} />
            </div>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--mute, #6a6a6a)', fontWeight: 500 }}>
                Total Orders
              </span>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ink, #111)' }}>
                {orders.length}
              </div>
            </div>
          </div>

          {/* Completed Orders Card */}
          <div
            style={{
              padding: '18px 20px',
              borderRadius: '16px',
              background: 'var(--soft, #f7f7f7)',
              border: '1px solid var(--line, rgba(0,0,0,0.06))',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.12)',
                color: '#10b981',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <CheckCircle2 size={20} />
            </div>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--mute, #6a6a6a)', fontWeight: 500 }}>
                Completed Purchases
              </span>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ink, #111)' }}>
                {paidCount}
              </div>
            </div>
          </div>

          {/* Total Spend Card */}
          <div
            style={{
              padding: '18px 20px',
              borderRadius: '16px',
              background: 'var(--soft, #f7f7f7)',
              border: '1px solid var(--line, rgba(0,0,0,0.06))',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'rgba(255, 56, 92, 0.12)',
                color: 'var(--brand, #ff385c)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <DollarSign size={20} />
            </div>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--mute, #6a6a6a)', fontWeight: 500 }}>
                Total Invested
              </span>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ink, #111)' }}>
                ${totalSpend.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Items Purchased Card */}
          <div
            style={{
              padding: '18px 20px',
              borderRadius: '16px',
              background: 'var(--soft, #f7f7f7)',
              border: '1px solid var(--line, rgba(0,0,0,0.06))',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'rgba(168, 85, 247, 0.12)',
                color: '#a855f7',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Layers size={20} />
            </div>
            <div>
              <span style={{ fontSize: '12px', color: 'var(--mute, #6a6a6a)', fontWeight: 500 }}>
                Units Purchased
              </span>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--ink, #111)' }}>
                {totalItemsCount}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Search & Filters Bar ─── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        {/* Status segmented buttons */}
        <div
          style={{
            display: 'inline-flex',
            padding: '4px',
            borderRadius: '12px',
            background: 'var(--soft, #f7f7f7)',
            border: '1px solid var(--line, rgba(0,0,0,0.08))',
            gap: '4px',
          }}
        >
          <button
            type="button"
            className="chip"
            style={{
              border: 'none',
              background: activeTab === 'all' ? 'var(--bg, #fff)' : 'transparent',
              color: activeTab === 'all' ? 'var(--ink, #111)' : 'var(--mute, #666)',
              fontWeight: activeTab === 'all' ? 700 : 500,
              boxShadow: activeTab === 'all' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
              cursor: 'pointer',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '13px',
            }}
            onClick={() => setActiveTab('all')}
          >
            All Orders ({orders.length})
          </button>

          <button
            type="button"
            className="chip"
            style={{
              border: 'none',
              background: activeTab === 'paid' ? 'var(--bg, #fff)' : 'transparent',
              color: activeTab === 'paid' ? '#10b981' : 'var(--mute, #666)',
              fontWeight: activeTab === 'paid' ? 700 : 500,
              boxShadow: activeTab === 'paid' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
              cursor: 'pointer',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '13px',
            }}
            onClick={() => setActiveTab('paid')}
          >
            Completed ({paidCount})
          </button>

          {pendingCount > 0 && (
            <button
              type="button"
              className="chip"
              style={{
                border: 'none',
                background: activeTab === 'pending' ? 'var(--bg, #fff)' : 'transparent',
                color: activeTab === 'pending' ? '#f59e0b' : 'var(--mute, #666)',
                fontWeight: activeTab === 'pending' ? 700 : 500,
                boxShadow: activeTab === 'pending' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '13px',
              }}
              onClick={() => setActiveTab('pending')}
            >
              Pending ({pendingCount})
            </button>
          )}
        </div>

        {/* Search input */}
        <div style={{ position: 'relative', width: '280px' }}>
          <input
            type="search"
            placeholder="Search order # or item name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              borderRadius: '10px',
              border: '1px solid var(--line, rgba(0,0,0,0.12))',
              background: 'var(--soft, #f7f7f7)',
              fontSize: '13px',
            }}
          />
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--mute, #888)',
            }}
          />
        </div>
      </div>

      {/* ─── Orders List ─── */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              style={{
                height: '140px',
                borderRadius: '16px',
                background: 'var(--soft, #f7f7f7)',
                animation: 'pulse 1.5s infinite',
                border: '1px solid var(--line, rgba(0,0,0,0.06))',
              }}
            />
          ))}
        </div>
      ) : error ? (
        <div
          style={{
            padding: '24px',
            borderRadius: '16px',
            background: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#ef4444',
            textAlign: 'center',
          }}
        >
          <p style={{ fontWeight: 600, margin: '0 0 8px' }}>Failed to load orders</p>
          <small>{error}</small>
          <div style={{ marginTop: '12px' }}>
            <button
              type="button"
              onClick={loadOrders}
              className="chip"
              style={{ cursor: 'pointer', fontWeight: 600 }}
            >
              Retry
            </button>
          </div>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div
          style={{
            padding: '60px 20px',
            borderRadius: '20px',
            background: 'var(--soft, #f7f7f7)',
            border: '1px solid var(--line, rgba(0,0,0,0.06))',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'var(--bg, #fff)',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 16px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
              color: 'var(--mute, #6a6a6a)',
            }}
          >
            <ShoppingBag size={26} />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: '0 0 6px', color: 'var(--ink, #111)' }}>
            {searchQuery ? 'No matching orders found' : 'No order history yet'}
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--mute, #6a6a6a)', maxWidth: '420px', margin: '0 auto 20px' }}>
            {searchQuery
              ? 'Try clearing your search query or switching tabs.'
              : 'Items you purchase with Stripe or eSewa will appear here automatically with verified receipts.'}
          </p>
          <Link
            to="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--brand, #ff385c)',
              color: '#ffffff',
              padding: '10px 20px',
              borderRadius: '999px',
              fontWeight: 600,
              fontSize: '14px',
              textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(255, 56, 92, 0.3)',
            }}
          >
            Explore Catalog <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filteredOrders.map((order) => {
            const isExpanded = expandedOrders.has(order.orderNumber);
            const statusConfig = STATUS_CONFIG[order.status.toLowerCase()] ?? {
              label: order.status,
              icon: <Clock size={13} />,
              bg: 'rgba(107, 114, 128, 0.12)',
              text: '#6b7280',
              border: 'rgba(107, 114, 128, 0.25)',
            };

            const isCopied = copiedOrderId === order.orderNumber;
            const itemsCount = order.items.reduce((sum, it) => sum + it.quantity, 0);

            return (
              <article
                key={order.orderNumber}
                style={{
                  borderRadius: '18px',
                  background: 'var(--bg, #ffffff)',
                  border: '1px solid var(--line, rgba(0,0,0,0.08))',
                  overflow: 'hidden',
                  boxShadow: '0 3px 12px rgba(0,0,0,0.03)',
                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
                }}
              >
                {/* ── Top Bar / Header ── */}
                <div
                  onClick={() => toggleExpand(order.orderNumber)}
                  style={{
                    padding: '20px 24px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px',
                    borderBottom: isExpanded ? '1px solid var(--line, rgba(0,0,0,0.06))' : 'none',
                    background: isExpanded ? 'var(--soft, rgba(0,0,0,0.02))' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '12px',
                        background: 'var(--soft, #f7f7f7)',
                        display: 'grid',
                        placeItems: 'center',
                        color: 'var(--brand, #ff385c)',
                        border: '1px solid var(--line, rgba(0,0,0,0.06))',
                      }}
                    >
                      <Package size={20} />
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 800,
                            fontSize: '15px',
                            color: 'var(--ink, #111)',
                          }}
                        >
                          #{order.orderNumber}
                        </span>

                        <button
                          type="button"
                          onClick={(e) => handleCopyOrderNumber(order.orderNumber, e)}
                          title="Copy order number"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: isCopied ? '#10b981' : 'var(--mute, #888)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '2px',
                          }}
                        >
                          {isCopied ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>

                      <div
                        style={{
                          fontSize: '12px',
                          color: 'var(--mute, #6a6a6a)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginTop: '3px',
                        }}
                      >
                        <span>{formatDate(order.createdAt)}</span>
                        <span>•</span>
                        <ProviderBadge provider={order.paymentProvider} />
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    {/* Status Pill */}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 700,
                        background: statusConfig.bg,
                        color: statusConfig.text,
                        border: `1px solid ${statusConfig.border}`,
                      }}
                    >
                      {statusConfig.icon}
                      {statusConfig.label}
                    </span>

                    {/* Total */}
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '11px', color: 'var(--mute, #888)', display: 'block' }}>
                        Total Amount
                      </span>
                      <strong style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ink, #111)' }}>
                        {formatCurrency(order.pricing.total, order.pricing.currency)}
                      </strong>
                    </div>

                    {/* Chevron */}
                    <div
                      style={{
                        color: 'var(--mute, #888)',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                  </div>
                </div>

                {/* ── Summary Line Items Preview (Visible when collapsed) ── */}
                {!isExpanded && (
                  <div
                    style={{
                      padding: '12px 24px',
                      background: 'var(--soft, #f7f7f7)',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {order.items.slice(0, 3).map((item) => (
                        <span
                          key={item.productId}
                          style={{
                            padding: '3px 10px',
                            borderRadius: '6px',
                            background: 'var(--bg, #fff)',
                            border: '1px solid var(--line, rgba(0,0,0,0.06))',
                            fontSize: '12px',
                            fontWeight: 500,
                          }}
                        >
                          {item.name} <b style={{ color: 'var(--brand, #ff385c)' }}>×{item.quantity}</b>
                        </span>
                      ))}
                      {order.items.length > 3 && (
                        <span style={{ fontSize: '12px', color: 'var(--mute, #888)' }}>
                          +{order.items.length - 3} more items
                        </span>
                      )}
                    </div>

                    <Link
                      to={`/checkout/result?orderNumber=${encodeURIComponent(order.orderNumber)}&provider=${order.paymentProvider.toLowerCase()}`}
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--brand, #ff385c)',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      View Receipt <ExternalLink size={12} />
                    </Link>
                  </div>
                )}

                {/* ── Detailed Expanded View ── */}
                {isExpanded && (
                  <div style={{ padding: '24px' }}>
                    {/* Line Items List */}
                    <div style={{ marginBottom: '24px' }}>
                      <h3
                        style={{
                          fontSize: '13px',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          color: 'var(--mute, #888)',
                          marginBottom: '12px',
                        }}
                      >
                        Purchased Items ({itemsCount})
                      </h3>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {order.items.map((item) => (
                          <div
                            key={item.productId}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '12px 16px',
                              borderRadius: '12px',
                              background: 'var(--soft, #f7f7f7)',
                              border: '1px solid var(--line, rgba(0,0,0,0.04))',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '8px',
                                  background: 'var(--bg, #fff)',
                                  display: 'grid',
                                  placeItems: 'center',
                                  fontSize: '14px',
                                  boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                                }}
                              >
                                🛍️
                              </div>
                              <div>
                                <span style={{ fontWeight: 600, fontSize: '14px', display: 'block' }}>
                                  {item.name}
                                </span>
                                <span style={{ fontSize: '12px', color: 'var(--mute, #888)' }}>
                                  Product ID: {item.productId} • Qty: {item.quantity}
                                </span>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                              <div style={{ textAlign: 'right' }}>
                                <strong style={{ fontSize: '14px', fontWeight: 700 }}>
                                  {formatCurrency(item.lineTotal, item.currency)}
                                </strong>
                                <div style={{ fontSize: '11px', color: 'var(--mute, #888)' }}>
                                  {formatCurrency(item.unitAmount, item.currency)} each
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleBuyAgain(item)}
                                className="chip"
                                style={{
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  padding: '6px 12px',
                                }}
                              >
                                Buy Again
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Financial Summary & Delivery Info Grid */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '20px',
                        paddingTop: '20px',
                        borderTop: '1px solid var(--line, rgba(0,0,0,0.08))',
                      }}
                    >
                      {/* Customer & Delivery */}
                      <div
                        style={{
                          padding: '16px',
                          borderRadius: '12px',
                          background: 'var(--soft, #f7f7f7)',
                          border: '1px solid var(--line, rgba(0,0,0,0.04))',
                        }}
                      >
                        <h4
                          style={{
                            fontSize: '12px',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                            color: 'var(--mute, #888)',
                            margin: '0 0 8px',
                          }}
                        >
                          Customer Recipient
                        </h4>
                        <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: '14px' }}>
                          {order.customer.fullName || 'Valued Customer'}
                        </p>
                        <p style={{ margin: '0 0 4px', fontSize: '13px', color: 'var(--mute, #6a6a6a)' }}>
                          Email: {order.customer.email}
                        </p>
                        {order.customer.phone && (
                          <p style={{ margin: 0, fontSize: '13px', color: 'var(--mute, #6a6a6a)' }}>
                            Phone: {order.customer.phone}
                          </p>
                        )}
                      </div>

                      {/* Pricing Breakdown */}
                      <div
                        style={{
                          padding: '16px',
                          borderRadius: '12px',
                          background: 'var(--soft, #f7f7f7)',
                          border: '1px solid var(--line, rgba(0,0,0,0.04))',
                        }}
                      >
                        <h4
                          style={{
                            fontSize: '12px',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                            color: 'var(--mute, #888)',
                            margin: '0 0 10px',
                          }}
                        >
                          Pricing Breakdown
                        </h4>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--mute, #6a6a6a)' }}>Subtotal</span>
                            <span>{formatCurrency(order.pricing.subtotal, order.pricing.currency)}</span>
                          </div>

                          {order.pricing.deliveryCharge > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--mute, #6a6a6a)' }}>Delivery &amp; Shipping</span>
                              <span>{formatCurrency(order.pricing.deliveryCharge, order.pricing.currency)}</span>
                            </div>
                          )}

                          {order.pricing.taxAmount > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--mute, #6a6a6a)' }}>Tax Amount</span>
                              <span>{formatCurrency(order.pricing.taxAmount, order.pricing.currency)}</span>
                            </div>
                          )}

                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              paddingTop: '8px',
                              marginTop: '4px',
                              borderTop: '1px dashed var(--line, rgba(0,0,0,0.1))',
                              fontWeight: 700,
                              fontSize: '15px',
                            }}
                          >
                            <span>Total Paid</span>
                            <span style={{ color: 'var(--brand, #ff385c)' }}>
                              {formatCurrency(order.pricing.total, order.pricing.currency)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Actions Footer */}
                    <div
                      style={{
                        marginTop: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        gap: '12px',
                      }}
                    >
                      <Link
                        to={`/checkout/result?orderNumber=${encodeURIComponent(order.orderNumber)}&provider=${order.paymentProvider.toLowerCase()}`}
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: 'var(--ink, #111)',
                          background: 'var(--soft, #f7f7f7)',
                          border: '1px solid var(--line, rgba(0,0,0,0.12))',
                          borderRadius: '8px',
                          padding: '8px 14px',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <ExternalLink size={13} /> View Full Receipt
                      </Link>

                      {order.status !== 'paid' && (order.status as string) !== 'completed' && (
                        <Link
                          to="/checkout"
                          style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: '#ffffff',
                            background: 'var(--brand, #ff385c)',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            textDecoration: 'none',
                          }}
                        >
                          Retry Payment
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
