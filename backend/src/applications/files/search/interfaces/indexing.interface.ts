export enum IndexingState {
  PENDING = 'pending',
  RUNNING = 'running',
  STOPPING = 'stopping',
  IDLE = 'idle',
  DISABLED = 'disabled'
}

export interface IndexingStatus {
  indexesCount: number
  state: IndexingState
  lastFullRunAt: number | null
  lastPartialRunAt: number | null
}
