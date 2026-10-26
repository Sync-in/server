import { API_FILES_OPERATION_THUMBNAIL } from '@sync-in-server/backend/src/applications/files/constants/routes'
import { encodeUrl } from '@sync-in-server/backend/src/common/shared'
import { getRenderedAttributes, mergeAttributes } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import type { FileModel } from '../../../models/file.model'
import type { MarkdownImageOptions } from '../interfaces/markdown-image.interface'

const MARKDOWN_IMAGE_THUMBNAIL_SIZE = 1024

export const MarkdownImage = Image.extend<MarkdownImageOptions>({
  addOptions() {
    return { ...this.parent?.(), resolveSource: (source: string) => source }
  },

  renderMarkdown(node) {
    const src = node.attrs?.src ?? ''
    const alt = node.attrs?.alt ?? ''
    const title = node.attrs?.title ?? ''
    // TipTap does not escape image fields, so preserve paths and labels containing Markdown delimiters.
    const escapedAlt = alt.replace(/[\\[\]]/g, '\\$&')
    const escapedTitle = title.replace(/["\\]/g, '\\$&')
    const destination = /[\s()<>\\]/.test(src) ? `<${src.replace(/[\\<>]/g, '\\$&')}>` : src
    return title ? `![${escapedAlt}](${destination} "${escapedTitle}")` : `![${escapedAlt}](${destination})`
  },

  addNodeView() {
    if (typeof document === 'undefined') return null

    return ({ node, HTMLAttributes, editor }) => {
      const image = document.createElement('img')
      let previousAttributes: Record<string, unknown> = {}
      let previousResolvedSource: string | null = null
      const updateImage = (attributes: Record<string, unknown>) => {
        const nextAttributes = mergeAttributes(this.options.HTMLAttributes, attributes)

        for (const name of Object.keys(previousAttributes)) {
          if (!(name in nextAttributes)) image.removeAttribute(name)
        }
        for (const [name, value] of Object.entries(nextAttributes)) {
          if (name === 'src' || previousAttributes[name] === value) continue
          if (value == null) {
            image.removeAttribute(name)
          } else {
            image.setAttribute(name, String(value))
          }
        }

        // Only the live node view resolves paths. HTML clipboard and Markdown serialization retain the source.
        const source = typeof nextAttributes.src === 'string' ? this.options.resolveSource(nextAttributes.src) : null
        if (source !== previousResolvedSource) {
          if (source) {
            image.setAttribute('src', source)
          } else {
            image.removeAttribute('src')
          }
          previousResolvedSource = source
        }
        previousAttributes = nextAttributes
      }
      updateImage(HTMLAttributes)
      const extensionAttributes = editor.extensionManager.attributes.filter((attribute) => attribute.type === node.type.name)

      return {
        dom: image,
        update: (updatedNode) => {
          if (updatedNode.type !== node.type) return false
          updateImage(getRenderedAttributes(updatedNode, extensionAttributes))
          return true
        }
      }
    }
  }
})

export function isAllowedAbsoluteImageSource(source: string): boolean {
  if (source !== source.trim()) return false
  if (source.slice(0, 11).toLowerCase() === 'data:image/') return true

  try {
    const imageUrl = source.startsWith('/') ? new URL(source, window.location.href) : new URL(source)
    return (imageUrl.protocol === 'http:' || imageUrl.protocol === 'https:') && imageUrl.origin === window.location.origin
  } catch {
    return false
  }
}

export function resolveMarkdownRelativeImageUrl(file: FileModel, reference: string): string | null {
  if (!reference || file.root || reference !== reference.trim()) return null

  try {
    const documentUrl = new URL(file.thumbnailUrl, window.location.href)
    const scopeUrl = new URL(`${API_FILES_OPERATION_THUMBNAIL}/${encodeUrl(file.basePath)}/`, window.location.href)
    if (!documentUrl.pathname.startsWith(scopeUrl.pathname)) return null

    const imageUrl = new URL(reference, documentUrl)
    if (imageUrl.origin !== scopeUrl.origin || !imageUrl.pathname.startsWith(scopeUrl.pathname) || imageUrl.pathname.endsWith('/')) {
      return null
    }
    return `${imageUrl.pathname}?size=${MARKDOWN_IMAGE_THUMBNAIL_SIZE}`
  } catch {
    return null
  }
}
