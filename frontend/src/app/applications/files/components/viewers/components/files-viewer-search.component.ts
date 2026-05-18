import { Component, effect, ElementRef, input, signal, untracked, viewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faChevronDown, faChevronUp, faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons'
import type { FileViewerSearchAdapter } from './files-viewer-search-adapter'

@Component({
  selector: 'app-files-viewer-search',
  imports: [FormsModule, FaIconComponent],
  styleUrl: 'files-viewer-search.component.scss',
  templateUrl: 'files-viewer-search.component.html'
})
export class FilesViewerSearchComponent {
  adapter = input.required<FileViewerSearchAdapter>()
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput')
  protected readonly icons = { faChevronDown, faChevronUp, faMagnifyingGlass, faXmark }
  protected readonly query = signal('')
  private currentAdapter: FileViewerSearchAdapter | null = null

  constructor() {
    effect(() => {
      const adapter = this.adapter()
      const isOpen = adapter.isOpen()
      if (adapter !== this.currentAdapter) {
        this.switchAdapter(adapter)
      }
      if (isOpen) {
        setTimeout(() => this.searchInput()?.nativeElement.focus())
      }
    })
  }

  protected queryChange(query: string) {
    this.query.set(query)
    this.adapter().setQuery(query)
  }

  protected searchKeyDown(event: KeyboardEvent) {
    event.stopPropagation()

    if (event.key === 'Enter') {
      event.preventDefault()
      const adapter = this.adapter()
      if (event.shiftKey) {
        adapter.previous()
      } else {
        adapter.next()
      }
      return
    }

    if (event.key === 'Escape' || event.key === 'Esc') {
      event.preventDefault()
      this.adapter().close()
    }
  }

  private switchAdapter(adapter: FileViewerSearchAdapter) {
    const previousAdapter = this.currentAdapter
    const wasOpen = previousAdapter?.isOpen() ?? false
    previousAdapter?.close()
    this.currentAdapter = adapter

    if (wasOpen) {
      adapter.open()
      adapter.setQuery(untracked(() => this.query()))
    }
  }
}
