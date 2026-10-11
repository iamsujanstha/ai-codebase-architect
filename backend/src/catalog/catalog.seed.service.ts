import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class CatalogSeedService implements OnModuleInit {
  private readonly logger = new Logger(CatalogSeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      const count = await this.prisma.products.count();
      this.logger.log(
        `PostgreSQL catalog verified. Active products count: ${count}`,
      );
    } catch (err: any) {
      this.logger.warn(`Could not verify PostgreSQL catalog: ${err?.message}`);
    }
  }
}
