import { applyDecorators, SetMetadata, UseGuards, UseInterceptors } from '@nestjs/common'
import { ContextInterceptor } from '../../../../infrastructure/context/interceptors/context.interceptor'
import { SpaceGuard } from '../../../spaces/guards/space.guard'
import { ONLY_OFFICE_CONTEXT } from './only-office.constants'
import { OnlyOfficeGuard } from './only-office.guard'

export const OnlyOfficeContext = () => SetMetadata(ONLY_OFFICE_CONTEXT, true)
export const OnlyOfficeEnvironment = () => {
  return applyDecorators(OnlyOfficeContext(), UseInterceptors(ContextInterceptor), UseGuards(OnlyOfficeGuard, SpaceGuard))
}
