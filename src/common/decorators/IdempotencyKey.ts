import {
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { Request } from 'express';

export const IdempotencyKey = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();

    const key = request.headers['idempotency-key'];

    if (typeof key !== 'string') {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    return key;
  },
);
