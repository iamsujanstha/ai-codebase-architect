import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './ai/ai.module';
import { CatalogModule } from './catalog/catalog.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  // AppModule is the root dependency graph for the NestJS service.
  // Larger systems may import many modules here, but the principle stays the same:
  // wire the application from the top and keep features encapsulated underneath.
  //
  // Production analogy:
  // This is similar to the "service composition root" in a real backend.
  // The database connection, business modules, and shared configuration all meet here.
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri:
          process.env.MONGODB_URI ??
          'mongodb://mongo:27017/ai-commerce-platform',
        dbName: process.env.MONGODB_DB_NAME ?? 'ai_commerce_platform',
        autoIndex: (process.env.MONGODB_AUTO_INDEX ?? 'true') === 'true',
        serverSelectionTimeoutMS: 10000,
      }),
    }),
    AiModule,
    CatalogModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
