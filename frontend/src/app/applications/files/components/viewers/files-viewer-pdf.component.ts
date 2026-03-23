import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser'
import { assetsUrl } from '../../files.constants'
import { FileModel } from '../../models/file.model'

@Component({
  selector: 'app-files-viewer-pdf',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <iframe [src]="url()" class="app-viewer-iframe" [style.height.px]="currentHeight()"></iframe> `
})
export class FilesViewerPdfComponent {
  file = input.required<FileModel>()
  currentHeight = input<number>()
  private readonly sanitizer = inject(DomSanitizer)
  private readonly pdfjsUrl = `${assetsUrl}/pdfjs/web/viewer.html?file=`
  url = computed<SafeResourceUrl | null>(() =>
    this.file() ? this.sanitizer.bypassSecurityTrustResourceUrl(`${this.pdfjsUrl}${this.file().dataUrl}`) : null
  )
}
