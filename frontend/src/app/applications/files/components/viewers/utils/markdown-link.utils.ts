import { API_FILES_OPERATION } from '@sync-in-server/backend/src/applications/files/constants/routes'
import { encodeUrl } from '@sync-in-server/backend/src/common/shared'
import Link from '@tiptap/extension-link'
import type { FileModel } from '../../../models/file.model'
import type { MarkdownLinkTarget } from '../interfaces/markdown-link.interface'
import { renderMarkdownDestination, resolveMarkdownRelativeUrl } from './markdown.utils'

const FILES_OPERATION_PATH = `${API_FILES_OPERATION}/`

export const MarkdownLink = Link.extend({
  renderMarkdown(node, helpers) {
    const href = node.attrs?.href ?? ''
    const title = node.attrs?.title ?? ''
    const text = helpers.renderChildren(node)
    return `[${text}](${renderMarkdownDestination(href, title)})`
  }
})

export function resolveMarkdownLink(file: FileModel, href: string): MarkdownLinkTarget | null {
  if (href.startsWith('/') || href.startsWith('?') || href.includes('\\')) return null

  const targetUrl = resolveMarkdownRelativeUrl(file.dataUrl, `${API_FILES_OPERATION}/${encodeUrl(file.basePath)}/`, href)
  if (!targetUrl || !targetUrl.pathname.startsWith(FILES_OPERATION_PATH)) return null
  const path = decodeMarkdownPath(targetUrl.pathname.slice(FILES_OPERATION_PATH.length))
  if (!path) return null
  const lowerPath = path.toLowerCase()
  if (!lowerPath.endsWith('.md') && !lowerPath.endsWith('.markdown')) return null

  try {
    return { path, fragment: decodeURIComponent(targetUrl.hash.slice(1)) }
  } catch {
    return null
  }
}

export function markdownHeadingSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-')
}

function decodeMarkdownPath(encodedPath: string): string | null {
  const segments: string[] = []
  for (const encodedSegment of encodedPath.split('/')) {
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
    if (!segment || segment === '.' || segment === '..') return null
    segments.push(segment)
  }
  return segments.join('/')
}
