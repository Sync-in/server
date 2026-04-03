import EventEmitter from 'node:events'
import type { FileEventEmit, FileTaskEventEmit } from '../interfaces/file-event.interface'

export const FileTaskEvent: EventEmitter<FileTaskEventEmit> = new EventEmitter<FileTaskEventEmit>()

export const FileEvent: EventEmitter<FileEventEmit> = new EventEmitter<FileEventEmit>()
