import { useEffect, useState } from 'react';
import { fetchCatalogProducts } from '@/core/api/catalogApi';
import type { CatalogProduct } from '@/core/types/catalog';
import { useCart } from '@/features/store/CartContext';
import { useWishlist } from '@/shared/hooks/useWishlist';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { CategoryStrip, DEFAULT_CATEGORIES } from './components/CategoryStrip';
import { SortButton, type SortOption } from './components/SortButton';
import { ProductGrid } from './components/ProductGrid';
import { CatalogErrorBanner } from './components/CatalogErrorBanner';
import { ConciergeLauncher } from '@/features/chat/components/ConciergeLauncher';

// Demo products matching atlas-app.html data structure
const DEMO_PRODUCTS: CatalogProduct[] = [
  {
    id: '1',
    slug: 'walnut-standing-desk',
    name: 'Walnut standing desk',
    subtitle: 'Electric, 160 × 80 cm',
    shortDescription: 'Electric, 160 × 80 cm',
    description: 'Premium electric standing desk',
    price: 649,
    compareAtPrice: null,
    currency: 'USD',
    rating: 4.9,
    reviewCount: 212,
    inventoryCount: 50,
    categorySlug: 'desk',
    categoryName: 'Desks',
    tags: [],
    keyHighlights: [],
    heroBadge: 'Premium Build',
    featured: true,
    bestSeller: true,
    newArrival: false,
    visual: { gradientFrom: '#f6d9b8', gradientTo: '#e8b98a', accent: '#d4a574', glyph: '🪑' },
    specs: [],
  },
  {
    id: '2',
    slug: 'halo-monitor-light',
    name: 'Halo monitor light bar',
    subtitle: 'Auto-dimming, USB-C',
    shortDescription: 'Auto-dimming, USB-C',
    description: 'Monitor light with auto-dimming',
    price: 69,
    compareAtPrice: null,
    currency: 'USD',
    rating: 4.8,
    reviewCount: 540,
    inventoryCount: 100,
    categorySlug: 'lighting',
    categoryName: 'Lighting',
    tags: [],
    keyHighlights: [],
    heroBadge: 'Best Value',
    featured: true,
    bestSeller: true,
    newArrival: false,
    visual: { gradientFrom: '#fff1b8', gradientTo: '#ffd36b', accent: '#ffcd4a', glyph: '💡' },
    specs: [],
  },
  {
    id: '3',
    slug: 'mechanical-keyboard',
    name: 'Low-profile mechanical keyboard',
    subtitle: '75%, hot-swap, tactile',
    shortDescription: '75%, hot-swap, tactile',
    description: 'Compact mechanical keyboard',
    price: 129,
    compareAtPrice: null,
    currency: 'USD',
    rating: 4.7,
    reviewCount: 388,
    inventoryCount: 30,
    categorySlug: 'keyboard',
    categoryName: 'Keyboards',
    tags: [],
    keyHighlights: [],
    heroBadge: 'Editor\'s Pick',
    featured: true,
    bestSeller: false,
    newArrival: true,
    visual: { gradientFrom: '#d6e4ff', gradientTo: '#a9c2ff', accent: '#8daeff', glyph: '⌨️' },
    specs: [],
  },
  {
    id: '4',
    slug: 'studio-headphones',
    name: 'Studio headphones',
    subtitle: 'Closed-back, wired + BT',
    shortDescription: 'Closed-back, wired + BT',
    description: 'Professional studio headphones',
    price: 249,
    compareAtPrice: null,
    currency: 'USD',
    rating: 4.8,
    reviewCount: 301,
    inventoryCount: 45,
    categorySlug: 'audio',
    categoryName: 'Audio',
    tags: [],
    keyHighlights: [],
    heroBadge: 'Pro Audio',
    featured: true,
    bestSeller: true,
    newArrival: false,
    visual: { gradientFrom: '#ffd6e0', gradientTo: '#ff9fb6', accent: '#ff8aa3', glyph: '🎧' },
    specs: [],
  },
  {
    id: '5',
    slug: 'ultrawide-display',
    name: '34" ultrawide display',
    subtitle: 'UWQHD, 144 Hz',
    shortDescription: 'UWQHD, 144 Hz',
    description: 'Ultra-wide gaming display',
    price: 499,
    compareAtPrice: null,
    currency: 'USD',
    rating: 4.6,
    reviewCount: 157,
    inventoryCount: 20,
    categorySlug: 'display',
    categoryName: 'Displays',
    tags: [],
    keyHighlights: [],
    heroBadge: 'High Refresh',
    featured: true,
    bestSeller: false,
    newArrival: false,
    visual: { gradientFrom: '#d4f1e4', gradientTo: '#9fdcc0', accent: '#7dd4ad', glyph: '🖥️' },
    specs: [],
  },
  {
    id: '6',
    slug: 'felt-desk-mat',
    name: 'Felt desk mat',
    subtitle: '90 × 40 cm, anti-slip',
    shortDescription: '90 × 40 cm, anti-slip',
    description: 'Premium felt desk mat',
    price: 39,
    compareAtPrice: null,
    currency: 'USD',
    rating: 4.5,
    reviewCount: 622,
    inventoryCount: 200,
    categorySlug: 'accessory',
    categoryName: 'Accessories',
    tags: [],
    keyHighlights: [],
    heroBadge: 'Essentials',
    featured: false,
    bestSeller: false,
    newArrival: false,
    visual: { gradientFrom: '#e6ddf7', gradientTo: '#c7b4ee', accent: '#b49eeb', glyph: '🧰' },
    specs: [],
  },
  {
    id: '7',
    slug: 'monitor-arm',
    name: 'Dual monitor arm',
    subtitle: 'Gas spring, up to 9 kg',
    shortDescription: 'Gas spring, up to 9 kg',
    description: 'Dual monitor gas spring arm',
    price: 119,
    compareAtPrice: null,
    currency: 'USD',
    rating: 4.7,
    reviewCount: 274,
    inventoryCount: 35,
    categorySlug: 'desk',
    categoryName: 'Desks',
    tags: [],
    keyHighlights: [],
    heroBadge: 'Ergonomic',
    featured: false,
    bestSeller: false,
    newArrival: false,
    visual: { gradientFrom: '#dfe7ea', gradientTo: '#b5c6cc', accent: '#9fb5bd', glyph: '🦾' },
    specs: [],
  },
  {
    id: '8',
    slug: 'task-lamp',
    name: 'Warm task lamp',
    subtitle: 'Dimmable, 2700–5000K',
    shortDescription: 'Dimmable, 2700–5000K',
    description: 'Adjustable task lamp',
    price: 54,
    compareAtPrice: null,
    currency: 'USD',
    rating: 4.6,
    reviewCount: 198,
    inventoryCount: 80,
    categorySlug: 'lighting',
    categoryName: 'Lighting',
    tags: [],
    keyHighlights: [],
    heroBadge: 'Adjustable',
    featured: false,
    bestSeller: false,
    newArrival: false,
    visual: { gradientFrom: '#ffe5c4', gradientTo: '#ffc58a', accent: '#ffb870', glyph: '🔦' },
    specs: [],
  },
  {
    id: '9',
    slug: 'usb-c-dock',
    name: 'USB-C dock',
    subtitle: '8-in-1, 100W pass-through',
    shortDescription: '8-in-1, 100W pass-through',
    description: 'Multi-port USB-C dock',
    price: 89,
    compareAtPrice: null,
    currency: 'USD',
    rating: 4.5,
    reviewCount: 419,
    inventoryCount: 120,
    categorySlug: 'accessory',
    categoryName: 'Accessories',
    tags: [],
    keyHighlights: [],
    heroBadge: 'Connectivity',
    featured: false,
    bestSeller: false,
    newArrival: true,
    visual: { gradientFrom: '#d9eef7', gradientTo: '#a6d6ea', accent: '#8bcee6', glyph: '🔌' },
    specs: [],
  },
  {
    id: '10',
    slug: 'bookshelf-speakers',
    name: 'Bookshelf speakers',
    subtitle: 'Powered, 60W RMS',
    shortDescription: 'Powered, 60W RMS',
    description: 'Powered bookshelf speakers',
    price: 199,
    compareAtPrice: null,
    currency: 'USD',
    rating: 4.8,
    reviewCount: 143,
    inventoryCount: 25,
    categorySlug: 'audio',
    categoryName: 'Audio',
    tags: [],
    keyHighlights: [],
    heroBadge: 'Audiophile',
    featured: false,
    bestSeller: true,
    newArrival: false,
    visual: { gradientFrom: '#fde0d3', gradientTo: '#f7b79b', accent: '#f5a785', glyph: '🔊' },
    specs: [],
  },
];

/**
 * StorefrontPage - Main shop page matching atlas-app.html design.
 */
export function StorefrontPage(): JSX.Element {
  const { addItem } = useCart();
  const { wishlist, toggleWishlist } = useWishlist();
  const { showToast } = useToastContext();

  // State
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortOption, setSortOption] = useState<SortOption>('featured');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<CatalogProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Load products
  useEffect(() => {
    let isMounted = true;

    async function loadProducts() {
      setIsLoading(true);
      setHasError(false);

      try {
        const response = await fetchCatalogProducts({ limit: 100 });
        
        if (isMounted) {
          setProducts(response.items);
        }
      } catch (error) {
        if (isMounted) {
          // Show error but use demo data
          setHasError(true);
          console.warn('Failed to load catalog, using demo data:', error);
          setProducts(DEMO_PRODUCTS);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  // Filter and sort products
  useEffect(() => {
    let result = [...products];

    // Filter by category
    if (selectedCategory !== 'all') {
      result = result.filter((p) => p.categorySlug === selectedCategory);
    }

    // Filter by search query (from URL params or header search)
    const urlParams = new URLSearchParams(window.location.search);
    const searchFromUrl = urlParams.get('q') || '';
    
    if (searchFromUrl) {
      const query = searchFromUrl.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.shortDescription?.toLowerCase().includes(query) ||
          p.subtitle?.toLowerCase().includes(query) ||
          p.categoryName?.toLowerCase().includes(query)
      );
    }

    // Sort
    switch (sortOption) {
      case 'price-asc':
        result.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        result.sort((a, b) => b.price - a.price);
        break;
      case 'rating':
        result.sort((a, b) => b.rating - a.rating);
        break;
      case 'featured':
      default:
        // Keep original order (featured first)
        break;
    }

    setFilteredProducts(result);
  }, [products, selectedCategory, sortOption]);

  const handleAddToCart = (product: CatalogProduct) => {
    addItem(product);
    showToast('Added to cart');
  };

  const handleRetry = () => {
    window.location.reload();
  };

  const handleOpenConcierge = () => {
    // TODO: Wire to concierge panel in step 5
    console.log('Opening AI concierge...');
  };

  // Get category name for title
  const categoryName = selectedCategory === 'all'
    ? 'All products'
    : DEFAULT_CATEGORIES.find((c) => c.id === selectedCategory)?.name || 'Products';

  const displayTitle = categoryName;

  return (
    <>
      <main className="wrap">
        <section>
          {/* Error banner */}
          {hasError && <CatalogErrorBanner onRetry={handleRetry} />}

          {/* Category strip and sort button */}
          <div className="cats">
            <CategoryStrip
              categories={DEFAULT_CATEGORIES}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
            />
            <SortButton currentSort={sortOption} onSortChange={setSortOption} />
          </div>

          {/* Page heading */}
          <div className="head">
            <h1>{displayTitle}</h1>
            <span>{filteredProducts.length} products</span>
          </div>

          {/* Product grid */}
          <ProductGrid
            products={filteredProducts}
            isLoading={isLoading}
            wishlist={wishlist}
            onAddToCart={handleAddToCart}
            onToggleWishlist={toggleWishlist}
            onAskAI={handleOpenConcierge}
          />
        </section>
      </main>

      {/* Floating AI concierge button */}
      <ConciergeLauncher onClick={handleOpenConcierge} />
    </>
  );
}
