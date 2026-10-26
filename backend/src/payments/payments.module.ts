import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { OutboxWorker } from './outbox.worker';
import { MailModule } from '../mail/mail.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { IdempotencyMiddleware } from '../common/middleware/idempotency.middleware';
import { PostgresPaymentsRepository } from './repositories/postgres-payments.repository';
import { PAYMENTS_REPOSITORY_TOKEN } from './repositories/payments.repository.interface';

@Module({
  imports: [PassportModule, AuthModule, DatabaseModule, MailModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    OutboxWorker,
    PostgresPaymentsRepository,
    {
      provide: PAYMENTS_REPOSITORY_TOKEN,
      useClass: PostgresPaymentsRepository,
    },
  ],
  exports: [PaymentsService, PAYMENTS_REPOSITORY_TOKEN, PostgresPaymentsRepository],
})
export class PaymentsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(IdempotencyMiddleware)
      .forRoutes('payments/stripe/checkout-session', 'payments/esewa/initiate');
  }
}
