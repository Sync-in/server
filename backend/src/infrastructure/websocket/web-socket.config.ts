import { IsIn, IsNotEmpty, IsString, ValidateIf } from 'class-validator'

export class WebSocketConfig {
  @IsString()
  @IsNotEmpty()
  @IsIn(['redis', 'cluster'])
  adapter: 'redis' | 'cluster' = 'cluster'

  @ValidateIf((o: WebSocketConfig) => o.adapter === 'redis')
  @IsString()
  @IsNotEmpty()
  // requires optional dependency: @socket.io/redis-adapter
  redis: string = 'redis://127.0.0.1:6379'

  @IsString()
  @IsNotEmpty()
  corsOrigin: string = '*'
}
