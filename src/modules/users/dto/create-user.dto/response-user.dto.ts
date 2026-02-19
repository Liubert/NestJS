import { UserRole } from '../../types/user-role.enum';

export class UserResponseDto {
  id!: string;
  email!: string;
  firstName!: string;
  lastName!: string | null;
  phone!: string | null;
  role!: UserRole;
}
