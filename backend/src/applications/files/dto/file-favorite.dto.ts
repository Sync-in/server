import { IsInt, IsNotEmpty, Min } from 'class-validator'

export class FileFavoriteDto {
  @IsNotEmpty()
  @IsInt()
  fileId: number
}

export class DeleteFileFavoriteDto {
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  fileId: number
}
