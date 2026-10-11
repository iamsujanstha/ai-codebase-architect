import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
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

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async getHomePage(): Promise<CatalogHomeResponse> {
    const [catGroups, featuredRows, newArrivalRows, allRows] =
      await Promise.all([
        this.prisma.products.groupBy({
          by: ['category'],
          _count: { id: true },
          where: { deleted_at: null },
          orderBy: { _count: { id: 'desc' } },
        }),
        this.prisma.products.findMany({
          where: { featured: true, deleted_at: null },
          orderBy: { price: 'desc' },
          take: 4,
        }),
        this.prisma.products.findMany({
          where: { deleted_at: null },
          orderBy: { created_at: 'desc' },
          take: 4,
        }),
        this.prisma.products.findMany({
          where: { deleted_at: null },
          orderBy: { id: 'asc' },
          take: 8,
        }),
      ]);

    return {
      announcement:
        '🚀 Powered by Neon Serverless PostgreSQL with Prisma ORM',
      hero: STOREFRONT_HERO,
      categories: catGroups.map((g) =>
        this.mapPostgresCategory({ category: g.category, count: g._count.id }),
      ),
      featuredProducts: featuredRows.map((r) => this.mapPostgresProduct(r)),
      newArrivals: newArrivalRows.map((r) => this.mapPostgresProduct(r)),
      catalogProducts: allRows.map((r) => this.mapPostgresProduct(r)),
      valueProps: STOREFRONT_VALUE_PROPS,
      testimonials: STOREFRONT_TESTIMONIALS,
    };
  }

  async listCategories(): Promise<CatalogCategory[]> {
    const groups = await this.prisma.products.groupBy({
      by: ['category'],
      _count: { id: true },
      where: { deleted_at: null },
      orderBy: { _count: { id: 'desc' } },
    });

    return groups.map((g) =>
      this.mapPostgresCategory({ category: g.category, count: g._count.id }),
    );
  }

  async listProducts(
    query: ListProductsQueryDto,
  ): Promise<CatalogProductsResponse> {
    const where: any = {
      deleted_at: null,
      status: { not: 'draft' },
    };

    if (query.category && query.category !== 'all') {
      where.category = { equals: query.category, mode: 'insensitive' };
    }

    if (query.featured !== undefined) {
      where.featured = query.featured;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { category: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const limit = query.limit ?? 24;
    const skip = query.skip ?? 0;

    const [total, rows] = await Promise.all([
      this.prisma.products.count({ where }),
      this.prisma.products.findMany({
        where,
        orderBy: [{ featured: 'desc' }, { price: 'desc' }],
        skip,
        take: limit,
      }),
    ]);

    return {
      items: rows.map((r) => this.mapPostgresProduct(r)),
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
    const numericId = parseInt(slug, 10);
    let row: any = null;

    if (!isNaN(numericId)) {
      row = await this.prisma.products.findFirst({
        where: { id: numericId, deleted_at: null },
      });
    }

    if (!row) {
      const normalizedSlug = slug.toLowerCase().replace(/-/g, ' ');
      row = await this.prisma.products.findFirst({
        where: {
          name: { contains: normalizedSlug, mode: 'insensitive' },
          deleted_at: null,
        },
      });
    }

    if (!row) {
      throw new NotFoundException(`Product with slug "${slug}" was not found.`);
    }

    const relatedRows = await this.prisma.products.findMany({
      where: {
        category: row.category,
        id: { not: row.id },
        deleted_at: null,
      },
      take: 3,
    });

    return {
      product: this.mapPostgresProduct(row),
      relatedProducts: relatedRows.map((r) => this.mapPostgresProduct(r)),
    };
  }

  async createProduct(createProductDto: any): Promise<CatalogProduct> {
    const price = Number(createProductDto.price) || 0;
    const stock = Number(createProductDto.inventoryCount) || 10;

    const created = await this.prisma.products.create({
      data: {
        name: createProductDto.name,
        category: createProductDto.categoryName || createProductDto.category || 'General',
        price,
        stock,
        description: createProductDto.description || createProductDto.shortDescription || '',
        featured: Boolean(createProductDto.featured),
        status: 'active',
      },
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

  private mapPostgresCategory(row: { category: string; count: number }): CatalogCategory {
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
      description: `Browse ${cat} queried directly from PostgreSQL via Prisma`,
      accentColor: '#00e599',
      icon: glyphMap[cat] || '📦',
      featuredCopy: `Curated ${cat} collection in PostgreSQL`,
      productCount: row.count || 0,
    };
  }

  private mapPostgresProduct(row: any): CatalogProduct {
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
      subtitle: `${row.category} • PostgreSQL Prisma ORM`,
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
        'prisma',
        'postgresql',
        'sql',
      ],
      keyHighlights: [
        `Live query directly from Neon PostgreSQL via Prisma (ID: ${row.id})`,
        `Category: ${row.category}`,
        `Current inventory: ${row.stock} units`,
      ],
      heroBadge: row.featured ? 'Prisma ORM' : 'In Stock',
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
        { label: 'ORM', value: 'Prisma Client v6' },
        { label: 'Database', value: 'Neon PostgreSQL (v16)' },
        { label: 'Stock Available', value: `${row.stock} units` },
      ],
    };
  }
}
