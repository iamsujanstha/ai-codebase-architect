import { FormEvent, useState, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, ShoppingCart, Sparkles } from 'lucide-react';
import { useCart } from '@/features/store/CartContext';
import { useAIConcierge } from '@/features/chat/AIConciergeContext';
import { ProfileMenu } from './ProfileMenu';
import { ThemeToggle } from './ThemeToggle';
import { ROUTES } from '@/app/constants/routes';

interface AppHeaderProps {
  onSearch?: (query: string) => void;
  onCartClick?: () => void;
  onAskAIClick?: () => void;
  categoryStrip?: ReactNode;
}

/**
 * AppHeader - Main navigation header matching the atlas-app.html design.
 * Features:
 * - Logo with tagline
 * - Search pill (moves to own row on mobile)
 * - Ask AI header button (matching admin CMS)
 * - Cart button with count
 * - Profile menu
 * - Theme toggle
 * - Optional category strip for storefront
 */
export function AppHeader({ onSearch, onCartClick, onAskAIClick, categoryStrip }: AppHeaderProps): JSX.Element {
  const { itemCount } = useCart();
  const { openConcierge } = useAIConcierge();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const handleAskAI = () => {
    if (onAskAIClick) {
      onAskAIClick();
    } else {
      openConcierge();
    }
  };

  const isHome = location.pathname === ROUTES.HOME;

  const handleSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const query = searchQuery.trim();
    
    if (onSearch) {
      onSearch(query);
    }
    
    // Navigate to home if not already there
    if (!isHome && query) {
      navigate(`${ROUTES.HOME}?q=${encodeURIComponent(query)}`);
    }
  };

  return (
    <header>
      <div className="wrap">
        <div className="top">
          {/* Logo */}
          <Link className="logo" to={ROUTES.HOME}>
            <svg 
              width="30" 
              height="30" 
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
              Atlas Commerce Lab
              <small>Shop with an AI concierge</small>
            </span>
          </Link>

          {/* Search */}
          <nav className="pill" aria-label="Search">
            <form id="sf" onSubmit={handleSearchSubmit}>
              <input
                id="q"
                type="search"
                placeholder="Search desk, lighting, audio"
                aria-label="Search products"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button className="go" aria-label="Search" type="submit">
                <Search size={15} strokeWidth={4} />
              </button>
            </form>
          </nav>

          {/* Right actions */}
          <div className="right">
            {/* Ask AI button */}
            <button
              className="chip"
              id="askaib"
              onClick={handleAskAI}
              type="button"
              aria-label="Ask AI"
              title="Open AI Concierge"
            >
              <Sparkles size={16} style={{ color: '#a93bff' }} />
              <span>Ask AI</span>
            </button>

            {/* Cart button */}
            <button
              className="chip"
              id="cartb"
              onClick={onCartClick}
              type="button"
              aria-label={`Cart, ${itemCount} items`}
            >
              <ShoppingCart size={18} />
              Cart
              {itemCount > 0 && (
                <span className="cnt" id="cc">
                  {itemCount}
                </span>
              )}
            </button>

            {/* Profile menu */}
            <ProfileMenu />

            {/* Theme toggle */}
            <ThemeToggle />
          </div>
        </div>

        {/* Category strip (shown on storefront) */}
        {categoryStrip}
      </div>
    </header>
  );
}
