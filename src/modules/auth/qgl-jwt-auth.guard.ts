import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';
import { ReqWithUser } from './types/auth.types';

type GqlContextWithReq = { req: ReqWithUser };

@Injectable()
export class GqlAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext): ReqWithUser {
    const gqlCtx = GqlExecutionContext.create(context);
    return gqlCtx.getContext<GqlContextWithReq>().req;
  }
}
