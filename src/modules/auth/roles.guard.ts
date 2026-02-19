import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { GqlContextWithReq, ReqWithUser } from './types/auth.types';

// type GqlContextWithReq = { req: ReqWithUser };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles =
      this.reflector.get<string[]>('roles', context.getHandler()) ?? [];

    if (!requiredRoles.length) return true;

    const req = this.getRequest(context);
    const role = req.user?.role;

    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }

  private getRequest(context: ExecutionContext): ReqWithUser {
    if (context.getType() === 'http') {
      return context.switchToHttp().getRequest<ReqWithUser>();
    }

    const gqlCtx = GqlExecutionContext.create(context);
    return gqlCtx.getContext<GqlContextWithReq>().req;
  }
}
