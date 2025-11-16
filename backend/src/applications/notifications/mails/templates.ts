/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { capitalizeString } from '../../../common/shared'
import { UserModel } from '../../users/models/user.model'

export const defaultFooter = 'If you no longer wish to receive notifications, change your preferences directly from your user space.'

export const mailTemplate = (content: string, footer: string) => `
<html lang="en">
<meta charset="utf-8"/>
<body>
<div>
${content}
</div>
<small style="color:#666">
--
${footer}
</small>
</body
</html>`

export const mailAuthor = (author: UserModel) =>
  `<img style="border-radius: 50% !important; vertical-align: middle; object-fit: cover;" height="40" width="40" src="${author.avatarBase64}" alt="avatar">&nbsp;<b>${author.fullName}</b>&nbsp;`

export const mailEventOnElement = (event: string, element: string) => `${event}:&nbsp;<b>${capitalizeString(element)}</b>`

export const mailItalicContent = (content: string) => `<p><i>${content}</i></p>`
