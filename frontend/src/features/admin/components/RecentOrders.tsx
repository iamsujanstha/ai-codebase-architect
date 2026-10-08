import { useNavigate } from 'react-router-dom';
import { Eye, Clock } from 'lucide-react';
import styles from '../Admin.module.css';

interface Order {
  _id: string;
  userEmail: string;
  total: number;
  status: string;
  createdAt: string;
  items: any[];
}

interface RecentOrdersProps {
  orders: Order[];
}

export function RecentOrders({ orders }: RecentOrdersProps) {
  const navigate = useNavigate();

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <Clock className={styles.cardIcon} />
        <h3 className={styles.cardTitle}>Recent Orders</h3>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className={styles.table}>
          <thead className={styles.tableHeader}>
            <tr>
              <th>Order ID</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody className={styles.tableBody}>
            {orders.map((order) => (
              <tr key={order._id}>
                <td>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    #{order._id.slice(-8)}
                  </span>
                </td>
                <td>{order.userEmail}</td>
                <td style={{ fontWeight: 600 }}>${order.total.toFixed(2)}</td>
                <td>
                  <span className={`${styles.badge} ${styles[order.status]}`}>
                    {order.status}
                  </span>
                </td>
                <td>
                  <button
                    onClick={() => navigate(`/admin/orders/${order._id}`)}
                    className={styles.btnIcon}
                  >
                    <Eye size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
