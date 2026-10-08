import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Package } from 'lucide-react';
import styles from '../Admin.module.css';

interface Product {
  _id: string;
  name: string;
  inventoryCount: number;
  price: number;
}

interface LowStockAlertProps {
  products: Product[];
}

export function LowStockAlert({ products }: LowStockAlertProps) {
  const navigate = useNavigate();

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <AlertTriangle className={styles.cardIcon} style={{ color: '#f59e0b' }} />
        <h3 className={styles.cardTitle}>Low Stock Alert</h3>
      </div>
      {products.length === 0 ? (
        <div className={styles.emptyState}>
          <Package className={styles.emptyIcon} />
          <div className={styles.emptyTitle}>All products are well stocked!</div>
          <div className={styles.emptyText}>No items need restocking at this time</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {products.map((product) => (
            <div
              key={product._id}
              onClick={() => navigate(`/admin/products/${product._id}/edit`)}
              style={{
                padding: '1rem',
                background: '#f9fafb',
                borderRadius: '10px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f3f4f6';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#f9fafb';
              }}
            >
              <div>
                <div style={{ fontWeight: 600, color: '#111827', marginBottom: '0.25rem' }}>
                  {product.name}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  ${product.price.toFixed(2)}
                </div>
              </div>
              <span
                className={styles.badge}
                style={{
                  background: product.inventoryCount === 0 ? '#fee2e2' : '#fef3c7',
                  color: product.inventoryCount === 0 ? '#991b1b' : '#92400e',
                }}
              >
                {product.inventoryCount === 0 ? 'Out of Stock' : `${product.inventoryCount} left`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
