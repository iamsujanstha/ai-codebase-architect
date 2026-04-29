import { TrendingUp, Award } from 'lucide-react';
import styles from '../Admin.module.css';

interface TopProduct {
  _id: string;
  productName: string;
  totalSold: number;
  revenue: number;
}

interface TopProductsProps {
  products: TopProduct[];
}

export function TopProducts({ products }: TopProductsProps) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <TrendingUp className={styles.cardIcon} style={{ color: '#10b981' }} />
        <h3 className={styles.cardTitle}>Top Selling Products</h3>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className={styles.table}>
          <thead className={styles.tableHeader}>
            <tr>
              <th>Rank</th>
              <th>Product</th>
              <th>Units Sold</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody className={styles.tableBody}>
            {products.map((product, index) => (
              <tr key={product._id}>
                <td>
                  {index < 3 ? (
                    <Award
                      size={20}
                      style={{
                        color:
                          index === 0
                            ? '#f59e0b'
                            : index === 1
                            ? '#9ca3af'
                            : '#ea580c',
                      }}
                    />
                  ) : (
                    <span style={{ fontWeight: 600, color: '#6b7280' }}>
                      #{index + 1}
                    </span>
                  )}
                </td>
                <td style={{ fontWeight: 600 }}>{product.productName}</td>
                <td>{product.totalSold.toLocaleString()} units</td>
                <td style={{ fontWeight: 700, color: '#10b981' }}>
                  ${product.revenue.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
