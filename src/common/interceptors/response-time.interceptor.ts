import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators'; // Added catchError
import { RequestWithMetadata } from '../middleware/logger.middleware';
import { Response } from 'express';

@Injectable()
export class ResponseTimeInterceptor implements NestInterceptor<
  unknown,
  unknown
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    // Skip GraphQL requests (no standard HTTP response object here)
    if (context.getType<'http' | 'rpc' | 'ws'>() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<RequestWithMetadata>();
    const res = http.getResponse<Response>();

    const handlerStart = Date.now();

    const setHeaders = () => {
      const handlerDuration = Date.now() - handlerStart;
      req.handlerDuration = handlerDuration;
      const totalSoFar = Date.now() - req.requestStartTime;
      const authAndValidationDuration = totalSoFar - handlerDuration;

      if (!res.headersSent) {
        res.setHeader(
          'X-Auth-And-Validation-Time',
          `${authAndValidationDuration}ms`,
        );
        res.setHeader('X-Processing-Time', `${handlerDuration}ms`);
        res.setHeader('X-Total-Server-Time', `${totalSoFar}ms`);
        // Standard header for browser DevTools (Network > Timing tab) visualization.
        res.setHeader(
          'Server-Timing',
          `auth_val;dur=${authAndValidationDuration};desc="Auth & Validation", ` +
            `proc;dur=${handlerDuration};desc="Processing", ` +
            `total;dur=${totalSoFar};desc="Total Server Time"`,
        );
      }
    };

    return next.handle().pipe(
      tap(() => setHeaders()), // Runs on success
      catchError((err: unknown) => {
        setHeaders(); // Runs on error
        const error =
          err instanceof Error
            ? err
            : new Error(`Unknown error: ${String(err)}`);
        return throwError(() => error);
      }),
    );
  }
}
