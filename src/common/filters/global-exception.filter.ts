import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  // Initialize the logger. You can later inject a custom logger service here.
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Determine the HTTP status code
    // If it's a known NestJS exception, use its status. Otherwise, assume Internal Server Error (500).
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // Determine the error message
    // HttpException often contains an object with 'message' and 'error' properties
    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    // Log the error details — sanitize to prevent secret leakage in logs
    const sanitized = this.sanitize(JSON.stringify(message));
    this.logger.error(`Http Status: ${status} Error Message: ${sanitized}`);

    // For non-HTTP exceptions, log sanitized stack trace (avoid leaking secrets)
    if (!(exception instanceof HttpException) && exception instanceof Error) {
      this.logger.error(this.sanitize(exception.stack ?? exception.message));
    }

    // Send the unified JSON response to the client
    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      error: message,
    });
  }

  // Strip sensitive values from error messages before logging.
  // Covers query-string (password=xxx), JSON ("password":"xxx"), and header formats.
  private sanitize(msg: string): string {
    return msg
      .replace(/password[=:]\S+/gi, 'password=***')
      .replace(/"password"\s*:\s*"[^"]*"/gi, '"password":"***"')
      .replace(/secret[=:]\S+/gi, 'secret=***')
      .replace(/"secret"\s*:\s*"[^"]*"/gi, '"secret":"***"')
      .replace(/Bearer\s+\S+/gi, 'Bearer ***')
      .replace(/token[=:]\S{20,}/gi, 'token=***')
      .replace(/"(access|refresh)Token"\s*:\s*"[^"]*"/gi, '"$1Token":"***"')
      .replace(/authorization[=:]\s*\S+/gi, 'authorization=***')
      .replace(/x-api-key[=:]\s*\S+/gi, 'x-api-key=***');
  }
}
