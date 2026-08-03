import { KeyValuePipe } from '@angular/common'
import { Component, inject, OnDestroy } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faArrowsAlt, faClone, faDownload, faQuestion, faTimes } from '@fortawesome/free-solid-svg-icons'
import { TAR_EXTENSION } from '@sync-in-server/backend/src/applications/files/constants/compress'
import { FILE_OPERATION, FILE_REPOSITORY } from '@sync-in-server/backend/src/applications/files/constants/operations'
import type { CompressFileDto } from '@sync-in-server/backend/src/applications/files/dto/file-operations.dto'
import { SPACE_ALIAS } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { Subscription } from 'rxjs'
import { take } from 'rxjs/operators'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { originalOrderKeyValue } from '../../../../common/utils/functions'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { SPACES_TITLE } from '../../../spaces/spaces.constants'
import { FileModel } from '../../models/file.model'
import { FilesService } from '../../services/files.service'
import { FilesCompressionDialogComponent } from '../dialogs/files-compression-dialog.component'
import { resolveFileLocation } from '../utils/file-location.utils'
import { FilesSummaryComponent } from '../utils/files-summary.component'

@Component({
  selector: 'app-files-clipboard',
  imports: [
    AutoResizeDirective,
    FaIconComponent,
    L10nTranslatePipe,
    TooltipModule,
    L10nTranslateDirective,
    KeyValuePipe,
    FormsModule,
    FilesSummaryComponent
  ],
  templateUrl: 'files-clipboard.component.html'
})
export class FilesClipboardComponent implements OnDestroy {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly icons = { faTimes, faDownload, faArrowsAlt, faClone, faQuestion }
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected operations = {
    copyPaste: { text: 'Copy-Paste', operation: FILE_OPERATION.COPY },
    cutPaste: { text: 'Cut-Paste', operation: FILE_OPERATION.MOVE },
    download: { text: 'Download', operation: FILE_OPERATION.DOWNLOAD },
    compress: { text: 'Compress', operation: FILE_OPERATION.COMPRESS }
  }
  protected files: FileModel[] = []
  private readonly layout = inject(LayoutService)
  private readonly store = inject(StoreService)
  private readonly filesService = inject(FilesService)
  protected selectedAction: 'copyPaste' | 'cutPaste' | 'download' | 'compress' = this.filesService.clipboardAction
  private subscriptions: Subscription[] = []

  constructor() {
    this.subscriptions.push(this.store.filesClipboard.subscribe((files: FileModel[]) => (this.files = files)))
  }

  ngOnDestroy() {
    this.subscriptions.forEach((s: Subscription) => s.unsubscribe())
  }

  clearAll() {
    this.layout.toggleRSideBar(false)
    this.filesService.clearClipboard()
  }

  remove(file: FileModel) {
    if (this.files.length === 1) {
      this.clearAll()
    } else {
      this.filesService.removeFromClipboard(file)
    }
  }

  protected fileLocation(file: FileModel): string {
    const location = resolveFileLocation(file.path)
    if (!location) return file.path
    const repositoryTitle =
      location.repository === SPACE_ALIAS.PERSONAL
        ? SPACES_TITLE.PERSONAL_FILES
        : location.repository === FILE_REPOSITORY.SHARE
          ? SPACES_TITLE.SHARES
          : SPACES_TITLE.SPACES
    return [this.layout.translateString(repositoryTitle), location.relativePath].filter(Boolean).join('/')
  }

  doAction() {
    if (this.selectedAction === 'copyPaste' || this.selectedAction === 'cutPaste') {
      this.filesService.onPasteClipboard(this.selectedAction)
    } else {
      const archiveProps: CompressFileDto = {
        name: this.files[0].name,
        compressInDirectory: this.operations[this.selectedAction].operation === FILE_OPERATION.COMPRESS,
        compression: false,
        files: this.files.map((f: FileModel) => ({ name: f.name, rootAlias: f.root?.alias, path: f.path })),
        extension: TAR_EXTENSION
      }
      const modalRef: BsModalRef<FilesCompressionDialogComponent> = this.layout.openDialog(FilesCompressionDialogComponent, null, {
        initialState: { archiveProps: archiveProps } as FilesCompressionDialogComponent
      })
      modalRef.content.submitEvent.pipe(take(1)).subscribe(() => this.filesService.clearClipboard())
    }
  }
}
