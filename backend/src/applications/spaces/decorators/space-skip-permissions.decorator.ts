import { SetMetadata } from '@nestjs/common'

export const SKIP_SPACE_PERMISSIONS_CHECK = 'skipSpacePermissionsCheck'
export const SkipSpacePermissionsCheck = () => SetMetadata(SKIP_SPACE_PERMISSIONS_CHECK, true)
