/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { AsyncPipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, InputSignal, Signal } from '@angular/core'
import { Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faArrowsAlt, faClipboardCheck, faLock, faSpinner, faUnlock } from '@fortawesome/free-solid-svg-icons'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { catchError, of, shareReplay } from 'rxjs'
import { map } from 'rxjs/operators'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { TimeDateFormatPipe } from '../../../../common/pipes/time-date-format.pipe'
import { convertBytesToText } from '../../../../common/utils/functions'
import { defaultCardImageSize } from '../../../../layout/layout.constants'
import { TAB_MENU } from '../../../../layout/layout.interfaces'
import { LayoutService } from '../../../../layout/layout.service'
import { SPACES_ICON, SPACES_PATH } from '../../../spaces/spaces.constants'
import { SYNC_ICON } from '../../../sync/sync.constants'
import { UserAvatarComponent } from '../../../users/components/utils/user-avatar.component'
import { USER_PATH } from '../../../users/user.constants'
import { FileModel } from '../../models/file.model'
import { FilesService } from '../../services/files.service'
import { FilePermissionsComponent } from '../utils/file-permissions.component'
import { FilesViewerMediaComponent } from '../viewers/files-viewer-media.component'

@Component({
  selector: 'app-files-selection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: 'files-selection.component.html',
  imports: [
    AutoResizeDirective,
    TimeDateFormatPipe,
    L10nTranslateDirective,
    L10nTranslatePipe,
    FaIconComponent,
    FilesViewerMediaComponent,
    UserAvatarComponent,
    FilePermissionsComponent,
    AsyncPipe
  ],
  styles: ['.card {width: 100%; background: transparent; border: none}']
})
export class FilesSelectionComponent {
  files: InputSignal<FileModel[]> = input.required<FileModel[]>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected multiple: Signal<boolean> = computed(() => this.files().length > 1)
  protected resizeOffset: Signal<number> = computed(() => (this.multiple() ? 120 : 80))
  protected readonly cardImageSize = defaultCardImageSize
  protected readonly icons = {
    SPACES: SPACES_ICON.SPACES,
    SHARES: SPACES_ICON.SHARES,
    LINKS: SPACES_ICON.LINKS,
    SYNC: SYNC_ICON.SYNC,
    faLock,
    faUnlock,
    faClipboardCheck,
    faArrowsAlt,
    faSpinner
  }
  private readonly router = inject(Router)
  private readonly layout = inject(LayoutService)
  private readonly filesService = inject(FilesService)

  goToShare(share: { type: number; name: string }) {
    this.layout.toggleRSideBar(false)
    this.router.navigate([share.type === 0 ? SPACES_PATH.SHARED : SPACES_PATH.LINKS], { queryParams: { select: share.name } }).catch(console.error)
  }

  goToSpace(space: { alias: string; name: string }) {
    this.layout.toggleRSideBar(false)
    this.router.navigate([SPACES_PATH.SPACES], { queryParams: { select: space.name } }).catch(console.error)
  }

  goToComments() {
    this.layout.showRSideBarTab(TAB_MENU.COMMENTS, true)
  }

  addToClipboard() {
    this.filesService.addToClipboard(this.files())
    this.layout.showRSideBarTab(TAB_MENU.CLIPBOARD, true)
  }

  goToSync(sync: { clientId: string; clientName: string; id: number }) {
    this.layout.toggleRSideBar(false)
    this.router
      .navigate([USER_PATH.BASE, USER_PATH.CLIENTS], {
        state: {
          clientId: sync.clientId,
          pathId: sync.id
        }
      })
      .catch(console.error)
  }

  openLockDialog(f: FileModel) {
    this.filesService.openLockDialog(f)
  }

  getSizeLazy(f: FileModel) {
    if (!f.isDir) return of(f.hSize)
    if (!f.hDirSize) {
      f.hDirSize = this.filesService.getSize(f).pipe(
        map((size) => convertBytesToText(size, 0, true)),
        catchError(() => (f.hDirSize = of(f.hSize))),
        shareReplay(1)
      )
    }
    return f.hDirSize
  }
}
