import { UserRole } from './user-role.enum';

export type CurrentUserType = {
  userId: string;
  role: UserRole;
  email: string;
  scopes: string[];
};
