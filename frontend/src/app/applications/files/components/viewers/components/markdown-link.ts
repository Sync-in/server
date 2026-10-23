import { resolveMarkdownRelativePath } from './markdown-relative-path'

export interface MarkdownLinkTarget {
  path: string
  fragment: string
}

/** Only standard, document-relative Markdown links; never guess vault-wide names. */
export function resolveMarkdownLink(documentPath: string, href: string): MarkdownLinkTarget | null {
  const hash = href.indexOf('#')
  const reference = hash < 0 ? href : href.slice(0, hash)
  let fragment = ''
  try {
    fragment = hash < 0 ? '' : decodeURIComponent(href.slice(hash + 1))
  } catch {
    return null
  }
  const path = !reference && hash === 0 ? documentPath : resolveMarkdownRelativePath(documentPath, reference)
  return path && /\.(md|markdown)$/i.test(path) ? { path, fragment } : null
}

export function markdownHeadingSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-')
}
