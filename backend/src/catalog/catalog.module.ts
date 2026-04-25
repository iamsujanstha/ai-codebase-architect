import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatalogController } from './catalog.controller';
import { CatalogSeedService } from './catalog.seed.service';
import { CatalogService } from './catalog.service';
import { Category, CategorySchema } from './schemas/category.schema';
import { Product, ProductSchema } from './schemas/product.schema';

// Feature modules are where NestJS starts to feel very production-friendly.
// The catalog module owns one coherent business capability:
// the ecommerce storefront data contract.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [CatalogController],
  providers: [CatalogService, CatalogSeedService],
  exports: [CatalogService],
})
export class CatalogModule {}
