import type { ImageOptions } from '@tiptap/extension-image'

export type MarkdownHeadingLevel = 1 | 2 | 3 | 4
export type MarkdownInlineMark = 'bold' | 'code' | 'italic' | 'strike' | 'underline'
export type MarkdownEditorMode = 'source' | 'visual'

export interface MarkdownImageOptions extends ImageOptions {
  resolveSource: (source: string) => string | null
}

export interface MarkdownLinkTarget {
  path: string
  fragment: string
}
