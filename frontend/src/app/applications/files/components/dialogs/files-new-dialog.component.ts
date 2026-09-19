import { KeyValuePipe } from '@angular/common'
import { AfterViewInit, Component, ElementRef, EventEmitter, inject, Input, OnInit, Output, ViewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { LucideDynamicIcon, LucideFileText, LucideGlobe } from '@lucide/angular'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { AutofocusDirective } from '../../../../common/directives/auto-focus.directive'
import { originalOrderKeyValue } from '../../../../common/utils/functions'
import { validHttpSchemaRegexp } from '../../../../common/utils/regexp'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { getAssetsMimeUrl, mimeDirectory, mimeFile } from '../../files.constants'
import { FileModel } from '../../models/file.model'
import { FilesService } from '../../services/files.service'

const DOCUMENT_MIME_TYPES: Record<string, string> = {
  odt: 'application-vnd.oasis.opendocument.text',
  ods: 'application-vnd.oasis.opendocument.spreadsheet',
  odp: 'application-vnd.oasis.opendocument.presentation',
  docx: 'application-vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application-vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application-vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text-plain',
  md: 'text-markdown'
}

@Component({
  selector: 'app-files-files-new-dialog',
  templateUrl: 'files-new-dialog.component.html',
  imports: [LucideDynamicIcon, L10nTranslateDirective, FormsModule, L10nTranslatePipe, AutofocusDirective, KeyValuePipe]
})
export class FilesNewDialogComponent implements OnInit, AfterViewInit {
  @Input() files: FileModel[]
  @Input() inputType: 'file' | 'directory' | 'download' = 'directory'
  @Output() refreshFiles = new EventEmitter()
  @ViewChild('InputText', { static: true }) inputText: ElementRef<HTMLInputElement>
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected layout = inject(LayoutService)
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly icons = { LucideFileText, LucideGlobe }
  protected readonly directoryMimeUrl = getAssetsMimeUrl(mimeDirectory)
  protected fileProp = { title: '', name: '', placeholder: '' }
  protected downloadProp = { title: '', url: '', placeholder: 'URL (https://...)' }
  protected selectedDocType = 'Text'
  private store = inject(StoreService)
  protected docTypes = this.store.server().files.sampleDocuments
  protected submitted = false
  protected error: string
  private filesService = inject(FilesService)

  ngOnInit() {
    if (this.inputType === 'download') {
      this.fileProp.title = 'Import from URL'
      this.fileProp.placeholder = 'File name'
      return
    }

    this.selectedDocType = this.docTypes[this.selectedDocType] ? this.selectedDocType : Object.keys(this.docTypes)[0]
    if (this.inputType === 'file') {
      this.fileProp.title = 'New document'
      this.fileProp.name = `${this.layout.translateString('New document')}${this.docTypeExtension(this.selectedDocType)}`
      this.fileProp.placeholder = 'Document name'
    } else {
      this.fileProp.title = 'New folder'
      this.fileProp.name = this.layout.translateString('New folder')
      this.fileProp.placeholder = 'Folder name'
    }
  }

  ngAfterViewInit() {
    if (this.inputType !== 'download') {
      this.updateFileSelection(this.inputType === 'directory')
    }
  }

  onSelectDocType(docType: string) {
    const extensionPosition = this.fileNamePosition()
    let baseName = this.inputType === 'file' && extensionPosition >= 0 ? this.fileProp.name.substring(0, extensionPosition) : this.fileProp.name
    if (baseName === this.layout.translateString('New folder')) {
      baseName = this.layout.translateString('New document')
    }
    this.inputType = 'file'
    this.fileProp.title = 'New document'
    this.selectedDocType = docType
    this.fileProp.placeholder = 'Document name'
    this.fileProp.name = `${baseName || this.layout.translateString('New document')}${this.docTypeExtension(docType)}`
    this.updateFileSelection()
  }

  onSelectDirectory() {
    if (this.inputType === 'file') {
      const extensionPosition = this.fileNamePosition()
      if (extensionPosition >= 0) {
        this.fileProp.name = this.fileProp.name.substring(0, extensionPosition)
      }
      if (this.fileProp.name === this.layout.translateString('New document')) {
        this.fileProp.name = this.layout.translateString('New folder')
      }
    }
    this.inputType = 'directory'
    this.fileProp.title = 'New folder'
    this.fileProp.placeholder = 'Folder name'
    this.updateFileSelection(true)
  }

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

  protected documentMimeUrl(extension: string) {
    return getAssetsMimeUrl(DOCUMENT_MIME_TYPES[extension] || mimeFile)
  }

  protected selectedDocumentMimeUrl() {
    const extensionPosition = this.fileNamePosition()
    const extension = extensionPosition >= 0 ? this.fileProp.name.slice(extensionPosition + 1).toLowerCase() : ''
    const documentType = Object.values(this.docTypes).find((type) => type.toLowerCase() === extension)
    return this.documentMimeUrl(documentType || '')
  }

  protected isSelectedDocType(docType: string) {
    const extensionPosition = this.fileNamePosition()
    const extension = extensionPosition >= 0 ? this.fileProp.name.slice(extensionPosition + 1).toLowerCase() : ''
    return this.inputType === 'file' && extension === this.docTypes[docType]?.toLowerCase()
  }

  private fileNamePosition() {
    return this.fileProp.name.lastIndexOf('.')
  }

  private docTypeExtension(docType: string) {
    return `.${this.docTypes[docType]}`
  }

  private updateFileSelection(selectAll = false) {
    setTimeout(() => {
      const input = this.inputText.nativeElement
      const extensionPosition = input.value.lastIndexOf('.')
      const selectionEnd = selectAll || extensionPosition < 0 ? input.value.length : extensionPosition
      input.focus()
      input.setSelectionRange(0, selectionEnd)
    }, 0)
  }
}
