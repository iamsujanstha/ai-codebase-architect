import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CartDrawer } from '@/features/store/components/CartDrawer';
import { useCart } from '@/features/store/CartContext';
import { ThemeToggle } from '@/shared/ui/ThemeToggle';

// AppChrome is the persistent frame around every route.
// This is a common product pattern because it keeps:
// - navigation consistent
// - global actions nearby
// - shared state visible across pages
export function AppChrome(): JSX.Element {
  const location = useLocation();
  const { itemCount, toggleCart } = useCart();

  const routeLabel = location.pathname.startsWith('/chat')
    ? 'Local AI concierge'
    : location.pathname.startsWith('/checkout')
      ? 'Payments orchestration'
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
          <NavLink to="/chat">Chat</NavLink>
        </nav>

        <div className="site-actions">
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
