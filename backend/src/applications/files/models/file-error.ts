export class FileError extends Error {
  httpCode: number

  constructor(httpCode: number, message: string) {
    super(message)
    this.name = FileError.name
    this.httpCode = httpCode
  }
}

export class SourceCleanupError extends Error {
  // The destination is committed, but the obsolete source still requires manual or deferred cleanup.
  constructor(
    readonly srcPath: string,
    readonly dstPath: string,
    options: ErrorOptions
  ) {
    super('Destination was published but the source could not be removed', options)
    this.name = SourceCleanupError.name
  }
}
