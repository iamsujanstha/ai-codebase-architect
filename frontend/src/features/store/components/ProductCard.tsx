import { Heart } from 'lucide-react';
import type { CatalogProduct } from '@/core/types/catalog';
import { getDynamicProductVisual } from '../utils/dynamicVisuals';

interface ProductCardProps {
  product: CatalogProduct;
  index?: number;
  onAddToCart: (product: CatalogProduct) => void;
  isWishlisted?: boolean;
  onToggleWishlist?: (productId: string) => void;
  isPurchased?: boolean;
}

/**
 * ProductCard - Airbnb-style listing card with dynamic items background,
 * contextual glyphs, elegant badge accents, and smooth reveal animation.
 */
export function ProductCard({
  product,
  index = 0,
  onAddToCart,
  isWishlisted = false,
  onToggleWishlist,
  isPurchased = false,
}: ProductCardProps): JSX.Element {
  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToCart(product);
  };

  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleWishlist) {
      onToggleWishlist(product.id);
    }
  };

  // Generate dynamic, harmonized background palette & contextual glyph
  const visual = getDynamicProductVisual(product, index);

  return (
    <article
      className="card dynamic-product-card"
      style={{
        animationDelay: `${Math.min(index * 35, 350)}ms`,
      }}
    >
      {/* Product visual container with dynamic background & ambient specular sheen */}
      <div
        className="img dynamic-card-canvas"
        style={{
          background: visual.gradient,
          '--dynamic-dark-bg': visual.darkGradient,
          '--dynamic-accent': visual.accent,
        } as React.CSSProperties}
      >
        {/* Ambient specular highlights */}
        <div className="dynamic-canvas-overlay" />

        {/* Dynamic contextual emoji / icon */}
        <span className="dynamic-glyph" aria-hidden="true">
          {visual.glyph}
        </span>

        {/* Purchased / Customer favourite / Featured badge */}
        {isPurchased && (
          <span
            className="badge dynamic-badge"
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              boxShadow: '0 2px 10px rgba(16, 185, 129, 0.45)',
              letterSpacing: '0.02em',
              fontWeight: 600,
            }}
          >
            ✓ Purchased
          </span>
        )}
        {!isPurchased && product.bestSeller && (
          <span className="badge dynamic-badge">Customer favourite</span>
        )}
        {!isPurchased && !product.bestSeller && product.featured && (
          <span className="badge dynamic-badge">Featured</span>
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
          <span className="product-title">{product.name}</span>
          <span className="product-rating">★ {product.rating.toFixed(1)}</span>
        </div>
        <div className="sub">{product.subtitle || product.shortDescription}</div>
        <div className="sub">{product.reviewCount} reviews</div>
        <div style={{ marginTop: '4px' }}>
          <b className="product-price">${product.price}</b>
        </div>
      </div>
    </article>
  );
}

