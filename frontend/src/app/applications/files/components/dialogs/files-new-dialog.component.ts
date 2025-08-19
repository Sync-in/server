/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { KeyValuePipe } from '@angular/common'
import { Component, ElementRef, EventEmitter, HostListener, inject, Input, OnInit, Output, ViewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faCaretDown, faFileAlt, faFolderClosed, faGlobe } from '@fortawesome/free-solid-svg-icons'
import { DOCUMENT_TYPE } from '@sync-in-server/backend/src/applications/files/constants/samples'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BsDropdownModule } from 'ngx-bootstrap/dropdown'
import { AutofocusDirective } from '../../../../common/directives/auto-focus.directive'
import { originalOrderKeyValue } from '../../../../common/utils/functions'
import { validHttpSchemaRegexp } from '../../../../common/utils/regexp'
import { LayoutService } from '../../../../layout/layout.service'
import { FileModel } from '../../models/file.model'
import { FilesService } from '../../services/files.service'

@Component({
  selector: 'app-files-files-new-dialog',
  templateUrl: 'files-new-dialog.component.html',
  imports: [FaIconComponent, L10nTranslateDirective, BsDropdownModule, FormsModule, L10nTranslatePipe, AutofocusDirective, KeyValuePipe]
})
export class FilesNewDialogComponent implements OnInit {
  @Input() files: FileModel[]
  @Input() inputType: 'file' | 'directory' | 'download'
  @Output() refreshFiles = new EventEmitter()
  @ViewChild('InputText', { static: true }) inputText: ElementRef
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected layout = inject(LayoutService)
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly icons = { faCaretDown, faGlobe, faFolderClosed, faFileAlt }
  protected fileProp = { title: '', name: '', placeholder: '' }
  protected downloadProp = { title: 'Download from an external link', url: '', placeholder: 'URL (https://...)' }
  protected selectedDocType = 'Text'
  protected docTypes = DOCUMENT_TYPE
  protected submitted = false
  protected error: string
  private filesService = inject(FilesService)

  ngOnInit() {
    if (this.inputType === 'download') {
      this.fileProp.title = 'Download from URL'
      this.fileProp.placeholder = 'File name'
    } else if (this.inputType === 'file') {
      this.fileProp.name = `${this.layout.translateString('New document')}.txt`
      this.fileProp.title = 'New document'
      this.fileProp.placeholder = 'Document name'
      this.updateFileSelection()
    } else {
      this.fileProp.title = 'New folder'
      this.fileProp.placeholder = 'Folder name'
    }
  }

  onSelectDocType(docType: string) {
    this.selectedDocType = docType
    const pos = this.fileNamePosition()
    this.fileProp.name = `${this.fileProp.name.substring(0, pos < 0 ? this.fileProp.name.length : pos)}${this.docTypes[docType]}`
    this.updateFileSelection()
  }

  @HostListener('document:keyup.enter')
  onEnter() {
    if (this.fileProp.name) {
      this.onSubmit()
    }
  }

  onSubmit() {
    this.submitted = true
    if (this.files.find((f) => f.name.toLowerCase() === this.fileProp.name.toLowerCase())) {
      this.error = 'This name is already used'
      this.submitted = false
      return
    }
    if (this.inputType === 'download') {
      if (!validHttpSchemaRegexp.test(this.downloadProp.url)) {
        this.error = 'Malformed URL'
        this.submitted = false
        return
      }
      this.filesService.downloadFromUrl(this.downloadProp.url, this.fileProp.name)
    } else {
      this.filesService.make(this.inputType, this.fileProp.name)
    }
    this.layout.closeDialog()
  }

  pasteUrl() {
    setTimeout(() => {
      this.fileProp.name = this.downloadProp.url.split('/').slice(-1)[0]
    }, 200)
  }

  private fileNamePosition() {
    return this.fileProp.name.lastIndexOf('.')
  }

  private updateFileSelection() {
    setTimeout(() => {
      this.inputText.nativeElement.focus()
      this.inputText.nativeElement.setSelectionRange(0, this.fileNamePosition())
    }, 0)
  }
}
