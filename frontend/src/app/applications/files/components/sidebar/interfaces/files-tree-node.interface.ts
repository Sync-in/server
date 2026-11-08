import type { FileTree } from '@sync-in-server/backend/src/applications/files/interfaces/file-tree.interface'

export interface FilesTreeNode {
  data: FileTree
  parent: FilesTreeNode | null
  children: FilesTreeNode[] | null
  level: number
  isExpanded: boolean
  isLoading: boolean
  loadingPromise: Promise<void> | null
}
