import { mergeAttributes } from '@tiptap/core'
import Image, { type ImageOptions } from '@tiptap/extension-image'

interface MarkdownImageOptions extends ImageOptions {
  resolveSource: (source: string) => string | null
}

export const MarkdownImage = Image.extend<MarkdownImageOptions>({
  addOptions() {
    return { ...this.parent?.(), resolveSource: (source: string) => source }
  },

  renderMarkdown(node) {
    const src = node.attrs?.src ?? ''
    const alt = node.attrs?.alt ?? ''
    const title = node.attrs?.title ?? ''
    const destination = /[\s()]/.test(src) ? `<${src}>` : src
    return title ? `![${alt}](${destination} "${title}")` : `![${alt}](${destination})`
  },

  addNodeView() {
    return ({ node }) => {
      const image = document.createElement('img')
      const updateImage = (attributes: typeof node.attrs) => {
        const merged = mergeAttributes(this.options.HTMLAttributes, attributes)
        for (const attribute of Array.from(image.attributes)) image.removeAttribute(attribute.name)
        for (const [name, value] of Object.entries(merged)) {
          if (name !== 'src' && value != null) image.setAttribute(name, String(value))
        }
        // Only the live node view resolves paths. HTML clipboard and Markdown serialization retain the source.
        const source = this.options.resolveSource(attributes.src ?? '')
        if (source) image.setAttribute('src', source)
        if (!image.alt) image.alt = attributes.src ?? ''
      }
      updateImage(node.attrs)
      return {
        dom: image,
        update: (updatedNode) => {
          if (updatedNode.type !== node.type) return false
          updateImage(updatedNode.attrs)
          return true
        }
      }
    }
  }
})
