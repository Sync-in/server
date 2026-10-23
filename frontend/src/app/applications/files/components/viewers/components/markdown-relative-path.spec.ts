import { describe, expect, it } from 'vitest'
import { resolveMarkdownRelativePath } from './markdown-relative-path'

describe('resolveMarkdownRelativePath', () => {
  it.each([
    ['images/photo.png', 'files/personal/notes/images/photo.png'],
    ['./images/photo.png', 'files/personal/notes/images/photo.png'],
    ['../assets/photo.png', 'files/personal/assets/photo.png'],
    ['images/../photo.png', 'files/personal/notes/photo.png'],
    ['images/a b.png', 'files/personal/notes/images/a b.png'],
    ['images/a%20b.png', 'files/personal/notes/images/a b.png'],
    ['images/%2520.png', 'files/personal/notes/images/%20.png'],
    ['images/%23%3F.png', 'files/personal/notes/images/#?.png'],
    ['images/über.png', 'files/personal/notes/images/über.png'],
    ['image.png#preview', 'files/personal/notes/image.png']
  ])('resolves %s', (reference, expected) => {
    expect(resolveMarkdownRelativePath('files/personal/notes/index.md', reference)).toBe(expected)
  })

  it.each([
    '',
    '../../other/image.png',
    '%2e%2e/%2e%2e/image.png',
    'image%2fsecret.png',
    'image%5csecret.png',
    'image%00.png',
    'image%FF.png',
    'https://example.com/a.png',
    'data:image/png;base64,AA',
    '//example.com/a.png',
    '/image.png',
    '#heading',
    '?query',
    '../..'
  ])('does not resolve %s as a relative file', (reference) => {
    expect(resolveMarkdownRelativePath('files/personal/notes/index.md', reference)).toBeNull()
  })

  it('keeps the current share and resolves from the destination document directory', () => {
    expect(resolveMarkdownRelativePath('shares/my-share/sub/next.md', '../image.png')).toBe('shares/my-share/image.png')
    expect(resolveMarkdownRelativePath('shares/my-share/index.md', '../image.png')).toBeNull()
    expect(resolveMarkdownRelativePath('files/team/root/sub/index.md', '../image.png')).toBe('files/team/root/image.png')
  })
})
