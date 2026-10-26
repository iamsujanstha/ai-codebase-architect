import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CATALOG_REPOSITORY_TOKEN,
  ICatalogRepository,
} from './repositories/catalog.repository.interface';

@Injectable()
export class CatalogSeedService implements OnModuleInit {
  private readonly logger = new Logger(CatalogSeedService.name);

  constructor(
    @Inject(CATALOG_REPOSITORY_TOKEN)
    private readonly catalogRepo: ICatalogRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const count = await this.catalogRepo.count();
      this.logger.log(
        `PostgreSQL catalog verified. Active products count: ${count}`,
      );
    } catch (err: any) {
      this.logger.warn(`Could not verify PostgreSQL catalog: ${err?.message}`);
    }
  }
}
