/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Test, TestingModule } from '@nestjs/testing'
import { NotificationsController } from './notifications.controller'
import { NotificationsManager } from './services/notifications-manager.service'

describe(NotificationsController.name, () => {
  let controller: NotificationsController
  const notificationsManagerMock: jest.Mocked<NotificationsManager> = {
    list: jest.fn(),
    wasRead: jest.fn(),
    delete: jest.fn()
  } as unknown as jest.Mocked<NotificationsManager>

  const user = { id: 1, login: 'john.doe' } as any

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsManager, useValue: notificationsManagerMock }]
    }).compile()

    controller = module.get<NotificationsController>(NotificationsController)
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  it('list() should return notifications and call manager.list with user', async () => {
    const notifications = [{ id: 10 }, { id: 11 }] as any
    notificationsManagerMock.list.mockResolvedValueOnce(notifications)

    await expect(controller.list(user)).resolves.toBe(notifications)
    expect(notificationsManagerMock.list).toHaveBeenCalledTimes(1)
    expect(notificationsManagerMock.list).toHaveBeenCalledWith(user)
  })

  it('listUnread() should return unread notifications and call manager.list with unread=true', async () => {
    const notifications = [{ id: 12 }] as any
    notificationsManagerMock.list.mockResolvedValueOnce(notifications)

    await expect(controller.listUnread(user)).resolves.toBe(notifications)
    expect(notificationsManagerMock.list).toHaveBeenCalledTimes(1)
    expect(notificationsManagerMock.list).toHaveBeenCalledWith(user, true)
  })

  it('wasRead() should delegate to manager.wasRead with user and id', () => {
    notificationsManagerMock.wasRead.mockReturnValueOnce(undefined as unknown as void)

    controller.wasRead(user, 42)
    expect(notificationsManagerMock.wasRead).toHaveBeenCalledTimes(1)
    expect(notificationsManagerMock.wasRead).toHaveBeenCalledWith(user, 42)
  })

  it('deleteAll() should call manager.delete with user only', async () => {
    notificationsManagerMock.delete.mockResolvedValueOnce(undefined)

    await expect(controller.deleteAll(user)).resolves.toBeUndefined()
    expect(notificationsManagerMock.delete).toHaveBeenCalledTimes(1)
    expect(notificationsManagerMock.delete).toHaveBeenCalledWith(user)
  })

  it('delete(:id) should call manager.delete with user and id', async () => {
    notificationsManagerMock.delete.mockResolvedValueOnce(undefined)

    await expect(controller.delete(user, 7)).resolves.toBeUndefined()
    expect(notificationsManagerMock.delete).toHaveBeenCalledTimes(1)
    expect(notificationsManagerMock.delete).toHaveBeenCalledWith(user, 7)
  })
})
