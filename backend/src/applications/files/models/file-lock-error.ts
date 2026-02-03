import { FileLock } from '../interfaces/file-lock.interface'

export class LockConflict extends Error {
  lock: FileLock

  constructor(lock: FileLock, message: string) {
    super(message)
    this.name = LockConflict.name
    this.lock = lock
  }
}
