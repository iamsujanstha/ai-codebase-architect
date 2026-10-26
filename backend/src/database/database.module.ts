import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PostgresService } from './postgres.service';
import { PostgresIdempotencyRepository } from '../common/repositories/postgres-idempotency.repository';
import { IDEMPOTENCY_REPOSITORY_TOKEN } from '../common/repositories/idempotency.repository.interface';
import { PostgresHealthRepository } from './repositories/postgres-health.repository';
import { HEALTH_REPOSITORY_TOKEN } from './repositories/health.repository.interface';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    PostgresService,
    PostgresIdempotencyRepository,
    {
      provide: IDEMPOTENCY_REPOSITORY_TOKEN,
      useClass: PostgresIdempotencyRepository,
    },
    PostgresHealthRepository,
    {
      provide: HEALTH_REPOSITORY_TOKEN,
      useClass: PostgresHealthRepository,
    },
  ],
  exports: [
    PostgresService,
    PostgresIdempotencyRepository,
    IDEMPOTENCY_REPOSITORY_TOKEN,
    PostgresHealthRepository,
    HEALTH_REPOSITORY_TOKEN,
  ],
})
export class DatabaseModule {}
