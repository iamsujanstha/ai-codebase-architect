import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  STOREFRONT_ANNOUNCEMENT,
  STOREFRONT_HERO,
  STOREFRONT_TESTIMONIALS,
  STOREFRONT_VALUE_PROPS,
} from './data/catalog-seed.data';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { CatalogCategory } from './interfaces/catalog-category.interface';
import { CatalogHomeResponse } from './interfaces/catalog-home-response.interface';
import { CatalogProductDetailResponse } from './interfaces/catalog-product-detail-response.interface';
import { CatalogProduct } from './interfaces/catalog-product.interface';
import { CatalogProductsResponse } from './interfaces/catalog-products-response.interface';
import {
  CATALOG_REPOSITORY_TOKEN,
  CategoryCountRow,
  ICatalogRepository,
  ProductRow,
} from './repositories/catalog.repository.interface';

@Injectable()
export class CatalogService {
  constructor(
    @Inject(CATALOG_REPOSITORY_TOKEN)
    private readonly catalogRepo: ICatalogRepository,
  ) {}

  async getHomePage(): Promise<CatalogHomeResponse> {
    const [catGroups, featuredRows, newArrivalRows, allRows] =
      await Promise.all([
        this.catalogRepo.getCategoryCounts(),
        this.catalogRepo.findFeatured(4),
        this.catalogRepo.findNewArrivals(4),
        this.catalogRepo.findCatalogProducts(8),
      ]);

    return {
      announcement: STOREFRONT_ANNOUNCEMENT,
      hero: STOREFRONT_HERO,
      categories: catGroups.map((g) => this.mapPostgresCategory(g)),
      featuredProducts: featuredRows.map((r) => this.mapPostgresProduct(r)),
      newArrivals: newArrivalRows.map((r) => this.mapPostgresProduct(r)),
      catalogProducts: allRows.map((r) => this.mapPostgresProduct(r)),
      valueProps: STOREFRONT_VALUE_PROPS,
      testimonials: STOREFRONT_TESTIMONIALS,
    };
  }

  async listCategories(): Promise<CatalogCategory[]> {
    const groups = await this.catalogRepo.getCategoryCounts();
    return groups.map((g) => this.mapPostgresCategory(g));
  }

  async listProducts(
    query: ListProductsQueryDto,
  ): Promise<CatalogProductsResponse> {
    const limit = query.limit ?? 24;
    const skip = query.skip ?? 0;

    const { products, total } = await this.catalogRepo.findPaginated({
      category: query.category,
      featured: query.featured,
      search: query.search,
      limit,
      skip,
    });

    return {
      items: products.map((r) => this.mapPostgresProduct(r)),
      total,
      appliedFilters: {
        category: query.category,
        search: query.search,
        featured: query.featured,
        skip: query.skip,
      },
    };
  }

  async getProductBySlug(slug: string): Promise<CatalogProductDetailResponse> {
    const product = await this.catalogRepo.findBySlugOrId(slug);

    if (!product) {
      throw new NotFoundException(`Product with identifier "${slug}" was not found.`);
    }

    const relatedRows = await this.catalogRepo.findRelated(product.category, product.id, 3);

    return {
      product: this.mapPostgresProduct(product),
      relatedProducts: relatedRows.map((r) => this.mapPostgresProduct(r)),
    };
  }

  async createProduct(createProductDto: any): Promise<CatalogProduct> {
    const price = Number(createProductDto.price) || 0;
    const stock = Number(createProductDto.inventoryCount) || 10;

    const created = await this.catalogRepo.create({
      name: createProductDto.name,
      category: createProductDto.categoryName || createProductDto.category || 'General',
      price,
      stock,
      description: createProductDto.description || createProductDto.shortDescription || '',
      featured: Boolean(createProductDto.featured),
    });

    return this.mapPostgresProduct(created);
  }

  async seedProducts(count: number = 4): Promise<CatalogProduct[]> {
    const products: CatalogProduct[] = [];
    const categories = await this.listCategories();
    if (categories.length === 0) return [];

    const adjectives = ['Ultra', 'Smart', 'Elite', 'Pro', 'NextGen', 'Cloud', 'Hyper'];
    const nouns = ['Monitor', 'Keyboard', 'CPU', 'Controller', 'Node', 'Gateway', 'Interface'];

    for (let i = 0; i < count; i++) {
      const category = categories[Math.floor(Math.random() * categories.length)];
      const name = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]} ${Math.floor(Math.random() * 900) + 100}`;

      const productData = {
        name,
        categoryName: category.name,
        shortDescription: `The ultimate tool for your ${category.name.toLowerCase()} workflow.`,
        price: Math.floor(Math.random() * 800) + 99,
        inventoryCount: 50,
        featured: true,
      };

      products.push(await this.createProduct(productData));
    }

    return products;
  }

  private mapPostgresCategory(row: CategoryCountRow): CatalogCategory {
    const cat = row.category || 'General';
    const slug = cat.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const glyphMap: Record<string, string> = {
      Electronics: '💻',
      Furniture: '🪑',
      Accessories: '🧰',
      Lighting: '💡',
      Audio: '🎧',
      Desks: '🪑',
    };
    return {
      id: slug,
      slug,
      name: cat,
      description: `Browse ${cat} queried directly from PostgreSQL via Repository`,
      accentColor: '#00e599',
      icon: glyphMap[cat] || '📦',
      featuredCopy: `Curated ${cat} collection in PostgreSQL`,
      productCount: row.count || 0,
    };
  }

  private mapPostgresProduct(row: ProductRow): CatalogProduct {
    const slug = (row.name || `product-${row.id}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const categorySlug = (row.category || 'general')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    const price = Number(row.price) || 0;

    const glyphMap: Record<string, string> = {
      Electronics: '💻',
      Furniture: '🪑',
      Accessories: '🧰',
      Lighting: '💡',
      Audio: '🎧',
      Desks: '🪑',
    };
    const glyph = glyphMap[row.category] || '📦';

    return {
      id: String(row.id),
      slug,
      name: row.name,
      subtitle: `${row.category} • PostgreSQL Repository`,
      shortDescription: row.description || '',
      description: row.description || '',
      price,
      compareAtPrice: Math.round(price * 1.15),
      currency: 'USD',
      rating: 4.8 + (row.id % 3) * 0.1,
      reviewCount: 30 + ((row.id * 11) % 180),
      inventoryCount: row.stock ?? 50,
      categorySlug,
      categoryName: row.category,
      tags: [
        row.category ? row.category.toLowerCase() : 'gear',
        'repository',
        'postgresql',
        'sql',
      ],
      keyHighlights: [
        `Live query directly from Neon PostgreSQL via PostgresCatalogRepository (ID: ${row.id})`,
        `Category: ${row.category}`,
        `Current inventory: ${row.stock} units`,
      ],
      heroBadge: row.featured ? 'Featured' : 'In Stock',
      featured: Boolean(row.featured),
      bestSeller: row.id % 2 === 0,
      newArrival: row.id % 3 === 0,
      visual: {
        gradientFrom: '#00e599',
        gradientTo: '#003322',
        accent: '#00e599',
        glyph,
      },
      specs: [
        { label: 'Persistence', value: 'PostgresCatalogRepository' },
        { label: 'Database', value: 'Neon PostgreSQL (v16)' },
        { label: 'Stock Available', value: `${row.stock} units` },
      ],
    };
  }
}
