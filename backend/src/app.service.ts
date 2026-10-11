import { Injectable, Optional } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { PostgresService } from './database/postgres.service';

@Injectable()
export class AppService {
  constructor(
    @Optional()
    @InjectConnection() private readonly mongoConnection: Connection,
    private readonly postgresService: PostgresService,
  ) {}

  getOverview() {
    // This response doubles as documentation and as a sanity check that the service booted correctly.
    return {
      service: 'AI Commerce + Local LLM Backend Gateway',
      database: 'Neon Serverless PostgreSQL',
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
    const databaseMode = process.env.DATABASE_MODE ?? 'postgres-only';
    const isPostgresPrimary = databaseMode !== 'mongodb-only';

    let pgDetails: any = null;
    if (this.postgresService.isReady()) {
      try {
        const [prodCount, userCount, orderCount] = await Promise.all([
          this.postgresService.query('SELECT COUNT(*) FROM products'),
          this.postgresService.query('SELECT COUNT(*) FROM users'),
          this.postgresService.query('SELECT COUNT(*) FROM orders'),
        ]);

        pgDetails = {
          engine: 'postgresql',
          provider: 'neon',
          name: process.env.POSTGRES_DB || 'neondb',
          state: 'connected',
          host: 'ep-super-rice-b34nlx0w-pooler.c-4.ap-southeast-1.aws.neon.tech',
          counts: {
            products: parseInt(prodCount.rows[0].count, 10),
            users: parseInt(userCount.rows[0].count, 10),
            orders: parseInt(orderCount.rows[0].count, 10),
          },
        };
      } catch (err: any) {
        pgDetails = {
          engine: 'postgresql',
          provider: 'neon',
          state: 'error',
          error: err.message,
        };
      }
    }

    const mongoReadyStateMap: Record<number, string> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    return {
      status: 'ok',
      service: 'backend-gateway',
      timestamp: new Date().toISOString(),
      aiServiceUrl: process.env.AI_SERVICE_URL ?? 'http://localhost:8000',
      databaseMode,
      database: isPostgresPrimary && pgDetails
        ? pgDetails
        : {
            engine: 'mongodb',
            provider:
              process.env.MONGODB_URI?.includes('mongodb+srv://') === true
                ? 'atlas'
                : 'local-or-self-hosted',
            name:
              this.mongoConnection?.name ||
              process.env.MONGODB_DB_NAME ||
              'ai_commerce_platform',
            state:
              mongoReadyStateMap[this.mongoConnection?.readyState ?? 0] ?? 'unknown',
          },
      payments: {
        stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
        esewaConfigured: Boolean(
          process.env.ESEWA_PRODUCT_CODE && process.env.ESEWA_SECRET_KEY,
        ),
      },
    };
  }
}

