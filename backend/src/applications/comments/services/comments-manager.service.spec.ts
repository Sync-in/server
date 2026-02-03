import { HttpException, HttpStatus } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { Cache } from '../../../infrastructure/cache/services/cache.service'
import { ContextManager } from '../../../infrastructure/context/services/context-manager.service'
import { DB_TOKEN_PROVIDER } from '../../../infrastructure/database/constants'
import { FilesQueries } from '../../files/services/files-queries.service'
import { dirName, fileName, getProps, isPathExists } from '../../files/utils/files'
import { NotificationsManager } from '../../notifications/services/notifications-manager.service'
import { SharesQueries } from '../../shares/services/shares-queries.service'
import { SpacesQueries } from '../../spaces/services/spaces-queries.service'
import { CommentsManager } from './comments-manager.service'
import { CommentsQueries } from './comments-queries.service'

// Mocks of the file utilities used by the service
jest.mock('../../files/utils/files', () => ({
  isPathExists: jest.fn(),
  getProps: jest.fn(),
  dirName: jest.fn(),
  fileName: jest.fn()
}))

describe(CommentsManager.name, () => {
  let commentsManager: CommentsManager
  let contextManager: { headerOriginUrl: jest.Mock }
  let commentQueries: {
    getComments: jest.Mock
    createComment: jest.Mock
    updateComment: jest.Mock
    deleteComment: jest.Mock
    getRecentsFromUser: jest.Mock
    membersToNotify: jest.Mock
  }
  let filesQueries: {
    getSpaceFileId: jest.Mock
    getOrCreateSpaceFile: jest.Mock
  }
  let notificationsManager: { create: jest.Mock }

  const user = { id: 42, email: 'john@doe.tld' } as any

  const makeSpace = (overrides: Partial<any> = {}) =>
    ({
      realPath: '/real/path',
      url: '/space/folder/file.txt',
      dbFile: {
        path: 'folder',
        ownerId: 42,
        spaceExternalRootId: null,
        shareExternalId: null
      },
      ...overrides
    }) as any

  beforeAll(async () => {
    commentQueries = {
      getComments: jest.fn(),
      createComment: jest.fn(),
      updateComment: jest.fn(),
      deleteComment: jest.fn(),
      getRecentsFromUser: jest.fn(),
      membersToNotify: jest.fn()
    }
    filesQueries = {
      getSpaceFileId: jest.fn(),
      getOrCreateSpaceFile: jest.fn()
    }
    notificationsManager = {
      create: jest.fn().mockResolvedValue(undefined)
    }
    contextManager = {
      headerOriginUrl: jest.fn().mockReturnValue('https://app.local/path')
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: DB_TOKEN_PROVIDER,
          useValue: {}
        },
        { provide: Cache, useValue: {} },
        { provide: NotificationsManager, useValue: notificationsManager },
        { provide: ContextManager, useValue: contextManager },
        { provide: CommentsManager, useClass: CommentsManager },
        { provide: CommentsQueries, useValue: commentQueries },
        { provide: FilesQueries, useValue: filesQueries },
        { provide: SpacesQueries, useValue: {} },
        { provide: SharesQueries, useValue: {} }
      ]
    }).compile()

    commentsManager = module.get<CommentsManager>(CommentsManager)
  })

  beforeEach(() => {
    jest.clearAllMocks()
    ;(isPathExists as jest.Mock).mockResolvedValue(true)
    ;(getProps as jest.Mock).mockResolvedValue({ name: 'file.txt', path: 'folder' })
    ;(dirName as jest.Mock).mockReturnValue('/space/folder')
    ;(fileName as jest.Mock).mockReturnValue('file.txt')
  })

  it('should be defined', () => {
    expect(commentsManager).toBeDefined()
  })

  describe('getComments', () => {
    it('returns [] if no fileId', async () => {
      filesQueries.getSpaceFileId.mockResolvedValue(0)

      const res = await commentsManager.getComments(user, makeSpace())

      expect(res).toEqual([])
      expect(filesQueries.getSpaceFileId).toHaveBeenCalledTimes(1)
      expect(commentQueries.getComments).not.toHaveBeenCalled()
    })

    it('returns comments if fileId is valid', async () => {
      filesQueries.getSpaceFileId.mockResolvedValue(123)
      const expected = [{ id: 1 }, { id: 2 }]
      commentQueries.getComments.mockResolvedValue(expected)

      const res = await commentsManager.getComments(user, makeSpace())

      expect(filesQueries.getSpaceFileId).toHaveBeenCalled()
      expect(commentQueries.getComments).toHaveBeenCalledWith(42, true, 123)
      expect(res).toBe(expected)
    })

    it('throws NOT_FOUND if path does not exist', async () => {
      ;(isPathExists as jest.Mock).mockResolvedValue(false)

      await expect(commentsManager.getComments(user, makeSpace())).rejects.toThrow(HttpException)
      await expect(commentsManager.getComments(user, makeSpace())).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND })
    })
  })

  describe('createComment', () => {
    it("rejects on external root/share at path '.'", async () => {
      const space = makeSpace({
        dbFile: { path: '.', ownerId: 42, spaceExternalRootId: 'ext', shareExternalId: null }
      })
      await expect(commentsManager.createComment(user, space, { fileId: 0, content: 'Hi' } as any)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      })

      const space2 = makeSpace({
        dbFile: { path: '.', ownerId: 42, spaceExternalRootId: null, shareExternalId: 'shr' }
      })
      await expect(commentsManager.createComment(user, space2, { fileId: 0, content: 'Hi' } as any)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      })
    })

    it('rejects BAD_REQUEST if provided fileId mismatches', async () => {
      filesQueries.getSpaceFileId.mockResolvedValue(100)

      await expect(commentsManager.createComment(user, makeSpace(), { fileId: 101, content: 'x' } as any)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      })
    })

    it('uses getOrCreate when fileId < 0', async () => {
      filesQueries.getOrCreateSpaceFile.mockResolvedValue(555)
      commentQueries.createComment.mockResolvedValue(777)
      commentQueries.getComments.mockResolvedValue([{ id: 777, fileId: 555, content: 'hello' }])
      // Force a rejection in notify() to cover the catch attached to this.notify(...) in createComment
      commentQueries.membersToNotify.mockRejectedValueOnce(new Error('members failed'))
      const loggerSpy = jest.spyOn(commentsManager['logger'], 'error').mockImplementation(() => undefined as any)

      const res = await commentsManager.createComment(user, makeSpace(), { fileId: -1, content: 'hello' } as any)
      // Let the microtask run the catch of createComment
      await new Promise((r) => setImmediate(r))

      expect(filesQueries.getOrCreateSpaceFile).toHaveBeenCalled()
      expect(filesQueries.getSpaceFileId).not.toHaveBeenCalled()
      expect(commentQueries.createComment).toHaveBeenCalledWith(42, 555, 'hello')
      expect(notificationsManager.create).not.toHaveBeenCalled()
      expect(res).toEqual({ id: 777, fileId: 555, content: 'hello' })
      // Verify that the catch of createComment logged the error
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('createComment'))
      loggerSpy.mockRestore()
    })

    it('notifies members when present', async () => {
      filesQueries.getSpaceFileId.mockResolvedValue(10)
      commentQueries.createComment.mockResolvedValue(1)
      commentQueries.getComments.mockResolvedValue([{ id: 1, fileId: 10, content: 'c' }])
      commentQueries.membersToNotify.mockResolvedValue([{ id: 2, email: 'a@b.c' }])
      // Force rejection of notification creation to trigger the catch in notify()
      notificationsManager.create.mockRejectedValueOnce(new Error('notify failed'))
      const loggerSpy = jest.spyOn(commentsManager['logger'], 'error').mockImplementation(() => undefined as any)

      await commentsManager.createComment(user, makeSpace(), { fileId: 10, content: 'c' } as any)
      // Let the microtask execute the internal catch of notify()
      await new Promise((r) => setImmediate(r))

      expect(notificationsManager.create).toHaveBeenCalledTimes(1)
      notificationsManager.create.mockClear()
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('notify'))
      loggerSpy.mockRestore()

      const space = makeSpace()
      await commentsManager.createComment(user, space, { fileId: 10, content: 'c' } as any)

      expect(commentQueries.membersToNotify).toHaveBeenCalledWith(42, 10)
      expect(notificationsManager.create).toHaveBeenCalledTimes(1)
      const [members, notification, data] = notificationsManager.create.mock.calls[0]
      expect(members).toEqual([{ id: 2, email: 'a@b.c' }])
      expect(notification).toMatchObject({
        app: expect.anything(),
        event: expect.anything(),
        element: 'file.txt',
        url: '/space/folder'
      })
      expect(fileName).toHaveBeenCalledWith(space.url)
      expect(dirName).toHaveBeenCalledWith(space.url)
      expect(data).toMatchObject({
        author: user,
        currentUrl: 'https://app.local/path',
        content: 'c'
      })
    })

    it('logs an error if notificationsManager.create rejects (covers catch in notify)', async () => {
      filesQueries.getSpaceFileId.mockResolvedValue(10)
      commentQueries.createComment.mockResolvedValue(1)
      commentQueries.getComments.mockResolvedValue([{ id: 1, fileId: 10, content: 'c' }])
      commentQueries.membersToNotify.mockResolvedValue([{ id: 2, email: 'a@b.c' }])
      // Force rejection to trigger the catch in notify()
      notificationsManager.create.mockRejectedValueOnce(new Error('notify failed'))
      const loggerSpy = jest.spyOn(commentsManager['logger'], 'error').mockImplementation(() => undefined as any)

      await commentsManager.createComment(user, makeSpace(), { fileId: 10, content: 'c' } as any)
      // Allow the microtask to run the internal catch of notify()
      await new Promise((r) => setImmediate(r))

      expect(notificationsManager.create).toHaveBeenCalledTimes(1)
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('notify'))
      loggerSpy.mockRestore()
    })

    it('does not notify if no members', async () => {
      filesQueries.getSpaceFileId.mockResolvedValue(10)
      commentQueries.createComment.mockResolvedValue(1)
      commentQueries.getComments.mockResolvedValue([{ id: 1 }])
      commentQueries.membersToNotify.mockResolvedValue([])

      await commentsManager.createComment(user, makeSpace(), { fileId: 10, content: 'c' } as any)

      expect(notificationsManager.create).not.toHaveBeenCalled()
    })
  })

  describe('updateComment', () => {
    it('rejects NOT_FOUND if target comment is not found', async () => {
      commentQueries.getComments.mockResolvedValue([])

      await expect(commentsManager.updateComment(user, makeSpace(), { commentId: 99, fileId: 1, content: 'z' } as any)).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND
      })
    })

    it('rejects BAD_REQUEST if fileId mismatches', async () => {
      commentQueries.getComments.mockResolvedValue([{ id: 50, fileId: 123 }])
      filesQueries.getSpaceFileId.mockResolvedValue(999)

      await expect(commentsManager.updateComment(user, makeSpace(), { commentId: 50, fileId: 123, content: 'z' } as any)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      })
    })

    it('rejects INTERNAL_SERVER_ERROR if update fails', async () => {
      commentQueries.getComments.mockResolvedValueOnce([{ id: 50, fileId: 5 }])
      filesQueries.getSpaceFileId.mockResolvedValue(5)
      commentQueries.updateComment.mockResolvedValue(false)

      await expect(commentsManager.updateComment(user, makeSpace(), { commentId: 50, fileId: 5, content: 'z' } as any)).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR
      })
    })

    it('returns the comment after update', async () => {
      commentQueries.getComments
        .mockResolvedValueOnce([{ id: 50, fileId: 5 }]) // initial fetch
        .mockResolvedValueOnce([{ id: 50, fileId: 5, content: 'updated' }]) // fetch after update -> include content
      filesQueries.getSpaceFileId.mockResolvedValue(5)
      commentQueries.updateComment.mockResolvedValue(true)

      const res = await commentsManager.updateComment(user, makeSpace(), { commentId: 50, fileId: 5, content: 'updated' } as any)

      expect(commentQueries.updateComment).toHaveBeenCalledWith(42, 50, 5, 'updated')
      // allow additional fields via toMatchObject
      expect(res).toMatchObject({ id: 50, fileId: 5, content: 'updated' })
    })
  })

  describe('deleteComment', () => {
    it('rejects BAD_REQUEST if fileId mismatches', async () => {
      filesQueries.getSpaceFileId.mockResolvedValue(10)

      await expect(commentsManager.deleteComment(user, makeSpace(), { commentId: 1, fileId: 11 } as any)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST
      })
    })

    it('rejects FORBIDDEN if deletion is denied', async () => {
      filesQueries.getSpaceFileId.mockResolvedValue(10)
      commentQueries.deleteComment.mockResolvedValue(false)

      await expect(commentsManager.deleteComment(user, makeSpace(), { commentId: 1, fileId: 10 } as any)).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN
      })
    })

    it('resolves when deletion succeeds', async () => {
      filesQueries.getSpaceFileId.mockResolvedValue(10)
      commentQueries.deleteComment.mockResolvedValue(true)

      await expect(commentsManager.deleteComment(user, makeSpace(), { commentId: 1, fileId: 10 } as any)).resolves.toBeUndefined()
    })
  })

  describe('getRecents', () => {
    it('delegates to commentQueries.getRecentsFromUser', async () => {
      const recents = [{ id: 1 }, { id: 2 }]
      commentQueries.getRecentsFromUser.mockResolvedValue(recents)

      const res = await commentsManager.getRecents(user, 5)

      expect(commentQueries.getRecentsFromUser).toHaveBeenCalledWith(user, 5)
      expect(res).toBe(recents)
    })
  })
})
