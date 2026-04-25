import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from '../catalog/schemas/product.schema';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { Order, OrderSchema } from './schemas/order.schema';

import { MailModule } from '../mail/mail.module';

// Payment integrations deserve their own module because they combine:
// - provider-specific APIs
// - order persistence
// - callback verification
// - frontend-facing checkout orchestration
//
// Keeping this isolated prevents payment logic from bleeding into catalog and AI features.
@Module({
  imports: [
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
