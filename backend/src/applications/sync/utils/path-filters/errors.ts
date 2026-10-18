export class PathFilterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PathFilterError'
  }
}
