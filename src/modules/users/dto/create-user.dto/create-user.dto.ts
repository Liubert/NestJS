import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Length } from 'class-validator';
import { trimTransform } from '../../../../common/transformers/trim-transformer';
import { IsPassword } from '../../../../common/validators/password.validator';

export class CreateUserDto {
  @Transform(trimTransform)
  @IsEmail()
  email!: string;

  @IsString()
  @Length(8, 128)
  @IsPassword()
  password!: string;

  @Transform(trimTransform)
  @IsString()
  @Length(1, 50)
  firstName?: string;

  @Transform(trimTransform)
  @IsString()
  @Length(1, 50)
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
