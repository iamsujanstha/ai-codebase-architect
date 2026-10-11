import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Users,
  Menu,
  X,
  ExternalLink,
  Sun,
  Moon,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/features/auth/AuthContext';
import { adminApi, AdminStats } from './api/adminApi';
import styles from './Admin.module.css';

export const AdminLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check initial theme
    const theme = document.documentElement.getAttribute('data-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsDark(theme === 'dark' || (!theme && prefersDark));

    // Fetch stats for sidebar counts
    adminApi
      .getStats()
      .then((data) => setStats(data))
      .catch((err) => console.error('Failed to load admin stats:', err));
  }, [location.pathname]);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    document.documentElement.setAttribute('data-theme', nextDark ? 'dark' : 'light');
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleOpenStorefront = () => {
    window.open('/', '_blank');
  };

  // Compute breadcrumb title
  const getBreadcrumb = () => {
    if (location.pathname === '/admin' || location.pathname === '/admin/') {
      return 'Dashboard';
    }
    if (location.pathname.startsWith('/admin/products')) {
      return 'Products';
    }
    if (location.pathname.startsWith('/admin/users')) {
      return 'Users';
    }
    return 'Admin';
  };

  const adminName = user?.name || 'Administrator';
  const adminInitial = adminName.charAt(0).toUpperCase();

  return (
    <div className={styles.shell}>
      {/* Mobile Drawer Backdrop */}
      {sidebarOpen && (
        <div
          className={styles.dsc}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`${styles.sb} ${sidebarOpen ? styles.open : ''}`}
        aria-label="Sidebar"
      >
        <div className={styles.logo}>
          <svg
            width="28"
            height="28"
            viewBox="0 0 32 32"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M16 3c3 5 9 12 9 18a9 9 0 0 1-18 0c0-6 6-13 9-18z" />
            <path d="M12 22c1 2 7 2 8 0" />
          </svg>
          <span>
            Atlas Admin
            <small>Atlas Commerce Lab</small>
          </span>
        </div>

        <nav id="nav">
          <div className={styles.sectionHeader}>OVERVIEW</div>
          <NavLink
            to="/admin"
            end
            className={({ isActive }) =>
              `${styles.nv} ${isActive ? styles.active : ''}`
            }
            onClick={() => setSidebarOpen(false)}
          >
            <LayoutDashboard />
            <span>Dashboard</span>
          </NavLink>

          <div className={styles.sectionHeader}>MANAGE</div>
          <NavLink
            to="/admin/products"
            className={({ isActive }) =>
              `${styles.nv} ${isActive ? styles.active : ''}`
            }
            onClick={() => setSidebarOpen(false)}
          >
            <Package />
            <span>Products</span>
            {stats && stats.totalProducts !== undefined && (
              <span className={styles.ct}>{stats.totalProducts}</span>
            )}
          </NavLink>

          <NavLink
            to="/admin/users"
            className={({ isActive }) =>
              `${styles.nv} ${isActive ? styles.active : ''}`
            }
            onClick={() => setSidebarOpen(false)}
          >
            <Users />
            <span>Users</span>
            {stats && stats.totalUsers !== undefined && (
              <span className={styles.ct}>{stats.totalUsers}</span>
            )}
          </NavLink>
        </nav>

        <div className={styles.sbf}>
          <div className={styles.vs}>
            <span className={styles.av} title={adminName}>
              {user?.avatar ? (
                <img src={user.avatar} alt={adminName} />
              ) : (
                adminInitial
              )}
            </span>
            <div>
              <b>{adminName}</b>
              <small>Administrator</small>
            </div>
          </div>

          <button
            type="button"
            className={styles.nv}
            onClick={handleOpenStorefront}
          >
            <ExternalLink />
            <span>Open storefront ↗</span>
          </button>

          <button
            type="button"
            className={styles.nv}
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun /> : <Moon />}
            <span>{isDark ? 'Light theme' : 'Dark theme'}</span>
          </button>

          <button
            type="button"
            className={styles.nv}
            onClick={handleLogout}
            aria-label="Log out"
          >
            <LogOut />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div>
        <header className={styles.tb}>
          <button
            type="button"
            className={styles.hb}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className={styles.bc}>{getBreadcrumb()}</div>

          <span className={styles.av} title={adminName}>
            {user?.avatar ? (
              <img src={user.avatar} alt={adminName} />
            ) : (
              adminInitial
            )}
          </span>
        </header>

        <main className={styles.main}>
          <Outlet context={{ refreshStats: () => adminApi.getStats().then(setStats) }} />
        </main>
      </div>
    </div>
  );
};
