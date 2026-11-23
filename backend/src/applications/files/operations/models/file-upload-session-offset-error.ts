import { HttpException, HttpStatus } from '@nestjs/common'

export class FileUploadSessionOffsetError extends HttpException {
  constructor(
    readonly offset: number,
    message = 'Upload offset does not match',
    readonly validatedOffset?: number
  ) {
    super(message, HttpStatus.CONFLICT)
  }
}
