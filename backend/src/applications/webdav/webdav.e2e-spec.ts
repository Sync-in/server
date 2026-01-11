/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { NestFastifyApplication } from '@nestjs/platform-fastify'
import { appBootstrap } from '../../app.bootstrap'
import { XML_CONTENT_TYPE } from './constants/webdav'

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

  describe('PUT with non-XML Content-Types (stream preservation)', () => {
    const testFilePath = '/webdav/personal/test-content-type.txt'
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
