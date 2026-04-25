import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  // The bootstrap function is the operational entry point of the backend service.
  // In production this is where global middleware, pipes, filters, and app-wide policies are wired together.
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new GlobalHttpExceptionFilter());

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

  const port = Number(process.env.PORT ?? 3000);

  await app.listen(port);

  Logger.log(
    `Backend gateway is listening on http://localhost:${port}`,
    'Bootstrap',
  );
}

bootstrap();
