import { Injectable, Optional } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class AppService {
  constructor(
    @Optional()
    @InjectConnection() private readonly mongoConnection: Connection,
  ) {}

  getOverview() {
    // This response doubles as documentation and as a sanity check that the service booted correctly.
    return {
      service: 'AI Commerce + Local LLM Backend Gateway',
      responsibility:
        'Validate client requests, orchestrate AI service calls, expose Mongo-backed ecommerce catalog APIs, and return stable contracts to the frontend.',
      endpoints: {
        overview: 'GET /',
        health: 'GET /health',
        catalogHome: 'GET /catalog/home',
        catalogProducts: 'GET /catalog/products',
        catalogProductDetail: 'GET /catalog/products/:slug',
        catalogCategories: 'GET /catalog/categories',
        aiModels: 'GET /ai/models',
        aiGenerate: 'POST /ai/generate',
        aiGenerateStream: 'POST /ai/generate/stream',
      },
      architectureReasoning:
        'The backend exists so browsers do not need direct knowledge of internal AI service topology or direct access to the database layer.',
    };
  }

  getHealth() {
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
      database: {
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
    };
  }
}
