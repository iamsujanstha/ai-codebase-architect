import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AppHeader } from './AppHeader';

/**
 * AppLayout - Main layout wrapper with the new AppHeader.
 * Handles search and cart drawer interactions.
 */
export function AppLayout(): JSX.Element {
  const [, setSearchQuery] = useState('');

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    // Search is handled by URL params or will be wired to context
    console.log('Search:', query);
  };

  const handleCartClick = () => {
    // Cart drawer will be wired in step 4
    console.log('Cart clicked - drawer will open in step 4');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppHeader onSearch={handleSearch} onCartClick={handleCartClick} />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
    </div>
  );
}
