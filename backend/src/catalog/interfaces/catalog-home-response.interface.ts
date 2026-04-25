import { CatalogCategory } from './catalog-category.interface';
import { CatalogProduct } from './catalog-product.interface';

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
