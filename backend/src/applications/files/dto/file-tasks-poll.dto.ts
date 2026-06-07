import { IsArray, IsString } from 'class-validator'

export class FileTasksPollDto {
  @IsArray()
  @IsString({ each: true })
  trackedIds: string[]
}
