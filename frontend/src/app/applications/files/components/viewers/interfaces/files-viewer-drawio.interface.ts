export interface DrawioEditorEvent {
  event: string
  error?: boolean | string
  exit?: boolean
  message?: string
  xml?: string
}
