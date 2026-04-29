import { Users, Package, ShoppingCart, DollarSign, TrendingUp } from 'lucide-react';
import styles from '../Admin.module.css';

interface DashboardStatsProps {
  stats: {
    totalUsers: number;
    totalProducts: number;
    totalOrders: number;
    totalRevenue: number;
    ordersByStatus: Record<string, number>;
  };
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  const statCards = [
    {
      title: 'Total Users',
      value: stats.totalUsers.toLocaleString(),
      icon: Users,
      change: '+12%',
    },
    {
      title: 'Total Products',
      value: stats.totalProducts.toLocaleString(),
      icon: Package,
      change: '+5%',
    },
    {
      title: 'Total Orders',
      value: stats.totalOrders.toLocaleString(),
      icon: ShoppingCart,
      change: '+18%',
    },
    {
      title: 'Total Revenue',
      value: `$${stats.totalRevenue.toLocaleString()}`,
      icon: DollarSign,
      change: '+23%',
    },
  ];

  return (
    <div className={styles.statsGrid}>
      {statCards.map((stat) => {
        const Icon = stat.icon;
        return (
          <div key={stat.title} className={styles.statCard}>
            <div className={styles.statContent}>
              <div className={styles.statInfo}>
                <div className={styles.statLabel}>{stat.title}</div>
                <div className={styles.statValue}>{stat.value}</div>
                <div className={styles.statChange}>
                  <TrendingUp size={16} />
                  <span>{stat.change}</span>
                  <span style={{ color: '#6b7280', marginLeft: '0.25rem' }}>vs last month</span>
                </div>
              </div>
              <div className={styles.statIconWrapper}>
                <Icon className={styles.statIcon} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
