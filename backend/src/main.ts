import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  const uploadsDir = join(process.cwd(), 'uploads');
  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }
  app.useStaticAssets(uploadsDir, { prefix: '/uploads/' });

  // PHASE 1 PRODUCTION IMPROVEMENTS:
  // - Structured logging for observability (correlation IDs, JSON logs)
  // - Global validation for request validation
  // - Exception filtering for consistent error responses
  // See: ARCHITECTURE_GAP_ANALYSIS.md Phase 1

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  // Add structured logging interceptor (Phase 1: Observability)
  app.useGlobalInterceptors(new LoggingInterceptor());

  const rawCorsOrigins = process.env.CORS_ORIGIN ?? '';
  const allowedOrigins = rawCorsOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Even though the Docker deployment uses same-origin proxying through Nginx,
  // enabling CORS keeps local development ergonomic when the Vite dev server runs separately.
  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
  });

  // Enable graceful shutdown (Phase 1: Reliability)
  // Ensures in-flight requests complete before shutdown
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);

  await app.listen(port);

  Logger.log(
    `Backend gateway is listening on http://localhost:${port}`,
    'Bootstrap',
  );
  Logger.log(
    `Production improvements active: Structured logging, graceful shutdown, request correlation`,
    'Bootstrap',
  );
}

bootstrap();
