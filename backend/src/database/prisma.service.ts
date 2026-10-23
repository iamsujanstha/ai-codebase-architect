import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const url =
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL
    super({
      datasources: {
        db: {
          url,
        },
      },
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Connected to PostgreSQL via Prisma ORM');
    } catch (err: any) {
      this.logger.error(
        `Failed to connect to PostgreSQL via Prisma: ${err.message}`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
