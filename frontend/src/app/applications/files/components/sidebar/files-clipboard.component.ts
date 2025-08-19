/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { KeyValuePipe } from '@angular/common'
import { Component, OnDestroy, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faArrowsAlt, faClone, faDownload, faQuestion, faTimes, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { tarExtension } from '@sync-in-server/backend/src/applications/files/constants/compress'
import { FILE_OPERATION } from '@sync-in-server/backend/src/applications/files/constants/operations'
import type { CompressFileDto } from '@sync-in-server/backend/src/applications/files/dto/file-operations.dto'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { Subscription } from 'rxjs'
import { take } from 'rxjs/operators'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { originalOrderKeyValue } from '../../../../common/utils/functions'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { FileModel } from '../../models/file.model'
import { FilesService } from '../../services/files.service'
import { FilesCompressionDialogComponent } from '../dialogs/files-compression-dialog.component'

@Component({
  selector: 'app-files-clipboard',
  imports: [AutoResizeDirective, FaIconComponent, L10nTranslatePipe, TooltipModule, L10nTranslateDirective, KeyValuePipe, FormsModule],
  templateUrl: 'files-clipboard.component.html'
})
export class FilesClipboardComponent implements OnDestroy {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  private readonly layout = inject(LayoutService)
  private readonly store = inject(StoreService)
  private readonly filesService = inject(FilesService)
  private subscriptions: Subscription[] = []
  protected readonly icons = { faTrashCan, faTimes, faDownload, faArrowsAlt, faClone, faQuestion }
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected operations = {
    copyPaste: { text: 'Copy-Paste', operation: FILE_OPERATION.COPY },
    cutPaste: { text: 'Cut-Paste', operation: FILE_OPERATION.MOVE },
    download: { text: 'Download', operation: FILE_OPERATION.DOWNLOAD },
    compress: { text: 'Compress', operation: FILE_OPERATION.COMPRESS }
  }
  protected selectedAction: 'copyPaste' | 'cutPaste' | 'download' | 'compress' = this.filesService.clipboardAction
  protected files: FileModel[] = []

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

  doAction() {
    if (this.selectedAction === 'copyPaste' || this.selectedAction === 'cutPaste') {
      this.filesService.onPasteClipboard(this.selectedAction)
    } else {
      const archiveProps: CompressFileDto = {
        name: this.files[0].name,
        compressInDirectory: this.operations[this.selectedAction].operation === FILE_OPERATION.COMPRESS,
        files: this.files.map((f: FileModel) => ({ name: f.name, rootAlias: f.root?.alias, path: f.path })),
        extension: tarExtension
      }
      const modalRef: BsModalRef<FilesCompressionDialogComponent> = this.layout.openDialog(FilesCompressionDialogComponent, null, {
        initialState: { archiveProps: archiveProps } as FilesCompressionDialogComponent
      })
      modalRef.content.submitEvent.pipe(take(1)).subscribe(() => this.filesService.clearClipboard())
    }
  }
}
