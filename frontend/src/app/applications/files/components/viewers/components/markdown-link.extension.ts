import Link from '@tiptap/extension-link'

/** Keep link destinations containing spaces or parentheses valid when saving Markdown. */
export const MarkdownLink = Link.extend({
  renderMarkdown(node, helpers) {
    const href = node.attrs?.href ?? ''
    const destination = /[\s()]/.test(href) ? `<${href}>` : href
    const title = node.attrs?.title ?? ''
    const text = helpers.renderChildren(node)
    return title ? `[${text}](${destination} "${title}")` : `[${text}](${destination})`
  }
})
