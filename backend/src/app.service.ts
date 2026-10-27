import { Inject, Injectable } from '@nestjs/common';
import {
  HEALTH_REPOSITORY_TOKEN,
  IHealthRepository,
} from './database/repositories/health.repository.interface';
import type { SystemCounts } from './database/repositories/health.repository.interface';

type DatabaseHealthState = 'connected' | 'disconnected' | 'error';

interface DatabaseHealthDetails {
  engine: string;
  provider: string;
  name: string;
  state: DatabaseHealthState;
  counts?: SystemCounts;
}

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

  /**
   * Checks database readiness and returns the service health contract.
   *
   * @returns Health details with an error status when database readiness fails.
   */
  async getHealth() {
    const databaseReady = this.healthRepo.isDatabaseReady();
    const databaseDetails: DatabaseHealthDetails = {
      engine: 'postgresql',
      provider: 'neon',
      name: process.env.POSTGRES_DB || 'neondb',
      state: databaseReady ? 'connected' : 'disconnected',
    };
    const healthDetails = {
      service: 'backend-gateway',
      timestamp: new Date().toISOString(),
      aiServiceUrl: process.env.AI_SERVICE_URL ?? 'http://localhost:8000',
      databaseMode: 'postgres-only',
      database: databaseDetails,
      payments: {
        stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
        esewaConfigured: Boolean(
          process.env.ESEWA_PRODUCT_CODE && process.env.ESEWA_SECRET_KEY,
        ),
      },
    };

    if (!databaseReady) {
      return { status: 'error' as const, ...healthDetails };
    }

    try {
      databaseDetails.counts = await this.healthRepo.getSystemCounts();
    } catch {
      databaseDetails.state = 'error';
      return { status: 'error' as const, ...healthDetails };
    }

    return { status: 'ok' as const, ...healthDetails };
  }
}
