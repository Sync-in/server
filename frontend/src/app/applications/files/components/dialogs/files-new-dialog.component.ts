import { KeyValuePipe } from '@angular/common'
import { AfterViewInit, Component, computed, ElementRef, inject, Input, OnInit, signal, viewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { LucideDynamicIcon, LucideFileText, LucideGlobe } from '@lucide/angular'
import { COLLABORA_ONLINE_EXTENSIONS } from '@sync-in-server/backend/src/applications/files/editors/collabora-online/collabora-online.constants'
import { DRAWIO_EXTENSIONS } from '@sync-in-server/backend/src/applications/files/editors/drawio/drawio.constants'
import { ONLY_OFFICE_EXTENSIONS } from '@sync-in-server/backend/src/applications/files/editors/only-office/only-office.constants'
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
  drawio: 'application-x-drawio',
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
  private readonly inputText = viewChild.required<ElementRef<HTMLInputElement>>('InputText')
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected layout = inject(LayoutService)
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly icons = { LucideFileText, LucideGlobe }
  protected readonly directoryMimeUrl = getAssetsMimeUrl(mimeDirectory)
  protected readonly selectedInputType = signal<'file' | 'directory' | 'download'>('directory')
  protected readonly fileProp = computed(() => {
    if (this.selectedInputType() === 'download') return { title: 'Import from URL', placeholder: 'File name' }
    if (this.selectedInputType() === 'file') return { title: 'New document', placeholder: 'Document name' }
    return { title: 'New folder', placeholder: 'Folder name' }
  })
  protected readonly fileName = signal('')
  protected readonly downloadUrl = signal('')
  protected readonly downloadPlaceholder = 'URL (https://...)'
  private store = inject(StoreService)
  protected readonly docTypes = computed(() => this.buildDocumentTypes(this.store.server().files.sampleDocuments))
  protected readonly currentDocType = computed(() => {
    const extensionPosition = this.fileNamePosition()
    const extension =
      extensionPosition >= 0
        ? this.fileName()
            .slice(extensionPosition + 1)
            .toLowerCase()
        : ''
    return Object.keys(this.docTypes()).find((docType) => this.docTypes()[docType] && this.docTypes()[docType].toLowerCase() === extension) || 'Other'
  })
  protected readonly selectedDocumentMimeUrl = computed(() => this.documentMimeUrl(this.docTypes()[this.currentDocType()]))
  protected readonly canOpenAfterCreation = computed(() => {
    if (this.selectedInputType() === 'directory') return true
    const docType = this.currentDocType()
    if (this.selectedInputType() !== 'file' || docType === 'Other') return false
    const extension = this.docTypes()[docType].toLowerCase()
    if (extension === 'txt' || extension === 'md') return true
    const editors = this.store.server().files.editors
    return (
      (editors.drawio && DRAWIO_EXTENSIONS.has(extension)) ||
      (editors.collabora && COLLABORA_ONLINE_EXTENSIONS.has(extension)) ||
      ((editors.onlyoffice || editors.eurooffice) && ONLY_OFFICE_EXTENSIONS.has(extension))
    )
  })
  protected readonly openAfterCreate = signal(true)
  protected readonly submitted = signal(false)
  protected readonly error = signal<string | null>(null)
  private filesService = inject(FilesService)

  ngOnInit() {
    this.selectedInputType.set(this.inputType)
    if (this.selectedInputType() === 'download') {
      return
    }

    if (this.selectedInputType() === 'file') {
      const docType = this.docTypes().Text ? 'Text' : Object.keys(this.docTypes())[0]
      this.fileName.set(`${this.layout.translateString('New document')}${this.docTypeExtension(docType)}`)
    } else {
      this.fileName.set(this.layout.translateString('New folder'))
    }
  }

  ngAfterViewInit() {
    if (this.selectedInputType() !== 'download') {
      this.updateFileSelection(this.selectedInputType() === 'directory')
    }
  }

  onSelectDocType(docType: string) {
    const extensionPosition = this.fileNamePosition()
    let baseName = this.selectedInputType() === 'file' && extensionPosition >= 0 ? this.fileName().substring(0, extensionPosition) : this.fileName()
    if (baseName === this.layout.translateString('New folder')) {
      baseName = this.layout.translateString('New document')
    }
    this.selectedInputType.set('file')
    this.fileName.set(`${baseName || this.layout.translateString('New document')}${this.docTypeExtension(docType)}`)
    this.updateFileSelection()
  }

  onSelectMobileType(type: string) {
    if (type === 'directory') {
      this.onSelectDirectory()
    } else {
      this.onSelectDocType(type)
    }
  }

  onSelectDirectory() {
    if (this.selectedInputType() === 'file') {
      const extensionPosition = this.fileNamePosition()
      if (extensionPosition >= 0) {
        this.fileName.set(this.fileName().substring(0, extensionPosition))
      }
      if (this.fileName() === this.layout.translateString('New document')) {
        this.fileName.set(this.layout.translateString('New folder'))
      }
    }
    this.selectedInputType.set('directory')
    this.updateFileSelection(true)
  }

  onEnter() {
    if (this.fileName()) {
      this.onSubmit()
    }
  }

  onSubmit() {
    this.submitted.set(true)
    if (this.files.find((f) => f.name.toLowerCase() === this.fileName().toLowerCase())) {
      this.error.set('This name is already used')
      this.submitted.set(false)
      return
    }
    const selectedInputType = this.selectedInputType()
    if (selectedInputType === 'download') {
      if (!validHttpSchemaRegexp.test(this.downloadUrl())) {
        this.error.set('Malformed URL')
        this.submitted.set(false)
        return
      }
      this.filesService.downloadFromUrl(this.downloadUrl(), this.fileName())
    } else {
      this.filesService.make(selectedInputType, this.fileName(), undefined, false, this.openAfterCreate() && this.canOpenAfterCreation())
    }
    this.layout.closeDialog()
  }

  pasteUrl() {
    setTimeout(() => {
      this.fileName.set(this.downloadUrl().split('/').slice(-1)[0])
    }, 200)
  }

  protected documentMimeUrl(extension: string) {
    return getAssetsMimeUrl(DOCUMENT_MIME_TYPES[extension] || mimeFile)
  }

  protected isSelectedDocType(docType: string) {
    return this.selectedInputType() === 'file' && docType === this.currentDocType()
  }

  private buildDocumentTypes(documentTypes: Record<string, string>): Record<string, string> {
    const { Diagram, Text, Markdown, ...officeDocumentTypes } = documentTypes
    return {
      ...officeDocumentTypes,
      ...(Diagram ? { Diagram } : {}),
      ...(Markdown ? { Markdown } : {}),
      ...(Text ? { Text } : {}),
      Other: ''
    }
  }

  private fileNamePosition() {
    return this.fileName().lastIndexOf('.')
  }

  private docTypeExtension(docType: string) {
    const extension = this.docTypes()[docType]
    return extension ? `.${extension}` : ''
  }

  private updateFileSelection(selectAll = false) {
    setTimeout(() => {
      const input = this.inputText().nativeElement
      const extensionPosition = input.value.lastIndexOf('.')
      const selectionEnd = selectAll || extensionPosition < 0 ? input.value.length : extensionPosition
      input.focus()
      input.setSelectionRange(0, selectionEnd)
    }, 0)
  }
}
