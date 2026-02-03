import { NestFastifyApplication } from '@nestjs/platform-fastify'
import { FastifyInstance } from 'fastify'
import { HTTP_METHOD, HTTP_WEBDAV_METHOD } from '../../applications.constants'
import { WEBDAV_NS, WEBDAV_SPACES } from '../constants/routes'
import { WEBDAV_CONTENT_TYPES } from '../constants/webdav'

/**
 * Bootstrap WebDAV-specific Nest/Fastify configuration.
 *
 * - Enables XML body parsing for WebDAV XML-based methods (PROPFIND/PROPPATCH/etc.)
 * - Registers additional WebDAV HTTP methods
 * - Forces binary Content-Type ONLY for WebDAV PUT requests (file uploads)
 *
 * Per RFC 4918, PUT is used to create/replace the content of a resource and the
 * request body must be treated as an opaque stream (even if the file is JSON/XML).
 */
export function bootstrapWebDAV(app: NestFastifyApplication, fastifyInstance: FastifyInstance) {
  // Enable XML body parser for WebDAV XML requests (PROPFIND, PROPPATCH, LOCK, etc.)
  app.useBodyParser(WEBDAV_CONTENT_TYPES)

  // Register WebDAV-specific HTTP methods
  for (const method of Object.values(HTTP_WEBDAV_METHOD)) {
    fastifyInstance.addHttpMethod(method, { hasBody: true })
  }

  /**
   * onRequest hook for WebDAV uploads.
   *
   * WebDAV clients may send JSON/XML files with a Content-Type that triggers
   * Fastify's body parsers (application/json, text/plain, application/xml...).
   * For PUT uploads we must always treat the payload as a raw binary stream.
   *
   * This hook forces `application/octet-stream` for WebDAV PUT requests only,
   * leaving XML-based WebDAV methods unaffected.
   */
  fastifyInstance.addHook('onRequest', (req, _reply, done) => {
    // Only handle WebDAV PUT requests under the WebDAV base path
    if (req.method !== HTTP_METHOD.PUT) return done()
    if (!req.originalUrl.startsWith(WEBDAV_SPACES[WEBDAV_NS.WEBDAV].route)) return done()

    req.headers['content-type'] = 'application/octet-stream'
    return done()
  })
}
