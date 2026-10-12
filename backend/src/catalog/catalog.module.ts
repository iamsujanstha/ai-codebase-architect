import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CatalogController } from './catalog.controller';
import { CatalogSeedService } from './catalog.seed.service';
import { CatalogService } from './catalog.service';
import { CATALOG_REPOSITORY_TOKEN } from './repositories/catalog.repository.interface';
import { PostgresCatalogRepository } from './repositories/postgres-catalog.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [CatalogController],
  providers: [
    CatalogService,
    CatalogSeedService,
    PostgresCatalogRepository,
    {
      provide: CATALOG_REPOSITORY_TOKEN,
      useClass: PostgresCatalogRepository,
    },
  ],
  exports: [
    CatalogService,
    CATALOG_REPOSITORY_TOKEN,
    PostgresCatalogRepository,
  ],
})
export class CatalogModule {}
