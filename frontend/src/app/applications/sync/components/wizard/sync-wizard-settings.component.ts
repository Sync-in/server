/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, inject } from '@angular/core'
import { Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { SYNC_PATH_CONFLICT_MODE, SYNC_PATH_MODE } from '@sync-in-server/backend/src/applications/sync/constants/sync'
import { L10nTranslateDirective } from 'angular-l10n'
import { TooltipDirective } from 'ngx-bootstrap/tooltip'
import { LayoutService } from '../../../../layout/layout.service'
import { SyncPathModel } from '../../models/sync-path.model'
import { SyncService } from '../../services/sync.service'
import { SYNC_ICON, SYNC_PATH, SYNC_TITLE } from '../../sync.constants'
import { SyncPathSettingsComponent } from '../shared/sync-path-settings.component'
import { SyncPathDirectionIconComponent } from '../utils/sync-path-direction-icon.component'

@Component({
  selector: 'app-sync-wizard-settings',
  imports: [L10nTranslateDirective, FaIconComponent, TooltipDirective, SyncPathDirectionIconComponent, SyncPathSettingsComponent],
  templateUrl: './sync-wizard-settings.component.html'
})
export class SyncWizardSettingsComponent {
  private readonly router = inject(Router)
  private readonly layout = inject(LayoutService)
  protected readonly syncService = inject(SyncService)
  protected readonly SYNC_PATH_CONFLICT_MODE = SYNC_PATH_CONFLICT_MODE
  protected readonly SYNC_PATH_MODE = SYNC_PATH_MODE
  protected readonly icons = { CLIENT: SYNC_ICON.CLIENT, SERVER: SYNC_ICON.SERVER }
  protected readonly translatedRemotePath = this.syncService.translateServerPath(this.syncService.wizard.remotePath.serverPath)
  protected syncPath: SyncPathModel
  protected error: string = null

  constructor() {
    this.syncPath = new SyncPathModel({
      settings: {
        name: this.syncService.wizard.localPath.name,
        localPath: this.syncService.wizard.localPath.path,
        remotePath: this.syncService.wizard.remotePath.serverPath,
        enabled: this.syncService.wizard.settings.enabled,
        mode: this.syncService.wizard.remotePath.isWriteable ? this.syncService.wizard.settings.mode : SYNC_PATH_MODE.DOWNLOAD,
        conflictMode: this.syncService.wizard.settings.conflictMode,
        diffMode: this.syncService.wizard.settings.diffMode,
        scheduler: this.syncService.wizard.settings.scheduler,
        permissions: this.syncService.wizard.remotePath.permissions
      }
    } as SyncPathModel)
    this.layout.setBreadcrumbIcon(SYNC_ICON.WIZARD)
    this.layout.setBreadcrumbNav({
      url: `/${SYNC_PATH.BASE}/${SYNC_PATH.WIZARD}/${SYNC_PATH.WIZARD_SETTINGS}/${SYNC_TITLE.WIZARD_SETTINGS}`,
      splicing: 3,
      translating: true,
      sameLink: true
    })
  }

  onPrevious() {
    this.router.navigate([SYNC_PATH.BASE, SYNC_PATH.WIZARD, SYNC_PATH.WIZARD_SERVER]).catch(console.error)
  }

  async onSubmit() {
    const r: SyncPathModel | string = await this.syncService.addPath(this.syncPath.settings)
    if (typeof r === 'string') {
      this.error = r
    } else {
      await this.syncService.refreshPaths()
      this.router.navigate([SYNC_PATH.BASE, SYNC_PATH.PATHS], { state: { id: r.id, withSettings: false } }).catch(console.error)
      this.syncService.resetWizard()
    }
  }
}
