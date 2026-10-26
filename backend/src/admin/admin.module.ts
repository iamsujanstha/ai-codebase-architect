import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PostgresAdminRepository } from './repositories/postgres-admin.repository';
import { ADMIN_REPOSITORY_TOKEN } from './repositories/admin.repository.interface';

@Module({
  controllers: [AdminController],
  providers: [
    AdminService,
    PostgresAdminRepository,
    {
      provide: ADMIN_REPOSITORY_TOKEN,
      useClass: PostgresAdminRepository,
    },
  ],
  exports: [AdminService, ADMIN_REPOSITORY_TOKEN, PostgresAdminRepository],
})
export class AdminModule {}

