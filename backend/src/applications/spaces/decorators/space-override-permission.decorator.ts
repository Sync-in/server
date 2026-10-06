import { Reflector } from '@nestjs/core'
import { SPACE_OPERATION } from '../constants/spaces.js'

export const OverrideSpacePermission = Reflector.createDecorator<SPACE_OPERATION>()
