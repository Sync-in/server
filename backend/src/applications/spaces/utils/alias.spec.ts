import { createUniqueAlias } from './alias.js'

describe('createUniqueAlias', () => {
  it('resolves aliases from a common base without retaining the numeric suffix', async () => {
    const aliasExists = vi.fn(async (alias: string) => ['docs', 'docs-1', 'docs-2'].includes(alias))

    await expect(createUniqueAlias('docs-2', aliasExists, { replaceCount: true })).resolves.toBe('docs-3')
    expect(aliasExists.mock.calls).toEqual([['docs'], ['docs-1'], ['docs-2'], ['docs-3']])
  })

  it.each([
    [false, 'rapport.pdf', [['rapport.pdf']]],
    [true, 'rapport-1.pdf', [['rapport.pdf'], ['rapport-1.pdf']]]
  ])('resolves a complete root alias with collision=%s', async (collision, expected, calls) => {
    const aliasExists = vi.fn(async (alias: string) => collision && alias === 'rapport.pdf')

    await expect(createUniqueAlias('rapport-2', aliasExists, { extension: '.pdf', replaceCount: true })).resolves.toBe(expected)
    expect(aliasExists.mock.calls).toEqual(calls)
  })

  it.each(['é'.repeat(255), '𐐨'.repeat(255)])('preserves an alias of exactly 255 Unicode code points', async (alias) => {
    const aliasExists = vi.fn(async () => false)

    await expect(createUniqueAlias(alias, aliasExists)).resolves.toBe(alias)
    expect(aliasExists).toHaveBeenCalledExactlyOnceWith(alias)
  })

  it('truncates whole graphemes and reserves the collision suffix within 255 code points', async () => {
    const aliasExists = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const base = 'कि'.repeat(128)

    await expect(createUniqueAlias(base, aliasExists)).resolves.toBe(`${'कि'.repeat(126)}-1`)
    expect(aliasExists.mock.calls).toEqual([['कि'.repeat(127)], [`${'कि'.repeat(126)}-1`]])
  })

  it('reserves additional suffix characters at two digits while keeping the extension', async () => {
    const aliasExists = vi.fn(async (alias: string) => !alias.endsWith('-10.pdf'))

    await expect(createUniqueAlias('a'.repeat(255), aliasExists, { extension: '.pdf' })).resolves.toBe(`${'a'.repeat(248)}-10.pdf`)
    expect(aliasExists).toHaveBeenCalledTimes(11)
    expect(aliasExists).toHaveBeenNthCalledWith(1, `${'a'.repeat(251)}.pdf`)
    expect(aliasExists).toHaveBeenNthCalledWith(10, `${'a'.repeat(249)}-9.pdf`)
    expect(aliasExists).toHaveBeenNthCalledWith(11, `${'a'.repeat(248)}-10.pdf`)
    for (const [alias] of aliasExists.mock.calls) {
      expect(Array.from(alias).length).toBeLessThanOrEqual(255)
    }
  })

  it('bounds an oversized extension while retaining a base and a collision suffix', async () => {
    const aliasExists = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    await expect(createUniqueAlias('rapport', aliasExists, { extension: `.${'x'.repeat(300)}` })).resolves.toBe(`r-1.${'x'.repeat(251)}`)
    expect(aliasExists.mock.calls).toEqual([[`r.${'x'.repeat(253)}`], [`r-1.${'x'.repeat(251)}`]])
  })

  it('drops an extension when its first word grapheme cannot fit without being split', async () => {
    const aliasExists = vi.fn(async () => false)

    await expect(createUniqueAlias('rapport', aliasExists, { extension: `.a${'\u0301'.repeat(254)}` })).resolves.toBe('rapport')
    expect(aliasExists).toHaveBeenCalledExactlyOnceWith('rapport')
  })

  it('uses a bounded fallback when a single base grapheme exceeds the character limit', async () => {
    const aliasExists = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    await expect(createUniqueAlias(`a${'\u0301'.repeat(255)}`, aliasExists)).resolves.toBe('alias-1')
    expect(aliasExists.mock.calls).toEqual([['alias'], ['alias-1']])
  })

  it('keeps a usable base when truncation removes the only letter', async () => {
    const aliasExists = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    await expect(createUniqueAlias(`${'📷'.repeat(255)}a`, aliasExists)).resolves.toBe('alias-1')
    expect(aliasExists.mock.calls).toEqual([['alias'], ['alias-1']])
  })

  it('reserves room for the fallback base when an extension leaves only symbols in the prefix', async () => {
    const aliasExists = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    await expect(createUniqueAlias(`${'📷'.repeat(5)}a`, aliasExists, { extension: `.${'x'.repeat(300)}` })).resolves.toBe(
      `alias-1.${'x'.repeat(247)}`
    )
    expect(aliasExists.mock.calls).toEqual([[`alias.${'x'.repeat(249)}`], [`alias-1.${'x'.repeat(247)}`]])
  })
})
