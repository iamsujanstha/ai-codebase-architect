import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getOverview() {
    // This response doubles as documentation and as a sanity check that the service booted correctly.
    return {
      service: 'AI Code Assistant Backend Gateway',
      responsibility:
        'Validate client requests, orchestrate AI service calls, and return a stable contract to the frontend.',
      endpoints: {
        overview: 'GET /',
        health: 'GET /health',
        generate: 'POST /ai/generate',
      },
      architectureReasoning:
        'The backend exists so browsers do not need direct knowledge of internal AI service topology.',
    };
  }

  getHealth() {
    return {
      status: 'ok',
      service: 'backend-gateway',
      timestamp: new Date().toISOString(),
      aiServiceUrl: process.env.AI_SERVICE_URL ?? 'http://localhost:8000',
    };
  }
}
