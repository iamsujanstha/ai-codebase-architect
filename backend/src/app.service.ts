import { Inject, Injectable } from '@nestjs/common';
import {
  HEALTH_REPOSITORY_TOKEN,
  IHealthRepository,
} from './database/repositories/health.repository.interface';

@Injectable()
export class AppService {
  constructor(
    @Inject(HEALTH_REPOSITORY_TOKEN)
    private readonly healthRepo: IHealthRepository,
  ) {}

  getOverview() {
    return {
      service: 'AI Commerce + Local LLM Backend Gateway',
      database: 'Neon Serverless PostgreSQL (via raw pg connection pool)',
      responsibility:
        'Validate client requests, orchestrate AI service calls, expose Neon PostgreSQL-backed ecommerce catalog APIs, and return stable contracts to the frontend.',
      endpoints: {
        overview: 'GET /',
        health: 'GET /health',
        catalogHome: 'GET /catalog/home',
        catalogProducts: 'GET /catalog/products',
        catalogProductDetail: 'GET /catalog/products/:slug',
        catalogCategories: 'GET /catalog/categories',
        paymentQuote: 'POST /payments/quote',
        stripeCheckout: 'POST /payments/stripe/checkout-session',
        stripeWebhook: 'POST /payments/stripe/webhook',
        esewaInitiate: 'POST /payments/esewa/initiate',
        orderStatus: 'GET /payments/orders/:orderNumber',
        aiModels: 'GET /ai/models',
        aiGenerate: 'POST /ai/generate',
        aiGenerateStream: 'POST /ai/generate/stream',
      },
      architectureReasoning:
        'The backend exists so browsers do not need direct knowledge of internal AI service topology or direct access to the database layer.',
    };
  }

  async getHealth() {
    let pgDetails: any = {
      engine: 'postgresql',
      provider: 'neon',
      name: process.env.POSTGRES_DB || 'neondb',
      state: 'connected',
      host: 'ep-super-rice-b34nlx0w-pooler.c-4.ap-southeast-1.aws.neon.tech',
    };

    if (this.healthRepo.isDatabaseReady()) {
      try {
        const counts = await this.healthRepo.getSystemCounts();
        pgDetails.counts = counts;
      } catch (err: any) {
        pgDetails.state = 'error';
        pgDetails.error = err.message;
      }
    }

    return {
      status: 'ok',
      service: 'backend-gateway',
      timestamp: new Date().toISOString(),
      aiServiceUrl: process.env.AI_SERVICE_URL ?? 'http://localhost:8000',
      databaseMode: 'postgres-only',
      database: pgDetails,
      payments: {
        stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
        esewaConfigured: Boolean(
          process.env.ESEWA_PRODUCT_CODE && process.env.ESEWA_SECRET_KEY,
        ),
      },
    };
  }
}
