import { Reflector } from '@nestjs/core'
import type { USER_PERMISSION } from '../constants/user'

export const UserHavePermission = Reflector.createDecorator<USER_PERMISSION | USER_PERMISSION[]>()
