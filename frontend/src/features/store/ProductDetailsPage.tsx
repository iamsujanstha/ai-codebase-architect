import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '@/core/api/aiApi';
import { fetchCatalogProduct } from '@/core/api/catalogApi';
import type { CatalogProductDetailResponse } from '@/core/types/catalog';
import { ProductCard } from '@/features/store/components/ProductCard';
import { useCart } from '@/features/store/CartContext';
import { formatCurrency } from '@/shared/utils/formatCurrency';

export function ProductDetailsPage(): JSX.Element {
  const { slug = '' } = useParams();
  const { addItem } = useCart();
  const [detail, setDetail] = useState<CatalogProductDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadProduct() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetchCatalogProduct(slug);
        if (isMounted) {
          setDetail(response);
        }
      } catch (caughtError) {
        if (!isMounted) {
          return;
        }

        setError(
          caughtError instanceof ApiError
            ? caughtError.message
            : 'The product detail page could not load this SKU.',
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    if (slug) {
      void loadProduct();
    }

    return () => {
      isMounted = false;
    };
  }, [slug]);

  if (isLoading) {
    return <div className="detail-loading panel-surface">Loading product detail…</div>;
  }

  if (error || !detail) {
    return (
      <section className="product-detail-page">
        <div className="thread-banner error">{error ?? 'Product not found.'}</div>
        <Link className="secondary-link-button" to="/">
          Back to storefront
        </Link>
      </section>
    );
  }

  const { product, relatedProducts } = detail;

  return (
    <div className="product-detail-page">
      <Link className="back-link" to="/">
        ← Back to storefront
      </Link>

      <section className="product-detail-hero panel-surface">
        <div
          className="product-detail-visual"
          style={{
            background: `linear-gradient(135deg, ${product.visual.gradientFrom}, ${product.visual.gradientTo})`,
          }}
        >
          <span>{product.visual.glyph}</span>
        </div>

        <div className="product-detail-copy">
          <p className="section-kicker">{product.categoryName}</p>
          <h1>{product.name}</h1>
          <p className="product-detail-subtitle">{product.subtitle}</p>
          <p className="product-detail-description">{product.description}</p>

          <div className="product-chip-row">
            <span className="surface-chip">{product.heroBadge}</span>
            {product.bestSeller ? <span className="surface-chip">Best seller</span> : null}
            {product.newArrival ? <span className="surface-chip">New arrival</span> : null}
          </div>

          <div className="product-detail-price">
            <strong>{formatCurrency(product.price, product.currency)}</strong>
            {product.compareAtPrice ? (
              <span>{formatCurrency(product.compareAtPrice, product.currency)}</span>
            ) : null}
          </div>

          <div className="product-detail-actions">
            <button
              className="primary-button"
              type="button"
              onClick={() => addItem(product)}
            >
              Add to cart
            </button>
            <Link className="secondary-link-button" to="/chat">
              Ask AI about this product
            </Link>
          </div>

          <div className="product-detail-metrics">
            <div>
              <strong>{product.rating.toFixed(1)}</strong>
              <span>Average rating</span>
            </div>
            <div>
              <strong>{product.reviewCount}</strong>
              <span>Verified reviews</span>
            </div>
            <div>
              <strong>{product.inventoryCount}</strong>
              <span>Units in stock</span>
            </div>
          </div>
        </div>
      </section>

      <section className="product-detail-columns">
        <article className="panel-surface">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Highlights</p>
              <h2>Why teams choose it</h2>
            </div>
          </div>
          <ul className="detail-list">
            {product.keyHighlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        </article>

        <article className="panel-surface">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Specifications</p>
              <h2>Technical details</h2>
            </div>
          </div>
          <div className="spec-grid">
            {product.specs.map((spec) => (
              <div key={spec.label} className="spec-card">
                <span>{spec.label}</span>
                <strong>{spec.value}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="related-products-section">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Related picks</p>
            <h2>Complete the setup</h2>
          </div>
        </div>

        <div className="product-grid">
          {relatedProducts.map((relatedProduct) => (
            <ProductCard
              key={relatedProduct.id}
              product={relatedProduct}
              onAddToCart={addItem}
              compact
            />
          ))}
        </div>
      </section>
    </div>
  );
}
