import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../users/types/user-role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<UserRole[]>(
      'roles',
      context.getHandler(),
    );

    if (!requiredRoles?.length) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user as { role?: UserRole } | undefined;

    if (!user?.role) return false;

    return requiredRoles.includes(user.role);
  }
}
