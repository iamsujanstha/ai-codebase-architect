import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { GenerateAiRequestDto } from './dto/generate-ai-request.dto';
import { AiGatewayService } from './ai.service';

// Controllers are the HTTP boundary of the feature.
// Their job is deliberately narrow:
// - receive validated input
// - delegate work to services
// - return a response
//
// Business logic should stay out of controllers so they remain easy to read and maintain.
@Controller('ai')
export class AiController {
  constructor(private readonly aiGatewayService: AiGatewayService) {}

  @Get('models')
  async listModels() {
    return this.aiGatewayService.listModels();
  }

  @Post('generate')
  async generate(@Body() request: GenerateAiRequestDto) {
    return this.aiGatewayService.generateResponse(request.prompt, request.model);
  }

  @Post('generate/stream')
  async streamGenerate(
    @Body() request: GenerateAiRequestDto,
    @Res() response: Response,
  ) {
    try {
      await this.aiGatewayService.streamResponse(
        request.prompt,
        request.model,
        response,
      );
    } catch (error) {
      const statusCode = error instanceof HttpException ? error.getStatus() : 502;
      const payload =
        error instanceof HttpException
          ? error.getResponse()
          : {
              message:
                'Unexpected gateway failure while streaming the AI response.',
            };

      return response.status(statusCode).json(
        typeof payload === 'string' ? { message: payload } : payload,
      );
    }
  }
}
