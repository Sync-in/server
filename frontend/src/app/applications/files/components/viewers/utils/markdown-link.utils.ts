import Link from '@tiptap/extension-link'
import type { MarkdownLinkTarget } from '../interfaces/markdown-link.interface'

export const MarkdownLink = Link.extend({
  renderMarkdown(node, helpers) {
    const href = node.attrs?.href ?? ''
    const title = node.attrs?.title ?? ''
    const text = helpers.renderChildren(node)
    const escapedTitle = title.replace(/["\\]/g, '\\$&')
    const destination = /[\s()<>\\]/.test(href) ? `<${href.replace(/[\\<>]/g, '\\$&')}>` : href
    return title ? `[${text}](${destination} "${escapedTitle}")` : `[${text}](${destination})`
  }
})

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

function resolveMarkdownRelativePath(documentPath: string, reference: string): string | null {
  if (!reference || /^(?:[a-z][a-z\d+.-]*:|[/#?\\])/i.test(reference)) return null
  const path = reference.split(/[?#]/, 1)[0]
  const segments = documentPath.split('/')
  if (segments.length < 3 || segments.some((segment) => !segment)) return null
  segments.pop()
  for (const encodedSegment of path.split('/')) {
    let segment: string
    try {
      segment = decodeURIComponent(encodedSegment)
    } catch {
      return null
    }
    if (
      segment.includes('/') ||
      segment.includes('\\') ||
      [...segment].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    ) {
      return null
    }
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (segments.length <= 2) return null
      segments.pop()
    } else {
      segments.push(segment)
    }
  }
  return segments.length > 2 ? segments.join('/') : null
}
