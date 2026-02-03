import { SetMetadata } from '@nestjs/common'

export const SYNC_CONTEXT = 'SyncContext'
export const SyncContext = () => SetMetadata(SYNC_CONTEXT, true)
