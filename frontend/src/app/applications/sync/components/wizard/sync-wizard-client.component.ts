/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */
import { Component, Renderer2, inject } from '@angular/core'
import { Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faArrowCircleRight, faTimesCircle } from '@fortawesome/free-solid-svg-icons'
import { L10nTranslateDirective } from 'angular-l10n'
import { ELECTRON_DIALOG } from '../../../../electron/constants/dialogs'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { getAssetsMimeUrl, mimeDirectory } from '../../../files/files.constants'
import type { FileModel } from '../../../files/models/file.model'
import { SyncPathModel } from '../../models/sync-path.model'
import { SyncService } from '../../services/sync.service'
import { SYNC_ICON, SYNC_PATH, SYNC_TITLE } from '../../sync.constants'

@Component({
  selector: 'app-sync-wizard-client',
  imports: [FaIconComponent, L10nTranslateDirective],
  templateUrl: 'sync-wizard-client.component.html'
})
export class SyncWizardClientComponent {
  private readonly router = inject(Router)
  private readonly renderer = inject(Renderer2)
  private readonly store = inject(StoreService)
  private readonly layout = inject(LayoutService)
  protected readonly syncService = inject(SyncService)
  protected readonly icons = { faTimesCircle, faArrowCircleRight }
  public pathIsValid = false
  public infoMsg: string = null

  constructor() {
    this.layout.setBreadcrumbIcon(SYNC_ICON.WIZARD)
    this.layout.setBreadcrumbNav({
      url: `/${SYNC_PATH.BASE}/${SYNC_PATH.WIZARD}/${SYNC_PATH.WIZARD_CLIENT}/${SYNC_TITLE.WIZARD_CLIENT}`,
      splicing: 3,
      translating: true,
      sameLink: true
    })
    if (this.syncService.wizard.localPath) {
      this.checkSelection()
    }
    const routeState = this.router.getCurrentNavigation()?.extras.state as { file: FileModel }
    if (routeState?.file) {
      this.syncService.addFileToRemotePath(routeState.file)
    }
  }

  dragOver(ev: any) {
    ev.preventDefault()
    if (ev.dataTransfer.items[0].type) {
      return false
    } else {
      ev.dataTransfer.dropEffect = 'copy'
      ev.stopPropagation()
      if (ev.target.classList.contains('dropzone')) {
        this.renderer.addClass(ev.target, 'active')
      }
    }
    return true
  }

  dragLeave(ev: any) {
    ev.preventDefault()
    if (ev.target.classList.contains('dropzone')) {
      this.renderer.removeClass(ev.target, 'active')
    }
  }

  drop(ev: any) {
    ev.preventDefault()
    ev.stopPropagation()
    const element: FileSystemEntry = ev.dataTransfer.items[0].webkitGetAsEntry()
    if (element && element.isDirectory) {
      this.syncService.wizard.localPath = {
        name: element.name,
        path: this.syncService.getFilePath(ev.dataTransfer.files[0]),
        mimeUrl: getAssetsMimeUrl(mimeDirectory),
        origin: null
      }
      this.checkSelection()
      return true
    } else {
      return false
    }
  }

  onSelect() {
    this.syncService.showOpenDialog({ properties: [ELECTRON_DIALOG.DIRECTORY, ELECTRON_DIALOG.CREATE_DIRECTORY], defaultPath: '' }).then((ev) => {
      if (!ev.canceled) {
        this.syncService.wizard.localPath = {
          name: ev.filePaths[0].split('\\').pop().split('/').pop(),
          path: ev.filePaths[0],
          mimeUrl: getAssetsMimeUrl(mimeDirectory),
          origin: null
        }
        this.checkSelection()
      }
    })
  }

  onReset() {
    this.syncService.wizard.localPath = null
    this.pathIsValid = false
    this.infoMsg = null
  }

  onNext() {
    this.router.navigate([SYNC_PATH.BASE, SYNC_PATH.WIZARD, SYNC_PATH.WIZARD_SERVER]).catch((e: Error) => console.error(e))
  }

  onCancel() {
    this.router.navigate([SYNC_PATH.BASE, SYNC_PATH.PATHS]).catch((e: Error) => console.error(e))
    this.syncService.resetWizard()
  }

  private checkSelection() {
    const root = this.store
      .clientSyncPaths()
      .find((sp: SyncPathModel) => new RegExp(`^${sp.settings.localPath}((\\/.*)+|\\/?)$`).test(this.syncService.wizard.localPath.path))
    if (root) {
      this.pathIsValid = false
      this.syncService.wizard.localPath.mimeUrl = getAssetsMimeUrl(`${mimeDirectory}_sync`)
      this.syncService.wizard.localPath.origin = root.settings.localPath
      this.infoMsg = 'The parent directory is already synced'
    } else {
      this.infoMsg = null
      this.pathIsValid = true
    }
  }
}
