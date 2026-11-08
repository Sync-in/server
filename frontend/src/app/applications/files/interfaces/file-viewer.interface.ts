import type { FileModel } from '../models/file.model'

export type FileChangeHandler = (file: FileModel) => void
export type ViewerHookResult = { action: 'open'; shortMime: string } | { action: 'offerDownload'; message?: string }
