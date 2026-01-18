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
export class ResponseTimeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
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
      catchError((err) => {
        setHeaders(); // Runs on error
        return throwError(() => err);
      }),
    );
  }
}
