import {
  BadGatewayException,
  Injectable,
  Logger,
  RequestTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios from 'axios';
import { ChatMessageDto } from './dto/generate-ai-request.dto';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { Readable } from 'stream';
import { DownstreamModelsResponse } from './interfaces/downstream-models-response.interface';
import { DownstreamAiResponse } from './interfaces/downstream-ai-response.interface';
import { GatewayAiResponse } from './interfaces/gateway-ai-response.interface';
import { ModelsResponse } from './interfaces/models-response.interface';
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
} from '../common/utils/circuit-breaker.util';
import { retryWithBackoff } from '../common/utils/retry.util';

// Services own business and orchestration logic.
// In this project, the service behaves like a small API gateway orchestration unit:
// it creates a request id, calls the downstream AI engine, translates the response,
// and normalizes failures into backend-friendly HTTP exceptions.
//
// PHASE 2 IMPROVEMENTS:
// - Circuit breaker for AI service HTTP calls (prevents cascading failures)
// - Retry with exponential backoff (handles transient errors)
// - Fail fast when AI service is down (better UX)
@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger(AiGatewayService.name);
  private readonly aiServiceUrl =
    process.env.AI_SERVICE_URL ?? 'http://localhost:8000';
  private readonly requestTimeoutMs = Number(
    process.env.AI_SERVICE_TIMEOUT_MS ?? 120000,
  );
  private readonly streamTimeoutMs = Number(
    process.env.AI_SERVICE_STREAM_TIMEOUT_MS ?? 300000,
  );

  /**
   * PHASE 2: Circuit breaker for AI service HTTP calls
   * 
   * Why: AI service failures should not cascade to backend
   * Threshold: 5 failures (AI is less critical than payments, more tolerant)
   * Reset: 30 seconds (AI can recover quickly)
   * 
   * Behavior:
   * - First 5 AI failures: Try normally (with retry)
   * - After 5 failures: Circuit opens
   * - While open: Reject immediately (no timeout wait)
   * - After 30s: Try one request (half-open)
   * - If success: Circuit closes
   * - If failure: Circuit opens again
   */
  private readonly aiCircuitBreaker = new CircuitBreaker({
    name: 'ai-service',
    failureThreshold: 5,
    resetTimeout: 30000,
  });

  async listModels(): Promise<ModelsResponse> {
    try {
      /**
       * PHASE 2: Circuit breaker + retry for AI service calls
       * 
       * List models is a read-only operation, safe to retry
       * Lower threshold (2 retries) since it's a quick operation
       */
      const data = await this.aiCircuitBreaker.execute(async () => {
        return await retryWithBackoff(
          async () => {
            const response = await axios.get<DownstreamModelsResponse>(
              `${this.aiServiceUrl}/models`,
              {
                timeout: this.requestTimeoutMs,
              },
            );
            return response.data;
          },
          {
            maxRetries: 2,
            initialDelay: 100,
            context: 'ai-list-models',
          },
        );
      });

      return {
        provider: data.provider,
        defaultModel: data.default_model,
        models: (data.models ?? []).map((model) => ({
          name: model.name,
          sizeBytes: model.size_bytes,
          sizeLabel: model.size_label,
          modifiedAt: model.modified_at,
          digest: model.digest ?? null,
          family: model.family ?? null,
          parameterSize: model.parameter_size ?? null,
          quantizationLevel: model.quantization_level ?? null,
        })),
      };
    } catch (error) {
      // Handle circuit breaker open state
      if (error instanceof CircuitBreakerOpenError) {
        this.logger.error({
          event: 'ai_circuit_open',
          operation: 'list_models',
          message: 'AI service circuit breaker is open - service appears down',
        });
        throw new ServiceUnavailableException(
          'AI service is temporarily unavailable. Please try again shortly.',
        );
      }
      this.handleAxiosError(error, 'while loading local models');
    }
  }

  async generateResponse(
    prompt: string,
    messages?: ChatMessageDto[],
    model?: string,
  ): Promise<GatewayAiResponse> {
    const gatewayStartedAt = Date.now();
    const requestId = randomUUID();

    try {
      /**
       * PHASE 2: Circuit breaker + retry for AI generation
       * 
       * AI generation is expensive and slow
       * - Fewer retries (2) since each attempt is costly
       * - Longer initial delay (500ms) to give AI service time
       * - Circuit breaker prevents overwhelming AI service during outage
       */
      const data = await this.aiCircuitBreaker.execute(async () => {
        return await retryWithBackoff(
          async () => {
            const response = await axios.post<DownstreamAiResponse>(
              `${this.aiServiceUrl}/generate`,
              {
                prompt,
                messages,
                request_id: requestId,
                model,
              },
              {
                timeout: this.requestTimeoutMs,
                headers: {
                  'Content-Type': 'application/json',
                },
              },
            );
            return response.data;
          },
          {
            maxRetries: 2,
            initialDelay: 500,
            maxDelay: 2000,
            context: 'ai-generate',
            shouldRetry: (error, attempt) => {
              // Don't retry timeouts (AI generation is slow, timeout is intentional)
              if (error.code === 'ECONNABORTED') {
                return false;
              }
              // Retry connection errors
              if (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET') {
                return true;
              }
              // Retry 5xx server errors
              if (error.response?.status >= 500) {
                return true;
              }
              // Don't retry client errors (4xx)
              return false;
            },
          },
        );
      });

      return {
        requestId: data.request_id,
        prompt: data.prompt,
        summary: data.summary,
        answer: data.answer,
        keyPoints: data.key_points,
        suggestedFollowUpPrompts: data.suggested_follow_up_prompts,
        provider: data.provider,
        model: data.model ?? model ?? 'unknown',
        upstreamProcessingTimeMs: data.processing_time_ms,
        gatewayProcessingTimeMs: Date.now() - gatewayStartedAt,
        generatedAt: data.generated_at,
      };
    } catch (error) {
      // Handle circuit breaker open state
      if (error instanceof CircuitBreakerOpenError) {
        this.logger.error({
          event: 'ai_circuit_open',
          operation: 'generate',
          requestId,
          message: 'AI service circuit breaker is open - service appears down',
        });
        throw new ServiceUnavailableException(
          'AI service is temporarily unavailable. Please try again in 30 seconds.',
        );
      }
      this.handleAxiosError(error, 'while processing the AI request');
    }
  }

  async streamResponse(
    prompt: string,
    messages: ChatMessageDto[] | undefined,
    model: string | undefined,
    response: Response,
  ): Promise<void> {
    const requestId = randomUUID();
    const abortController = new AbortController();
    const onClose = () => abortController.abort();
    response.once('close', onClose);

    try {
      const upstreamResponse = await axios.post<Readable>(
        `${this.aiServiceUrl}/generate/stream`,
        {
          prompt,
          messages,
          request_id: requestId,
          model,
        },
        {
          timeout: this.streamTimeoutMs,
          responseType: 'stream',
          signal: abortController.signal,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/x-ndjson',
          },
        },
      );

      if (response.destroyed) {
        upstreamResponse.data.destroy();
        return;
      }

      response.status(200);
      response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache, no-transform');
      response.setHeader('Connection', 'keep-alive');
      response.setHeader('X-Accel-Buffering', 'no');
      response.flushHeaders?.();

      upstreamResponse.data.on('error', (streamError: Error) => {
        this.logger.error(
          'Upstream AI stream failed.',
          streamError.stack ?? streamError.message,
        );

        if (!response.writableEnded) {
          response.end();
        }
      });

      response.once('close', () => upstreamResponse.data.destroy());
      upstreamResponse.data.pipe(response);
    } catch (error) {
      response.off('close', onClose);
      if (abortController.signal.aborted) return;
      this.handleAxiosError(error, 'while opening the AI stream');
    }
  }

  private handleAxiosError(error: unknown, context: string): never {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        throw new RequestTimeoutException(
          `The AI service took too long to respond ${context}.`,
        );
      }

      if (!error.response) {
        this.logger.error(
          `AI service could not be reached at ${this.aiServiceUrl} ${context}.`,
        );

        throw new BadGatewayException(
          'The backend could not reach the AI service.',
        );
      }

      this.logger.error(
        `AI service responded with status ${error.response.status} ${context}.`,
      );

      throw new BadGatewayException(
        'The AI service returned an invalid downstream response.',
      );
    }

    this.logger.error(
      `Unexpected AI orchestration error ${context}.`,
      error instanceof Error ? error.stack : String(error),
    );

    throw new BadGatewayException(
      'Unexpected backend failure while processing the AI request.',
    );
  }
}
