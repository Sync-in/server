import { Transform, Type } from 'class-transformer'
import { IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator'
import { SYNC_PATH_CONFLICT_MODE, SYNC_PATH_DIFF_MODE, SYNC_PATH_MODE, SYNC_PATH_SCHEDULER_UNIT } from '../constants/sync'
import { SyncPathSettings } from '../interfaces/sync-path.interface'

class SyncPathSchedulerDto {
  @IsInt()
  value: number

  @IsEnum(SYNC_PATH_SCHEDULER_UNIT)
  unit: SYNC_PATH_SCHEDULER_UNIT
}

export class SyncPathDto implements SyncPathSettings {
  @IsOptional()
  @IsInt()
  id?: number

  @IsNotEmpty()
  @IsString()
  name: string

  @IsNotEmpty()
  @IsString()
  localPath: string

  @IsNotEmpty()
  @IsString()
  remotePath: string

  @IsOptional()
  @IsString()
  permissions: string

  @Transform(({ value }) => value.toLowerCase())
  @IsEnum(SYNC_PATH_MODE)
  mode: SYNC_PATH_MODE

  @Transform(({ value }) => value.toLowerCase())
  @IsEnum(SYNC_PATH_DIFF_MODE)
  diffMode: SYNC_PATH_DIFF_MODE

  @Transform(({ value }) => value.toLowerCase())
  @IsEnum(SYNC_PATH_CONFLICT_MODE)
  conflictMode: SYNC_PATH_CONFLICT_MODE

  @IsArray()
  @IsString({ each: true })
  filters: string[]

  @Transform(({ value }) => (value ? value : { value: 0, unit: SYNC_PATH_SCHEDULER_UNIT.DISABLED }))
  @ValidateNested()
  @Type(() => SyncPathSchedulerDto)
  scheduler: SyncPathSchedulerDto

  @IsInt()
  timestamp: number

  @IsBoolean()
  enabled: boolean

  @IsOptional()
  lastSync: Date
}

export class SyncPathUpdateDto extends SyncPathDto {
  @IsOptional()
  declare localPath: string

  @IsOptional()
  declare remotePath: string

  @IsOptional()
  declare timestamp: number
}
