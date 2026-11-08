import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core'
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser'
import { LayoutService } from '../../../../layout/layout.service'

@Component({
  selector: 'app-files-viewer-html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (content(); as resourceUrl) {
    <iframe [src]="resourceUrl" [style.height.px]="currentHeight()" class="app-viewer-iframe" sandbox></iframe>
  }`
})
export class FilesViewerHtmlComponent implements OnInit {
  readonly fileUrl = input<string>()
  readonly currentHeight = input<number>()
  protected readonly content = signal<SafeResourceUrl | null>(null)
  private readonly http = inject(HttpClient)
  private readonly sanitizer = inject(DomSanitizer)
  private readonly layout = inject(LayoutService)

  ngOnInit() {
    this.http.get(this.fileUrl(), { responseType: 'text' }).subscribe({
      next: (data: string) => {
        this.content.set(this.sanitizer.bypassSecurityTrustResourceUrl(`data:text/html,${data}`))
      },
      error: (e) => {
        this.content.set(
          this.sanitizer.bypassSecurityTrustResourceUrl(`data:text/html,${this.layout.translateString('Unable to open document')} : ${e.statusText}`)
        )
      }
    })
  }
}
