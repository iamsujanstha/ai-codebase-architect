import {
  BadGatewayException,
  Injectable,
  Logger,
  RequestTimeoutException,
} from '@nestjs/common';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { Readable } from 'stream';
import { DownstreamModelsResponse } from './interfaces/downstream-models-response.interface';
import { DownstreamAiResponse } from './interfaces/downstream-ai-response.interface';
import { GatewayAiResponse } from './interfaces/gateway-ai-response.interface';
import { ModelsResponse } from './interfaces/models-response.interface';

// Services own business and orchestration logic.
// In this project, the service behaves like a small API gateway orchestration unit:
// it creates a request id, calls the downstream AI engine, translates the response,
// and normalizes failures into backend-friendly HTTP exceptions.
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

  async listModels(): Promise<ModelsResponse> {
    try {
      const { data } = await axios.get<DownstreamModelsResponse>(
        `${this.aiServiceUrl}/models`,
        {
          timeout: this.requestTimeoutMs,
        },
      );

      return {
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
      this.handleAxiosError(error, 'while loading local models');
    }
  }

  async generateResponse(
    prompt: string,
    messages?: any[],
    model?: string,
  ): Promise<GatewayAiResponse> {
    const gatewayStartedAt = Date.now();
    const requestId = randomUUID();

    try {
      const { data } = await axios.post<DownstreamAiResponse>(
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
      this.handleAxiosError(error, 'while processing the AI request');
    }
  }

  async streamResponse(
    prompt: string,
    messages: any[] | undefined,
    model: string | undefined,
    response: Response,
  ): Promise<void> {
    const requestId = randomUUID();

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
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/x-ndjson',
          },
        },
      );

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

      upstreamResponse.data.pipe(response);
    } catch (error) {
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
