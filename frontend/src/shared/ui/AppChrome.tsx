import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CartDrawer } from '@/features/store/components/CartDrawer';
import { useCart } from '@/features/store/CartContext';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';
import { useAuth } from '@/features/auth/AuthContext';
import { LogOut } from 'lucide-react';

export function AppChrome(): JSX.Element {
  const location = useLocation();
  const { itemCount, toggleCart } = useCart();
  const { user, logout } = useAuth();

  const routeLabel = location.pathname.startsWith('/chat')
    ? 'Local AI concierge'
    : location.pathname.startsWith('/checkout')
      ? 'Payments orchestration'
    : location.pathname.startsWith('/orders')
      ? 'Order History'
    : location.pathname.startsWith('/dashboard')
      ? 'Admin Operations'
    : 'Mongo-backed storefront';

  return (
    <div className="platform-shell">
      <header className="site-header">
        <div className="site-brand">
          <NavLink className="brand-wordmark" to="/">
            Atlas Commerce Lab
          </NavLink>
          <span className="brand-caption">{routeLabel}</span>
        </div>

        <nav className="site-nav">
          <NavLink to="/" end>
            Home
          </NavLink>
          {user && <NavLink to="/dashboard">Dashboard</NavLink>}
          {user && <NavLink to="/orders">Orders</NavLink>}
          <NavLink to="/chat">Chat</NavLink>
        </nav>

        <div className="site-actions">
          {user ? (
            <div className="user-profile-nav">
              <span className="user-name">{user.name}</span>
              <button className="icon-btn" onClick={logout} title="Logout">
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <div className="auth-links">
              <NavLink to="/login">Login</NavLink>
            </div>
          )}
          <button className="cart-button" type="button" onClick={toggleCart}>
            Cart
            <span className="cart-count">{itemCount}</span>
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div className="route-shell">
        <Outlet />
      </div>

      <CartDrawer />
    </div>
  );
}
