/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Test, TestingModule } from '@nestjs/testing'
import { Mailer } from '../../../infrastructure/mailer/mailer.service'
import { USER_NOTIFICATION } from '../../users/constants/user'
import { UsersManager } from '../../users/services/users-manager.service'
import { NOTIFICATION_APP } from '../constants/notifications'
import { NOTIFICATIONS_WS } from '../constants/websocket'
import * as mailModels from '../mails/models'
import { WebSocketNotifications } from '../notifications.gateway'
import { NotificationsManager } from './notifications-manager.service'
import { NotificationsQueries } from './notifications-queries.service'

// Compact mock for mail generators
jest.mock('../mails/models', () => ({
  commentMail: jest.fn(() => ['comment title', 'comment html']),
  spaceMail: jest.fn(() => ['space title', 'space html']),
  spaceRootMail: jest.fn(() => ['spaceRoot title', 'spaceRoot html']),
  shareMail: jest.fn(() => ['share title', 'share html']),
  linkMail: jest.fn(() => ['link title', 'link html']),
  syncMail: jest.fn(() => ['sync title', 'sync html'])
}))

describe(NotificationsManager.name, () => {
  let service: NotificationsManager

  const usersManagerMock = { getAvatarBase64: jest.fn() }
  const mailerMock = { available: true, sendMails: jest.fn() }
  const notificationsQueriesMock = {
    list: jest.fn(),
    usersNotifiedByEmail: jest.fn(),
    create: jest.fn(),
    wasRead: jest.fn(),
    delete: jest.fn()
  }
  const webSocketNotificationsMock = { sendMessageToUsers: jest.fn() }

  const flushPromises = () => new Promise<void>((r) => setImmediate(r))
  const spyLogger = () => jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined as any)

  beforeEach(async () => {
    jest.clearAllMocks()
    mailerMock.available = true
    mailerMock.sendMails.mockResolvedValue(undefined)
    notificationsQueriesMock.create.mockResolvedValue(undefined)
    notificationsQueriesMock.wasRead.mockResolvedValue(undefined)
    notificationsQueriesMock.delete.mockResolvedValue(undefined)
    notificationsQueriesMock.list.mockResolvedValue([])
    notificationsQueriesMock.usersNotifiedByEmail.mockResolvedValue([])
    usersManagerMock.getAvatarBase64.mockResolvedValue('avatar-base64')

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsManager,
        { provide: UsersManager, useValue: usersManagerMock },
        { provide: Mailer, useValue: mailerMock },
        { provide: WebSocketNotifications, useValue: webSocketNotificationsMock },
        { provide: NotificationsQueries, useValue: notificationsQueriesMock }
      ]
    }).compile()
    service = module.get<NotificationsManager>(NotificationsManager)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('list', () => {
    it.each`
      userId | onlyUnread   | expected
      ${42}  | ${true}      | ${true}
      ${1}   | ${undefined} | ${false}
    `('should list notifications (userId=$userId, onlyUnread=$onlyUnread)', async ({ userId, onlyUnread, expected }) => {
      const expectedRes = [{ id: userId }] as any
      notificationsQueriesMock.list.mockResolvedValueOnce(expectedRes)
      const res = await service.list({ id: userId } as any, onlyUnread as any)
      expect(notificationsQueriesMock.list).toHaveBeenCalledWith(userId, expected)
      expect(res).toBe(expectedRes)
    })
  })

  describe('create', () => {
    it('stores, sends WS and no email when filtered list empty (object input)', async () => {
      const sendEmailSpy = jest.spyOn(service, 'sendEmailNotification').mockResolvedValue(undefined)
      const toUsers = [
        { id: 10, email: 'u1@test.tld', language: 'en', notification: USER_NOTIFICATION.APPLICATION },
        { id: 11, email: 'u2@test.tld', language: 'fr', notification: USER_NOTIFICATION.APPLICATION }
      ]
      await service.create(toUsers as any, { app: NOTIFICATION_APP.COMMENTS } as any, { author: { id: 99, login: 'john' } } as any)
      expect(notificationsQueriesMock.create).toHaveBeenCalledWith(99, [10, 11], { app: NOTIFICATION_APP.COMMENTS })
      expect(webSocketNotificationsMock.sendMessageToUsers).toHaveBeenCalledWith([10, 11], NOTIFICATIONS_WS.EVENTS.NOTIFICATION, 'check')
      expect(sendEmailSpy).not.toHaveBeenCalled()
      expect(notificationsQueriesMock.usersNotifiedByEmail).not.toHaveBeenCalled()
    })

    it('stores, sends WS and email for ids input', async () => {
      const sendEmailSpy = jest.spyOn(service, 'sendEmailNotification').mockResolvedValue(undefined)
      const toUserIds = [1, 2, 3]
      const content = { app: NOTIFICATION_APP.SHARES } as any
      const emailUsers = [
        { id: 1, email: 'a@test', language: 'en' },
        { id: 3, email: 'c@test', language: 'fr' }
      ]
      notificationsQueriesMock.usersNotifiedByEmail.mockResolvedValueOnce(emailUsers as any)
      await service.create(toUserIds, content)
      expect(notificationsQueriesMock.create).toHaveBeenCalledWith(null, toUserIds, content)
      expect(webSocketNotificationsMock.sendMessageToUsers).toHaveBeenCalledWith(toUserIds, NOTIFICATIONS_WS.EVENTS.NOTIFICATION, 'check')
      expect(notificationsQueriesMock.usersNotifiedByEmail).toHaveBeenCalledWith(toUserIds)
      expect(sendEmailSpy).toHaveBeenCalledWith(emailUsers as any, content, undefined)
    })

    it('does not try email when mailer is unavailable', async () => {
      mailerMock.available = false
      const sendEmailSpy = jest.spyOn(service, 'sendEmailNotification').mockResolvedValue(undefined)
      await service.create([7], { app: NOTIFICATION_APP.SYNC } as any, { author: { id: 12, login: 'jane' } } as any)
      expect(notificationsQueriesMock.create).toHaveBeenCalledWith(12, [7], { app: NOTIFICATION_APP.SYNC })
      expect(webSocketNotificationsMock.sendMessageToUsers).toHaveBeenCalledWith([7], NOTIFICATIONS_WS.EVENTS.NOTIFICATION, 'check')
      expect(notificationsQueriesMock.usersNotifiedByEmail).not.toHaveBeenCalled()
      expect(sendEmailSpy).not.toHaveBeenCalled()
    })

    it('logs error when storeNotification internal try/catch catches create error', async () => {
      const loggerSpy = spyLogger()
      notificationsQueriesMock.create.mockRejectedValueOnce(new Error('DB fail'))
      await service.create([1], { app: NOTIFICATION_APP.LINKS } as any)
      await flushPromises()
      expect(loggerSpy).toHaveBeenCalled()
      expect(loggerSpy.mock.calls[0]?.[0] as string).toMatch(/create/i)
    })

    it('logs error when storeNotification promise rejects (create catch)', async () => {
      const loggerSpy = spyLogger()
      jest.spyOn<any, any>(service as any, 'storeNotification').mockRejectedValueOnce(new Error('store reject'))
      await service.create([1, 2], { app: NOTIFICATION_APP.SYNC } as any, { author: { id: 5, login: 'xx' } } as any)
      await flushPromises()
      expect(loggerSpy).toHaveBeenCalled()
      expect(loggerSpy.mock.calls[0]?.[0] as string).toMatch(/create/i)
    })

    it('logs error when sendEmailNotification rejects (create catch)', async () => {
      const loggerSpy = spyLogger()
      notificationsQueriesMock.usersNotifiedByEmail.mockResolvedValueOnce([{ id: 1, email: 'a@test', language: 'en' }] as any)
      jest.spyOn(service, 'sendEmailNotification').mockRejectedValueOnce(new Error('email reject'))
      await service.create([1], { app: NOTIFICATION_APP.COMMENTS } as any)
      await flushPromises()
      expect(loggerSpy).toHaveBeenCalled()
      expect(loggerSpy.mock.calls[0]?.[0] as string).toMatch(/create/i)
    })
  })

  describe('wasRead', () => {
    it('calls queries.wasRead and logs on error', async () => {
      service.wasRead({ id: 5 } as any, 123)
      expect(notificationsQueriesMock.wasRead).toHaveBeenCalledWith(5, 123)
      const loggerSpy = spyLogger()
      notificationsQueriesMock.wasRead.mockRejectedValueOnce(new Error('fail'))
      service.wasRead({ id: 8 } as any, undefined)
      await flushPromises()
      expect(loggerSpy).toHaveBeenCalled()
      expect(loggerSpy.mock.calls[0]?.[0] as string).toMatch(/wasRead/i)
    })
  })

  describe('delete', () => {
    it('forwards to queries.delete', async () => {
      await service.delete({ id: 77 } as any, 456)
      expect(notificationsQueriesMock.delete).toHaveBeenCalledWith(77, 456)
    })
  })

  describe('sendEmailNotification', () => {
    it('returns early when mailer is not available', async () => {
      mailerMock.available = false
      await service.sendEmailNotification(
        [{ id: 1, email: 'a@test', language: 'en' }] as any,
        { app: NOTIFICATION_APP.COMMENTS } as any,
        {
          author: { id: 1, login: 'john' }
        } as any
      )
      expect(usersManagerMock.getAvatarBase64).not.toHaveBeenCalled()
      expect(mailerMock.sendMails).not.toHaveBeenCalled()
    })

    it('enriches author avatar and sends mapped mails', async () => {
      usersManagerMock.getAvatarBase64.mockResolvedValueOnce('base64-xxx')
      const toUsers = [
        { id: 1, email: 'a@test', language: 'en' },
        { id: 2, email: 'b@test', language: 'fr' }
      ]
      const options: any = { author: { id: 9, login: 'jdoe' }, content: 'hello', currentUrl: 'https://app.test/path' }
      const content = { app: NOTIFICATION_APP.COMMENTS } as any
      await service.sendEmailNotification(toUsers as any, content, options)
      expect(usersManagerMock.getAvatarBase64).toHaveBeenCalledWith('jdoe')
      expect(options.author.avatarBase64).toBe('base64-xxx')
      expect(mailerMock.sendMails).toHaveBeenCalledTimes(1)
      expect((mailerMock.sendMails as jest.Mock).mock.calls[0][0]).toEqual([
        { to: 'a@test', subject: 'comment title', html: 'comment html' },
        { to: 'b@test', subject: 'comment title', html: 'comment html' }
      ])
    })

    it('logs error when sendMails rejects', async () => {
      mailerMock.sendMails.mockRejectedValueOnce(new Error('smtp down'))
      const loggerSpy = spyLogger()
      await service.sendEmailNotification([{ id: 1, email: 'a@test', language: 'en' }] as any, { app: NOTIFICATION_APP.SYNC } as any, {} as any)
      expect(loggerSpy).toHaveBeenCalled()
      expect(loggerSpy.mock.calls[0]?.[0] as string).toMatch(/sendEmailNotification/i)
    })
  })

  describe('genMail (private) - switch coverage', () => {
    const cases = [
      {
        name: 'COMMENTS',
        app: NOTIFICATION_APP.COMMENTS,
        fn: 'commentMail',
        options: { content: 'c', currentUrl: 'u', author: { id: 1, login: 'x' } }
      },
      { name: 'SPACES', app: NOTIFICATION_APP.SPACES, fn: 'spaceMail', options: { currentUrl: 'u', action: 'A' } },
      {
        name: 'SPACE_ROOTS',
        app: NOTIFICATION_APP.SPACE_ROOTS,
        fn: 'spaceRootMail',
        options: { currentUrl: 'u', author: { id: 2, login: 'y' }, action: 'B' }
      },
      { name: 'SHARES', app: NOTIFICATION_APP.SHARES, fn: 'shareMail', options: { currentUrl: 'u', author: { id: 3, login: 'z' }, action: 'C' } },
      {
        name: 'LINKS',
        app: NOTIFICATION_APP.LINKS,
        fn: 'linkMail',
        options: { currentUrl: 'u', author: { id: 4, login: 'w' }, linkUUID: 'uuid', action: 'D' }
      },
      { name: 'SYNC', app: NOTIFICATION_APP.SYNC, fn: 'syncMail', options: { currentUrl: 'u', action: 'E' } }
    ] as const

    it.each(cases)('uses $fn for $name', ({ app, fn, options }) => {
      const res = (service as any).genMail('en', { app } as any, options as any)
      expect(res).toEqual([
        `${fn.replace('Mail', '')} title`.replace('spaceRoot', 'spaceRoot'),
        `${fn.replace('Mail', '')} html`.replace('spaceRoot', 'spaceRoot')
      ])
      expect((mailModels as any)[fn]).toHaveBeenCalled()
    })

    it('logs error for unhandled app', () => {
      const loggerSpy = spyLogger()
      const result = (service as any).genMail('en', { app: 99999 } as any, {} as any)
      expect(result).toBeUndefined()
      expect(loggerSpy).toHaveBeenCalled()
      expect(loggerSpy.mock.calls[0]?.[0] as string).toMatch(/case not handled/i)
    })
  })
})
