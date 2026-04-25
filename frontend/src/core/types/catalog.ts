// Storefront contract types mirror the backend catalog responses.
// Keeping them centralized gives the commerce UI the same kind of safety
// that the chat route already gets from typed AI contracts.

export interface CatalogCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  accentColor: string;
  icon: string;
  featuredCopy: string;
  productCount: number;
}

export interface CatalogProductVisual {
  gradientFrom: string;
  gradientTo: string;
  accent: string;
  glyph: string;
}

export interface CatalogProductSpec {
  label: string;
  value: string;
}

export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  shortDescription: string;
  description: string;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  rating: number;
  reviewCount: number;
  inventoryCount: number;
  categorySlug: string;
  categoryName: string;
  tags: string[];
  keyHighlights: string[];
  heroBadge: string;
  featured: boolean;
  bestSeller: boolean;
  newArrival: boolean;
  visual: CatalogProductVisual;
  specs: CatalogProductSpec[];
}

export interface CatalogHeroStat {
  label: string;
  value: string;
}

export interface CatalogHero {
  eyebrow: string;
  title: string;
  description: string;
  primaryCtaLabel: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaHref: string;
  stats: CatalogHeroStat[];
}

export interface CatalogValueProp {
  title: string;
  description: string;
}

export interface CatalogTestimonial {
  customer: string;
  role: string;
  quote: string;
}

export interface CatalogHomeResponse {
  announcement: string;
  hero: CatalogHero;
  categories: CatalogCategory[];
  featuredProducts: CatalogProduct[];
  newArrivals: CatalogProduct[];
  catalogProducts: CatalogProduct[];
  valueProps: CatalogValueProp[];
  testimonials: CatalogTestimonial[];
}

export interface CatalogProductsResponse {
  items: CatalogProduct[];
  total: number;
  appliedFilters: {
    category?: string;
    search?: string;
    featured?: boolean;
  };
}

export interface CatalogProductDetailResponse {
  product: CatalogProduct;
  relatedProducts: CatalogProduct[];
}

export interface CartLineItem {
  productId: string;
  slug: string;
  name: string;
  subtitle: string;
  price: number;
  currency: string;
  quantity: number;
  heroBadge: string;
  visual: CatalogProductVisual;
}
