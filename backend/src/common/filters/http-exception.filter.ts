import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiErrorResponse } from '../interfaces/api-error-response.interface';

// A global exception filter gives the backend one consistent error shape.
// This is a production-grade pattern because clients should not have to guess
// how different errors are formatted across routes.
@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

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

