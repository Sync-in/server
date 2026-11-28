import { CONTENT_SECURITY_POLICY, CORS_ORIGINS } from './app.constants.js'

describe('CORS origins', () => {
  it('allows only the configured Photopea origin when enabled', () => {
    expect(CORS_ORIGINS(true, 'https://photopea.example.test/editor/')).toEqual(['https://photopea.example.test'])
  })

  it('does not allow Photopea when disabled or without a configured server', () => {
    expect(CORS_ORIGINS(false, 'https://photopea.example.test')).toEqual([])
    expect(CORS_ORIGINS(true, null)).toEqual([])
  })
})

describe('content security policy', () => {
  it('allows only the configured Photopea server as an additional frame source', () => {
    const policy = CONTENT_SECURITY_POLICY(null, null, null, 'https://www.photopea.com')

    expect(policy.directives.frameSrc).toContain('https://www.photopea.com')
    expect(policy.directives.frameSrc).not.toContain('https://unconfigured.example.test')
  })
})
