import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { BackendWorkerModule } from './backend-worker.module';

async function bootstrapBackendWorker(): Promise<void> {
  const application =
    await NestFactory.createApplicationContext(BackendWorkerModule);
  application.enableShutdownHooks();
  Logger.log('Backend worker started', 'BackendWorker');
}

void bootstrapBackendWorker();
