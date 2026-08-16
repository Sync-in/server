import path from 'node:path'
import { USER_ROLE } from '../../users/constants/user'
import { UserModel } from '../../users/models/user.model'
import { realPathFromSpace, temporaryRootFromSpace, temporaryRootFromStorage, trashTargetFromSpace } from './paths'

vi.mock('../../../configuration/config.environment', () => ({
  configuration: {
    applications: {
      files: {
        usersPath: '/data/users',
        spacesPath: '/data/spaces',
        linksPath: '/data/links'
      }
    }
  }
}))

describe('temporary path resolution', () => {
  const user = new UserModel({ id: 42, login: 'alice', role: USER_ROLE.USER } as any)

  it('places personal-space artifacts in the personal storage root', () => {
    expect(temporaryRootFromSpace(user, { inPersonalSpace: true } as any)).toBe('/data/users/alice/.sync-in-tmp/users/42')
  })

  it('places native-space artifacts in the managed space temporary root', () => {
    expect(temporaryRootFromSpace(user, { alias: 'project' } as any)).toBe('/data/spaces/project/tmp/users/42')
  })

  it('places external-space artifacts under the external storage root', () => {
    expect(temporaryRootFromSpace(user, { root: { externalPath: '/mnt/archive' } } as any)).toBe('/mnt/archive/.sync-in-tmp/users/42')
  })

  it('places anchored personal-space artifacts in the owner storage root', () => {
    const space = { root: { file: { path: 'documents' }, owner: { login: 'bob' } } } as any

    expect(temporaryRootFromSpace(user, space)).toBe('/data/users/bob/.sync-in-tmp/users/42')
  })

  it('places native and external share artifacts with their physical storage', () => {
    const nativeShare = { root: { file: { space: { id: 1, alias: 'project' } } } } as any
    const externalShare = {
      root: { file: { path: 'shared', space: { id: 1, alias: 'project' }, root: { id: 2, externalPath: '/mnt/archive' } } }
    } as any

    expect(temporaryRootFromSpace(user, nativeShare)).toBe('/data/spaces/project/tmp/users/42')
    expect(temporaryRootFromSpace(user, externalShare)).toBe('/mnt/archive/.sync-in-tmp/users/42')
  })

  it('uses the shared users namespace for guests and a numeric links namespace for link users', () => {
    const guest = new UserModel({ id: 7, login: 'guest', role: USER_ROLE.GUEST } as any)
    const link = new UserModel({ id: 9, login: 'link-login', role: USER_ROLE.LINK } as any)

    expect(guest.homePath).toBe('/data/users/guest')
    expect(guest.tmpPath).toBe('/data/users/guest/tmp')
    expect(link.homePath).toBe('/data/links/9')
    expect(link.tmpPath).toBe('/data/links/9/tmp')
  })

  it('resolves trash and staging together from the target space', () => {
    expect(trashTargetFromSpace(user, { inPersonalSpace: true } as any)).toEqual({
      mode: 'trash',
      path: '/data/users/alice/trash',
      temporaryRoot: '/data/users/alice/.sync-in-tmp/users/42'
    })
    expect(trashTargetFromSpace(user, { alias: 'project' } as any)).toEqual({
      mode: 'trash',
      path: '/data/spaces/project/trash',
      temporaryRoot: '/data/spaces/project/tmp/users/42'
    })
    expect(
      trashTargetFromSpace(user, {
        alias: 'project',
        root: { externalPath: '/mnt/archive' },
        inFilesRepository: true,
        inSharesRepository: false
      } as any)
    ).toEqual({
      mode: 'trash',
      path: '/data/spaces/project/trash',
      temporaryRoot: '/data/spaces/project/tmp/users/42'
    })
    expect(trashTargetFromSpace(user, { root: { file: { space: { id: 1, alias: 'project' } } } } as any)).toEqual({
      mode: 'trash',
      path: '/data/spaces/project/trash',
      temporaryRoot: '/data/spaces/project/tmp/users/42'
    })
  })

  it('permanently deletes external shares and uses the owner trash for an anchored personal root', () => {
    expect(trashTargetFromSpace(user, { root: { externalPath: '/mnt/share' }, inFilesRepository: false, inSharesRepository: true } as any)).toEqual({
      mode: 'permanent',
      reason: 'external-share'
    })
    expect(trashTargetFromSpace(user, { root: { file: { path: 'documents' }, owner: { login: 'bob' } } } as any)).toEqual({
      mode: 'trash',
      path: '/data/users/bob/trash',
      temporaryRoot: '/data/users/bob/.sync-in-tmp/users/42'
    })
    expect(trashTargetFromSpace(user, {} as any)).toBeNull()
  })

  it.each([['.sync-in-tmp', 'users', '42'], ['.sync-in.uploading']])('rejects direct access to internal temporary paths', (...paths) => {
    const space = { inPersonalSpace: false, root: { externalPath: '/mnt/archive' }, paths, inSharesRepository: false } as any

    expect(() => realPathFromSpace(user, space)).toThrow('Internal temporary locations are not accessible')
  })

  it('keeps regular external paths accessible', () => {
    const space = { inPersonalSpace: false, root: { externalPath: '/mnt/archive' }, paths: ['documents'], inSharesRepository: false } as any

    expect(realPathFromSpace(user, space)).toBe('/mnt/archive/documents')
  })

  it('rejects an external root anchored inside the internal temporary tree', () => {
    const space = {
      inPersonalSpace: false,
      root: { externalPath: '/mnt/archive/.sync-in-tmp/users/42' },
      paths: [],
      inSharesRepository: true
    } as any

    expect(() => realPathFromSpace(user, space)).toThrow('Internal temporary locations are not accessible')
  })

  it('does not treat segments above a personal repository as requested entries', () => {
    const reservedLogin = new UserModel({ id: 43, login: '.sync-in.user', role: USER_ROLE.USER } as any)

    expect(realPathFromSpace(reservedLogin, { inPersonalSpace: true, paths: ['documents'] } as any)).toBe('/data/users/.sync-in.user/files/documents')
  })

  it('rejects invalid actor identifiers', () => {
    expect(() => temporaryRootFromStorage(path.join('/mnt', 'archive'), 0)).toThrow('Invalid temporary-file owner')
  })
})
