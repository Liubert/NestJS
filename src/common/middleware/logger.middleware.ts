import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

// 1. Defining a custom interface to avoid TS errors
export interface RequestWithMetadata extends Request {
  requestId: string;
  requestStartTime: number;
  handlerDuration?: number;
}

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  // 2. Use our custom interface for 'req'
  use(req: RequestWithMetadata, res: Response, next: NextFunction) {
    const requestId: string = randomUUID();
    const startTime: number = Date.now();

    req.requestId = requestId;
    req.requestStartTime = startTime;

    res.setHeader('X-Request-Id', requestId);

    this.logger.log(`[${requestId}] START: ${req.method} ${req.originalUrl}`);

    res.on('finish', () => {
      const totalTime = Date.now() - startTime;
      const processingTime = req.handlerDuration || 0;
      const authValTime = totalTime - processingTime; // Consistent naming

      this.logger.log(
        `[${requestId}] END: ${res.statusCode} | Total: ${totalTime}ms (Processing: ${processingTime}ms, Auth&Val: ${authValTime}ms)`,
      );
    });

    next();
  }
}
