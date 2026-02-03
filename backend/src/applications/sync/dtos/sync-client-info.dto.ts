import { IsEnum, IsString } from 'class-validator'
import { SYNC_CLIENT_TYPE } from '../constants/sync'
import { SyncClientInfo } from '../interfaces/sync-client.interface'

export class SyncClientInfoDto implements SyncClientInfo {
  @IsString()
  node: string

  @IsString()
  os: string

  @IsString()
  osRelease: string

  @IsString()
  user: string

  @IsEnum(SYNC_CLIENT_TYPE)
  type: SYNC_CLIENT_TYPE

  @IsString()
  version: string
}
