import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './ai/ai.module';
import { CatalogModule } from './catalog/catalog.module';
import { PaymentsModule } from './payments/payments.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { OrdersModule } from './orders/orders.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGODB_URI ?? 'mongodb://mongo:27017/ai-commerce-platform',
        dbName: process.env.MONGODB_DB_NAME ?? 'ai_commerce_platform',
        autoIndex: (process.env.MONGODB_AUTO_INDEX ?? 'true') === 'true',
        serverSelectionTimeoutMS: 10000,
      }),
    }),
    AiModule,
    CatalogModule,
    PaymentsModule,
    UsersModule,
    AuthModule,
    OrdersModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
