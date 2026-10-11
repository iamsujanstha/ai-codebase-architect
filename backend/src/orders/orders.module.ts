import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { ORDERS_REPOSITORY_TOKEN } from './repositories/orders.repository.interface';
import { PostgresOrdersRepository } from './repositories/postgres-orders.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    PostgresOrdersRepository,
    {
      provide: ORDERS_REPOSITORY_TOKEN,
      useClass: PostgresOrdersRepository,
    },
  ],
  exports: [OrdersService, ORDERS_REPOSITORY_TOKEN, PostgresOrdersRepository],
})
export class OrdersModule {}
