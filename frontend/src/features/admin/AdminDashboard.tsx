import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Plus, Sparkles } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { useAIConcierge } from '@/features/chat/AIConciergeContext';
import { adminApi, AdminStats, AdminProduct } from './api/adminApi';
import { ProductDrawer } from './ProductDrawer';
import styles from './Admin.module.css';

const EMOJI_MAP: Record<string, string> = {
  desk: '🪑',
  lighting: '💡',
  keyboard: '⌨️',
  audio: '🎧',
  display: '🖥️',
  accessory: '🧰',
};

const GRADIENTS = [
  ['#f6d9b8', '#e8b98a'],
  ['#fff1b8', '#ffd36b'],
  ['#d6e4ff', '#a9c2ff'],
  ['#ffd6e0', '#ff9fb6'],
  ['#d4f1e4', '#9fdcc0'],
  ['#e6ddf7', '#c7b4ee'],
];

export const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const { openConcierge } = useAIConcierge();
  const navigate = useNavigate();
  const { refreshStats } = useOutletContext<{ refreshStats?: () => void }>() || {};

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer state for Restock / Add Product
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);

  // Toast message
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const loadStats = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await adminApi.getStats();
      setStats(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load dashboard stats');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const handleRestock = (product: AdminProduct) => {
    setEditingProduct(product);
    setDrawerOpen(true);
  };

  const handleAddProduct = () => {
    setEditingProduct(null);
    setDrawerOpen(true);
  };

  const handleProductSaved = () => {
    showToast(editingProduct ? 'Changes saved' : 'Product created');
    loadStats();
    if (refreshStats) refreshStats();
  };

  if (isLoading) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--mute)' }}>
        Loading dashboard…
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--bad)' }}>
        <b>Failed to load dashboard:</b> {error || 'No data'}
        <div style={{ marginTop: '16px' }}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={loadStats}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const adminGreeting = user?.name ? user.name.split(' ')[0] : 'Administrator';

  // Calculate 7-day sales bar heights
  const salesDays = stats.sales7Days && stats.sales7Days.length > 0
    ? stats.sales7Days
    : [
        { day: 'Mon', date: '', sales: 42000 },
        { day: 'Tue', date: '', sales: 61000 },
        { day: 'Wed', date: '', sales: 38000 },
        { day: 'Thu', date: '', sales: 90000 },
        { day: 'Fri', date: '', sales: 76000 },
        { day: 'Sat', date: '', sales: 124000 },
        { day: 'Sun', date: '', sales: 98000 },
      ];

  const totalSales7Days = salesDays.reduce((acc, d) => acc + d.sales, 0);
  const maxSales = Math.max(...salesDays.map((d) => d.sales), 100);

  // Revenue format: cents to dollars
  const revenueDollars = Math.round(stats.revenue30Days / 100);

  return (
    <div>
      <h1 className={styles.title}>Good to see you, {adminGreeting}</h1>
      <p className={styles.sub}>A quick look at your store.</p>

      {/* 4 Stat Cards */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <b>{stats.totalProducts}</b>
          <span>Total products</span>
        </div>
        <div className={styles.stat}>
          <b>{stats.publishedProducts}</b>
          <span>Published</span>
        </div>
        <div className={styles.stat}>
          <b>{stats.totalUsers}</b>
          <span>Users</span>
        </div>
        <div className={styles.stat}>
          <b>${revenueDollars.toLocaleString()}</b>
          <span>Revenue, last 30 days</span>
        </div>
      </div>

      {/* AI Assistant Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(255, 56, 92, 0.05), rgba(169, 59, 255, 0.08))',
          border: '1px solid rgba(169, 59, 255, 0.2)',
          borderRadius: '16px',
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #ff385c, #a93bff)',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              boxShadow: '0 4px 10px rgba(169, 59, 255, 0.25)',
              flexShrink: 0,
            }}
          >
            <Sparkles size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink, #222)' }}>
              Atlas AI Assistant & Catalog Concierge
            </div>
            <div style={{ fontSize: '13px', color: 'var(--mute, #6a6a6a)' }}>
              Analyze low inventory, generate product descriptions, or ask catalog questions in real time.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={openConcierge}
          className={styles.btn}
          style={{
            background: 'linear-gradient(135deg, #ff385c, #a93bff)',
            color: '#fff',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '999px',
            fontWeight: 600,
            fontSize: '13px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(169, 59, 255, 0.3)',
          }}
        >
          <Sparkles size={15} />
          <span>Open AI Concierge</span>
        </button>
      </div>

      {/* Two Column Grid: 7-Day Sales & New Users */}
      <div className={styles.two}>
        {/* Sales Card */}
        <div className={styles.cardb}>
          <h2>Sales, last 7 days</h2>
          <span className={styles.sub}>
            Total ${Math.round(totalSales7Days / 100).toLocaleString()}
          </span>
          <div className={styles.chart}>
            {salesDays.map((dayItem, idx) => {
              const heightPct = Math.max(
                4,
                Math.round((dayItem.sales / maxSales) * 100),
              );
              const dayDollars = Math.round(dayItem.sales / 100);
              return (
                <div key={idx} className={styles.chartCol}>
                  <i
                    className={styles.chartBar}
                    style={{ height: `${heightPct}%` }}
                    title={`$${dayDollars}`}
                  />
                  <span>{dayItem.day}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* New Users Card */}
        <div className={styles.cardb}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h2>New users</h2>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSmall} ${styles.btnGhost}`}
              onClick={() => navigate('/admin/users')}
            >
              View all
            </button>
          </div>

          <div className={styles.ul}>
            {stats.recentUsers && stats.recentUsers.length > 0 ? (
              stats.recentUsers.map((recUser, idx) => {
                const gradient = GRADIENTS[idx % GRADIENTS.length];
                const initial = (recUser.name || 'U').charAt(0).toUpperCase();
                return (
                  <div key={recUser.id || idx} className={styles.ulItem}>
                    <span
                      className={styles.av}
                      style={{
                        background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
                        color: '#222',
                      }}
                    >
                      {initial}
                    </span>
                    <div className={styles.ulText}>
                      <b>{recUser.name}</b>
                      <span className={styles.sub}>{recUser.email}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className={styles.sub} style={{ marginTop: '12px' }}>
                No registered users yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Low Stock List */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '18px' }}>Low stock</h2>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSmall}`}
          onClick={handleAddProduct}
        >
          <Plus size={16} />
          <span>Add product</span>
        </button>
      </div>

      <div className={styles.att}>
        {stats.lowStockProducts && stats.lowStockProducts.length > 0 ? (
          stats.lowStockProducts.map((p, idx) => {
            const gradient = GRADIENTS[idx % GRADIENTS.length];
            const emoji = EMOJI_MAP[p.category] || '📦';
            return (
              <div key={p.id} className={styles.attRow}>
                <div
                  className={styles.th}
                  style={
                    p.imageUrl
                      ? { backgroundImage: `url(${p.imageUrl})` }
                      : {
                          background: `linear-gradient(145deg, ${gradient[0]}, ${gradient[1]})`,
                        }
                  }
                >
                  {!p.imageUrl && emoji}
                </div>
                <div className={styles.attText}>
                  <b>{p.title}</b>
                  <div className={styles.sub} style={{ margin: 0 }}>
                    {p.stock === 0 ? (
                      <span className={styles.out}>Out of stock</span>
                    ) : (
                      <span className={styles.low}>Only {p.stock} left</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSmall}`}
                  onClick={() => handleRestock(p)}
                >
                  Restock
                </button>
              </div>
            );
          })
        ) : (
          <div className={styles.sub} style={{ padding: '20px 18px', margin: 0 }}>
            All products are well stocked.
          </div>
        )}
      </div>

      {/* Drawer */}
      <ProductDrawer
        isOpen={drawerOpen}
        product={editingProduct}
        onClose={() => setDrawerOpen(false)}
        onSaved={handleProductSaved}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className={styles.toast} role="status">
          {toastMessage}
        </div>
      )}
    </div>
  );
};
