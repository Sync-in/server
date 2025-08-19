/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, EventEmitter, Input, Output, inject } from '@angular/core'
import { USER_PERMISSION } from '@sync-in-server/backend/src/applications/users/constants/user'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { CapitalizePipe } from '../../../../common/pipes/capitalize.pipe'

@Component({
  selector: 'app-admin-permissions',
  imports: [CapitalizePipe, L10nTranslateDirective, L10nTranslatePipe],
  template: ` <div class="d-flex flex-column col-12 pb-3">
    <label for="permissions" l10nTranslate>Permissions</label>
    <div id="permissions" class="form-check form-switch form-check-inline">
      @for (app of allApplications; track $index) {
        <div class="d-flex">
          <label class="form-check-label">
            <input
              (change)="updatePermissions(app, $event)"
              [checked]="permissions.indexOf(app) > -1"
              [value]="app"
              class="form-check-input"
              type="checkbox"
            />
            {{ app | translate: locale.language | capitalize }}
          </label>
        </div>
      }
    </div>
  </div>`
})
export class AdminPermissionsComponent {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  @Input() permissions: USER_PERMISSION[] = []
  @Output() permissionsChange = new EventEmitter<USER_PERMISSION[]>()
  protected readonly allApplications = Object.values(USER_PERMISSION)

  updatePermissions(app: USER_PERMISSION, event: any) {
    if (event.target.checked) {
      this.permissions.push(app)
    } else {
      this.permissions.splice(this.permissions.indexOf(app), 1)
    }
    this.permissionsChange.emit(this.permissions)
  }
}
