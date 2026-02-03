export class FileError extends Error {
  httpCode: number

  constructor(httpCode: number, message: string) {
    super(message)
    this.name = FileError.name
    this.httpCode = httpCode
  }
}
