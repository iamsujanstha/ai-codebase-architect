import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { MailModule } from '../mail/mail.module';
import { RabbitMqModule } from '../messaging/rabbitmq/rabbitmq.module';
import { OrderPaidConsumer } from '../payments/order-paid.consumer';
import { OrderPaidEventRegistration } from '../payments/order-paid-event.registration';
import { PostgresPaymentsRepository } from '../payments/repositories/postgres-payments.repository';
import { PAYMENTS_REPOSITORY_TOKEN } from '../payments/repositories/payments.repository.interface';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    MailModule,
    RabbitMqModule,
  ],
  providers: [
    OrderPaidConsumer,
    OrderPaidEventRegistration,
    PostgresPaymentsRepository,
    {
      provide: PAYMENTS_REPOSITORY_TOKEN,
      useClass: PostgresPaymentsRepository,
    },
  ],
})
export class RabbitMqWorkerModule {}
