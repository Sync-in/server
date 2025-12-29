import { HttpException, HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { FastifyReply } from 'fastify'
import { urlToPath } from '../../../common/functions'
import { decodeUrl } from '../../../common/shared'
import { HTTP_METHOD } from '../../applications.constants'
import { CACHE_LOCK_DEFAULT_TTL } from '../../files/constants/cache'
import { DEPTH, HEADER, LOCK_SCOPE, OPTIONS_HEADERS, PROPSTAT } from '../constants/webdav'
import { FastifyDAVRequest } from '../interfaces/webdav.interface'
import * as IfHeaderUtils from '../utils/if-header'
import { PROPFIND_ALL_PROP } from '../utils/webdav'
import { WebDAVProtocolGuard } from './webdav-protocol.guard'

// Keep these mocks to control path transforms in COPY/MOVE tests
jest.mock('../../../common/shared', () => ({
  decodeUrl: jest.fn((s: string) => s)
}))
jest.mock('../../../common/functions', () => ({
  urlToPath: jest.fn((s: string) => s)
}))

describe(WebDAVProtocolGuard.name, () => {
  let guard: WebDAVProtocolGuard

  const makeUser = (hasPerm = true) => ({
    havePermission: jest.fn(() => hasPerm),
    fullName: 'John Doe',
    email: 'john@doe.tld'
  })

  const makeRes = (): FastifyReply =>
    ({
      headers: jest.fn()
    }) as unknown as FastifyReply

  const baseReq = (method: string, overrides: Partial<FastifyDAVRequest> = {}): FastifyDAVRequest =>
    ({
      method,
      headers: {},
      // undefined body allows to hit the "allowed empty body" branch for PROPFIND/LOCK
      body: undefined as any,
      originalUrl: '/webdav/base/path',
      protocol: 'http',
      raw: { httpVersion: '1.1' } as any,
      user: makeUser(),
      ...overrides
    }) as unknown as FastifyDAVRequest

  const makeCtx = (req: FastifyDAVRequest, res: FastifyReply) =>
    ({
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res
      })
    }) as any

  const expectIfHeadersParsed = (req: FastifyDAVRequest) => {
    expect(Array.isArray(req.dav.ifHeaders)).toBe(true)
    expect(req.dav.ifHeaders.length).toBeGreaterThan(0)
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebDAVProtocolGuard]
    }).compile()

    guard = module.get(WebDAVProtocolGuard)
  })

  describe('Permissions', () => {
    it('allows OPTIONS even without WEBDAV permission (responds headers + 200)', async () => {
      const req = baseReq(HTTP_METHOD.OPTIONS, { user: makeUser(false) as any })
      const res = makeRes()
      const ctx = makeCtx(req, res)

      await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException)
      try {
        await guard.canActivate(ctx)
      } catch (e) {
        const ex = e as HttpException
        expect(res.headers).toHaveBeenCalledWith(OPTIONS_HEADERS)
        expect(ex.getStatus()).toBe(HttpStatus.OK)
      }
    })

    it('forbids non-OPTIONS when the user lacks WEBDAV permission', async () => {
      const req = baseReq(HTTP_METHOD.GET, { user: makeUser(false) as any })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: HttpStatus.FORBIDDEN })
    })

    it('falls through for a method not handled by the switch', async () => {
      const req = baseReq('VIEW', {})
      const res = makeRes()
      const ctx = makeCtx(req, res)
      const spy = jest.spyOn(guard as any, 'setDAVContext')

      const result = await guard.canActivate(ctx)
      expect(result).toBe(true)
      expect(spy).toHaveBeenCalled()
      spy.mockRestore()
    })
  })

  describe('PROPFIND', () => {
    it('defaults depth=1 (members) when header is missing, and sets ALLPROP with empty body', async () => {
      const req = baseReq(HTTP_METHOD.PROPFIND, {
        headers: {},
        body: undefined
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)

      await expect(guard.canActivate(ctx)).resolves.toBe(true)
      expect(req.dav.url).toBe(req.originalUrl)
      expect(req.dav.depth).toBe(DEPTH.MEMBERS)
      expect(req.dav.body).toBe(PROPFIND_ALL_PROP)
      expect(req.dav.propfindMode).toBe(PROPSTAT.ALLPROP)
      expect(req.dav.ifHeaders === undefined || req.dav.ifHeaders.length === 0).toBe(true)
    })

    it.each([
      { title: 'depth "infinity" normalized to 1 (members)', depth: DEPTH.INFINITY as any },
      { title: 'invalid depth normalized to 1 (members)', depth: 'bad' as any }
    ])('depth normalization: $title', async ({ depth }) => {
      const req = baseReq(HTTP_METHOD.PROPFIND, {
        headers: { [HEADER.DEPTH]: depth },
        body: undefined
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).resolves.toBe(true)
      expect(req.dav.depth).toBe(DEPTH.MEMBERS)
    })

    it('valid XML body with propname and parses If header', async () => {
      const req = baseReq(HTTP_METHOD.PROPFIND, {
        headers: { [HEADER.DEPTH]: DEPTH.RESOURCE, [HEADER.IF]: '(<urn:uuid:abc> ["W/\\"ETag\\""])' },
        body: '<propfind xmlns="DAV:"><propname/></propfind>'
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)

      await expect(guard.canActivate(ctx)).resolves.toBe(true)
      expect(req.dav.depth).toBe(DEPTH.RESOURCE)
      expect(req.dav.propfindMode).toBe(PROPSTAT.PROPNAME)
      expectIfHeadersParsed(req)
    })

    it('invalid propfind mode -> 400', async () => {
      const req = baseReq(HTTP_METHOD.PROPFIND, {
        headers: {},
        body: '<propfind xmlns="DAV:"><unknown/></propfind>'
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })
    })

    it('invalid XML (with code) -> 400', async () => {
      const req = baseReq(HTTP_METHOD.PROPFIND, {
        headers: {},
        body: '<bad'
      } as any)
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })
    })

    it('specific XML validation error handled -> 400', async () => {
      const req = baseReq(HTTP_METHOD.PROPFIND, {
        headers: {},
        body: 'this is not XML at all'
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).rejects.toHaveProperty('status', HttpStatus.BAD_REQUEST)
    })

    it('skips body when parseBody returns false, still parses If header', async () => {
      const spyParse = jest.spyOn(guard as any, 'parseBody').mockReturnValue(false as any)
      const req = baseReq(HTTP_METHOD.PROPFIND, {
        headers: { [HEADER.IF]: '(<urn:uuid:abc>)' },
        body: undefined
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)

      try {
        await expect(guard.canActivate(ctx)).resolves.toBe(true)
        expect(req.dav.body).toBeUndefined()
        expect(req.dav.propfindMode).toBeUndefined()
        expectIfHeadersParsed(req)
      } finally {
        spyParse.mockRestore()
      }
    })
  })

  describe('PROPPATCH', () => {
    it('requires "propertyupdate" in body', async () => {
      const req = baseReq(HTTP_METHOD.PROPPATCH, {
        headers: {},
        body: '<xml/>'
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })
    })

    it('valid body and parses If header', async () => {
      const req = baseReq(HTTP_METHOD.PROPPATCH, {
        headers: { [HEADER.IF]: '(<urn:uuid:abc>)', [HEADER.DEPTH]: DEPTH.RESOURCE },
        body: '<propertyupdate xmlns="DAV:"><set/></propertyupdate>'
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).resolves.toBe(true)
      expect(req.dav.depth).toBe(DEPTH.RESOURCE)
      expectIfHeadersParsed(req)
    })
  })

  describe('LOCK', () => {
    it('timeout=Infinite -> default timeout, owner from string, depth=resource', async () => {
      const req = baseReq(HTTP_METHOD.LOCK, {
        headers: { [HEADER.TIMEOUT]: 'Infinite', [HEADER.DEPTH]: DEPTH.RESOURCE },
        body: '<lockinfo xmlns="DAV:"><lockscope><exclusive/></lockscope><owner>Custom Owner</owner></lockinfo>'
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).resolves.toBe(true)
      expect(req.dav.lock.timeout).toBe(CACHE_LOCK_DEFAULT_TTL)
      expect(req.dav.lock.lockscope).toBe(LOCK_SCOPE.EXCLUSIVE)
      expect(req.dav.lock.owner).toContain('Custom Owner')
      expect(req.dav.depth).toBe(DEPTH.RESOURCE)
    })

    it('timeout Second-10 + non-string owner -> default WebDAV owner, depth=infinity', async () => {
      const req = baseReq(HTTP_METHOD.LOCK, {
        headers: { [HEADER.TIMEOUT]: 'Second-10', [HEADER.DEPTH]: DEPTH.INFINITY },
        body: '<lockinfo xmlns="DAV:"><lockscope><shared/></lockscope><owner><href>me</href></owner></lockinfo>'
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).resolves.toBe(true)
      expect(req.dav.lock.timeout).toBe(10)
      expect(req.dav.lock.lockscope).toBe(LOCK_SCOPE.SHARED)
      expect(req.dav.lock.owner).toMatch(/^me/)
      expect(req.dav.depth).toBe(DEPTH.INFINITY)
    })

    it('clamps timeout Second-N to default when N exceeds default', async () => {
      const big = CACHE_LOCK_DEFAULT_TTL + 1000
      const req = baseReq(HTTP_METHOD.LOCK, {
        headers: { [HEADER.TIMEOUT]: `Second-${big}` },
        body: '<lockinfo xmlns="DAV:"><lockscope><exclusive/></lockscope></lockinfo>'
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).resolves.toBe(true)
      expect(req.dav.lock.timeout).toBe(CACHE_LOCK_DEFAULT_TTL)
    })

    it('invalid timeout -> NaN (no fallback), depth=infinity', async () => {
      const req = baseReq(HTTP_METHOD.LOCK, {
        headers: { [HEADER.TIMEOUT]: 'Bad-Token', [HEADER.DEPTH]: 'x' as any },
        body: '<lockinfo xmlns="DAV:"><lockscope><exclusive/></lockscope></lockinfo>'
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).resolves.toBe(true)
      expect(Number.isNaN(req.dav.lock.timeout)).toBe(true)
      expect(req.dav.depth).toBe(DEPTH.INFINITY)
    })

    it('handles parseInt exception during timeout parsing', async () => {
      const req = baseReq(HTTP_METHOD.LOCK, {
        headers: { [HEADER.TIMEOUT]: 'Second-' },
        body: '<lockinfo xmlns="DAV:"><lockscope><exclusive/></lockscope></lockinfo>'
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)

      const originalParseInt = global.parseInt
      global.parseInt = jest.fn().mockImplementation(() => {
        throw new Error('Forced parseInt error')
      })

      try {
        await expect(guard.canActivate(ctx)).resolves.toBe(true)
        expect(req.dav.lock).toBeDefined()
      } finally {
        global.parseInt = originalParseInt
      }
    })

    it('timeout Infinite + empty IfHeader -> default timeout and ifHeaders undefined', async () => {
      const spyIf = jest.spyOn(IfHeaderUtils, 'parseIfHeader').mockReturnValue([] as any)
      const req = baseReq(HTTP_METHOD.LOCK, {
        headers: { [HEADER.TIMEOUT]: 'Infinite', [HEADER.IF]: '(<any>)' },
        body: '<lockinfo xmlns="DAV:"><lockscope><exclusive/></lockscope></lockinfo>'
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)

      try {
        await expect(guard.canActivate(ctx)).resolves.toBe(true)
        expect(req.dav.lock.timeout).toBe(CACHE_LOCK_DEFAULT_TTL)
        expect(req.dav.ifHeaders).toBeUndefined()
      } finally {
        spyIf.mockRestore()
      }
    })

    it('missing lockinfo -> 400', async () => {
      const req = baseReq(HTTP_METHOD.LOCK, {
        headers: {},
        body: '<notlockinfo xmlns="DAV:"/>'
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })
    })

    it('invalid lockscope -> 400', async () => {
      const req = baseReq(HTTP_METHOD.LOCK, {
        headers: {},
        body: '<lockinfo xmlns="DAV:"><lockscope><invalid/></lockscope></lockinfo>'
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })
    })

    it('handles Object.keys(lockscope) exception with malformed lockscope -> 400', async () => {
      const req = baseReq(HTTP_METHOD.LOCK, {
        headers: {},
        body: '<lockinfo xmlns="DAV:"><lockscope><exclusive/></lockscope></lockinfo>'
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)

      jest.spyOn(guard as any, 'parseBody').mockImplementation(() => {
        req.dav.body = {
          lockinfo: {
            lockscope: null
          }
        }
        return true
      })

      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Invalid or undefined lockscope'
      })
    })

    it('refresh (no body) -> dav.depth = null', async () => {
      const req = baseReq(HTTP_METHOD.LOCK, {
        headers: { [HEADER.DEPTH]: DEPTH.RESOURCE },
        body: undefined
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).resolves.toBe(true)
      expect(req.dav.depth).toBeNull()
    })

    it('no timeout header -> lock.timeout is undefined', async () => {
      const req = baseReq(HTTP_METHOD.LOCK, {
        headers: {},
        body: '<lockinfo xmlns="DAV:"><lockscope><exclusive/></lockscope></lockinfo>'
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).resolves.toBe(true)
      expect(req.dav.lock).toBeDefined()
      expect(req.dav.lock.timeout).toBeUndefined()
    })
  })

  describe('UNLOCK', () => {
    it('missing lock-token -> 400', async () => {
      const req = baseReq(HTTP_METHOD.UNLOCK)
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })
    })

    it('sets token in dav.lock and parses If header', async () => {
      const req = baseReq(HTTP_METHOD.UNLOCK, {
        headers: { [HEADER.LOCK_TOKEN]: ' <abc> ', [HEADER.IF]: '(<urn:uuid:abc>)' }
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).resolves.toBe(true)
      expect(req.dav.lock.token).toBe('abc')
      expectIfHeadersParsed(req)
    })
  })

  describe('PUT / DELETE', () => {
    it('PUT: depth=0 and parses If header', async () => {
      const req = baseReq(HTTP_METHOD.PUT, {
        headers: { [HEADER.IF]: '(<urn:uuid:abc>)' }
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).resolves.toBe(true)
      expect(req.dav.depth).toBe(DEPTH.RESOURCE)
      expectIfHeadersParsed(req)
    })

    it('DELETE: parses If header', async () => {
      const req = baseReq(HTTP_METHOD.DELETE, {
        headers: { [HEADER.IF]: '(<urn:uuid:abc>)' }
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).resolves.toBe(true)
      expectIfHeadersParsed(req)
    })
  })

  describe('MKCOL', () => {
    it('non-zero content-length -> 415', async () => {
      const req = baseReq(HTTP_METHOD.MKCOL, {
        headers: { 'content-length': '3' }
      } as any)
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: HttpStatus.UNSUPPORTED_MEDIA_TYPE })
    })

    it('zero/absent content-length -> depth=0 and parses If header', async () => {
      const req = baseReq(HTTP_METHOD.MKCOL, {
        headers: { 'content-length': '0', [HEADER.IF]: '(<urn:uuid:abc>)' } as any
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).resolves.toBe(true)
      expect(req.dav.depth).toBe(DEPTH.RESOURCE)
      expectIfHeadersParsed(req)
    })
  })

  describe('COPY / MOVE', () => {
    it('COPY: missing Destination -> 400', async () => {
      const req = baseReq(HTTP_METHOD.COPY)
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })
    })

    it('COPY: invalid Destination base path -> 400', async () => {
      ;(decodeUrl as jest.Mock).mockImplementation((s: string) => s)
      ;(urlToPath as jest.Mock).mockImplementation((s: string) => '/not-webdav' + s)

      const req = baseReq(HTTP_METHOD.COPY, {
        headers: { [HEADER.DESTINATION]: '/wrong' }
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST })
    })

    it('COPY: valid Destination -> overwrite=true, move=false, depth=infinity and parses If header', async () => {
      ;(decodeUrl as jest.Mock).mockImplementation((s: string) => s)
      ;(urlToPath as jest.Mock).mockImplementation((_s: string) => '/webdav/base/path/target')

      const req = baseReq(HTTP_METHOD.COPY, {
        headers: { [HEADER.DESTINATION]: '/webdav/base/path/target', [HEADER.IF]: '(<urn:uuid:abc>)' }
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).resolves.toBe(true)
      expect(req.dav.depth).toBe(DEPTH.INFINITY)
      expect(req.dav.copyMove).toEqual({
        overwrite: true,
        destination: '/webdav/base/path/target',
        isMove: false
      })
      expectIfHeadersParsed(req)
    })

    it('MOVE: isMove=true and overwrite=false when OVERWRITE header is "f", respects depth header', async () => {
      ;(decodeUrl as jest.Mock).mockImplementation((s: string) => s)
      ;(urlToPath as jest.Mock).mockImplementation((_s: string) => '/webdav/base/path/target2')

      const req = baseReq(HTTP_METHOD.MOVE, {
        headers: {
          [HEADER.DESTINATION]: '/webdav/base/path/target2',
          [HEADER.OVERWRITE]: 'f',
          [HEADER.DEPTH]: DEPTH.RESOURCE
        }
      })
      const res = makeRes()
      const ctx = makeCtx(req, res)
      await expect(guard.canActivate(ctx)).resolves.toBe(true)
      expect(req.dav.depth).toBe(DEPTH.RESOURCE)
      expect(req.dav.copyMove).toEqual({
        overwrite: false,
        destination: '/webdav/base/path/target2',
        isMove: true
      })
    })
  })
})
