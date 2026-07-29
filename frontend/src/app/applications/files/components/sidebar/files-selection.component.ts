import { AsyncPipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faChevronDown, faChevronUp, faLock, faSpinner, faUnlock } from '@fortawesome/free-solid-svg-icons'
import { TAR_EXTENSION } from '@sync-in-server/backend/src/applications/files/constants/compress'
import type { CompressFileDto } from '@sync-in-server/backend/src/applications/files/dto/file-operations.dto'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { from, of, shareReplay } from 'rxjs'
import { catchError, concatMap, scan, startWith, switchMap, tap } from 'rxjs/operators'
import { BadgePermissionsComponent } from '../../../../common/components/badge-permissions.component'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { TimeDateFormatPipe } from '../../../../common/pipes/time-date-format.pipe'
import { ToBytesPipe } from '../../../../common/pipes/to-bytes.pipe'
import { defaultCardImageSize, defaultResizeOffset } from '../../../../layout/layout.constants'
import { TAB_MENU } from '../../../../layout/layout.interfaces'
import { LayoutService } from '../../../../layout/layout.service'
import { SPACES_ICON, SPACES_PATH } from '../../../spaces/spaces.constants'
import { SYNC_ICON } from '../../../sync/sync.constants'
import { UserAvatarComponent } from '../../../users/components/utils/user-avatar.component'
import { USER_PATH } from '../../../users/user.constants'
import type { SelectionAction, SelectionSize } from '../../interfaces/file-selection.interface'
import { FileModel } from '../../models/file.model'
import { FilesService } from '../../services/files.service'
import { FilesCompressionDialogComponent } from '../dialogs/files-compression-dialog.component'
import { FileLockFormatPipe } from '../utils/file-lock.utils'
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
    BadgePermissionsComponent,
    AsyncPipe,
    FileLockFormatPipe,
    FormsModule,
    ToBytesPipe
  ],
  styles: ['.card {width: 100%; background: transparent; border: none}']
})
export class FilesSelectionComponent {
  files = input.required<FileModel[]>()
  private readonly router = inject(Router)
  private readonly layout = inject(LayoutService)
  private readonly filesService = inject(FilesService)
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly resizeOffset = defaultResizeOffset
  protected readonly cardImageSize = defaultCardImageSize
  protected filesListExpanded = false
  protected selectedAction: SelectionAction = 'clipboard'
  protected readonly selectionStats = computed(() => {
    const files = this.files()
    const directories = files.filter((file) => file.isDir).length
    return { directories, files: files.length - directories }
  })
  protected readonly selectionSize = toObservable(this.files).pipe(
    switchMap((files) => {
      const directories = files.filter((file) => file.isDir)
      const initial: SelectionSize = {
        size: files.reduce((size, file) => size + (file.isDir ? 0 : file.size), 0),
        pendingDirectories: directories.length,
        hasError: false
      }
      return from(directories).pipe(
        concatMap((directory) => this.getSizeLazy(directory)),
        scan(
          (total: SelectionSize, size: number | null): SelectionSize => ({
            size: total.size + (size ?? 0),
            pendingDirectories: total.pendingDirectories - 1,
            hasError: total.hasError || size === null
          }),
          initial
        ),
        startWith(initial)
      )
    }),
    shareReplay(1)
  )
  protected readonly icons = {
    SPACES: SPACES_ICON.SPACES,
    SHARES: SPACES_ICON.SHARES,
    LINKS: SPACES_ICON.LINKS,
    SYNC: SYNC_ICON.SYNC,
    faLock,
    faUnlock,
    faSpinner,
    faChevronDown,
    faChevronUp
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

  addToClipboard() {
    this.filesService.addToClipboard(this.files())
    this.layout.showRSideBarTab(TAB_MENU.CLIPBOARD, true)
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
    return (f.dirSize ??= this.filesService.getSize(f).pipe(
      tap((size) => f.updateSize(size)),
      catchError(() => of(null)),
      shareReplay(1)
    ))
  }
}
