import type { Signal } from '@angular/core'
import type { DecorationSet } from '@tiptap/pm/view'

export interface FileViewerSearchAdapter {
  readonly currentIndex: Signal<number>
  readonly isOpen: Signal<boolean>
  readonly matchCount: Signal<number>

  close(): void
  next(): void
  open(): void
  previous(): void
  setQuery(query: string): void
  sync(): void
  toggle(): void
}

export interface FileViewerSearchMatch {
  from: number
  to: number
}

export interface TipTapFileViewerSearchPluginState {
  decorations: DecorationSet
  matches: FileViewerSearchMatch[]
  query: string
}
