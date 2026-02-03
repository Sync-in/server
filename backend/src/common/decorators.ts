import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator'

export function RejectIfMatch(regex: RegExp, validationOptions?: ValidationOptions) {
  return function (object: any, propertyName: string) {
    registerDecorator({
      name: 'RejectIfMatch',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          return typeof value === 'string' && !regex.test(value)
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} ne doit pas correspondre à ${regex}`
        }
      }
    })
  }
}
