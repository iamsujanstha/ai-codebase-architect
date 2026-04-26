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

// This service is the business layer for the ecommerce catalog.
// Its job is to translate raw Mongo documents into frontend-friendly view models.
//
// Production reasoning:
// The browser should not be forced to understand database structure.
// The service is where we shape the "commerce contract" that the UI can rely on.
@Injectable()
export class CatalogService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  async getHomePage(): Promise<CatalogHomeResponse> {
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
    const [categories, categoryCounts] = await Promise.all([
      this.categoryModel.find().sort({ sortOrder: 1, name: 1 }).lean(),
      this.getCategoryCounts(),
    ]);

    return categories.map((category) => this.mapCategory(category, categoryCounts));
  }

  async listProducts(
    query: ListProductsQueryDto,
  ): Promise<CatalogProductsResponse> {
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
      rating: 5,
      reviewCount: 0,
      inventoryCount: 10,
      featured: true,
      bestSeller: false,
      newArrival: true,
    });

    const savedProduct = await newProduct.save();
    return this.mapProduct(savedProduct);
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
}
