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
