import { useState, useEffect } from 'react';

const WISHLIST_STORAGE_KEY = 'atlas-wishlist';

/**
 * Hook for managing wishlist state with localStorage persistence.
 */
export function useWishlist() {
  const [wishlist, setWishlist] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') {
      return new Set();
    }

    try {
      const stored = localStorage.getItem(WISHLIST_STORAGE_KEY);
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load wishlist:', error);
    }

    return new Set();
  });

  // Persist to localStorage whenever wishlist changes
  useEffect(() => {
    try {
      localStorage.setItem(
        WISHLIST_STORAGE_KEY,
        JSON.stringify(Array.from(wishlist))
      );
    } catch (error) {
      console.error('Failed to save wishlist:', error);
    }
  }, [wishlist]);

  const toggleWishlist = (productId: string) => {
    setWishlist((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const isWishlisted = (productId: string) => wishlist.has(productId);

  const addToWishlist = (productId: string) => {
    setWishlist((prev) => new Set(prev).add(productId));
  };

  const removeFromWishlist = (productId: string) => {
    setWishlist((prev) => {
      const next = new Set(prev);
      next.delete(productId);
      return next;
    });
  };

  return {
    wishlist,
    toggleWishlist,
    isWishlisted,
    addToWishlist,
    removeFromWishlist,
  };
}
