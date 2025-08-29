/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Test, TestingModule } from '@nestjs/testing'
import { Cache } from '../../infrastructure/cache/services/cache.service'
import { ContextManager } from '../../infrastructure/context/services/context-manager.service'
import { DB_TOKEN_PROVIDER } from '../../infrastructure/database/constants'
import { FilesQueries } from '../files/services/files-queries.service'
import { LinksQueries } from '../links/services/links-queries.service'
import { NotificationsManager } from '../notifications/services/notifications-manager.service'
import { SharesManager } from '../shares/services/shares-manager.service'
import { SharesQueries } from '../shares/services/shares-queries.service'
import { SpacesManager } from '../spaces/services/spaces-manager.service'
import { SpacesQueries } from '../spaces/services/spaces-queries.service'
import { UsersQueries } from '../users/services/users-queries.service'
import { CommentsController } from './comments.controller'
import { CommentsManager } from './services/comments-manager.service'
import { CommentsQueries } from './services/comments-queries.service'

describe(CommentsController.name, () => {
  let commentsController: CommentsController
  let commentsManager: jest.Mocked<CommentsManager>

  const user: any = { id: 'user-1' }
  const space: any = { id: 'space-1' }

  const commentsSample = [{ id: 'c1' }, { id: 'c2' }] as any
  const commentSample = { id: 'c1', text: 'hello' } as any

  const commentsManagerMock: jest.Mocked<CommentsManager> = {
    getComments: jest.fn(),
    createComment: jest.fn(),
    updateComment: jest.fn(),
    deleteComment: jest.fn(),
    getRecents: jest.fn()
  } as any

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentsController],
      providers: [
        { provide: NotificationsManager, useValue: {} },
        { provide: DB_TOKEN_PROVIDER, useValue: {} },
        { provide: Cache, useValue: {} },
        ContextManager,
        { provide: CommentsManager, useValue: commentsManagerMock },
        CommentsQueries,
        SpacesManager,
        SpacesQueries,
        FilesQueries,
        SharesManager,
        SharesQueries,
        UsersQueries,
        LinksQueries
      ]
    }).compile()

    commentsController = module.get<CommentsController>(CommentsController)
    commentsManager = module.get(CommentsManager)
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(commentsController).toBeDefined()
  })

  it('getFromSpace calls CommentsManager.getComments and returns the list', async () => {
    commentsManager.getComments.mockResolvedValueOnce(commentsSample)

    const res = await commentsController.getFromSpace(user, space)

    expect(commentsManager.getComments).toHaveBeenCalledTimes(1)
    expect(commentsManager.getComments).toHaveBeenCalledWith(user, space)
    expect(res).toEqual(commentsSample)
  })

  it('createFromSpace calls CommentsManager.createComment and returns the created comment', async () => {
    const dto: any = { text: 'new comment' }
    commentsManager.createComment.mockResolvedValueOnce(commentSample)

    const res = await commentsController.createFromSpace(user, space, dto)

    expect(commentsManager.createComment).toHaveBeenCalledTimes(1)
    expect(commentsManager.createComment).toHaveBeenCalledWith(user, space, dto)
    expect(res).toEqual(commentSample)
  })

  it('updateFromSpace calls CommentsManager.updateComment and returns the updated comment', async () => {
    const dto: any = { id: 'c1', text: 'updated' }
    const updated = { id: 'c1', text: 'updated' } as any
    commentsManager.updateComment.mockResolvedValueOnce(updated)

    const res = await commentsController.updateFromSpace(user, space, dto)

    expect(commentsManager.updateComment).toHaveBeenCalledTimes(1)
    expect(commentsManager.updateComment).toHaveBeenCalledWith(user, space, dto)
    expect(res).toEqual(updated)
  })

  it('deleteFromSpace calls CommentsManager.deleteComment', async () => {
    const dto: any = { id: 'c1' }
    commentsManager.deleteComment.mockResolvedValueOnce(undefined)

    await expect(commentsController.deleteFromSpace(user, space, dto)).resolves.toBeUndefined()

    expect(commentsManager.deleteComment).toHaveBeenCalledTimes(1)
    expect(commentsManager.deleteComment).toHaveBeenCalledWith(user, space, dto)
  })

  it('getRecents calls CommentsManager.getRecents with the provided limit', async () => {
    const recents = [{ id: 'r1' }] as any
    commentsManager.getRecents.mockResolvedValueOnce(recents)

    const res = await commentsController.getRecents(user, 5 as any)

    expect(commentsManager.getRecents).toHaveBeenCalledTimes(1)
    expect(commentsManager.getRecents).toHaveBeenCalledWith(user, 5)
    expect(res).toEqual(recents)
  })

  it('getRecents uses the default limit (10) when not provided', async () => {
    const recents = [{ id: 'r2' }] as any
    commentsManager.getRecents.mockResolvedValueOnce(recents)

    // Call with undefined to trigger the parameter default value
    const res = await commentsController.getRecents(user, undefined as any)

    expect(commentsManager.getRecents).toHaveBeenCalledTimes(1)
    expect(commentsManager.getRecents).toHaveBeenCalledWith(user, 10)
    expect(res).toEqual(recents)
  })
})
