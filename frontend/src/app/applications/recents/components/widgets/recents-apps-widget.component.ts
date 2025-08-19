/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, inject } from '@angular/core'
import { RouterLink } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { USER_PERMISSION } from '@sync-in-server/backend/src/applications/users/constants/user'
import { L10nTranslateDirective } from 'angular-l10n'
import { SPACES_ICON, SPACES_PATH, SPACES_TITLE } from '../../../spaces/spaces.constants'
import { UserService } from '../../../users/user.service'

@Component({
  selector: 'app-recents-apps-widget',
  imports: [RouterLink, FaIconComponent, L10nTranslateDirective],
  templateUrl: './recents-apps-widget.component.html'
})
export class RecentsAppsWidgetComponent {
  protected readonly userService = inject(UserService)
  protected readonly USER_PERMISSION = USER_PERMISSION
  protected readonly SPACES_ICON = SPACES_ICON
  protected readonly SPACES_PATH = SPACES_PATH
  protected readonly SPACES_TITLE = SPACES_TITLE
}
