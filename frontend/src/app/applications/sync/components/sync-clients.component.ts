/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpErrorResponse } from '@angular/common/http'
import { Component, inject } from '@angular/core'
import { Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import {
  faArrowRotateRight,
  faAt,
  faCircle,
  faCircleUser,
  faClock,
  faCodeBranch,
  faKey,
  faMapMarkerAlt,
  faPen,
  faPlusCircle,
  faRotate,
  faTrashCan
} from '@fortawesome/free-solid-svg-icons'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { TooltipDirective } from 'ngx-bootstrap/tooltip'
import { take } from 'rxjs/operators'
import { AutoResizeDirective } from '../../../common/directives/auto-resize.directive'
import { TimeAgoPipe } from '../../../common/pipes/time-ago.pipe'
import { TimeDateFormatPipe } from '../../../common/pipes/time-date-format.pipe'
import { sortCollectionByNumber } from '../../../common/utils/sort'
import { LayoutService } from '../../../layout/layout.service'
import { USER_ICON, USER_PATH, USER_TITLE } from '../../users/user.constants'
import { SyncClientModel } from '../models/sync-client.model'
import { SyncPathModel } from '../models/sync-path.model'
import { SyncService } from '../services/sync.service'
import { SYNC_ICON, SYNC_PATH } from '../sync.constants'
import { SyncClientDeleteDialogComponent } from './dialogs/sync-client-delete.dialog.component'
import { SyncPathSettingsDialogComponent } from './dialogs/sync-path-settings.dialog.component'

@Component({
  selector: 'app-sync-clients',
  imports: [TooltipDirective, L10nTranslatePipe, FaIconComponent, AutoResizeDirective, L10nTranslateDirective, TimeDateFormatPipe, TimeAgoPipe],
  templateUrl: './sync-clients.component.html',
  styleUrl: './sync-clients.component.scss'
})
export class SyncClientsComponent {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  private readonly router = inject(Router)
  private readonly layout = inject(LayoutService)
  private readonly syncService = inject(SyncService)
  protected readonly icons = {
    faArrowRotateRight,
    faTrashCan,
    CLIENT: SYNC_ICON.CLIENT,
    faCircle,
    faCircleUser,
    faCodeBranch,
    faAt,
    faClock,
    faRotate,
    faPlusCircle,
    faMapMarkerAlt,
    faPen,
    faKey
  }
  private focusOnSelectId: string
  private focusOnSelectPathId: number
  protected loading = false
  protected selected: SyncClientModel
  protected selectedPath: SyncPathModel
  protected clients: SyncClientModel[] = []

  constructor() {
    this.layout.setBreadcrumbIcon(USER_ICON.CLIENTS)
    this.layout.setBreadcrumbNav({
      url: `/${USER_PATH.BASE}/${USER_PATH.CLIENTS}/${USER_TITLE.CLIENTS}`,
      splicing: 2,
      translating: true,
      sameLink: true
    })
    const routeState = this.router.getCurrentNavigation()?.extras.state as { clientId: string; pathId?: number }
    if (routeState?.clientId) {
      this.focusOnSelectId = routeState.clientId
      this.focusOnSelectPathId = routeState.pathId
    }
    this.loadClients()
  }

  loadClients() {
    this.loading = true
    this.onSelectClient()
    this.onSelectPath()
    this.syncService.getClients().subscribe({
      next: (clients: SyncClientModel[]) => {
        sortCollectionByNumber(clients, 'id', false)
        this.clients = clients
        if (this.focusOnSelectId) {
          this.onSelectClient(this.clients.find((c) => c.id === this.focusOnSelectId))
        }
        if (this.focusOnSelectPathId && this.selected) {
          this.onSelectPath(this.selected.paths.find((p) => p.id === this.focusOnSelectPathId))
          this.focusOnSelectPathId = null
        }
      },
      error: (e: HttpErrorResponse) => {
        console.log(e)
        this.loading = false
        this.layout.sendNotification('error', 'Clients', e.error.message)
      }
    })
  }

  onSelectClient(client?: SyncClientModel) {
    this.selected = client || null
  }

  onSelectPath(syncPathModel?: SyncPathModel) {
    this.selectedPath = syncPathModel || null
  }

  onDeleteClient() {
    const modalRef: BsModalRef<SyncClientDeleteDialogComponent> = this.layout.openDialog(SyncClientDeleteDialogComponent, 'md', {
      initialState: {
        client: this.selected
      } as SyncClientDeleteDialogComponent
    })
    modalRef.content.wasDeleted.pipe(take(1)).subscribe(() => this.loadClients())
  }

  gotoPath(path: SyncPathModel) {
    this.syncService.goToPath(path, false)
  }

  onEditPath() {
    if (this.selected.isCurrentClient) {
      this.router
        .navigate([SYNC_PATH.BASE, SYNC_PATH.PATHS], {
          state: {
            id: this.selectedPath.id,
            withSettings: true
          }
        })
        .catch((e: Error) => console.error(e))
    } else {
      const modalRef: BsModalRef<SyncPathSettingsDialogComponent> = this.layout.openDialog(SyncPathSettingsDialogComponent, 'md', {
        initialState: { syncPathSelected: this.selectedPath, syncClientSelected: this.selected } as SyncPathSettingsDialogComponent
      })
      modalRef.content.mustRefresh.pipe(take(1)).subscribe(() => {
        this.focusOnSelectId = this.selected.id
        this.focusOnSelectPathId = this.selectedPath.id
        this.loadClients()
      })
    }
  }
}
