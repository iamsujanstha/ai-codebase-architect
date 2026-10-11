import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { GenerateAiRequestDto } from './dto/generate-ai-request.dto';
import { AiGatewayService } from './ai.service';
import { RateLimit, RateLimitGuard } from '../common/guards/rate-limit.guard';
import { PromptInjectionGuard } from './guards/prompt-injection.guard';

// Controllers are the HTTP boundary of the feature.
// Their job is deliberately narrow:
// - receive validated input
// - delegate work to services
// - return a response
//
// Business logic should stay out of controllers so they remain easy to read and maintain.
//
// PHASE 1 PRODUCTION IMPROVEMENTS:
// - Rate limiting applied to prevent AI quota abuse
// - 20 requests per minute per user (fair resource sharing)
// - Prevents single user from monopolizing expensive AI resources
//
// PHASE 2 PRODUCTION IMPROVEMENTS:
// - Prompt injection defense guard (AI safety)
// - Blocks malicious prompts before sending to AI
// - Prevents data leaks, unauthorized actions
@Controller('ai')
export class AiController {
  constructor(private readonly aiGatewayService: AiGatewayService) {}

  // List models: 30 requests per minute (read-only, less restrictive)
  @Get('models')
  @RateLimit(30, 60 * 1000)
  @UseGuards(RateLimitGuard)
  async listModels() {
    return this.aiGatewayService.listModels();
  }

  // Generate: 20 requests per minute
  // Critical: AI generation costs money (OpenAI/Claude) or resources (local LLM)
  // Prevents abuse while allowing normal usage
  // PHASE 2: Added prompt injection guard for AI safety
  @Post('generate')
  @RateLimit(20, 60 * 1000)
  @UseGuards(RateLimitGuard, PromptInjectionGuard)
  async generate(@Body() request: GenerateAiRequestDto) {
    return this.aiGatewayService.generateResponse(
      request.prompt,
      request.messages,
      request.model,
    );
  }

  // Streaming: 20 requests per minute (same as non-streaming)
  // Streaming is more expensive (longer connection time)
  // PHASE 2: Added prompt injection guard for AI safety
  @Post('generate/stream')
  @RateLimit(20, 60 * 1000)
  @UseGuards(RateLimitGuard, PromptInjectionGuard)
  async streamGenerate(
    @Body() request: GenerateAiRequestDto,
    @Res() response: Response,
  ) {
    try {
      await this.aiGatewayService.streamResponse(
        request.prompt,
        request.messages,
        request.model,
        response,
      );
    } catch (error) {
      const statusCode =
        error instanceof HttpException ? error.getStatus() : 502;
      const payload =
        error instanceof HttpException
          ? error.getResponse()
          : {
              message:
                'Unexpected gateway failure while streaming the AI response.',
            };

      return response
        .status(statusCode)
        .json(typeof payload === 'string' ? { message: payload } : payload);
    }
  }
}
