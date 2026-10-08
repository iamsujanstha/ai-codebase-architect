import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { adminApi } from './api/adminApi';
import { DashboardStats } from './components/DashboardStats';
import styles from './Admin.module.css';
import { RecentOrders } from './components/RecentOrders';
import { LowStockAlert } from './components/LowStockAlert';
import { TopProducts } from './components/TopProducts';

export function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/');
      return;
    }

    loadDashboardStats();
  }, [user, navigate]);

  const loadDashboardStats = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getDashboardStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
      </div>
    );
  }

  return (
    <div className={styles.adminContent}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Dashboard</h1>
        <p className={styles.pageSubtitle}>
          Welcome back, <strong>{user?.name}</strong>. Here's what's happening with your store today.
        </p>
      </div>

      {stats && (
        <>
          <DashboardStats stats={stats} />
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '1.5rem', marginTop: '2rem' }}>
            <RecentOrders orders={stats.recentOrders} />
            <LowStockAlert products={stats.lowStockProducts} />
          </div>

          <div style={{ marginTop: '2rem' }}>
            <TopProducts products={stats.topProducts} />
          </div>
        </>
      )}
    </div>
  );
}
