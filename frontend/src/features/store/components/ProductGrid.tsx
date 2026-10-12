import type { CatalogProduct } from '@/core/types/catalog';
import { ProductCard } from './ProductCard';
import { SkeletonCard } from './SkeletonCard';
import { EmptyState } from './EmptyState';

interface ProductGridProps {
  products: CatalogProduct[];
  isLoading: boolean;
  isLoadingMore?: boolean;
  searchQuery?: string;
  wishlist?: Set<string>;
  onAddToCart: (product: CatalogProduct) => void;
  onToggleWishlist?: (productId: string) => void;
  onAskAI?: () => void;
}

/**
 * ProductGrid - Auto-fill grid container for product cards.
 * Uses the .grid class from atlas-app.html with:
 * - Auto-fill layout: minmax(250px, 1fr)
 * - Gap: 32px rows, 24px columns
 * - Loading skeletons (initial and infinite scroll)
 * - Empty state
 */
export function ProductGrid({
  products,
  isLoading,
  isLoadingMore = false,
  searchQuery,
  wishlist = new Set(),
  onAddToCart,
  onToggleWishlist,
  onAskAI,
}: ProductGridProps): JSX.Element {
  if (isLoading) {
    return (
      <div className="grid">
        {Array.from({ length: 8 }).map((_, index) => (
          <SkeletonCard key={`initial-skeleton-${index}`} />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="grid">
        <EmptyState searchQuery={searchQuery} onAskAI={onAskAI} />
      </div>
    );
  }

  return (
    <div className="grid">
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          index={index}
          onAddToCart={onAddToCart}
          isWishlisted={wishlist.has(product.id)}
          onToggleWishlist={onToggleWishlist}
        />
      ))}
      {isLoadingMore &&
        Array.from({ length: 4 }).map((_, index) => (
          <SkeletonCard key={`more-skeleton-${index}`} />
        ))}
    </div>
  );
}

