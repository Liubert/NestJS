import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../users/types/user-role.enum';

export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);
