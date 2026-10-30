import type { ImageOptions } from '@tiptap/extension-image'

export interface MarkdownImageOptions extends ImageOptions {
  resolveSource: (source: string) => string | null
}

export interface MarkdownLinkTarget {
  path: string
  fragment: string
}
