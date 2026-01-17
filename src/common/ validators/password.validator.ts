// src/common/validators/password.validator.ts
import { Matches, ValidationOptions } from 'class-validator';

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;
const PASSWORD_MESSAGE =
  'Password must contain at least one letter and one number';

export function IsPassword(validationOptions?: ValidationOptions) {
  const options: ValidationOptions = {
    ...(validationOptions || {}),
    message:
      (validationOptions && validationOptions.message) || PASSWORD_MESSAGE,
  };
  return Matches(PASSWORD_REGEX, options);
}

// Example usage in a DTO:
// import { IsPassword } from '../../../common/validators/password.validator';
// class CreateUserDto {
//   @IsPassword()
//   password: string;
// }
