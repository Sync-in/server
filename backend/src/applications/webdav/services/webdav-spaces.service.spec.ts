import { HttpException, HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { getProps, isPathExists, isPathIsDir } from '../../files/utils/files'
import { SPACE_REPOSITORY } from '../../spaces/constants/spaces'
import { SpacesBrowser } from '../../spaces/services/spaces-browser.service'
import { SpacesManager } from '../../spaces/services/spaces-manager.service'
import { canAccessToSpaceUrl } from '../../spaces/utils/permissions'
import { WEBDAV_NS } from '../constants/routes'
import { DEPTH } from '../constants/webdav'
import type { FastifyDAVRequest } from '../interfaces/webdav.interface'
import { WebDAVSpaces } from './webdav-spaces.service'

// mocks for file utils and permissions
jest.mock('../../files/utils/files', () => ({
  getProps: jest.fn(),
  isPathExists: jest.fn(),
  isPathIsDir: jest.fn()
}))
jest.mock('../../spaces/utils/permissions', () => ({
  canAccessToSpaceUrl: jest.fn()
}))
// mock for WEBDAV path-to-space segments
jest.mock('../utils/routes', () => ({
  WEBDAV_PATH_TO_SPACE_SEGMENTS: jest.fn(() => ['files', 'personal'])
}))

// small helper to collect results from an AsyncGenerator
async function collectGenerator<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const all: T[] = []
  for await (const item of gen) {
    all.push(item)
  }
  return all
}

describe(WebDAVSpaces.name, () => {
  let service: WebDAVSpaces
  let spacesManager: jest.Mocked<SpacesManager>
  let spacesBrowser: jest.Mocked<SpacesBrowser>

  const user = { id: 1, login: 'john', isAdmin: false } as any

  beforeAll(async () => {
    const spacesManagerMock: Partial<jest.Mocked<SpacesManager>> = {
      spaceEnv: jest.fn(),
      listSpaces: jest.fn(),
      listTrashes: jest.fn()
    }
    const spacesBrowserMock: Partial<jest.Mocked<SpacesBrowser>> = {
      browse: jest.fn()
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [{ provide: SpacesBrowser, useValue: spacesBrowserMock }, { provide: SpacesManager, useValue: spacesManagerMock }, WebDAVSpaces]
    }).compile()

    module.useLogger(['fatal'])
    service = module.get<WebDAVSpaces>(WebDAVSpaces)
    spacesManager = module.get(SpacesManager) as jest.Mocked<SpacesManager>
    spacesBrowser = module.get(SpacesBrowser) as jest.Mocked<SpacesBrowser>
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('spaceEnv', () => {
    it('returns space when manager resolves', async () => {
      const fakeSpace = { alias: 'personal', id: 0 } as any
      ;(spacesManager.spaceEnv as jest.Mock).mockResolvedValue(fakeSpace)

      const res = await service.spaceEnv(user as any, '/webdav/personal')
      expect(res).toBe(fakeSpace)
      expect(spacesManager.spaceEnv).toHaveBeenCalled()
    })

    it('returns null when manager throws', async () => {
      ;(spacesManager.spaceEnv as jest.Mock).mockRejectedValue(new Error('boom'))

      const res = await service.spaceEnv(user as any, '/webdav/personal')
      expect(res).toBeNull()
    })

    it('returns null when space not found', async () => {
      ;(spacesManager.spaceEnv as jest.Mock).mockResolvedValue(null)

      const res = await service.spaceEnv(user as any, '/webdav/personal')
      expect(res).toBeNull()
    })
  })

  describe('propfind - server root', () => {
    it('yields server root and webdav child when depth=1', async () => {
      const req = { user, dav: { url: '/', depth: DEPTH.MEMBERS } } as unknown as FastifyDAVRequest
      const items = await collectGenerator(service.propfind(req, WEBDAV_NS.SERVER as any))
      expect(items.map((i: any) => i.name)).toEqual([WEBDAV_NS.SERVER, WEBDAV_NS.WEBDAV])
    })

    it('yields only server root when depth=0', async () => {
      const req = { user, dav: { url: '/', depth: DEPTH.RESOURCE } } as unknown as FastifyDAVRequest
      const items = await collectGenerator(service.propfind(req, WEBDAV_NS.SERVER as any))
      expect(items.map((i: any) => i.name)).toEqual([WEBDAV_NS.SERVER])
    })
  })

  describe('propfind - webdav listing', () => {
    it('filters repositories by user access', async () => {
      ;(canAccessToSpaceUrl as jest.Mock).mockImplementation((_u: any, repos: string[]) => repos?.includes(SPACE_REPOSITORY.FILES))
      const req = { user, dav: { url: '/webdav', depth: DEPTH.MEMBERS } } as unknown as FastifyDAVRequest

      const items = await collectGenerator(service.propfind(req, WEBDAV_NS.WEBDAV as any))
      // should list only roots that include FILES in their repository (personal, spaces), not server/webdav
      expect(items.map((i: any) => i.name)).toEqual([WEBDAV_NS.WEBDAV, 'personal', 'spaces'])
    })

    it('lists only itself when depth=0', async () => {
      const req = { user, dav: { url: '/webdav', depth: DEPTH.RESOURCE } } as unknown as FastifyDAVRequest
      const items = await collectGenerator(service.propfind(req, WEBDAV_NS.WEBDAV as any))
      expect(items.map((i: any) => i.name)).toEqual([WEBDAV_NS.WEBDAV])
    })
  })

  describe('propfind - spaces listing', () => {
    it('yields spaces root then user spaces when depth=1', async () => {
      const now = new Date()
      ;(spacesManager.listSpaces as jest.Mock).mockResolvedValue([
        { id: 10, name: 'Team A', alias: 'team-a', createdAt: now.toISOString(), modifiedAt: now.toISOString() },
        { id: 11, name: 'Team B', alias: 'team-b', createdAt: now.toISOString(), modifiedAt: now.toISOString() }
      ])

      const req = { user, dav: { url: '/webdav/spaces', depth: DEPTH.MEMBERS } } as unknown as FastifyDAVRequest
      const items = await collectGenerator(service.propfind(req, WEBDAV_NS.SPACES as any))
      expect(items.map((i: any) => i.name)).toEqual([WEBDAV_NS.SPACES, 'Team A', 'Team B'])
    })

    it('yields only spaces root when depth=0', async () => {
      ;(spacesManager.listSpaces as jest.Mock).mockResolvedValue([])
      const req = { user, dav: { url: '/webdav/spaces', depth: DEPTH.RESOURCE } } as unknown as FastifyDAVRequest
      const items = await collectGenerator(service.propfind(req, WEBDAV_NS.SPACES as any))
      expect(items.map((i: any) => i.name)).toEqual([WEBDAV_NS.SPACES])
    })
  })

  describe('propfind - trashes listing', () => {
    it('yields trash root then each trash bucket when depth=1', async () => {
      ;(spacesManager.listTrashes as jest.Mock).mockResolvedValue([
        { id: 1, alias: 'personal', nb: 2, mtime: 3, ctime: 4, name: 'Personal files' },
        { id: 2, alias: 'team-a', nb: 5, mtime: 6, ctime: 7, name: 'Team A' }
      ])
      const req = { user, dav: { url: '/webdav/trash', depth: DEPTH.MEMBERS } } as unknown as FastifyDAVRequest
      const items = await collectGenerator(service.propfind(req, WEBDAV_NS.TRASH as any))
      expect(items.map((i: any) => i.name)).toEqual([WEBDAV_NS.TRASH, 'personal (2)', 'team-a (5)'])
    })

    it('yields only trash root when depth=0', async () => {
      ;(spacesManager.listTrashes as jest.Mock).mockResolvedValue([])
      const req = { user, dav: { url: '/webdav/trash', depth: DEPTH.RESOURCE } } as unknown as FastifyDAVRequest
      const items = await collectGenerator(service.propfind(req, WEBDAV_NS.TRASH as any))
      expect(items.map((i: any) => i.name)).toEqual([WEBDAV_NS.TRASH])
    })
  })

  describe('propfind - files listing (shares list)', () => {
    it('yields shares root and children when inSharesList=true and depth=1', async () => {
      ;(spacesBrowser.browse as jest.Mock).mockResolvedValue({
        files: [{ id: 1, name: 'doc.txt', isDir: false, size: 12, ctime: 1, mtime: 2, mime: 'text/plain' }]
      })

      const req = {
        user,
        dav: { url: '/webdav/files/personal', depth: DEPTH.MEMBERS },
        space: { inSharesList: true, realPath: '/any/ignored' }
      } as unknown as FastifyDAVRequest

      const items = await collectGenerator(service.propfind(req, SPACE_REPOSITORY.FILES))
      expect(items.map((i: any) => i.name)).toEqual(['shares', 'doc.txt'])
    })
  })

  describe('propfind - files listing (path cases)', () => {
    it('throws 404 when path does not exist', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(false)

      const req = {
        user,
        dav: { url: '/webdav/files/personal/current', depth: DEPTH.RESOURCE },
        space: { inSharesList: false, realPath: '/path/not/found' }
      } as unknown as FastifyDAVRequest

      await expect(collectGenerator(service.propfind(req, SPACE_REPOSITORY.FILES))).rejects.toBeInstanceOf(HttpException)
      await expect(collectGenerator(service.propfind(req, SPACE_REPOSITORY.FILES))).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND })
    })

    it('yields current directory and children when path exists and is dir', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      ;(getProps as jest.Mock).mockResolvedValue({
        id: 100,
        name: 'current',
        isDir: true,
        size: 0,
        ctime: Date.now(),
        mtime: Date.now(),
        mime: undefined
      })
      ;(isPathIsDir as jest.Mock).mockResolvedValue(true)
      ;(spacesBrowser.browse as jest.Mock).mockResolvedValue({
        files: [{ id: 2, name: 'child.txt', isDir: false, size: 1, ctime: 1, mtime: 2, mime: 'text/plain' }]
      })

      const req = {
        user,
        dav: { url: '/webdav/files/personal/current', depth: DEPTH.MEMBERS },
        space: { inSharesList: false, realPath: '/path/current' }
      } as unknown as FastifyDAVRequest

      const items = await collectGenerator(service.propfind(req, SPACE_REPOSITORY.FILES))
      expect(items.map((i: any) => i.name)).toEqual(['current', 'child.txt'])
    })

    it('does not list children when path exists but is not a directory', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(true)
      ;(getProps as jest.Mock).mockResolvedValue({
        id: 101,
        name: 'current',
        isDir: false,
        size: 123,
        ctime: Date.now(),
        mtime: Date.now(),
        mime: 'text/plain'
      })
      ;(isPathIsDir as jest.Mock).mockResolvedValue(false)
      ;(spacesBrowser.browse as jest.Mock).mockResolvedValue({ files: [] })

      const req = {
        user,
        dav: { url: '/webdav/files/personal/current', depth: DEPTH.MEMBERS },
        space: { inSharesList: false, realPath: '/path/current' }
      } as unknown as FastifyDAVRequest

      const items = await collectGenerator(service.propfind(req, SPACE_REPOSITORY.FILES))
      expect(items.map((i: any) => i.name)).toEqual(['current'])
      expect(spacesBrowser.browse).not.toHaveBeenCalled()
    })
  })

  describe('propfind - unknown space', () => {
    it('throws not found for unknown space', () => {
      const req = { user, dav: { url: '/webdav/unknown', depth: DEPTH.RESOURCE } } as unknown as FastifyDAVRequest
      try {
        service.propfind(req, 'unknown' as any)
        fail('Expected HttpException to be thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException)
        expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND)
      }
    })
  })
})
