import { signal, type Signal } from '@angular/core'
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
import { type Editor as TipTapEditor, Extension as TipTapExtension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

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

interface SearchMatch {
  from: number
  to: number
}

interface TipTapSearchPluginState {
  decorations: DecorationSet
  matches: SearchMatch[]
  query: string
}

abstract class BaseFileViewerSearchAdapter implements FileViewerSearchAdapter {
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

export class TipTapFileViewerSearchAdapter extends BaseFileViewerSearchAdapter {
  private readonly pluginKey = new PluginKey<TipTapSearchPluginState>('fileViewerSearch')
  private readonly plugin = this.createPlugin()
  readonly extension = TipTapExtension.create({
    name: 'fileViewerSearch',
    addProseMirrorPlugins: () => [this.plugin]
  })
  private query = ''

  constructor(private readonly getEditor: () => TipTapEditor | null | undefined) {
    super()
  }

  override close() {
    this.setOpen(false)
    this.dispatchSearch('')
    this.resetMatches()
  }

  override next() {
    this.selectMatch(this.currentIndex() >= this.matchCount() ? 1 : this.currentIndex() + 1)
  }

  override open() {
    this.setOpen(true)
    this.dispatchSearch(this.query)
    this.sync()
  }

  override previous() {
    this.selectMatch(this.currentIndex() <= 1 ? this.matchCount() : this.currentIndex() - 1)
  }

  override setQuery(query: string) {
    this.query = query
    this.dispatchSearch(query)
    this.sync()
  }

  override sync() {
    const editor = this.getEditor()
    if (!editor || editor.isDestroyed) {
      this.resetMatches()
      return
    }
    const searchState = this.pluginKey.getState(editor.state)
    if (!searchState) {
      this.resetMatches()
      return
    }
    const selection = editor.state.selection
    const currentIndex = searchState.matches.findIndex((match) => match.from === selection.from && match.to === selection.to)
    this.setMatches(currentIndex === -1 ? 0 : currentIndex + 1, searchState.matches.length)
  }

  private createPlugin(): Plugin<TipTapSearchPluginState> {
    return new Plugin<TipTapSearchPluginState>({
      key: this.pluginKey,
      state: {
        init: (_config, state) => this.createPluginState(state.doc, '', state.selection),
        apply: (transaction, previous, _oldState, newState) => {
          const query = transaction.getMeta(this.pluginKey) as string | undefined
          if (query !== undefined) {
            return this.createPluginState(newState.doc, query, newState.selection)
          }
          if (transaction.docChanged || transaction.selectionSet) {
            return this.createPluginState(newState.doc, previous.query, newState.selection)
          }
          return previous
        }
      },
      props: {
        decorations: (state) => this.pluginKey.getState(state)?.decorations
      }
    })
  }

  private createPluginState(doc: ProseMirrorNode, query: string, selection: { from: number; to: number }): TipTapSearchPluginState {
    const matches = this.findMatches(doc, query)
    const decorations = DecorationSet.create(
      doc,
      matches.map((match) =>
        Decoration.inline(match.from, match.to, {
          class: match.from === selection.from && match.to === selection.to ? 'files-viewer-search-match is-current' : 'files-viewer-search-match'
        })
      )
    )
    return { decorations, matches, query }
  }

  private dispatchSearch(query: string) {
    const editor = this.getEditor()
    if (!editor || editor.isDestroyed) return
    editor.view.dispatch(editor.state.tr.setMeta(this.pluginKey, query))
  }

  private findMatches(doc: ProseMirrorNode, query: string): SearchMatch[] {
    const needle = query.toLocaleLowerCase()
    if (!needle) return []

    const matches: SearchMatch[] = []
    doc.descendants((node, position) => {
      if (!node.isText || !node.text) return
      matches.push(...this.findTextMatches(node.text, needle, position))
    })
    return matches
  }

  private findTextMatches(text: string, needle: string, position: number): SearchMatch[] {
    const matches: SearchMatch[] = []
    const haystack = text.toLocaleLowerCase()
    let index = haystack.indexOf(needle)

    while (index !== -1) {
      const end = index + needle.length
      matches.push({ from: position + index, to: position + end })
      index = haystack.indexOf(needle, index + needle.length)
    }

    return matches
  }

  private selectMatch(index: number) {
    const editor = this.getEditor()
    if (!editor || editor.isDestroyed || index < 1) return
    const searchState = this.pluginKey.getState(editor.state)
    const match = searchState?.matches[index - 1]
    if (!match) return

    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, match.from, match.to)).scrollIntoView())
    this.scrollMatchIntoView(editor, match)
    this.sync()
  }

  private scrollMatchIntoView(editor: TipTapEditor, match: SearchMatch) {
    setTimeout(() => {
      if (editor.isDestroyed) return
      const scrollContainer = this.findScrollContainer(editor.view.dom)
      if (!scrollContainer) return

      const matchTop = editor.view.coordsAtPos(match.from).top
      const containerRect = scrollContainer.getBoundingClientRect()
      const offsetTop = matchTop - containerRect.top
      const scrollMargin = Math.min(120, containerRect.height / 3)

      if (offsetTop < scrollMargin) {
        scrollContainer.scrollTop += offsetTop - scrollMargin
      } else if (offsetTop > containerRect.height - scrollMargin) {
        scrollContainer.scrollTop += offsetTop - containerRect.height + scrollMargin
      }
    })
  }

  private findScrollContainer(element: HTMLElement): HTMLElement | null {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent)
      if (/(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight) {
        return parent
      }
    }
    return null
  }
}
