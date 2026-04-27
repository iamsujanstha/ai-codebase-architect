import { useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CartDrawer } from '@/features/store/components/CartDrawer';
import { useCart } from '@/features/store/CartContext';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';
import { useAuth } from '@/features/auth/AuthContext';
import { useOnClickOutside } from '@/shared/hooks/useOnClickOutside';
import { ROUTES } from '@/app/constants/routes';

// ─── route label ─────────────────────────────────────────────────────────────

function routeLabel(pathname: string): string {
  if (pathname.startsWith(ROUTES.CHAT))      return 'Local AI concierge';
  if (pathname.startsWith(ROUTES.CHECKOUT))  return 'Payments orchestration';
  if (pathname.startsWith(ROUTES.ORDERS))    return 'Order History';
  if (pathname.startsWith(ROUTES.DASHBOARD)) return 'Admin Operations';
  if (pathname.startsWith(ROUTES.LOGIN) || pathname.startsWith(ROUTES.REGISTER)) return 'Account';
  return 'Mongo-backed storefront';
}

// ─── user menu dropdown ───────────────────────────────────────────────────────

function UserMenu(): JSX.Element {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useOnClickOutside(ref, () => setOpen(false));

  if (!user) {
    return (
      <div className="auth-links">
        <NavLink to="/login" className="nav-auth-link">Sign in</NavLink>
        <NavLink to="/register" className="nav-auth-link nav-auth-link--primary">
          Register
        </NavLink>
      </div>
    );
  }

  const initials = user.name
    ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : user.email[0].toUpperCase();

  function handleLogout() {
    setOpen(false);
    logout();
    navigate(ROUTES.HOME);
  }

  return (
    <div className="user-menu" ref={ref}>
      <button
        className="user-menu__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        type="button"
      >
        {user.avatar ? (
          <img src={user.avatar} alt={user.name} className="user-menu__avatar" />
        ) : (
          <span className="user-menu__initials">{initials}</span>
        )}
        <span className="user-menu__name">{user.name?.split(' ')[0] ?? 'Account'}</span>
        <span className="user-menu__chevron" aria-hidden>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="user-menu__dropdown" role="menu">
          <div className="user-menu__header">
            <p className="user-menu__full-name">{user.name}</p>
            <p className="user-menu__email">{user.email}</p>
          </div>
          <div className="user-menu__divider" />
          <button className="user-menu__item" role="menuitem" type="button"
            onClick={() => { setOpen(false); navigate(ROUTES.ORDERS); }}>
            <span className="user-menu__item-icon">📦</span>My Orders
          </button>
          <button className="user-menu__item" role="menuitem" type="button"
            onClick={() => { setOpen(false); navigate(ROUTES.DASHBOARD); }}>
            <span className="user-menu__item-icon">⚙️</span>Dashboard
          </button>
          <div className="user-menu__divider" />
          <button className="user-menu__item user-menu__item--danger" role="menuitem" type="button"
            onClick={handleLogout}>
            <span className="user-menu__item-icon">→</span>Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// ─── app chrome ───────────────────────────────────────────────────────────────

export function AppChrome(): JSX.Element {
  const location = useLocation();
  const { itemCount, toggleCart } = useCart();
  // user is consumed by UserMenu — kept here for future route-level guards

  return (
    <div className="platform-shell">
      <header className="site-header">
        <div className="site-brand">
          <NavLink className="brand-wordmark" to="/">
            Atlas Commerce Lab
          </NavLink>
          <span className="brand-caption">{routeLabel(location.pathname)}</span>
        </div>

        <nav className="site-nav">
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/chat">Chat</NavLink>
        </nav>

        <div className="site-actions">
          <UserMenu />

          <button
            className="cart-button"
            type="button"
            onClick={toggleCart}
            aria-label={`Cart, ${itemCount} items`}
          >
            Cart
            {itemCount > 0 && (
              <span className="cart-count">{itemCount}</span>
            )}
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
