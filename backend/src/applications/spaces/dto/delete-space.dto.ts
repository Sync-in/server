import { IsBoolean, IsOptional } from 'class-validator'

export class DeleteSpaceDto {
  @IsOptional()
  @IsBoolean()
  deleteNow: boolean
}
