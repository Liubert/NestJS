import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { CurrentUserType } from '../users/types/current-user.type';
import { GqlContextWithReq, ReqWithUser } from './types/auth.types';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CurrentUserType => {
    // REST
    const httpReq = ctx.switchToHttp().getRequest<ReqWithUser>();
    if (httpReq?.user) return httpReq.user;

    // GraphQL
    const gqlCtx = GqlExecutionContext.create(ctx);
    const gqlContext = gqlCtx.getContext<GqlContextWithReq>();
    const user = gqlContext?.req?.user;

    if (!user) throw new UnauthorizedException('Unauthorized');

    return user;
  },
);
