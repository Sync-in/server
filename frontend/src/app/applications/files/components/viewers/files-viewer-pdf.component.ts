import { Component, computed, ElementRef, inject, input, viewChild } from '@angular/core'
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser'
import { assetsUrl } from '../../files.constants'
import { FileModel } from '../../models/file.model'

@Component({
  selector: 'app-files-viewer-pdf',
  template: ` <iframe #pdfIframe [src]="url()" class="app-viewer-iframe" [style.height.px]="currentHeight()" (load)="onViewerLoaded()"></iframe> `
})
export class FilesViewerPdfComponent {
  private readonly pdfIframe = viewChild<ElementRef<HTMLIFrameElement>>('pdfIframe')
  readonly file = input.required<FileModel>()
  readonly currentHeight = input<number>()
  private readonly sanitizer = inject(DomSanitizer)
  private readonly pdfjsUrl = `${assetsUrl}/pdfjs/web/viewer.html?file=`
  readonly url = computed<SafeResourceUrl | null>(() =>
    this.file() ? this.sanitizer.bypassSecurityTrustResourceUrl(`${this.pdfjsUrl}${this.file().dataUrl}`) : null
  )

  onViewerLoaded(): void {
    setTimeout(() => this.hideEditorButtons(), 100)
  }

  private hideEditorButtons() {
    const doc = this.pdfIframe()?.nativeElement.contentDocument
    if (!doc) return
    doc.querySelector('#downloadButton')?.classList.add('hidden')
    doc.querySelector('#editorModeButtons')?.classList.add('hidden')
    doc.querySelector('#editorModeSeparator')?.classList.add('hidden')
    const secondaryOpenFile = doc.querySelector('#secondaryOpenFile')
    secondaryOpenFile?.classList.add('hidden')
    const separator = secondaryOpenFile?.nextElementSibling?.nextElementSibling
    if (separator?.classList.contains('horizontalToolbarSeparator')) {
      separator.classList.add('hidden')
    }
  }
}
