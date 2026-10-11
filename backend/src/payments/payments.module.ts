import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { Product, ProductSchema } from '../catalog/schemas/product.schema';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { Order, OrderSchema } from './schemas/order.schema';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { IdempotencyMiddleware } from '../common/middleware/idempotency.middleware';

// PassportModule + AuthModule are imported together so AuthGuard('jwt') can
// resolve JwtStrategy at runtime inside this module's request pipeline.
//
// PHASE 1 PRODUCTION IMPROVEMENTS:
// - IdempotencyMiddleware applied to payment creation endpoints
// - Prevents duplicate payment processing from network retries or webhook replays
@Module({
  imports: [
    PassportModule,
    AuthModule,
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
    MailModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply idempotency middleware to payment creation endpoints
    // Clients should send Idempotency-Key header (UUID) for these routes
    consumer
      .apply(IdempotencyMiddleware)
      .forRoutes(
        'payments/stripe/checkout-session',
        'payments/esewa/initiate',
      );
  }
}
