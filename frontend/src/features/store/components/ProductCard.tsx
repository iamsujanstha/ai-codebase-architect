import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { CatalogProduct } from '@/core/types/catalog';
import { formatCurrency } from '@/shared/utils/formatCurrency';

interface ProductCardProps {
  product: CatalogProduct;
  onAddToCart: (product: CatalogProduct) => void;
  compact?: boolean;
}

export function ProductCard({
  product,
  onAddToCart,
  compact = false,
}: ProductCardProps): JSX.Element {
  const visualStyle = {
    '--product-gradient-from': product.visual.gradientFrom,
    '--product-gradient-to': product.visual.gradientTo,
    '--product-accent': product.visual.accent,
  } as CSSProperties;

  return (
    <article className={`product-card ${compact ? 'compact' : ''}`}>
      <div className="product-visual" style={visualStyle}>
        <span className="product-badge">{product.heroBadge}</span>
        <span className="product-glyph">{product.visual.glyph}</span>
      </div>

      <div className="product-card-body">
        <div className="product-card-topline">
          <span className="product-category-label">{product.categoryName}</span>
          <span className="product-rating">
            {product.rating.toFixed(1)} · {product.reviewCount} reviews
          </span>
        </div>

        <div className="product-heading">
          <h3>{product.name}</h3>
          <p>{product.subtitle}</p>
        </div>

        <p className="product-description">{product.shortDescription}</p>

        <div className="product-chip-row">
          {product.bestSeller ? <span className="surface-chip">Best seller</span> : null}
          {product.newArrival ? <span className="surface-chip">New</span> : null}
          {product.inventoryCount <= 20 ? (
            <span className="surface-chip warn">Low stock</span>
          ) : null}
        </div>

        <div className="product-pricing">
          <strong>{formatCurrency(product.price, product.currency)}</strong>
          {product.compareAtPrice ? (
            <span>{formatCurrency(product.compareAtPrice, product.currency)}</span>
          ) : null}
        </div>

        <div className="product-card-actions">
          <Link className="secondary-link-button" to={`/products/${product.slug}`}>
            View details
          </Link>
          <button
            className="primary-button"
            type="button"
            onClick={() => onAddToCart(product)}
          >
            Add to cart
          </button>
        </div>
      </div>
    </article>
  );
}
