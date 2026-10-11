import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  // The bootstrap function is the operational entry point of the backend service.
  // In production this is where global middleware, pipes, filters, and app-wide policies are wired together.
  //
  // `rawBody: true` is important for payment webhooks such as Stripe.
  // Stripe signs the exact raw payload bytes, so the server must preserve them
  // for signature verification rather than relying only on parsed JSON.
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

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
