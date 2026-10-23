import { MarkdownManager } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { describe, expect, it } from 'vitest'
import { MarkdownLink } from './markdown-link.extension'
import { markdownHeadingSlug, resolveMarkdownLink } from './markdown-link'

describe('Markdown note links', () => {
  const source = 'files/personal/vault/index.md'
  it.each([
    ['notes/first.md', 'files/personal/vault/notes/first.md', ''],
    ['./second.md', 'files/personal/vault/second.md', ''],
    ['../index.md', 'files/personal/index.md', ''],
    ['notes/a%20b.md#Heading%20One', 'files/personal/vault/notes/a b.md', 'Heading One'],
    ['notes/a b.md', 'files/personal/vault/notes/a b.md', ''],
    ['notes/%23literal.MD#heading', 'files/personal/vault/notes/#literal.MD', 'heading'],
    ['note.markdown', 'files/personal/vault/note.markdown', ''],
    ['#local-heading', source, 'local-heading']
  ])('resolves %s without browser-route dependence', (href, path, fragment) => {
    expect(resolveMarkdownLink(source, href)).toEqual({ path, fragment })
  })
  it.each([
    '../../other/secret.md',
    '%2e%2e/%2e%2e/secret.md',
    'a%2fb.md',
    'a%5cb.md',
    'a%00.md',
    'a%FF.md',
    'note.md#%FF',
    '/note.md',
    '//evil.test/note.md',
    'https://example.com/note.md',
    'javascript:alert(1)',
    'data:text/html,test',
    'picture.png',
    '',
    '?query'
  ])('rejects %s', (href) => {
    expect(resolveMarkdownLink(source, href)).toBeNull()
  })
  it('resolves each hop relative to the destination and confines shares', () => {
    const first = resolveMarkdownLink('shares/team/index.md', 'notes/first.md')!
    expect(resolveMarkdownLink(first.path, './second.md')?.path).toBe('shares/team/notes/second.md')
    expect(resolveMarkdownLink(first.path, '../index.md')?.path).toBe('shares/team/index.md')
    expect(resolveMarkdownLink(first.path, '../../other/note.md')).toBeNull()
  })
  it.each(['[Note](./notes/first.md)', '[Spaced](<notes/a b.md>)', '[Heading](notes/a%20b.md#heading)', '[External](https://example.com)'])(
    'keeps portable source through repeated round trips: %s',
    (source) => {
      const manager = new MarkdownManager({ extensions: [StarterKit.configure({ link: false }), MarkdownLink] })
      const original = manager.parse(source)
      let serialized = manager.serialize(original)
      for (let i = 0; i < 3; i++) serialized = manager.serialize(manager.parse(serialized))
      expect(manager.parse(serialized)).toEqual(original)
      expect(serialized).not.toContain('/api/')
    }
  )
  it('supports readable Unicode heading slugs', () => {
    expect(markdownHeadingSlug('Über Links & Notes!')).toBe('über-links--notes')
  })
})
