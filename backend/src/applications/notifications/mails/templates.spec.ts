import type { i18nLocale } from '../../../common/i18n'
import { commentMail } from './models'
import { mailAuthor, mailEventOnElement, mailItalicContent } from './templates'

describe('mail templates escaping', () => {
  const language: i18nLocale = 'fr'
  const payload = `<img src=x onerror="alert('xss')">`
  const escapedPayload = '&lt;img src=x onerror=&quot;alert(&apos;xss&apos;)&quot;&gt;'
  const escapedUrlPayload = '%3Cimg%20src%3Dx%20onerror%3D%22alert(&apos;xss&apos;)%22%3E'

  it('escapes author display name and avatar source', () => {
    const html = mailAuthor({
      fullName: payload,
      avatarBase64: `data:image/svg+xml,"${payload}"`
    } as any)

    expect(html).toContain(`<b>${escapedPayload}</b>`)
    expect(html).toContain('src="data:image/svg+xml,&quot;&lt;img src=x onerror=&quot;alert(&apos;xss&apos;)&quot;&gt;&quot;"')
    expect(html).not.toContain('<img src=x onerror=')
  })

  it('escapes event element and italic content', () => {
    expect(mailEventOnElement(payload, payload)).toContain(`${escapedPayload}:&nbsp;<b>${escapedPayload}</b>`)
    expect(mailItalicContent(payload)).toBe(`<p><i>${escapedPayload}</i></p>`)
  })

  it('escapes comment mail content and encodes generated URL values', () => {
    const [, html] = commentMail(
      language,
      {
        app: 'comments',
        event: payload,
        element: `file ${payload}.txt`,
        url: `space/${payload}`
      } as any,
      {
        content: payload,
        currentUrl: 'https://sync-in.test',
        author: { fullName: payload, avatarBase64: 'avatar', login: 'attacker' } as any
      }
    )

    expect(html).toContain(escapedPayload)
    expect(html).toContain(`space/${escapedUrlPayload}`)
    expect(html).toContain(`select=file%20${escapedUrlPayload}.txt`)
    expect(html).not.toContain('<img src=x onerror=')
  })
})
