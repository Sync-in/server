import { HttpErrorResponse } from '@angular/common/http'
import { Component, inject, signal, ViewChild, WritableSignal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faArrowCircleLeft, faArrowCircleRight, faFolderPlus } from '@fortawesome/free-solid-svg-icons'
import { FileTree } from '@sync-in-server/backend/src/applications/files/interfaces/file-tree.interface'
import { USER_PERMISSION } from '@sync-in-server/backend/src/applications/users/constants/user'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { TooltipDirective } from 'ngx-bootstrap/tooltip'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { FilesService } from '../../../files/services/files.service'
import { SPACES_ICON, SPACES_PATH, SPACES_TITLE } from '../../../spaces/spaces.constants'
import { UserService } from '../../../users/user.service'
import { SyncWizardPath } from '../../models/sync-wizard-path.model'
import { SyncService } from '../../services/sync.service'
import { SYNC_ICON, SYNC_PATH, SYNC_TITLE } from '../../sync.constants'
import { isSynchronizable } from '../../sync.utils'

@Component({
  selector: 'app-sync-wizard-server',
  imports: [FaIconComponent, L10nTranslateDirective, AutoResizeDirective, FormsModule, L10nTranslatePipe, ReactiveFormsModule, TooltipDirective],
  templateUrl: 'sync-wizard-server.component.html'
})
export class SyncWizardServerComponent {
  locale = inject<L10nLocale>(L10N_LOCALE)
  @ViewChild(AutoResizeDirective, { static: true }) autoResize: AutoResizeDirective
  protected readonly icons = { faArrowCircleLeft, faArrowCircleRight, faFolderPlus }
  protected infoMsg: string = null
  protected newDirectoryName: string
  protected selectedPath: SyncWizardPath
  protected currentPath: string
  protected currentShowedPath: string
  protected canCreateDir = false
  private readonly router = inject(Router)
  private readonly store = inject(StoreService)
  private readonly userService = inject(UserService)
  private readonly filesService = inject(FilesService)
  private readonly syncService = inject(SyncService)
  private readonly layout = inject(LayoutService)
  private readonly rootPaths: SyncWizardPath[] = [
    this.userService.userHavePermission(USER_PERMISSION.PERSONAL_SPACE)
      ? new SyncWizardPath({
          id: 0,
          name: this.layout.translateString(SPACES_TITLE.PERSONAL_FILES),
          path: `${SPACES_PATH.FILES}/${SPACES_PATH.PERSONAL}`,
          icon: SPACES_ICON.PERSONAL,
          hasChildren: true,
          enabled: true,
          iconClass: 'primary'
        })
      : null,
    this.userService.userHavePermission(USER_PERMISSION.SPACES)
      ? new SyncWizardPath({
          id: -1,
          name: this.layout.translateString(SPACES_TITLE.SPACES),
          path: SPACES_PATH.SPACES,
          icon: SPACES_ICON.SPACES,
          hasChildren: true,
          enabled: true,
          iconClass: 'primary'
        })
      : null,
    this.userService.userHavePermission(USER_PERMISSION.SHARES)
      ? new SyncWizardPath({
          id: -2,
          name: this.layout.translateString(SPACES_TITLE.SHARES),
          path: SPACES_PATH.SHARES,
          icon: SPACES_ICON.SHARES,
          hasChildren: true,
          enabled: true,
          iconClass: 'purple'
        })
      : null
  ].filter(Boolean)
  protected currentPaths: WritableSignal<SyncWizardPath[]> = signal([...this.rootPaths])

  constructor() {
    if (this.syncService.wizard.remotePath) {
      this.browse(this.syncService.wizard.remotePath.path.split('/').slice(0, -1).join('/'), this.syncService.wizard.remotePath.name).catch(
        (e: Error) => {
          console.error(e)
          this.currentPath = ''
          this.onBack()
        }
      )
    }
    this.layout.setBreadcrumbIcon(SYNC_ICON.WIZARD)
    this.layout.setBreadcrumbNav({
      url: `/${SYNC_PATH.BASE}/${SYNC_PATH.WIZARD}/${SYNC_PATH.WIZARD_SERVER}/${SYNC_TITLE.WIZARD_SERVER}`,
      splicing: 3,
      translating: true,
      sameLink: true
    })
  }

  async browse(path: string, selectByName: string = null) {
    this.currentPath = path || ''
    this.setCurrentPaths((await this.filesService.getTreeNode(path)).map((f: FileTree) => new SyncWizardPath(f)))
    this.setCurrentShowedPath()
    this.canCreateDir = this.currentPath.length ? isSynchronizable(`${this.currentPath}/canCreate`, true) : false
    if (selectByName) {
      const index = this.currentPaths().findIndex((p) => p.name === selectByName)
      if (index > -1) {
        this.onSelect(this.currentPaths()[index])
        this.autoResize.scrollIntoView(Math.max(index, 1) * 30 - 30)
      }
    } else {
      this.onSelect()
      this.autoResize.scrollTop()
    }
  }

  onBack() {
    const segments = this.currentPath.split('/')
    if ((segments.length === 2 && segments[0] === SPACES_PATH.FILES && segments[1] === SPACES_PATH.PERSONAL) || segments.length <= 1) {
      this.currentPath = ''
      this.onSelect()
      this.initRootPaths()
      this.setCurrentShowedPath()
      this.canCreateDir = false
    } else {
      const backRoute = segments.length === 2 && segments[0] === SPACES_PATH.FILES ? [SPACES_PATH.SPACES] : segments.slice(0, -1)
      this.browse(backRoute.join('/')).catch(console.error)
    }
  }

  addDirectory() {
    this.filesService.make('directory', this.newDirectoryName, this.currentPath, true).subscribe({
      next: () => {
        this.browse(this.currentPath, this.newDirectoryName)
          .then(() => (this.newDirectoryName = ''))
          .catch(console.error)
      },
      error: (e: HttpErrorResponse) => this.setInfoMsg(e.error.message)
    })
  }

  onSelect(path?: SyncWizardPath): void {
    this.setInfoMsg(null)
    this.currentPaths().forEach((p) => (p.selected = false))
    if (!path) {
      this.selectPath()
      return
    }
    path.selected = true
    if (!path.isSynchronizable) {
      return
    }
    if (!path.enabled) {
      this.setInfoMsg('This directory is not accessible')
      this.selectPath()
    } else if (path.isAlreadySynced) {
      this.setInfoMsg('This directory is already synced')
      this.selectPath()
    } else {
      if (!path.isWriteable) {
        this.setInfoMsg('This directory is read-only, you will not be able to modify it')
      }
      this.selectPath(path)
    }
  }

  onNext() {
    this.router.navigate([SYNC_PATH.BASE, SYNC_PATH.WIZARD, SYNC_PATH.WIZARD_SETTINGS]).catch(console.error)
  }

  onPrevious() {
    this.router.navigate([SYNC_PATH.BASE, SYNC_PATH.WIZARD, SYNC_PATH.WIZARD_CLIENT]).catch(console.error)
  }

  setServerPath(serverPath: SyncWizardPath) {
    this.syncService.wizard.remotePath = serverPath
  }

  private setCurrentPaths(paths?: SyncWizardPath[]) {
    for (const syncPath of this.store.clientSyncPaths()) {
      const searchRegexp = new RegExp(`^${syncPath.settings.remotePath}((\\/.*)+|\\/?)$`)
      for (const p of paths) {
        if (searchRegexp.test(p.serverPath)) {
          p.setAlreadySynced()
        }
      }
    }
    this.currentPaths.set(paths)
  }

  private initRootPaths() {
    this.currentPaths.set([...this.rootPaths])
  }

  private setCurrentShowedPath() {
    this.currentShowedPath = this.syncService.translateServerPath(this.currentPath)
  }

  private selectPath(path: SyncWizardPath = null) {
    this.selectedPath = path
    this.setServerPath(path)
  }

  private setInfoMsg(msg: string, timeout = false) {
    this.infoMsg = msg
    if (timeout) {
      setTimeout(() => (this.infoMsg = null), 6000)
    }
  }
}
