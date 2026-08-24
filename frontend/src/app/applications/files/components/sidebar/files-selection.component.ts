import { AsyncPipe } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faCommentDots, faLock, faSpinner, faTimes, faUnlock } from '@fortawesome/free-solid-svg-icons'
import { TAR_EXTENSION } from '@sync-in-server/backend/src/applications/files/constants/compress'
import type { CompressFileDto } from '@sync-in-server/backend/src/applications/files/dto/file-operations.dto'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { take } from 'rxjs/operators'
import { BadgePermissionsComponent } from '../../../../common/components/badge-permissions.component'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { TimeDateFormatPipe } from '../../../../common/pipes/time-date-format.pipe'
import { defaultCardImageSize } from '../../../../layout/layout.constants'
import { TAB_MENU } from '../../../../layout/layout.interfaces'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { FAVORITES_ICON } from '../../../favorites/favorites.constants'
import { SPACES_ICON, SPACES_PATH } from '../../../spaces/spaces.constants'
import { SYNC_ICON } from '../../../sync/sync.constants'
import { UserAvatarComponent } from '../../../users/components/utils/user-avatar.component'
import { USER_PATH } from '../../../users/user.constants'
import type { SelectionAction } from '../../interfaces/file-selection.interface'
import { FileModel } from '../../models/file.model'
import { FilesService } from '../../services/files.service'
import { FilesCompressionDialogComponent } from '../dialogs/files-compression-dialog.component'
import { FileLockFormatPipe } from '../utils/file-lock.utils'
import { FilesViewerMediaComponent } from '../viewers/files-viewer-media.component'
import { FilesSummaryComponent } from '../utils/files-summary.component'

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
    BadgePermissionsComponent,
    AsyncPipe,
    FileLockFormatPipe,
    FormsModule,
    FilesSummaryComponent
  ],
  styles: ['.card {width: 100%; background: transparent; border: none}']
})
export class FilesSelectionComponent {
  files = input.required<FileModel[]>()
  private readonly router = inject(Router)
  private readonly layout = inject(LayoutService)
  private readonly filesService = inject(FilesService)
  private readonly store = inject(StoreService)
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly cardImageSize = defaultCardImageSize
  protected selectedAction: SelectionAction = 'clipboard'
  protected readonly icons = {
    SPACES: SPACES_ICON.SPACES,
    SHARED: SPACES_ICON.SHARED_WITH_OTHERS,
    LINKS: SPACES_ICON.LINKS,
    SYNC: SYNC_ICON.SYNC,
    FAVORITES: FAVORITES_ICON,
    faCommentDots,
    faLock,
    faUnlock,
    faSpinner,
    faTimes
  }

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

  protected get canManageFavorite(): boolean {
    return !this.store.user.getValue()?.isLink && this.store.repository() !== SPACES_PATH.TRASH
  }

  toggleFavorite(file: FileModel) {
    if (!this.canManageFavorite) return
    this.filesService
      .toggleFavorite(file)
      .pipe(take(1))
      .subscribe({
        error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Favorites', file.name, e)
      })
  }

  addToClipboard() {
    this.filesService.addToClipboard(this.files())
    this.filesService.fileSelectionClear.next()
    this.layout.showRSideBarTab(TAB_MENU.CLIPBOARD, true)
  }

  removeFromSelection(file: FileModel) {
    this.filesService.fileSelectionRemove.next(file)
  }

  doAction() {
    if (this.selectedAction === 'clipboard') return this.addToClipboard()
    if (this.selectedAction === 'copyMove') return this.filesService.openTreeCopyMove()
    const archiveProps: CompressFileDto = {
      name: this.files()[0].name,
      compressInDirectory: this.selectedAction === 'compress',
      compression: false,
      files: this.files().map((file) => ({ name: file.name, rootAlias: file.root?.alias, path: file.path })),
      extension: TAR_EXTENSION
    }
    this.layout.openDialog(FilesCompressionDialogComponent, null, {
      initialState: { archiveProps } as FilesCompressionDialogComponent
    })
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
    return this.filesService.getSizeLazy(f)
  }
}
