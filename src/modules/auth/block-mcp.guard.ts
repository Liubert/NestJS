import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { CurrentUserType } from '../users/types/current-user.type.js';

@Injectable()
export class BlockMcpGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user: CurrentUserType }>();
    const user = request.user;

    if (user?.isMcpToken) {
      throw new ForbiddenException(
        'This action is not allowed for MCP tokens. Production writes must be performed manually via the Admin UI.',
      );
    }

    return true;
  }
}
