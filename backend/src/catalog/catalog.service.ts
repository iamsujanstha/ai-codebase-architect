import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
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
import { Category, CategoryDocument } from './schemas/category.schema';
import { Product, ProductDocument } from './schemas/product.schema';
import { PostgresService } from '../database/postgres.service';

// This service is the business layer for the ecommerce catalog.
// Its job is to translate raw database rows/documents into frontend-friendly view models.
//
// Production reasoning:
// The browser should not be forced to understand database structure.
// Sourcing from Neon PostgreSQL when DATABASE_MODE !== 'mongodb-only'.
@Injectable()
export class CatalogService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly postgresService: PostgresService,
  ) {}

  private isPostgresActive(): boolean {
    const mode = process.env.DATABASE_MODE ?? 'postgres-only';
    return mode !== 'mongodb-only' && this.postgresService.isReady();
  }

  async getHomePage(): Promise<CatalogHomeResponse> {
    if (this.isPostgresActive()) {
      try {
        const [catRows, featRows, newRows, allRows] = await Promise.all([
          this.postgresService.query(
            'SELECT category, COUNT(*) as count FROM products GROUP BY category ORDER BY count DESC',
          ),
          this.postgresService.query(
            'SELECT * FROM products WHERE featured = true ORDER BY price DESC LIMIT 4',
          ),
          this.postgresService.query(
            'SELECT * FROM products ORDER BY created_at DESC LIMIT 4',
          ),
          this.postgresService.query(
            'SELECT * FROM products ORDER BY id ASC LIMIT 8',
          ),
        ]);

        return {
          announcement: '🚀 Powered by Neon Serverless PostgreSQL (Sub-millisecond Queries)',
          hero: STOREFRONT_HERO,
          categories: catRows.rows.map((r) => this.mapPostgresCategory(r)),
          featuredProducts: featRows.rows.map((r) => this.mapPostgresProduct(r)),
          newArrivals: newRows.rows.map((r) => this.mapPostgresProduct(r)),
          catalogProducts: allRows.rows.map((r) => this.mapPostgresProduct(r)),
          valueProps: STOREFRONT_VALUE_PROPS,
          testimonials: STOREFRONT_TESTIMONIALS,
        };
      } catch (err) {
        console.warn('PostgreSQL getHomePage failed, falling back to Mongo:', err);
      }
    }
    const [categories, featuredProducts, newArrivals, catalogProducts] =
      await Promise.all([
        this.categoryModel.find().sort({ sortOrder: 1, name: 1 }).lean(),
        this.productModel
          .find({ featured: true })
          .sort({ bestSeller: -1, rating: -1 })
          .limit(4)
          .lean(),
        this.productModel
          .find({ newArrival: true })
          .sort({ createdAt: -1, rating: -1 })
          .limit(4)
          .lean(),
        this.productModel
          .find()
          .sort({ featured: -1, bestSeller: -1, rating: -1, createdAt: -1 })
          .limit(8)
          .lean(),
      ]);

    const categoryCounts = await this.getCategoryCounts();

    return {
      announcement: STOREFRONT_ANNOUNCEMENT,
      hero: STOREFRONT_HERO,
      categories: categories.map((category) =>
        this.mapCategory(category, categoryCounts),
      ),
      featuredProducts: featuredProducts.map((product) => this.mapProduct(product)),
      newArrivals: newArrivals.map((product) => this.mapProduct(product)),
      catalogProducts: catalogProducts.map((product) => this.mapProduct(product)),
      valueProps: STOREFRONT_VALUE_PROPS,
      testimonials: STOREFRONT_TESTIMONIALS,
    };
  }

  async listCategories(): Promise<CatalogCategory[]> {
    if (this.isPostgresActive()) {
      try {
        const catRows = await this.postgresService.query(
          'SELECT category, COUNT(*) as count FROM products GROUP BY category ORDER BY count DESC',
        );
        return catRows.rows.map((r) => this.mapPostgresCategory(r));
      } catch (err) {
        console.warn('PostgreSQL listCategories failed, falling back to Mongo:', err);
      }
    }

    const [categories, categoryCounts] = await Promise.all([
      this.categoryModel.find().sort({ sortOrder: 1, name: 1 }).lean(),
      this.getCategoryCounts(),
    ]);

    return categories.map((category) => this.mapCategory(category, categoryCounts));
  }

  async listProducts(
    query: ListProductsQueryDto,
  ): Promise<CatalogProductsResponse> {
    if (this.isPostgresActive()) {
      try {
        const conditions: string[] = ['1=1'];
        const params: any[] = [];
        let paramIdx = 1;

        if (query.category && query.category !== 'all') {
          conditions.push(`LOWER(category) = LOWER($${paramIdx++})`);
          params.push(query.category);
        }

        if (query.featured !== undefined) {
          conditions.push(`featured = $${paramIdx++}`);
          params.push(query.featured);
        }

        if (query.search) {
          conditions.push(`(name ILIKE $${paramIdx} OR description ILIKE $${paramIdx} OR category ILIKE $${paramIdx})`);
          params.push(`%${query.search}%`);
          paramIdx++;
        }

        const whereClause = conditions.join(' AND ');
        const limit = query.limit ?? 24;
        const skip = query.skip ?? 0;

        const countRes = await this.postgresService.query(
          `SELECT COUNT(*) FROM products WHERE ${whereClause}`,
          params,
        );
        const total = parseInt(countRes.rows[0].count, 10);

        const dataRes = await this.postgresService.query(
          `SELECT * FROM products WHERE ${whereClause} ORDER BY featured DESC, price DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
          [...params, limit, skip],
        );

        return {
          items: dataRes.rows.map((r) => this.mapPostgresProduct(r)),
          total,
          appliedFilters: {
            category: query.category,
            search: query.search,
            featured: query.featured,
            skip: query.skip,
          },
        };
      } catch (err) {
        console.warn('PostgreSQL listProducts failed, falling back to Mongo:', err);
      }
    }

    const filter = this.buildProductFilter(query);
    const limit = query.limit ?? 24;
    const skip = query.skip ?? 0;

    const [items, total] = await Promise.all([
      this.productModel
        .find(filter)
        .sort({ featured: -1, bestSeller: -1, rating: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      this.productModel.countDocuments(filter),
    ]);

    return {
      items: items.map((product) => this.mapProduct(product)),
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
    if (this.isPostgresActive()) {
      try {
        let productRes = await this.postgresService.query(
          `SELECT * FROM products WHERE LOWER(REPLACE(name, ' ', '-')) = LOWER($1) OR id::text = $1 LIMIT 1`,
          [slug],
        );

        if (productRes.rows.length === 0) {
          const slugPattern = `%${slug.replace(/-/g, ' ')}%`;
          productRes = await this.postgresService.query(
            `SELECT * FROM products WHERE name ILIKE $1 LIMIT 1`,
            [slugPattern],
          );
        }

        if (productRes.rows.length > 0) {
          const row = productRes.rows[0];
          const relatedRes = await this.postgresService.query(
            `SELECT * FROM products WHERE category = $1 AND id != $2 LIMIT 3`,
            [row.category, row.id],
          );

          return {
            product: this.mapPostgresProduct(row),
            relatedProducts: relatedRes.rows.map((r) => this.mapPostgresProduct(r)),
          };
        }
      } catch (err) {
        console.warn('PostgreSQL getProductBySlug failed, falling back to Mongo:', err);
      }
    }

    const product = await this.productModel.findOne({ slug }).lean();

    if (!product) {
      throw new NotFoundException(`Product with slug "${slug}" was not found.`);
    }

    const relatedProducts = await this.productModel
      .find({
        categorySlug: product.categorySlug,
        slug: { $ne: product.slug },
      })
      .sort({ featured: -1, rating: -1 })
      .limit(3)
      .lean();

    return {
      product: this.mapProduct(product),
      relatedProducts: relatedProducts.map((item) => this.mapProduct(item)),
    };
  }

  async createProduct(createProductDto: any): Promise<CatalogProduct> {
    const slug = createProductDto.name
      .toLowerCase()
      .replace(/ /g, '-')
      .replace(/[^\w-]+/g, '');

    const newProduct = new this.productModel({
      ...createProductDto,
      slug,
      rating: createProductDto.rating ?? 5,
      reviewCount: createProductDto.reviewCount ?? 0,
      inventoryCount: createProductDto.inventoryCount ?? 10,
      featured: createProductDto.featured ?? true,
      bestSeller: createProductDto.bestSeller ?? false,
      newArrival: createProductDto.newArrival ?? true,
      tags: createProductDto.tags ?? [],
      keyHighlights: createProductDto.keyHighlights ?? [],
      specs: createProductDto.specs ?? [],
    });

    const savedProduct = await newProduct.save();
    return this.mapProduct(savedProduct);
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
        subtitle: `Performance optimized ${category.name}`,
        shortDescription: `The ultimate tool for your ${category.name.toLowerCase()} workflow.`,
        description: `Experience unparalleled efficiency with the ${name}. Engineered for professionals who demand the best in ${category.name.toLowerCase()} technology.`,
        price: Math.floor(Math.random() * 800) + 99,
        categorySlug: category.slug,
        categoryName: category.name,
        heroBadge: 'New Release',
        visual: {
          gradientFrom: '#3b82f6',
          gradientTo: '#8b5cf6',
          accent: '#3b82f6',
          glyph: nouns[Math.floor(Math.random() * nouns.length)].toLowerCase(),
        }
      };

      products.push(await this.createProduct(productData));
    }

    return products;
  }

  private buildProductFilter(
    query: ListProductsQueryDto,
  ): FilterQuery<ProductDocument> {
    const filter: FilterQuery<ProductDocument> = {};

    if (query.category) {
      filter.categorySlug = query.category;
    }

    if (query.featured !== undefined) {
      filter.featured = query.featured;
    }

    if (query.search) {
      const safeSearch = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { subtitle: { $regex: safeSearch, $options: 'i' } },
        { tags: { $elemMatch: { $regex: safeSearch, $options: 'i' } } },
      ];
    }

    return filter;
  }

  private async getCategoryCounts(): Promise<Record<string, number>> {
    const counts = await this.productModel.aggregate<{
      _id: string;
      total: number;
    }>([
      {
        $group: {
          _id: '$categorySlug',
          total: { $sum: 1 },
        },
      },
    ]);

    return counts.reduce<Record<string, number>>((accumulator, entry) => {
      accumulator[entry._id] = entry.total;
      return accumulator;
    }, {});
  }

  private mapCategory(
    category: CategoryDocument | Category,
    categoryCounts: Record<string, number>,
  ): CatalogCategory {
    return {
      id: String('_id' in category ? category._id : category.slug),
      slug: category.slug,
      name: category.name,
      description: category.description,
      accentColor: category.accentColor,
      icon: category.icon,
      featuredCopy: category.featuredCopy,
      productCount: categoryCounts[category.slug] ?? 0,
    };
  }

  private mapProduct(product: ProductDocument | Product): CatalogProduct {
    return {
      id: String('_id' in product ? product._id : product.slug),
      slug: product.slug,
      name: product.name,
      subtitle: product.subtitle,
      shortDescription: product.shortDescription,
      description: product.description,
      price: product.price,
      compareAtPrice: product.compareAtPrice ?? null,
      currency: product.currency,
      rating: product.rating,
      reviewCount: product.reviewCount,
      inventoryCount: product.inventoryCount,
      categorySlug: product.categorySlug,
      categoryName: product.categoryName,
      tags: [...product.tags],
      keyHighlights: [...product.keyHighlights],
      heroBadge: product.heroBadge,
      featured: product.featured,
      bestSeller: product.bestSeller,
      newArrival: product.newArrival,
      visual: {
        gradientFrom: product.visual.gradientFrom,
        gradientTo: product.visual.gradientTo,
        accent: product.visual.accent,
        glyph: product.visual.glyph,
      },
      specs: product.specs.map((spec) => ({
        label: spec.label,
        value: spec.value,
      })),
    };
  }

  private mapPostgresCategory(row: any): CatalogCategory {
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
      description: `Browse ${cat} queried directly from Neon PostgreSQL`,
      accentColor: '#00e599',
      icon: glyphMap[cat] || '📦',
      featuredCopy: `Curated ${cat} collection in Neon`,
      productCount: parseInt(row.count, 10) || 0,
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
      subtitle: `${row.category} • Neon Serverless SQL`,
      shortDescription: row.description || '',
      description: row.description || '',
      price,
      compareAtPrice: Math.round(price * 1.15),
      currency: 'USD',
      rating: 4.8 + ((row.id % 3) * 0.1),
      reviewCount: 30 + (row.id * 11) % 180,
      inventoryCount: row.stock ?? 50,
      categorySlug,
      categoryName: row.category,
      tags: [row.category ? row.category.toLowerCase() : 'gear', 'neon', 'postgresql', 'sql'],
      keyHighlights: [
        `Live query directly from Neon PostgreSQL (ID: ${row.id})`,
        `Category: ${row.category}`,
        `Current inventory: ${row.stock} units`,
      ],
      heroBadge: row.featured ? 'Neon SQL' : 'In Stock',
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
        { label: 'Database Engine', value: 'Neon PostgreSQL (v16)' },
        { label: 'Source', value: 'PostgreSQL table "products"' },
        { label: 'Stock Available', value: `${row.stock} units` },
      ],
    };
  }
}

