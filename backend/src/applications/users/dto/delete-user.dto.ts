import { IsBoolean } from 'class-validator'

export class DeleteUserDto {
  @IsBoolean()
  deleteSpace: boolean
}
