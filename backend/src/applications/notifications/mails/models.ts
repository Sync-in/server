/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ACTION } from '../../../common/constants'
import { i18nLocale } from '../../../common/i18n'
import { capitalizeString, SERVER_NAME } from '../../../common/shared'
import { fileName } from '../../files/utils/files'
import { UserModel } from '../../users/models/user.model'
import { translateObject } from '../i18n'
import { NotificationContent } from '../interfaces/notification-properties.interface'
import { defaultFooter, mailAuthor, mailEventOnElement, mailItalicContent, mailTemplate } from './templates'
import { urlFromLink, urlFromSpace, urlFromSpaceFile, urlFromSync } from './urls'

export function commentMail(
  language: i18nLocale,
  notification: NotificationContent,
  options: {
    content: string
    currentUrl: string
    author: UserModel
  }
): [string, string] {
  const tr = translateObject(language, {
    title: 'Comment',
    defaultFooter: defaultFooter,
    footer: 'You receive this notification if you are the owner of the file or if you have also commented on this file',
    urlText: 'Access it from',
    event: notification.event
  })

  const content = `${mailAuthor(options.author)}${mailEventOnElement(tr.event, notification.element)}${mailItalicContent(options.content)}`

  const footer = `<br>${tr.urlText}&nbsp;<a href="${urlFromSpaceFile(options.currentUrl, notification)}">${SERVER_NAME}</a><br>${tr.footer}<br>${tr.defaultFooter}`

  return [`${tr.title}: ${capitalizeString(notification.element)}`, mailTemplate(content, footer)]
}

export function spaceMail(
  language: i18nLocale,
  notification: NotificationContent,
  options: {
    currentUrl: string
    action: ACTION
  }
): [string, string] {
  const tr = translateObject(language, {
    title: 'Space',
    defaultFooter: defaultFooter,
    urlText: options.action === ACTION.ADD ? 'Access it from' : 'Access your spaces from',
    event: notification.event
  })

  const spaceUrl = urlFromSpace(options.currentUrl, options.action === ACTION.ADD ? notification.element : undefined)

  const content = `${mailEventOnElement(tr.event, notification.element)}`

  const footer = `<br>${tr.urlText}&nbsp;<a href="${spaceUrl}">${SERVER_NAME}</a><br>${tr.defaultFooter}`

  return [`${tr.title}: ${capitalizeString(notification.element)}`, mailTemplate(content, footer)]
}

export function spaceRootMail(
  language: i18nLocale,
  notification: NotificationContent,
  options: {
    currentUrl: string
    author: UserModel
    action: ACTION
  }
): [string, string] {
  const tr = translateObject(language, {
    title: 'Space',
    defaultFooter: defaultFooter,
    urlText: options.action === ACTION.ADD ? 'Access it from' : 'Access this space from',
    event: notification.event,
    originEvent: options.action === ACTION.ADD ? 'to the space' : 'from the space'
  })

  const spaceName = fileName(notification.url)
  const spaceRootUrl =
    options.action === ACTION.ADD ? urlFromSpaceFile(options.currentUrl, notification) : urlFromSpace(options.currentUrl, spaceName)

  const content = `${mailAuthor(options.author)}${mailEventOnElement(tr.event, notification.element)}&nbsp;${tr.originEvent}&nbsp;<b>${spaceName}</b>`

  const footer = `<br>${tr.urlText}&nbsp;<a href="${spaceRootUrl}">${SERVER_NAME}</a><br>${tr.defaultFooter}`

  return [`${tr.title}: ${capitalizeString(spaceName)}`, mailTemplate(content, footer)]
}

export function shareMail(
  language: i18nLocale,
  notification: NotificationContent,
  options: {
    currentUrl: string
    author: UserModel
    action: ACTION
  }
): [string, string] {
  const tr = translateObject(language, {
    title: 'Share',
    defaultFooter: defaultFooter,
    urlText: options.action === ACTION.ADD ? 'Access it from' : 'Access your shares from',
    event: notification.event
  })

  const content = `${options.author ? mailAuthor(options.author) : ''}${mailEventOnElement(tr.event, notification.element)}`

  const footer = `<br>${tr.urlText}&nbsp;<a href="${urlFromSpaceFile(options.currentUrl, notification)}">${SERVER_NAME}</a><br>${tr.defaultFooter}`

  return [`${tr.title}: ${capitalizeString(notification.element)}`, mailTemplate(content, footer)]
}

export function linkMail(
  language: i18nLocale,
  notification: NotificationContent,
  options: {
    currentUrl: string
    author: UserModel
    action: ACTION
    linkUUID: string
    linkPassword: string
  }
): [string, string] {
  const tr = translateObject(language, {
    title: options.action === ACTION.ADD ? 'Share' : 'Space',
    passwordText: 'Access password',
    urlText: 'Access it from',
    event: notification.event
  })

  let content = `${options.author ? mailAuthor(options.author) : ''}${mailEventOnElement(tr.event, notification.element)}`

  if (options.linkPassword) {
    content += `<br><br>${tr.passwordText}:&nbsp;<div style="border:1px solid #000; padding:8px; display:inline-block;">${options.linkPassword}</div>`
  }

  const footer = `<br>${tr.urlText}&nbsp;<a href="${urlFromLink(options.currentUrl, options.linkUUID)}">${SERVER_NAME}</a>`

  return [`${tr.title}: ${capitalizeString(notification.element)}`, mailTemplate(content, footer)]
}

export function syncMail(
  language: i18nLocale,
  notification: NotificationContent,
  options: {
    currentUrl: string
    action: ACTION
  }
): [string, string] {
  const tr = translateObject(language, {
    title: 'Sync',
    defaultFooter: defaultFooter,
    urlText: options.action === ACTION.ADD ? 'Access it from' : 'Access your syncs from',
    event: notification.event
  })

  const syncUrl = urlFromSync(options.currentUrl)

  const content = `${mailEventOnElement(tr.event, notification.element)}`

  const footer = `<br>${tr.urlText}&nbsp;<a href="${syncUrl}">${SERVER_NAME}</a><br>${tr.defaultFooter}`

  return [`${tr.title}: ${capitalizeString(notification.element)}`, mailTemplate(content, footer)]
}

export function auth2FaMail(language: i18nLocale, notification: NotificationContent): [string, string] {
  const tr = translateObject(language, {
    title: 'Security notification',
    footer:
      'You received this notification because the security of your Sync-in account has changed. If you think this was a mistake, please review your security settings or contact your administrator.',
    event: notification.event,
    addressIp: 'Address IP',
    browser: 'Browser'
  })

  const content = `${tr.event}<br><br>${tr.addressIp}:&nbsp;${notification.url}<br>${tr.browser}:&nbsp;${notification.element}`

  const footer = `<br>${tr.footer}<br>`

  return [tr.title, mailTemplate(content, footer)]
}

export function authLockedMail(language: i18nLocale, notification: NotificationContent): [string, string] {
  const tr = translateObject(language, {
    title: 'Security notification',
    footer:
      'This security notification concerns your Sync-in account. Please contact an administrator to perform the analysis and unlock your account.',
    event: notification.event,
    addressIp: 'Address IP'
  })

  const content = `${tr.event}<br><br>${tr.addressIp}:&nbsp;${notification.url}<br>`

  const footer = `<br>${tr.footer}<br>`

  return [tr.title, mailTemplate(content, footer)]
}

export function requestUnlockMail(
  language: i18nLocale,
  notification: NotificationContent,
  options: {
    currentUrl: string
    author: UserModel
  }
): [string, string] {
  const tr = translateObject(language, {
    title: 'Unlock Request',
    defaultFooter: defaultFooter,
    footer: 'You receive this notification because you have a lock on this file.',
    urlText: 'Access it from',
    event: notification.event
  })

  const content = `${options.author ? mailAuthor(options.author) : ''}${mailEventOnElement(tr.event, notification.element)}`

  const footer = `<br>${tr.urlText}&nbsp;<a href="${urlFromSpaceFile(options.currentUrl, notification)}">${SERVER_NAME}</a><br>${tr.footer}<br>${tr.defaultFooter}`

  return [`${tr.title}: ${capitalizeString(notification.element)}`, mailTemplate(content, footer)]
}

export function serverUpdateAvailableMail(language: i18nLocale, notification: NotificationContent): [string, string] {
  const tr = translateObject(language, {
    title: 'New Version Available',
    defaultFooter: defaultFooter,
    footer: 'You receive this notification because you are the administrator of this server.',
    event: notification.event
  })

  const content = `${tr.event}:&nbsp;<b><a href="${notification.externalUrl}" target="_blank" rel="noopener">${notification.element}</a></b>`

  const footer = `<br>${tr.footer}<br>${tr.defaultFooter}`

  return [`${SERVER_NAME} - ${tr.title}`, mailTemplate(content, footer)]
}
