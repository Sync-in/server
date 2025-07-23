/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

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
