import { CatalogProduct } from './catalog-product.interface';

export interface CatalogProductsResponse {
  items: CatalogProduct[];
  total: number;
  appliedFilters: {
    category?: string;
    search?: string;
    featured?: boolean;
  };
}
