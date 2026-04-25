import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '@/core/api/aiApi';
import {
  fetchCatalogHome,
  fetchCatalogProducts,
} from '@/core/api/catalogApi';
import type {
  CatalogHomeResponse,
  CatalogProduct,
  CatalogProductsResponse,
} from '@/core/types/catalog';
import { ProductCard } from '@/features/store/components/ProductCard';
import { useCart } from '@/features/store/CartContext';
import { formatCurrency } from '@/shared/utils/formatCurrency';

export function StorefrontPage(): JSX.Element {
  const { addItem, openCart } = useCart();
  const [homeData, setHomeData] = useState<CatalogHomeResponse | null>(null);
  const [productData, setProductData] = useState<CatalogProductsResponse | null>(
    null,
  );
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchDraft, setSearchDraft] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [isLoadingHome, setIsLoadingHome] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadHome() {
      setIsLoadingHome(true);
      setError(null);

      try {
        const response = await fetchCatalogHome();

        if (isMounted) {
          setHomeData(response);
        }
      } catch (caughtError) {
        if (!isMounted) {
          return;
        }

        setError(
          caughtError instanceof ApiError
            ? caughtError.message
            : 'The storefront could not load the catalog landing data.',
        );
      } finally {
        if (isMounted) {
          setIsLoadingHome(false);
        }
      }
    }

    void loadHome();

    return () => {
      isMounted = false;
    };
  }, []);

  // Infinite scroll logic
  const [currentPage, setCurrentPage] = useState(1);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadProducts() {
      if (currentPage === 1) {
        setIsLoadingProducts(true);
      } else {
        setIsFetchingMore(true);
      }
      
      setError(null);

      try {
        const response = await fetchCatalogProducts({
          category: selectedCategory === 'all' ? undefined : selectedCategory,
          search: committedSearch || undefined,
          limit: 12,
          skip: (currentPage - 1) * 12,
        });

        if (isMounted) {
          if (currentPage === 1) {
            setProductData(response);
          } else {
            setProductData(prev => prev ? {
              ...response,
              items: [...prev.items, ...response.items]
            } : response);
          }
        }
      } catch (caughtError) {
        if (!isMounted) {
          return;
        }

        setError(
          caughtError instanceof ApiError
            ? caughtError.message
            : 'The storefront could not load product results.',
        );
      } finally {
        if (isMounted) {
          setIsLoadingProducts(false);
          setIsFetchingMore(false);
        }
      }
    }

    void loadProducts();

    return () => {
      isMounted = false;
    };
  }, [committedSearch, selectedCategory, currentPage]);

  // Reset page when search or category changes
  useEffect(() => {
    setCurrentPage(1);
  }, [committedSearch, selectedCategory]);


  const heroProduct = useMemo(() => homeData?.featuredProducts[0] ?? null, [homeData]);

  function handleAddToCart(product: CatalogProduct) {
    addItem(product);
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCommittedSearch(searchDraft.trim());
  }

  return (
    <div className="storefront-page">
      {homeData ? (
        <section className="announcement-bar">
          <span>{homeData.announcement}</span>
          <Link to="/chat">Try the local AI route</Link>
        </section>
      ) : null}

      <section className="hero-section panel-surface">
        <div className="hero-copy">
          <p className="section-kicker">
            {homeData?.hero.eyebrow ?? 'Loading catalog'}
          </p>
          <h1>
            {homeData?.hero.title ??
              'Premium ecommerce, local AI, and Mongo-backed APIs in one app.'}
          </h1>
          <p>
            {homeData?.hero.description ??
              'The storefront is loading product data from the backend catalog service.'}
          </p>

          <div className="hero-actions">
            <a className="primary-button" href={homeData?.hero.primaryCtaHref ?? '#catalog'}>
              {homeData?.hero.primaryCtaLabel ?? 'Browse collection'}
            </a>
            <Link className="secondary-link-button" to="/chat">
              {homeData?.hero.secondaryCtaLabel ?? 'Open AI concierge'}
            </Link>
          </div>

          <div className="hero-stats">
            {(homeData?.hero.stats ?? []).map((stat) => (
              <div key={stat.label} className="hero-stat">
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-product-card">
          {heroProduct ? (
            <>
              <div
                className="hero-product-visual"
                style={{
                  background: `linear-gradient(135deg, ${heroProduct.visual.gradientFrom}, ${heroProduct.visual.gradientTo})`,
                }}
              >
                <span>{heroProduct.visual.glyph}</span>
              </div>

              <div className="hero-product-copy">
                <p className="surface-chip hero-surface-chip">{heroProduct.heroBadge}</p>
                <h2>{heroProduct.name}</h2>
                <p>{heroProduct.shortDescription}</p>
                <div className="hero-product-price">
                  <strong>
                    {formatCurrency(heroProduct.price, heroProduct.currency)}
                  </strong>
                  {heroProduct.compareAtPrice ? (
                    <span>
                      {formatCurrency(
                        heroProduct.compareAtPrice,
                        heroProduct.currency,
                      )}
                    </span>
                  ) : null}
                </div>
                <div className="hero-product-actions">
                  <Link
                    className="secondary-link-button"
                    to={`/products/${heroProduct.slug}`}
                  >
                    Explore product
                  </Link>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => {
                      handleAddToCart(heroProduct);
                      openCart();
                    }}
                  >
                    Quick add
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="loading-panel">Loading hero product...</div>
          )}
        </div>
      </section>

      <section className="featured-section">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Featured</p>
            <h2>Best-in-class setup upgrades</h2>
          </div>
          <Link className="text-link" to="/chat">
            Need help choosing? Ask the AI concierge
          </Link>
        </div>

        <div className="product-grid">
          {(homeData?.featuredProducts ?? []).map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onAddToCart={handleAddToCart}
            />
          ))}
        </div>
      </section>

      <section className="category-section panel-surface">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Browse by category</p>
            <h2>Curated collections for high-output teams</h2>
          </div>
        </div>

        <div className="category-grid">
          <button
            className={`category-pill ${selectedCategory === 'all' ? 'selected' : ''}`}
            type="button"
            onClick={() => setSelectedCategory('all')}
          >
            <strong>All products</strong>
            <span>{productData?.total ?? homeData?.catalogProducts.length ?? 0} items</span>
          </button>

          {(homeData?.categories ?? []).map((category) => (
            <button
              key={category.slug}
              className={`category-pill ${selectedCategory === category.slug ? 'selected' : ''}`}
              type="button"
              onClick={() => setSelectedCategory(category.slug)}
            >
              <strong>
                <span
                  className="category-icon"
                  style={{ color: category.accentColor }}
                >
                  {category.icon}
                </span>
                {category.name}
              </strong>
              <span>{category.productCount} items</span>
            </button>
          ))}
        </div>
      </section>


      <section id="catalog" className="catalog-section">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Catalog explorer</p>
            <h2>Search the collection</h2>
          </div>
          <span className="status-chip">
            {isLoadingProducts
              ? 'Refreshing products'
              : `${productData?.total ?? 0} results`}
          </span>
        </div>

        <form className="catalog-toolbar panel-surface" onSubmit={handleSearchSubmit}>
          <label className="search-field">
            <span>Search products</span>
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Try desk, lighting, keyboard, or audio"
            />
          </label>

          <div className="catalog-toolbar-actions">
            <button className="secondary-button" type="submit">
              Apply search
            </button>
            {committedSearch ? (
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setSearchDraft('');
                  setCommittedSearch('');
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
        </form>

        {error ? <div className="thread-banner error">{error}</div> : null}

        <div className="product-grid">
          {isLoadingProducts ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="product-skeleton panel-surface" />
            ))
          ) : (
            productData?.items.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={handleAddToCart}
              />
            ))
          )}
        </div>

        {productData && productData.items.length < productData.total && (
          <div className="infinite-scroll-trigger">
            <button 
              className="secondary-button" 
              disabled={isFetchingMore}
              onClick={() => setCurrentPage(prev => prev + 1)}
            >
              {isFetchingMore ? 'Loading more...' : 'Load more items'}
            </button>
          </div>
        )}

      </section>

      <section className="value-props-grid">
        {(homeData?.valueProps ?? []).map((valueProp) => (
          <article key={valueProp.title} className="panel-surface value-prop-card">
            <p className="section-kicker">Best practice</p>
            <h3>{valueProp.title}</h3>
            <p>{valueProp.description}</p>
          </article>
        ))}
      </section>

      <section className="testimonials-section panel-surface">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Proof</p>
            <h2>Why this architecture feels real</h2>
          </div>
        </div>

        <div className="testimonial-grid">
          {(homeData?.testimonials ?? []).map((testimonial) => (
            <article key={testimonial.customer} className="testimonial-card">
              <p>“{testimonial.quote}”</p>
              <div>
                <strong>{testimonial.customer}</strong>
                <span>{testimonial.role}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="ai-cta-banner panel-surface">
        <div>
          <p className="section-kicker">Built into the same platform</p>
          <h2>Need a second opinion on your setup?</h2>
          <p>
            Jump into the `/chat` route and ask your local Ollama model to compare
            products, explain tradeoffs, or generate developer setup advice.
          </p>
        </div>

        <Link className="primary-button" to="/chat">
          Open AI concierge
        </Link>
      </section>

      {isLoadingHome ? <div className="loading-hint">Loading storefront content…</div> : null}
    </div>
  );
}
