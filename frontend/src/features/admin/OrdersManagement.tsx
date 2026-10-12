import React, { useState, useEffect, useCallback } from 'react';
import {
  ShoppingBag,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  Truck,
  Package,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { adminApi, AdminOrder } from './api/adminApi';
import styles from './Admin.module.css';

export const OrdersManagement: React.FC = () => {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search & Pagination
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'shipped' | 'delivered' | 'canceled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Selected order for slide-over drawer
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadOrders = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await adminApi.getOrders(
        page,
        pageSize,
        statusFilter === 'all' ? undefined : statusFilter,
      );
      setOrders(res.orders || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load orders from database');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleStatusChange = async (orderId: number, newStatus: string) => {
    try {
      await adminApi.updateOrderStatus(orderId.toString(), newStatus);
      showToast(`Order status updated to "${newStatus}"`);
      // Optimistic local update
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)),
      );
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to update order status');
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const orderNum = (o.order_number || '').toLowerCase();
    const email = (o.users?.email || '').toLowerCase();
    const name = (o.users?.name || '').toLowerCase();
    return orderNum.includes(query) || email.includes(query) || name.includes(query);
  });

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
      case 'completed':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 600,
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
            }}
          >
            <CheckCircle2 size={13} /> Paid
          </span>
        );
      case 'pending':
      case 'pending_payment':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 600,
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#f59e0b',
            }}
          >
            <Clock size={13} /> Pending
          </span>
        );
      case 'shipped':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 600,
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#3b82f6',
            }}
          >
            <Truck size={13} /> Shipped
          </span>
        );
      case 'delivered':
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 600,
              background: 'rgba(139, 92, 246, 0.15)',
              color: '#8b5cf6',
            }}
          >
            <Package size={13} /> Delivered
          </span>
        );
      default:
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '999px',
              fontSize: '12px',
              fontWeight: 600,
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#ef4444',
            }}
          >
            <XCircle size={13} /> {status}
          </span>
        );
    }
  };

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <div className={styles.main}>
      {/* Toast */}
      {toastMessage && <div className={styles.toast}>{toastMessage}</div>}

      {/* Header */}
      <div className={styles.head}>
        <div>
          <h1 className={styles.headTitle}>Orders Management</h1>
          <p className={styles.headSubtitle}>
            Track customer purchases, oversee fulfillment, and reconcile Stripe &amp; eSewa payments.
          </p>
        </div>
        <button
          type="button"
          className={styles.btnSecondary}
          onClick={() => loadOrders()}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Error alert */}
      {error && (
        <div className={styles.alert} style={{ borderLeftColor: '#ef4444' }}>
          <span>{error}</span>
          <button type="button" onClick={() => loadOrders()}>
            Retry
          </button>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className={styles.tb}>
        <div className={styles.seg}>
          {(['all', 'paid', 'pending', 'shipped', 'delivered', 'canceled'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={styles.segBtn}
              aria-pressed={statusFilter === tab}
              onClick={() => {
                setStatusFilter(tab);
                setPage(1);
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', flex: 1, maxWidth: '320px' }}>
          <input
            type="search"
            className={styles.search}
            placeholder="Search order #, customer name, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', paddingLeft: '32px' }}
          />
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--mute, #9ca3af)',
            }}
          />
        </div>
      </div>

      {/* Orders Table */}
      <div className={styles.tw}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thCell}>Order #</th>
              <th className={styles.thCell}>Customer</th>
              <th className={styles.thCell}>Items</th>
              <th className={styles.thCell}>Total</th>
              <th className={styles.thCell}>Provider</th>
              <th className={styles.thCell}>Status</th>
              <th className={styles.thCell}>Date</th>
              <th className={styles.thCell} style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className={styles.tdEmpty}>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '24px' }}>
                    <RefreshCw size={18} className="animate-spin" /> Loading orders from PostgreSQL...
                  </div>
                </td>
              </tr>
            ) : filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.tdEmpty}>
                  <div style={{ textAlign: 'center', padding: '32px 0' }}>
                    <ShoppingBag size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                    <p style={{ fontWeight: 500 }}>No orders found</p>
                    <small style={{ color: 'var(--mute, #888)' }}>
                      {searchQuery ? 'Try adjusting your search criteria' : 'Purchases from the storefront will appear here.'}
                    </small>
                  </div>
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => {
                const customerName = order.users?.name || order.users?.email?.split('@')[0] || `User #${order.user_id}`;
                const customerEmail = order.users?.email || 'N/A';
                const itemCount = order.order_items?.reduce((acc, it) => acc + (it.quantity || 1), 0) || 0;
                const formattedDate = order.created_at
                  ? new Date(order.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'N/A';

                return (
                  <tr key={order.id} className={styles.tableRow}>
                    <td className={styles.tdCell}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--brand, #00e599)' }}>
                        {order.order_number}
                      </span>
                    </td>
                    <td className={styles.tdCell}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600 }}>{customerName}</span>
                        <span style={{ fontSize: '12px', color: 'var(--mute, #888)' }}>{customerEmail}</span>
                      </div>
                    </td>
                    <td className={styles.tdCell}>
                      <span style={{ fontSize: '13px' }}>
                        {itemCount} {itemCount === 1 ? 'item' : 'items'}
                      </span>
                    </td>
                    <td className={styles.tdCell}>
                      <span style={{ fontWeight: 600 }}>${Number(order.total_amount).toFixed(2)}</span>
                    </td>
                    <td className={styles.tdCell}>
                      <span
                        style={{
                          fontSize: '11px',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background:
                            order.payment_method?.toLowerCase() === 'esewa'
                              ? 'rgba(96, 187, 70, 0.15)'
                              : 'rgba(99, 91, 255, 0.15)',
                          color:
                            order.payment_method?.toLowerCase() === 'esewa'
                              ? '#60bb46'
                              : '#635bff',
                        }}
                      >
                        {order.payment_method || 'stripe'}
                      </span>
                    </td>
                    <td className={styles.tdCell}>{getStatusBadge(order.status)}</td>
                    <td className={styles.tdCell} style={{ fontSize: '12px', color: 'var(--mute, #888)' }}>
                      {formattedDate}
                    </td>
                    <td className={styles.tdCell} style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                        <select
                          className={styles.btnSm}
                          value={order.status}
                          onChange={(e) => handleStatusChange(order.id, e.target.value)}
                          style={{
                            padding: '4px 8px',
                            fontSize: '12px',
                            background: 'var(--card-bg, rgba(255,255,255,0.05))',
                            border: '1px solid var(--soft, rgba(255,255,255,0.1))',
                            borderRadius: '6px',
                            color: 'inherit',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="pending">Pending</option>
                          <option value="paid">Paid</option>
                          <option value="shipped">Shipped</option>
                          <option value="delivered">Delivered</option>
                          <option value="canceled">Canceled</option>
                        </select>

                        <button
                          type="button"
                          className={styles.btnSm}
                          onClick={() => setSelectedOrder(order)}
                          title="View order details"
                          style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Eye size={13} /> View
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={styles.pg}>
          <button
            type="button"
            className={styles.pgBtn}
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span style={{ fontSize: '13px', color: 'var(--mute, #888)' }}>
            Page {page} of {totalPages} ({total} total orders)
          </span>
          <button
            type="button"
            className={styles.pgBtn}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      )}

      {/* Slide-over Order Details Drawer */}
      {selectedOrder && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'flex-end',
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => setSelectedOrder(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              height: '100%',
              background: 'var(--bg, #121316)',
              borderLeft: '1px solid var(--soft, rgba(255,255,255,0.1))',
              padding: '28px',
              overflowY: 'auto',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--brand, #00e599)', textTransform: 'uppercase', fontWeight: 600 }}>
                  Order Details
                </span>
                <h2 style={{ fontSize: '20px', fontWeight: 700, margin: '4px 0 0' }}>
                  {selectedOrder.order_number}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  color: 'var(--mute, #888)',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {/* Quick Status and Provider */}
            <div
              style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                padding: '12px',
                borderRadius: '8px',
                background: 'var(--card-bg, rgba(255,255,255,0.03))',
                border: '1px solid var(--soft, rgba(255,255,255,0.08))',
              }}
            >
              <div>{getStatusBadge(selectedOrder.status)}</div>
              <div style={{ fontSize: '13px', color: 'var(--mute, #888)' }}>
                Provider: <b style={{ textTransform: 'uppercase', color: 'inherit' }}>{selectedOrder.payment_method || 'stripe'}</b>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: '18px', fontWeight: 700, color: 'var(--brand, #00e599)' }}>
                ${Number(selectedOrder.total_amount).toFixed(2)}
              </div>
            </div>

            {/* Customer Details */}
            <div
              style={{
                padding: '16px',
                borderRadius: '8px',
                background: 'var(--card-bg, rgba(255,255,255,0.03))',
                border: '1px solid var(--soft, rgba(255,255,255,0.08))',
              }}
            >
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px', color: 'var(--mute, #aaa)' }}>
                Customer Information
              </h3>
              <p style={{ margin: '4px 0', fontWeight: 600 }}>
                {selectedOrder.users?.name || 'Customer'}
              </p>
              <p style={{ margin: '4px 0', fontSize: '13px', color: 'var(--mute, #888)' }}>
                Email: {selectedOrder.users?.email || 'N/A'}
              </p>
              <p style={{ margin: '4px 0', fontSize: '12px', color: 'var(--mute, #888)' }}>
                User ID: {selectedOrder.user_id}
              </p>
            </div>

            {/* Items Purchased List */}
            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--mute, #aaa)' }}>
                Purchased Items ({selectedOrder.order_items?.length || 0})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(selectedOrder.order_items || []).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'var(--card-bg, rgba(255,255,255,0.02))',
                      border: '1px solid var(--soft, rgba(255,255,255,0.06))',
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: '14px' }}>{item.name}</p>
                      <span style={{ fontSize: '12px', color: 'var(--mute, #888)' }}>
                        Product ID: {item.product_id} • Qty: {item.quantity}
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px' }}>
                        ${(Number(item.price) * item.quantity).toFixed(2)}
                      </span>
                      <div style={{ fontSize: '11px', color: 'var(--mute, #888)' }}>
                        (${Number(item.price).toFixed(2)} each)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Timeline & Metadata */}
            <div
              style={{
                marginTop: 'auto',
                paddingTop: '16px',
                borderTop: '1px solid var(--soft, rgba(255,255,255,0.08))',
                fontSize: '12px',
                color: 'var(--mute, #888)',
              }}
            >
              <p style={{ margin: '2px 0' }}>
                Created:{' '}
                {selectedOrder.created_at
                  ? new Date(selectedOrder.created_at).toLocaleString()
                  : 'N/A'}
              </p>
              {selectedOrder.payment_intent_id && (
                <p style={{ margin: '2px 0', fontFamily: 'monospace' }}>
                  Payment Intent: {selectedOrder.payment_intent_id}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
