import { signal } from '@angular/core'
import type { FileViewerSearchAdapter } from '../../../interfaces/file-viewer-search.interface'

export abstract class BaseFileViewerSearchAdapter implements FileViewerSearchAdapter {
  private readonly currentIndexSignal = signal(0)
  readonly currentIndex = this.currentIndexSignal.asReadonly()
  private readonly isOpenSignal = signal(false)
  readonly isOpen = this.isOpenSignal.asReadonly()
  private readonly matchCountSignal = signal(0)
  readonly matchCount = this.matchCountSignal.asReadonly()

  abstract close(): void
  abstract next(): void
  abstract open(): void
  abstract previous(): void
  abstract setQuery(query: string): void
  abstract sync(): void

  toggle() {
    if (this.isOpen()) {
      this.close()
      return
    }
    this.open()
  }

  protected resetMatches() {
    this.setMatches(0, 0)
  }

  protected resetState() {
    this.setOpen(false)
    this.resetMatches()
  }

  protected setMatches(currentIndex: number, matchCount: number) {
    this.currentIndexSignal.set(currentIndex)
    this.matchCountSignal.set(matchCount)
  }

  protected setOpen(isOpen: boolean) {
    this.isOpenSignal.set(isOpen)
  }
}
