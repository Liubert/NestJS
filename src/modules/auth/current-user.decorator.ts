import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { UserRole } from '../users/types/user-role.enum';

export type AuthUser = { userId: string; role: UserRole };

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => {
    // REST
    const httpReq = ctx.switchToHttp().getRequest();
    if (httpReq?.user) return httpReq.user as AuthUser;

    // GraphQL
    const gqlCtx = GqlExecutionContext.create(ctx);
    const req = gqlCtx.getContext()?.req;
    return req?.user as AuthUser;
  },
);
