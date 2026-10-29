import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { RabbitMqWorkerModule } from './rabbitmq-worker.module';

async function bootstrapRabbitMqWorker(): Promise<void> {
  const application =
    await NestFactory.createApplicationContext(RabbitMqWorkerModule);
  application.enableShutdownHooks();
  Logger.log('RabbitMQ email and inventory worker started', 'RabbitMqWorker');
}

void bootstrapRabbitMqWorker();
