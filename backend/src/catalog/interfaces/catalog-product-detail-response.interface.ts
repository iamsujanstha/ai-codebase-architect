import { CatalogProduct } from './catalog-product.interface';

export interface CatalogProductDetailResponse {
  product: CatalogProduct;
  relatedProducts: CatalogProduct[];
}
