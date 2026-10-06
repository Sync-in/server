import { Transform } from 'class-transformer'
import { IsBoolean, IsNotEmpty, IsString } from 'class-validator'
import { DB_CHARSET } from './constants.js'

export class MySQLConfig {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (value.endsWith(`?charset=${DB_CHARSET}`) ? value : `${value}?charset=${DB_CHARSET}`))
  url: string

  @IsBoolean()
  logQueries: boolean = false
}
