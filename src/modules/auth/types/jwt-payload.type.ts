import { UserRole } from '../../users/types/user-role.enum';

export type JwtPayload = {
  sub: string;
  role: UserRole;
  email: string;
  scopes: string[];
};
