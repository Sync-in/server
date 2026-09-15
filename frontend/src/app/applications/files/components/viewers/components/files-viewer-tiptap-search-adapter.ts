import { type Editor as TipTapEditor, Extension as TipTapExtension } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { FileViewerSearchMatch, TipTapFileViewerSearchPluginState } from '../../../interfaces/file-viewer-search.interface'
import { BaseFileViewerSearchAdapter } from './files-viewer-search-adapter'

export class TipTapFileViewerSearchAdapter extends BaseFileViewerSearchAdapter {
  private readonly pluginKey = new PluginKey<TipTapFileViewerSearchPluginState>('fileViewerSearch')
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

  private createPlugin(): Plugin<TipTapFileViewerSearchPluginState> {
    return new Plugin<TipTapFileViewerSearchPluginState>({
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

  private createPluginState(doc: ProseMirrorNode, query: string, selection: { from: number; to: number }): TipTapFileViewerSearchPluginState {
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

  private findMatches(doc: ProseMirrorNode, query: string): FileViewerSearchMatch[] {
    const needle = query.toLocaleLowerCase()
    if (!needle) return []

    const matches: FileViewerSearchMatch[] = []
    doc.descendants((node, position) => {
      if (!node.isText || !node.text) return
      matches.push(...this.findTextMatches(node.text, needle, position))
    })
    return matches
  }

  private findTextMatches(text: string, needle: string, position: number): FileViewerSearchMatch[] {
    const matches: FileViewerSearchMatch[] = []
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

  private scrollMatchIntoView(editor: TipTapEditor, match: FileViewerSearchMatch) {
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
