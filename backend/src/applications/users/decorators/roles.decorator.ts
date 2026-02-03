import { Reflector } from '@nestjs/core'
import { USER_ROLE } from '../constants/user'

export const UserHaveRole = Reflector.createDecorator<USER_ROLE>()
