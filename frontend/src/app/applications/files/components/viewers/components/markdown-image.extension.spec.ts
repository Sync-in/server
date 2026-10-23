import { MarkdownManager } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'
import { MarkdownImage } from './markdown-image.extension'

describe('MarkdownImage serialization', () => {
  const manager = new MarkdownManager({ extensions: [StarterKit, MarkdownImage.configure({ allowBase64: true })] })

  it.each([
    '![Photo](images/photo.png)',
    '![Photo](../assets/photo.png "Title")',
    '![Photo](images/a%20b.png)',
    '![Photo](<images/a b.png>)',
    '![Photo](<images/a(b).png>)',
    '![Photo](https://example.com/photo.png)',
    '![Photo](data:image/png;base64,AAAA)'
  ])('retains the image source through repeated visual/source round trips: %s', (markdown) => {
    const original = manager.parse(markdown)
    let serialized = manager.serialize(original)
    for (let i = 0; i < 3; i++) serialized = manager.serialize(manager.parse(serialized))
    expect(manager.parse(serialized)).toEqual(original)
    expect(serialized).not.toContain('/api/')
  })
})
