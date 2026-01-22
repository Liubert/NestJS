import { Matches, ValidationOptions } from 'class-validator';

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;
const PASSWORD_MESSAGE =
  'Password must contain at least one letter and one number';

// TODO: In future, should be used for forgot password and change password flows.

export function IsPassword(validationOptions?: ValidationOptions) {
  const options: ValidationOptions = {
    ...(validationOptions || {}),
    message:
      (validationOptions && validationOptions.message) || PASSWORD_MESSAGE,
  };
  return Matches(PASSWORD_REGEX, options);
}
