import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { trimTransform } from '../../../common/transformers/trim-transformer.js';
import { IsPassword } from '../../../common/validators/password.validator.js';
import { UserRole } from '../types/user-role.enum.js';

export class AdminCreateUserDto {
  @Transform(trimTransform)
  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 128)
  @IsPassword()
  password!: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @Transform(trimTransform)
  @IsString()
  @Length(1, 50)
  firstName?: string;

  @IsOptional()
  @Transform(trimTransform)
  @IsString()
  @Length(1, 50)
  lastName?: string;
}
