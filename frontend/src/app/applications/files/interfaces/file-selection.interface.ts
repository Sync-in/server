export type SelectionAction = 'clipboard' | 'copyMove' | 'download' | 'compress'

export interface SelectionSize {
  size: number
  pendingDirectories: number
  hasError: boolean
}
