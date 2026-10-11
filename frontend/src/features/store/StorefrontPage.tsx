import { useEffect, useState, useRef, useCallback } from 'react';
import { fetchCatalogProducts, fetchCategories } from '@/core/api/catalogApi';
import type { CatalogProduct, CatalogCategory } from '@/core/types/catalog';
import { useCart } from '@/features/store/CartContext';
import { useWishlist } from '@/shared/hooks/useWishlist';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { CategoryStrip, DEFAULT_CATEGORIES, type Category } from './components/CategoryStrip';
import { SortButton, type SortOption } from './components/SortButton';
import { ProductGrid } from './components/ProductGrid';
import { CatalogErrorBanner } from './components/CatalogErrorBanner';
import { useAIConcierge } from '@/features/chat/AIConciergeContext';
import { Sparkles, Laptop, Armchair, BookOpen, Wrench, Package } from 'lucide-react';

const PAGE_SIZE = 8;

// Placeholder for backward compatibility (static data removed)
export const DEMO_PRODUCTS: CatalogProduct[] = [];

function getCategoryIcon(slug: string): React.ReactNode {
  switch (slug.toLowerCase()) {
    case 'electronics':
      return <Laptop size={24} />;
    case 'furniture':
    case 'desk':
    case 'desks':
      return <Armchair size={24} />;
    case 'books':
      return <BookOpen size={24} />;
    case 'accessories':
    case 'accessory':
      return <Wrench size={24} />;
    default:
      return <Package size={24} />;
  }
}

/**
 * StorefrontPage - Main shop page with Airbnb-style infinite scrolling & skeleton loading
 * Data is dynamically queried from Neon PostgreSQL.
 */
export function StorefrontPage(): JSX.Element {
  const { addItem } = useCart();
  const { wishlist, toggleWishlist } = useWishlist();
  const { showToast } = useToastContext();
  const { openConcierge } = useAIConcierge();

  // Categories & Filtering
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortOption, setSortOption] = useState<SortOption>('featured');

  // Products & Infinite Scrolling State
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [hasError, setHasError] = useState<boolean>(false);

  // Sentinel ref for IntersectionObserver
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Load dynamic categories from Neon PostgreSQL on mount
  useEffect(() => {
    let isMounted = true;
    async function loadDynamicCategories() {
      try {
        const catData: CatalogCategory[] = await fetchCategories();
        if (isMounted && Array.isArray(catData) && catData.length > 0) {
          const dynamicList: Category[] = [
            { id: 'all', name: 'All', icon: <Sparkles size={24} /> },
            ...catData.map((c) => ({
              id: c.slug,
              name: c.name,
              icon: getCategoryIcon(c.slug),
              count: c.productCount,
            })),
          ];
          setCategories(dynamicList);
        }
      } catch (err) {
        console.warn('Using default category fallback:', err);
      }
    }
    void loadDynamicCategories();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch initial batch whenever category or search param changes
  const loadInitialProducts = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    setProducts([]);

    const urlParams = new URLSearchParams(window.location.search);
    const searchFromUrl = urlParams.get('q') || undefined;

    try {
      const response = await fetchCatalogProducts({
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        search: searchFromUrl,
        limit: PAGE_SIZE,
        skip: 0,
      });

      setProducts(response.items);
      setTotalCount(response.total);
      setHasMore(response.items.length < response.total);
    } catch (error) {
      setHasError(true);
      console.error('Failed to load initial catalog from Neon PostgreSQL:', error);
      setProducts([]);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory]);

  useEffect(() => {
    void loadInitialProducts();
  }, [loadInitialProducts]);

  // Load next batch (Airbnb-style infinite scroll)
  const loadMoreProducts = useCallback(async () => {
    if (isLoading || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);

    const urlParams = new URLSearchParams(window.location.search);
    const searchFromUrl = urlParams.get('q') || undefined;

    try {
      const response = await fetchCatalogProducts({
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        search: searchFromUrl,
        limit: PAGE_SIZE,
        skip: products.length,
      });

      setProducts((prev) => {
        const existingIds = new Set(prev.map((p) => p.id));
        const newUnique = response.items.filter((item) => !existingIds.has(item.id));
        const updated = [...prev, ...newUnique];
        setHasMore(updated.length < response.total);
        return updated;
      });
      setTotalCount(response.total);
    } catch (error) {
      console.error('Failed to fetch more products from Neon PostgreSQL:', error);
      setHasMore(false);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoading, isLoadingMore, hasMore, products.length, selectedCategory]);

  // IntersectionObserver for sentinel element
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !isLoading && !isLoadingMore) {
          void loadMoreProducts();
        }
      },
      {
        root: null,
        rootMargin: '350px', // Pre-fetch before user reaches the very bottom
        threshold: 0.1,
      },
    );

    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [loadMoreProducts, hasMore, isLoading, isLoadingMore]);

  // Client-side sorting on loaded products
  const sortedProducts = [...products].sort((a, b) => {
    switch (sortOption) {
      case 'price-asc':
        return a.price - b.price;
      case 'price-desc':
        return b.price - a.price;
      case 'rating':
        return b.rating - a.rating;
      case 'featured':
      default:
        return (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
    }
  });

  const handleAddToCart = (product: CatalogProduct) => {
    addItem(product);
    showToast(`Added ${product.name} to cart`);
  };

  const handleRetry = () => {
    void loadInitialProducts();
  };

  const selectedCatObj = categories.find((c) => c.id === selectedCategory);
  const displayTitle = selectedCategory === 'all' ? 'All products' : selectedCatObj?.name || 'Products';

  return (
    <main className="wrap">
      <section>
        {/* Error banner */}
        {hasError && <CatalogErrorBanner onRetry={handleRetry} />}

        {/* Category strip and sort button */}
        <div className="cats">
          <CategoryStrip
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={(catId) => {
              setSelectedCategory(catId);
            }}
          />
          <SortButton currentSort={sortOption} onSortChange={setSortOption} />
        </div>

        {/* Page heading */}
        <div className="head">
          <div>
            <h1>{displayTitle}</h1>
            <span style={{ fontSize: '13px', color: 'var(--brand, #00e599)', fontWeight: 500 }}>
              Live from Neon PostgreSQL
            </span>
          </div>
          <span>
            {isLoading ? 'Loading...' : `${products.length} of ${totalCount} products`}
          </span>
        </div>

        {/* Product grid with initial & infinite scroll skeleton cards */}
        <ProductGrid
          products={sortedProducts}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          wishlist={wishlist}
          onAddToCart={handleAddToCart}
          onToggleWishlist={toggleWishlist}
          onAskAI={openConcierge}
        />

        {/* Infinite scroll sentinel trigger element */}
        <div
          ref={sentinelRef}
          style={{
            height: '40px',
            marginTop: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isLoadingMore && (
            <div style={{ color: 'var(--mute)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#00e599',
                  animation: 'p 1s infinite',
                }}
              />
              Loading more from Neon PostgreSQL...
            </div>
          )}
        </div>

        {/* End of catalog indicator */}
        {!hasMore && !isLoading && products.length > 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '30px 0 40px',
              color: 'var(--mute)',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
            }}
          >
            <div style={{ height: '1px', width: '60px', background: 'var(--soft, #e5e7eb)' }} />
            <span>✓ All {totalCount} products loaded from Neon PostgreSQL</span>
            <div style={{ height: '1px', width: '60px', background: 'var(--soft, #e5e7eb)' }} />
          </div>
        )}
      </section>
    </main>
  );
}
