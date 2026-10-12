export interface ProductRow {
  id: number;
  name: string;
  description?: string | null;
  price: number | string;
  category: string;
  stock: number;
  image_url?: string | null;
  featured: boolean;
  status?: string | null;
  sku?: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

export interface CategoryCountRow {
  category: string;
  count: number;
}

export interface ListProductsFilters {
  category?: string;
  featured?: boolean;
  search?: string;
  limit: number;
  skip: number;
}

export interface CreateProductParams {
  name: string;
  category: string;
  price: number;
  stock: number;
  description: string;
  featured: boolean;
}

export interface ICatalogRepository {
  getCategoryCounts(): Promise<CategoryCountRow[]>;
  findFeatured(limit: number): Promise<ProductRow[]>;
  findNewArrivals(limit: number): Promise<ProductRow[]>;
  findCatalogProducts(limit: number): Promise<ProductRow[]>;
  findPaginated(
    filters: ListProductsFilters,
  ): Promise<{ products: ProductRow[]; total: number }>;
  findBySlugOrId(identifier: string | number): Promise<ProductRow | null>;
  findById(id: number): Promise<ProductRow | null>;
  findRelated(
    category: string,
    excludeId: number,
    limit: number,
  ): Promise<ProductRow[]>;
  create(params: CreateProductParams): Promise<ProductRow>;
  searchSemantic(
    vector: number[],
    limit?: number,
    minScore?: number,
  ): Promise<Array<ProductRow & { score: number }>>;
  syncEmbeddings(
    items: Array<{ productId: number; vector: number[] }>,
  ): Promise<number>;
}

export const CATALOG_REPOSITORY_TOKEN = Symbol('ICatalogRepository');
