import { SetMetadata } from '@nestjs/common'

export const SKIP_SPACE_GUARD = 'skipSpaceGuard'
export const SkipSpaceGuard = () => SetMetadata(SKIP_SPACE_GUARD, true)
