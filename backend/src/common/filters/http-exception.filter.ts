import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponse } from '../interfaces/api-error-response.interface';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Log unexpected (non-HTTP) errors with full stack so they're visible in
    // the backend console — the client only ever sees the sanitised message.
    if (!(exception instanceof HttpException)) {
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const exceptionPayload =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Unexpected server error.';

    const message =
      typeof exceptionPayload === 'object' &&
      exceptionPayload !== null &&
      'message' in exceptionPayload
        ? (exceptionPayload as { message?: string | string[] }).message ??
          'Unexpected server error.'
        : String(exceptionPayload);

    const errorResponse: ApiErrorResponse = {
      statusCode,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    };

    response.status(statusCode).json(errorResponse);
  }
}

