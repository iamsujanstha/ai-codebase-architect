import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AppHeader } from './AppHeader';
import { useCart } from '@/features/store/CartContext';
import { useAIConcierge } from '@/features/chat/AIConciergeContext';
import { CartDrawer } from '@/features/store/components/CartDrawer';
import { ConciergeDrawer } from '@/features/chat/components/ConciergeDrawer';

/**
 * AppLayout - Main layout wrapper with the new AppHeader.
 * Manages Cart drawer and AI concierge drawer.
 */
export function AppLayout(): JSX.Element {
  const [, setSearchQuery] = useState('');

  const { openCart, closeCart } = useCart();
  const { isConciergeOpen, openConcierge, closeConcierge } = useAIConcierge();

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleCartClick = () => {
    closeConcierge();
    openCart();
  };

  const handleOpenConcierge = () => {
    closeCart();
    openConcierge();
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader
        onSearch={handleSearch}
        onCartClick={handleCartClick}
        onAskAIClick={handleOpenConcierge}
      />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>

      {/* Cart Drawer */}
      <CartDrawer />

      {/* AI Concierge Drawer */}
      <ConciergeDrawer isOpen={isConciergeOpen} onClose={closeConcierge} />
    </div>
  );
}
