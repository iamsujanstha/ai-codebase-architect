import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PostgresService } from './postgres.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PostgresService, PrismaService],
  exports: [PostgresService, PrismaService],
})
export class DatabaseModule {}
