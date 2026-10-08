import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { Product, ProductSchema } from '../catalog/schemas/product.schema';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { Order, OrderSchema } from './schemas/order.schema';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';

// PassportModule + AuthModule are imported together so AuthGuard('jwt') can
// resolve JwtStrategy at runtime inside this module's request pipeline.
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
export class PaymentsModule {}
