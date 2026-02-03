import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { VgBufferingModule } from '@videogular/ngx-videogular/buffering'
import { VgControlsModule } from '@videogular/ngx-videogular/controls'
import { VgCoreModule } from '@videogular/ngx-videogular/core'
import { VgOverlayPlayModule } from '@videogular/ngx-videogular/overlay-play'

@Component({
  selector: 'app-files-viewer-media',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VgCoreModule, VgControlsModule, VgOverlayPlayModule, VgBufferingModule],
  template: `
    <vg-player [style.height.px]="currentHeight()">
      <video [vgMedia]="$any(media)" #media preload="none" autoplay controls>
        <source [src]="fileUrl()" type="video/webm" />
      </video>
    </vg-player>
  `
})
export class FilesViewerMediaComponent {
  fileUrl = input<string>()
  currentHeight = input<number>()
}
