import { type Extension as CodeMirrorExtension, Prec } from '@codemirror/state'
import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  search,
  searchPanelOpen,
  SearchQuery,
  setSearchQuery
} from '@codemirror/search'
import { EditorView } from '@codemirror/view'
import { BaseFileViewerSearchAdapter } from './files-viewer-search-adapter'

export class CodeMirrorFileViewerSearchAdapter extends BaseFileViewerSearchAdapter {
  readonly extensions: CodeMirrorExtension[] = [
    Prec.highest(
      EditorView.domEventHandlers({
        keydown: (event) => {
          if (!this.isSearchShortcut(event)) return false
          event.preventDefault()
          event.stopPropagation()
          this.toggle()
          return true
        }
      })
    ),
    search({
      createPanel: () => {
        const dom = document.createElement('div')
        dom.className = 'files-viewer-search-hidden-panel'
        dom.hidden = true
        return { dom }
      }
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged || update.selectionSet) {
        this.syncView(update.view)
      }
    })
  ]
  private query = ''

  constructor(private readonly getView: () => EditorView | null | undefined) {
    super()
  }

  override close() {
    const view = this.getView()
    if (view) closeSearchPanel(view)
    this.setOpen(false)
    this.resetMatches()
  }

  override next() {
    const view = this.getView()
    if (!view) return
    findNext(view)
    this.syncView(view)
  }

  override open() {
    const view = this.getView()
    if (!view) return
    openSearchPanel(view)
    this.dispatchQuery(view, this.query)
    this.syncView(view)
  }

  override previous() {
    const view = this.getView()
    if (!view) return
    findPrevious(view)
    this.syncView(view)
  }

  override setQuery(query: string) {
    const view = this.getView()
    this.query = query
    if (!view) {
      this.resetState()
      return
    }
    this.dispatchQuery(view, query)
    this.syncView(view)
  }

  override sync() {
    const view = this.getView()
    if (!view) {
      this.resetState()
      return
    }
    this.syncView(view)
  }

  override toggle() {
    this.sync()
    super.toggle()
  }

  private isSearchShortcut(event: KeyboardEvent): boolean {
    return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f'
  }

  private syncView(view: EditorView) {
    const isOpen = searchPanelOpen(view.state)
    this.setOpen(isOpen)
    if (!isOpen) {
      this.resetMatches()
      return
    }
    const query = getSearchQuery(view.state)
    if (!query.search || !query.valid) {
      this.resetMatches()
      return
    }

    const selection = view.state.selection.main
    let currentIndex = 0
    let matchCount = 0
    const cursor = query.getCursor(view.state)

    for (let match = cursor.next(); !match.done; match = cursor.next()) {
      matchCount++
      if (match.value.from === selection.from && match.value.to === selection.to) {
        currentIndex = matchCount
      }
    }

    this.setMatches(currentIndex, matchCount)
  }

  private dispatchQuery(view: EditorView, query: string) {
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: query })) })
  }
}
