import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  OnDestroy,
  viewChild,
  ViewEncapsulation
} from '@angular/core'
import * as PlyrModule from 'plyr'
import { FileModel } from '../../models/file.model'

interface PlyrInstance {
  destroy(): void
}
interface PlyrOptions {
  autoplay?: boolean
  blankVideo?: string
  controls?: string[]
  iconUrl?: string
  keyboard?: {
    focused?: boolean
    global?: boolean
  }
  settings?: string[]
  speed?: {
    selected: number
    options: number[]
  }
}
type PlyrConstructor = new (target: HTMLElement | string, options?: PlyrOptions) => PlyrInstance
const plyrModule = PlyrModule as unknown as PlyrConstructor & { default?: PlyrConstructor }
const PlyrPlayer = plyrModule.default ?? plyrModule

@Component({
  selector: 'app-files-viewer-media',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styles: [
    `
      app-files-viewer-media {
        display: block;
        width: 100%;
      }

      .files-viewer-media {
        width: 100%;
        background: #000;
      }

      .files-viewer-media--audio {
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
      }

      .files-viewer-media,
      .files-viewer-media .plyr,
      .files-viewer-media .plyr__video-wrapper,
      .files-viewer-media .files-viewer-media__player {
        height: 100%;
      }

      .files-viewer-media .plyr {
        width: 100%;
        --plyr-color-main: var(--bs-primary);
      }

      .files-viewer-media--audio .plyr {
        height: auto;
        max-width: 720px;
        border-radius: 6px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
        --plyr-audio-controls-background: rgba(17, 24, 28, 0.94);
        --plyr-audio-control-color: rgba(255, 255, 255, 0.88);
        --plyr-audio-control-color-hover: #fff;
        --plyr-audio-control-background-hover: var(--bs-primary);
        --plyr-audio-range-track-background: rgba(255, 255, 255, 0.24);
        --plyr-audio-progress-buffered-background: rgba(255, 255, 255, 0.24);
        --plyr-range-thumb-background: #fff;
        --plyr-menu-background: #1f2a30;
        --plyr-menu-color: rgba(255, 255, 255, 0.9);
        --plyr-menu-arrow-color: rgba(255, 255, 255, 0.72);
      }

      .files-viewer-media--audio .plyr--audio .plyr__controls {
        border-radius: inherit;
      }

      .files-viewer-media .files-viewer-media__player {
        width: 100%;
        object-fit: contain;
      }
    `
  ],
  template: `
    <div class="files-viewer-media" [class.files-viewer-media--audio]="isAudio()" [style.height.px]="currentHeight()">
      @if (isAudio()) {
        <audio #media class="files-viewer-media__player" preload="none" autoplay controls>
          <source [src]="file().dataUrl" />
        </audio>
      } @else {
        <video #media class="files-viewer-media__player" preload="none" autoplay playsinline controls>
          <source [src]="file().dataUrl" />
        </video>
      }
    </div>
  `
})
export class FilesViewerMediaComponent implements AfterViewInit, OnDestroy {
  file = input.required<FileModel>()
  currentHeight = input<number>()
  protected readonly isAudio = computed(() => {
    const mime = this.file().mime?.trim().toLowerCase()
    if (!mime) return false
    return (mime.includes('/') ? mime : mime.replace('-', '/')).startsWith('audio/')
  })
  private readonly media = viewChild.required<ElementRef<HTMLMediaElement>>('media')
  private player?: PlyrInstance

  ngAfterViewInit() {
    this.player = new PlyrPlayer(this.media().nativeElement, {
      autoplay: true,
      blankVideo: 'assets/plyr/blank.mp4',
      controls: ['play-large', 'play', 'progress', 'current-time', 'duration', 'mute', 'volume', 'settings', 'pip', 'airplay', 'fullscreen'],
      iconUrl: 'assets/plyr/plyr.svg',
      keyboard: { focused: true, global: true },
      settings: ['speed', 'loop'],
      speed: { selected: 1, options: [0.5, 0.75, 1, 1.25, 1.5, 2] }
    })
  }

  ngOnDestroy() {
    this.player?.destroy()
  }
}
