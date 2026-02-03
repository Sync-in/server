import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class CreateOrUpdateCommentDto {
  @IsNotEmpty()
  @IsInt()
  fileId: number

  @IsNotEmpty()
  @IsString()
  content: string

  @IsOptional()
  @IsInt()
  commentId?: number
}

export class DeleteCommentDto {
  @IsNotEmpty()
  @IsInt()
  fileId: number

  @IsInt()
  commentId: number
}
