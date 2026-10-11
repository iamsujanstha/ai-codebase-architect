import { Heart } from 'lucide-react';
import type { CatalogProduct } from '@/core/types/catalog';

interface ProductCardProps {
  product: CatalogProduct;
  onAddToCart: (product: CatalogProduct) => void;
  isWishlisted?: boolean;
  onToggleWishlist?: (productId: string) => void;
}

/**
 * ProductCard - Product card with gradient background, emoji, badges, and actions.
 * Matches the exact design from atlas-app.html with:
 * - 20/19 aspect ratio image
 * - Heart button for wishlist
 * - "Customer favourite" badge
 * - Hover "Add to cart" button
 * - Rating and price display
 */
export function ProductCard({
  product,
  onAddToCart,
  isWishlisted = false,
  onToggleWishlist,
}: ProductCardProps): JSX.Element {
  const handleAddToCart = () => {
    onAddToCart(product);
  };

  const handleToggleWishlist = () => {
    if (onToggleWishlist) {
      onToggleWishlist(product.id);
    }
  };

  // Get gradient colors from product visual
  const gradientFrom = product.visual?.gradientFrom || '#e0e0e0';
  const gradientTo = product.visual?.gradientTo || '#f5f5f5';
  const glyph = product.visual?.glyph || '📦';

  return (
    <article className="card">
      {/* Product image with gradient background */}
      <div
        className="img"
        style={{
          background: `linear-gradient(145deg, ${gradientFrom}, ${gradientTo})`,
        }}
      >
        {/* Emoji icon */}
        <span aria-hidden="true">{glyph}</span>

        {/* Customer favourite badge */}
        {product.bestSeller && (
          <span className="badge">Customer favourite</span>
        )}

        {/* Heart/wishlist button */}
        <button
          className="heart"
          data-h={product.id}
          aria-pressed={isWishlisted}
          aria-label={`Save ${product.name}`}
          onClick={handleToggleWishlist}
          type="button"
        >
          <Heart
            size={24}
            fill={isWishlisted ? 'var(--brand)' : 'rgba(0,0,0,.45)'}
            stroke="white"
            strokeWidth={2}
          />
        </button>

        {/* Add to cart button (shows on hover) */}
        <button
          className="add"
          data-a={product.id}
          onClick={handleAddToCart}
          type="button"
        >
          Add to cart
        </button>
      </div>

      {/* Product metadata */}
      <div className="meta">
        <div className="row">
          <span>{product.name}</span>
          <span>★ {product.rating.toFixed(1)}</span>
        </div>
        <div className="sub">{product.subtitle || product.shortDescription}</div>
        <div className="sub">{product.reviewCount} reviews</div>
        <div style={{ marginTop: '4px' }}>
          <b>${product.price}</b>
        </div>
      </div>
    </article>
  );
}
