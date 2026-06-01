import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator'
import { isValidUserLogin } from '../utils/login'

export function IsUserLogin(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'IsUserLogin',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isValidUserLogin(value)
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid user login`
        }
      }
    })
  }
}
