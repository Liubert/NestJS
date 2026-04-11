import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { CurrentUserType } from '../users/types/current-user.type';
import { ReqWithUser } from './types/auth.types';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CurrentUserType => {
    const req = ctx.switchToHttp().getRequest<ReqWithUser>();
    if (!req?.user) throw new UnauthorizedException('Unauthorized');
    return req.user;
  },
);
