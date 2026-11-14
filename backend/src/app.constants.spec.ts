import fastifyHelmet from '@fastify/helmet'
import Fastify from 'fastify'
import { CONTENT_SECURITY_POLICY } from './app.constants.js'

describe('Content Security Policy', () => {
  it('allows PDF.js blob images in the emitted header without relaxing other directives', async () => {
    const app = Fastify()
    try {
      await app.register(fastifyHelmet, { contentSecurityPolicy: CONTENT_SECURITY_POLICY(null, null, null) })
      app.get('/', async () => 'PDF viewer')
      const response = await app.inject({ method: 'GET', url: '/' })
      const directives = String(response.headers['content-security-policy'])
        .split(';')
        .map((directive) => directive.trim())

      expect(response.statusCode).toBe(200)
      expect(directives).toContain("img-src 'self' data: blob:")
      expect(directives).toContain("default-src 'self'")
      expect(directives).toContain("object-src 'none'")
      expect(directives).toContain("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'")
    } finally {
      await app.close()
    }
  })
})
