import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Package, 
  User, 
  Mail, 
  DollarSign,
  MapPin,
  CreditCard,
  Truck,
  CheckCircle,
  Clock,
  AlertCircle
} from 'lucide-react';
import { adminApi } from './api/adminApi';
import styles from './Admin.module.css';

interface OrderData {
  _id: string;
  userId: string;
  userEmail: string;
  total: number;
  subtotal: number;
  currency: string;
  status: string;
  createdAt: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    currency: string;
  }>;
  customer?: {
    fullName: string;
    email: string;
    phone?: string;
    addressLine1?: string;
    city?: string;
    country?: string;
  };
  paymentProvider?: string;
  paymentReference?: string;
}

interface UserData {
  _id: string;
  name: string;
  email: string;
}

export function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const statusOptions = [
    'pending',
    'processing', 
    'paid',
    'completed',
    'shipped',
    'delivered',
    'cancelled',
    'refunded'
  ];

  useEffect(() => {
    if (id) {
      loadOrderData();
    }
  }, [id]);

  const loadOrderData = async () => {
    if (!id) {
      setError('No order ID provided');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await adminApi.getOrderById(id);
      setOrder(data.order || data);
      setUser(data.user || null);
    } catch (error: any) {
      console.error('Failed to load order data:', error);
      setError(error.response?.data?.message || error.message || 'Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!order) return;
    
    try {
      await adminApi.updateOrderStatus(order._id, newStatus);
      setOrder({ ...order, status: newStatus });
    } catch (error) {
      console.error('Failed to update order status:', error);
      alert('Failed to update order status');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock size={20} style={{ color: '#f59e0b' }} />;
      case 'processing':
        return <Package size={20} style={{ color: '#3b82f6' }} />;
      case 'paid':
      case 'completed':
        return <CheckCircle size={20} style={{ color: '#10b981' }} />;
      case 'shipped':
        return <Truck size={20} style={{ color: '#8b5cf6' }} />;
      case 'delivered':
        return <CheckCircle size={20} style={{ color: '#059669' }} />;
      case 'cancelled':
      case 'refunded':
        return <AlertCircle size={20} style={{ color: '#dc2626' }} />;
      default:
        return <Package size={20} style={{ color: '#6b7280' }} />;
    }
  };

  if (loading) {
    return (
      <div className={styles.adminContent}>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <div className={styles.loadingText}>Loading order details...</div>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className={styles.adminContent}>
        <div className={styles.emptyState}>
          <Package className={styles.emptyIcon} />
          <div className={styles.emptyTitle}>
            {error ? 'Error Loading Order' : 'Order not found'}
          </div>
          <div className={styles.emptyText}>
            {error || 'The requested order could not be found'}
          </div>
          <button
            onClick={() => navigate('/admin/orders')}
            className={styles.emptyAction}
          >
            <ArrowLeft size={20} />
            Back to Orders
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.adminContent}>
      <div className={styles.pageHeader}>
        <button
          onClick={() => navigate('/admin/orders')}
          className={`${styles.btn} ${styles.btnSecondary}`}
          style={{ marginBottom: '1rem' }}
        >
          <ArrowLeft size={20} />
          Back to Orders
        </button>
        <h1 className={styles.pageTitle}>Order Details</h1>
        <p className={styles.pageSubtitle}>
          Order #{order._id.slice(-8)} • {new Date(order.createdAt).toLocaleDateString()}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>
        {/* Order Status */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            {getStatusIcon(order.status)}
            <h3 className={styles.cardTitle}>Order Status</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className={styles.formLabel}>Current Status</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                {getStatusIcon(order.status)}
                <span className={`${styles.statusBadge} ${styles[order.status]}`}>
                  <div className={styles.statusDot}></div>
                  {order.status}
                </span>
              </div>
            </div>

            <div>
              <label className={styles.formLabel}>Update Status</label>
              <select
                value={order.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className={styles.formSelect}
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
              <div>
                <div className={styles.statLabel}>Order Date</div>
                <div className={styles.primaryText}>
                  {new Date(order.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
              </div>
              <div>
                <div className={styles.statLabel}>Order Total</div>
                <div className={styles.totalCell} style={{ fontSize: '1.25rem' }}>
                  ${order.total.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Customer Information */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <User className={styles.cardIcon} />
            <h3 className={styles.cardTitle}>Customer Information</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className={styles.customerCell}>
              <div className={styles.customerAvatar}>
                <User size={20} />
              </div>
              <div className={styles.tableCellContent}>
                <div className={styles.primaryText}>
                  {order.customer?.fullName || user?.name || 'Guest User'}
                </div>
                <div className={styles.tableCell}>
                  <Mail size={16} style={{ color: '#6b7280' }} />
                  <span className={styles.secondaryText}>
                    {order.customer?.email || order.userEmail}
                  </span>
                </div>
              </div>
            </div>

            {user && (
              <button
                onClick={() => navigate(`/admin/users/${user._id}`)}
                className={`${styles.btn} ${styles.btnSecondary}`}
                style={{ alignSelf: 'flex-start' }}
              >
                View Customer Profile
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Order Items */}
      <div className={styles.card} style={{ marginTop: '1.5rem' }}>
        <div className={styles.cardHeader}>
          <Package className={styles.cardIcon} />
          <h3 className={styles.cardTitle}>Order Items</h3>
        </div>

        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead className={styles.tableHeader}>
              <tr>
                <th>Product</th>
                <th>Price</th>
                <th>Quantity</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody className={styles.tableBody}>
              {order.items?.map((item, index) => (
                <tr key={index}>
                  <td>
                    <div className={styles.customerCell}>
                      <div className={styles.customerAvatar}>
                        <Package size={16} />
                      </div>
                      <div className={styles.tableCellContent}>
                        <div className={styles.primaryText}>
                          {item.productName}
                        </div>
                        <div className={styles.secondaryText}>
                          Product ID: {item.productId.slice(-8)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className={styles.tableCell}>
                      <DollarSign size={16} style={{ color: '#10b981' }} />
                      <span>${item.unitPrice.toFixed(2)}</span>
                    </div>
                  </td>
                  <td>
                    <span className={styles.itemsBadge}>
                      {item.quantity}
                    </span>
                  </td>
                  <td>
                    <span className={styles.totalCell}>
                      ${item.lineTotal.toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ padding: '1.5rem', borderTop: '2px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className={styles.statLabel}>Order Total:</span>
              <span className={styles.totalCell} style={{ fontSize: '1.5rem' }}>
                ${order.total.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Shipping & Payment Information */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginTop: '1.5rem' }}>
        {/* Customer Address */}
        {order.customer && (order.customer.addressLine1 || order.customer.city) && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <MapPin className={styles.cardIcon} />
              <h3 className={styles.cardTitle}>Customer Address</h3>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {order.customer.addressLine1 && (
                <div className={styles.primaryText}>{order.customer.addressLine1}</div>
              )}
              {order.customer.city && (
                <div className={styles.secondaryText}>
                  {order.customer.city}{order.customer.country ? `, ${order.customer.country}` : ''}
                </div>
              )}
              {order.customer.phone && (
                <div className={styles.secondaryText}>
                  Phone: {order.customer.phone}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Payment Information */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <CreditCard className={styles.cardIcon} />
            <h3 className={styles.cardTitle}>Payment Information</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <div className={styles.statLabel}>Payment Provider</div>
              <div className={styles.primaryText}>
                {order.paymentProvider || 'Stripe'}
              </div>
            </div>
            {order.paymentReference && (
              <div>
                <div className={styles.statLabel}>Payment Reference</div>
                <div className={styles.secondaryText} style={{ fontFamily: 'monospace' }}>
                  {order.paymentReference}
                </div>
              </div>
            )}
            <div>
              <div className={styles.statLabel}>Payment Status</div>
              <span className={`${styles.statusBadge} ${order.status === 'paid' || order.status === 'completed' ? styles.completed : styles.pending}`}>
                {order.status === 'paid' || order.status === 'completed' ? 'Paid' : 'Pending'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}