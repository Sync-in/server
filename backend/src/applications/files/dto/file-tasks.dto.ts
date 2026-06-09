import { ArrayNotEmpty, IsArray, IsString } from 'class-validator'

export class FileTasksDeleteDto {
  @ArrayNotEmpty()
  @IsArray()
  @IsString({ each: true })
  taskIds: string[]
}

export class FileTasksPollDto {
  @IsArray()
  @IsString({ each: true })
  trackedIds: string[]
}
