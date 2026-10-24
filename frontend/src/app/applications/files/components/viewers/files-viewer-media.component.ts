import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  CUSTOM_ELEMENTS_SCHEMA,
  ElementRef,
  inject,
  input,
  viewChild
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { L10nTranslationService } from 'angular-l10n'
import { map } from 'rxjs'
import '@videojs/html/audio/neutral-skin'
import '@videojs/html/audio/player'
import '@videojs/html/i18n'
import '@videojs/html/video/neutral-skin'
import '@videojs/html/video/player'
import { FileModel } from '../../models/file.model'

@Component({
  selector: 'app-files-viewer-media',
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  styles: [
    `
      :host {
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

      .files-viewer-media video-player,
      .files-viewer-media video-neutral-skin,
      .files-viewer-media video.files-viewer-media__player {
        height: 100%;
      }

      .files-viewer-media video-player,
      .files-viewer-media audio-player,
      .files-viewer-media video-neutral-skin,
      .files-viewer-media audio-neutral-skin,
      .files-viewer-media .files-viewer-media__player {
        width: 100%;
      }

      .files-viewer-media video-player {
        display: contents;
      }

      .files-viewer-media media-i18n {
        display: contents;
      }

      .files-viewer-media audio-player {
        display: block;
      }

      .files-viewer-media video-neutral-skin,
      .files-viewer-media audio-neutral-skin {
        display: block;
        --media-accent-color: var(--bs-primary);
        --media-accent-text-color: #fff;
        --media-border-color: transparent;
      }

      .files-viewer-media video-neutral-skin {
        --media-border-radius: 0;
        --media-object-fit: contain;
      }

      .files-viewer-media--audio audio-player {
        max-width: 720px;
      }

      .files-viewer-media--audio audio-neutral-skin {
        height: auto;
        border-radius: 6px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
        color-scheme: dark;
        --media-border-radius: 6px;
      }

      .files-viewer-media video.files-viewer-media__player {
        object-fit: contain;
      }
    `
  ],
  template: `
    <div
      class="files-viewer-media"
      [class.files-viewer-media--audio]="isAudio()"
      [style.--media-scale-unit]="sidebarMode() ? '14px' : null"
      [style.height.px]="currentHeight()"
    >
      <media-i18n [attr.lang]="playerLanguage()">
        @if (isAudio()) {
          <audio-player>
            <audio-neutral-skin #audioSkin>
              <audio class="files-viewer-media__player" preload="none" [autoplay]="!sidebarMode()" [src]="file().dataUrl"></audio>
            </audio-neutral-skin>
          </audio-player>
        } @else {
          <video-player>
            <video-neutral-skin>
              <video class="files-viewer-media__player" preload="none" [autoplay]="!sidebarMode()" [src]="file().dataUrl" playsinline></video>
            </video-neutral-skin>
          </video-player>
        }
      </media-i18n>
    </div>
  `
})
export class FilesViewerMediaComponent {
  file = input.required<FileModel>()
  currentHeight = input<number>()
  sidebarMode = input(false)
  private readonly audioSkin = viewChild<ElementRef<HTMLElement>>('audioSkin')
  protected readonly playerLanguage = toSignal(
    inject(L10nTranslationService)
      .onChange()
      .pipe(map((locale) => locale.language)),
    {
      requireSync: true
    }
  )
  protected readonly isAudio = computed(() => {
    const mime = this.file().mime?.trim().toLowerCase()
    if (!mime) return false
    return (mime.includes('/') ? mime : mime.replace('-', '/')).startsWith('audio/')
  })

  constructor() {
    afterRenderEffect(() => {
      const hideSeekControls = this.sidebarMode()
      const shadowRoot = this.audioSkin()?.nativeElement.shadowRoot
      if (!shadowRoot) return
      // These packaged-skin internals may change between Video.js releases; verify them after each upgrade.
      // Neutral audio uses separate private values for its controls outline and radius.
      const audioControls = shadowRoot.querySelector<HTMLElement>('.audio-controls-content')
      audioControls?.style.setProperty('border-radius', 'var(--media-border-radius)')
      audioControls?.style.setProperty('box-shadow', 'none')
      // Packaged Video.js skins expose no option to remove controls, but their shadow root is open.
      shadowRoot
        .querySelectorAll<HTMLElement>('media-seek-button, media-seek-button + media-tooltip')
        .forEach((control) => control.toggleAttribute('hidden', hideSeekControls))
    })
  }
}
