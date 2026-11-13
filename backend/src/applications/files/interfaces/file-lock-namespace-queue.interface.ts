export interface FileLockNamespaceQueueWaiter {
  deadline: number
  timeout: ReturnType<typeof setTimeout>
  resolve: () => void
  reject: () => void
}
