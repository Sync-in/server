import { NestFastifyApplication } from '@nestjs/platform-fastify'
import { randomUUID } from 'node:crypto'
import { appBootstrap } from '../../app.bootstrap.js'
import { HTTP_METHOD } from '../applications.constants.js'
import { XML_CONTENT_TYPE } from './constants/webdav.js'

const XML_VERSION_STR = '<?xml version="1.0" encoding="utf-8" standalone="yes"?>'

describe('WebDAV (e2e)', () => {
  let app: NestFastifyApplication

  beforeAll(async () => {
    app = await appBootstrap()
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('should be defined', () => {
    expect(app).toBeDefined()
  })

  it.each([
    HTTP_METHOD.HEAD,
    HTTP_METHOD.PROPFIND,
    HTTP_METHOD.PUT,
    HTTP_METHOD.DELETE,
    HTTP_METHOD.COPY,
    HTTP_METHOD.MOVE,
    HTTP_METHOD.LOCK,
    HTTP_METHOD.UNLOCK,
    HTTP_METHOD.PROPPATCH,
    HTTP_METHOD.MKCOL
  ])('%s on a WebDAV file route should reach the Basic auth guard', async (method) => {
    const res = await app.inject({
      method,
      url: '/webdav/personal/__route_probe__'
    } as any)

    expect(res.statusCode).toEqual(401)
    expect(res.headers['www-authenticate']).toEqual('Basic realm="Sync-in"')
  })

  it('PROPFIND ALLPROP /webdav => 207', async () => {
    const res = await app.inject({
      method: 'PROPFIND',
      url: '/webdav',
      headers: { authorization: 'Basic am86cGFzc3dvcmQ=', 'content-type': XML_CONTENT_TYPE, Depth: '1' },
      body: `${XML_VERSION_STR}
       <propfind xmlns:D="DAV:">
         <allprop/>
       </propfind>`
    } as any)
    expect(res.statusCode).toEqual(207)
  })

  it('PROPFIND PROP /webdav => 207', async () => {
    const res = await app.inject({
      method: 'PROPFIND',
      url: '/webdav',
      headers: { authorization: 'Basic am86cGFzc3dvcmQ=', 'content-type': XML_CONTENT_TYPE, Depth: '1' },
      body: `${XML_VERSION_STR}
        <D:propfind xmlns:D="DAV:">
        <D:prop>
          <D:creationdate/>
          <D:displayname/>
          <D:getcontentlength/>
          <D:getcontenttype/>
          <D:getetag/>
          <D:getlastmodified/>
          <D:resourcetype/>
        </D:prop>
       </D:propfind>`
    } as any)
    expect(res.statusCode).toEqual(207)
  })

  describe('collection locks without inheritance', () => {
    const auth = 'Basic am86cGFzc3dvcmQ='
    const collectionPath = `/webdav/personal/test-collection-lock-${randomUUID()}`
    let lockToken: string | undefined

    afterEach(async () => {
      if (lockToken) {
        await app.inject({
          method: 'UNLOCK',
          url: collectionPath,
          headers: { authorization: auth, 'lock-token': lockToken }
        } as any)
        lockToken = undefined
      }
      await app.inject({ method: 'DELETE', url: collectionPath, headers: { authorization: auth } } as any)
    })

    it('persists a Depth infinity collection lock without blocking a child and requires its token to delete the collection', async () => {
      const mkcolRes = await app.inject({ method: 'MKCOL', url: collectionPath, headers: { authorization: auth } } as any)
      expect(mkcolRes.statusCode).toBe(201)

      const lockRes = await app.inject({
        method: 'LOCK',
        url: collectionPath,
        headers: {
          authorization: auth,
          'content-type': XML_CONTENT_TYPE,
          depth: 'infinity',
          timeout: 'Second-60'
        },
        body: '<lockinfo xmlns="DAV:"><lockscope><exclusive/></lockscope><locktype><write/></locktype><owner>e2e</owner></lockinfo>'
      } as any)
      expect(lockRes.statusCode).toBe(200)
      const returnedLockToken = lockRes.headers['lock-token']
      lockToken = Array.isArray(returnedLockToken) ? returnedLockToken[0] : returnedLockToken
      expect(lockToken).toBeDefined()
      if (!lockToken) throw new Error('LOCK response did not provide a lock token')

      const lockDiscoveryRes = await app.inject({
        method: 'PROPFIND',
        url: collectionPath,
        headers: { authorization: auth, 'content-type': XML_CONTENT_TYPE, depth: '0' },
        body: '<propfind xmlns="DAV:"><prop><lockdiscovery/></prop></propfind>'
      } as any)
      expect(lockDiscoveryRes.statusCode).toBe(207)
      expect(lockDiscoveryRes.body).toContain(lockToken.slice(1, -1))

      const childPutRes = await app.inject({
        method: 'PUT',
        url: `${collectionPath}/child.txt`,
        headers: { authorization: auth, 'content-type': 'text/plain' },
        body: 'child'
      } as any)
      expect([201, 204]).toContain(childPutRes.statusCode)

      const deleteWithoutTokenRes = await app.inject({ method: 'DELETE', url: collectionPath, headers: { authorization: auth } } as any)
      expect(deleteWithoutTokenRes.statusCode).toBe(423)

      const deleteWithTokenRes = await app.inject({
        method: 'DELETE',
        url: collectionPath,
        headers: { authorization: auth, if: `(${lockToken})` }
      } as any)
      expect(deleteWithTokenRes.statusCode).toBe(204)
      lockToken = undefined
    })
  })

  describe('PUT with non-XML Content-Types (stream preservation)', () => {
    const testFilePath = `/webdav/personal/test-content-type-${randomUUID()}.txt`
    const auth = 'Basic am86cGFzc3dvcmQ='

    afterEach(async () => {
      // Cleanup: delete the test file if it exists
      await app.inject({
        method: 'DELETE',
        url: testFilePath,
        headers: { authorization: auth }
      } as any)
    })

    it('PUT with application/json should preserve stream and create file with content', async () => {
      const jsonContent = '{"key":"value","number":42}'

      const putRes = await app.inject({
        method: 'PUT',
        url: testFilePath,
        headers: {
          authorization: auth,
          'content-type': 'application/json'
        },
        body: jsonContent
      } as any)

      expect([201, 204]).toContain(putRes.statusCode)

      // Verify the file was created with the correct content
      const getRes = await app.inject({
        method: 'GET',
        url: testFilePath,
        headers: { authorization: auth }
      } as any)

      expect(getRes.statusCode).toEqual(200)
      expect(getRes.body).toEqual(jsonContent)
      expect(getRes.headers['content-length']).toEqual(String(jsonContent.length))
    })

    it('PUT with text/plain should preserve stream and create file with content', async () => {
      const textContent = 'This is plain text content with special chars: éàù'

      const putRes = await app.inject({
        method: 'PUT',
        url: testFilePath,
        headers: {
          authorization: auth,
          'content-type': 'text/plain'
        },
        body: textContent
      } as any)

      expect([201, 204]).toContain(putRes.statusCode)

      // Verify the file was created with the correct content
      const getRes = await app.inject({
        method: 'GET',
        url: testFilePath,
        headers: { authorization: auth }
      } as any)

      expect(getRes.statusCode).toEqual(200)
      expect(getRes.body).toEqual(textContent)
      expect(getRes.headers['content-length']).toEqual(String(Buffer.byteLength(textContent, 'utf8')))
    })

    it('HEAD and Range GET should preserve file metadata and partial content', async () => {
      const textContent = '0123456789abcdefghij'
      const contentLength = Buffer.byteLength(textContent, 'utf8')

      const putRes = await app.inject({
        method: 'PUT',
        url: testFilePath,
        headers: {
          authorization: auth,
          'content-type': 'text/plain'
        },
        body: textContent
      } as any)

      expect([201, 204]).toContain(putRes.statusCode)

      const headRes = await app.inject({
        method: 'HEAD',
        url: testFilePath,
        headers: { authorization: auth }
      } as any)

      expect(headRes.statusCode).toEqual(200)
      expect(headRes.rawPayload).toHaveLength(0)
      expect(headRes.headers['content-length']).toEqual(String(contentLength))
      expect(headRes.headers['accept-ranges']).toEqual('bytes')

      const rangeRes = await app.inject({
        method: 'GET',
        url: testFilePath,
        headers: {
          authorization: auth,
          range: 'bytes=5-9'
        }
      } as any)

      expect(rangeRes.statusCode).toEqual(206)
      expect(rangeRes.body).toEqual('56789')
      expect(rangeRes.headers['content-length']).toEqual('5')
      expect(rangeRes.headers['content-range']).toEqual(`bytes 5-9/${contentLength}`)
    })

    it('PUT with text/plain; charset=utf-8 should preserve stream and create file with content', async () => {
      const textContent = 'Text with charset and emoji: 🚀 ✅'

      const putRes = await app.inject({
        method: 'PUT',
        url: testFilePath,
        headers: {
          authorization: auth,
          'content-type': 'text/plain; charset=utf-8'
        },
        body: textContent
      } as any)

      expect([201, 204]).toContain(putRes.statusCode)

      // Verify the file was created with the correct content
      const getRes = await app.inject({
        method: 'GET',
        url: testFilePath,
        headers: { authorization: auth }
      } as any)

      expect(getRes.statusCode).toEqual(200)
      expect(getRes.body).toEqual(textContent)
      expect(getRes.headers['content-length']).toEqual(String(Buffer.byteLength(textContent, 'utf8')))
    })

    it('PUT with application/octet-stream should work as expected', async () => {
      const binaryContent = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

      const putRes = await app.inject({
        method: 'PUT',
        url: testFilePath,
        headers: {
          authorization: auth,
          'content-type': 'application/octet-stream'
        },
        body: binaryContent
      } as any)

      expect([201, 204]).toContain(putRes.statusCode)

      // Verify the file was created with the correct content
      const getRes = await app.inject({
        method: 'GET',
        url: testFilePath,
        headers: { authorization: auth }
      } as any)

      expect(getRes.statusCode).toEqual(200)
      expect(Buffer.from(getRes.rawPayload)).toEqual(binaryContent)
      expect(getRes.headers['content-length']).toEqual(String(binaryContent.length))
    })
  })
})
