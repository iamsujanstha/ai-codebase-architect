import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CATEGORY_SEED_DATA, PRODUCT_SEED_DATA } from './data/catalog-seed.data';
import { Category, CategoryDocument } from './schemas/category.schema';
import { Product, ProductDocument } from './schemas/product.schema';

// The seeder keeps the teaching project immediately useful after first boot.
// In production, this responsibility would often move to:
// - a dedicated migration job
// - an admin CMS
// - a merchandising backoffice
//
// For a learning repo, seeding on boot is a pragmatic on-ramp.
@Injectable()
export class CatalogSeedService implements OnModuleInit {
  private readonly logger = new Logger(CatalogSeedService.name);

  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    const shouldSeed = (process.env.STORE_SEED_ON_BOOT ?? 'true') === 'true';

    if (!shouldSeed) {
      this.logger.log('Catalog seed skipped because STORE_SEED_ON_BOOT=false.');
      return;
    }

    const existingProductCount = await this.productModel.estimatedDocumentCount();

    if (existingProductCount > 0) {
      this.logger.log('Catalog seed skipped because products already exist.');
      return;
    }

    await this.categoryModel.insertMany(CATEGORY_SEED_DATA);
    await this.productModel.insertMany(PRODUCT_SEED_DATA);

    this.logger.log(
      `Seeded ${CATEGORY_SEED_DATA.length} categories and ${PRODUCT_SEED_DATA.length} products.`,
    );
  }
}
