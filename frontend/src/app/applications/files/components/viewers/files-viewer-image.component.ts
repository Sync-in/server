/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, model, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faAngleLeft, faAngleRight, faExpand, faInfo, faPlay, faStop } from '@fortawesome/free-solid-svg-icons'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { ButtonCheckboxDirective } from 'ngx-bootstrap/buttons'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { Subscription, timer } from 'rxjs'
import { FileModel } from '../../models/file.model'

@Component({
  selector: 'app-files-viewer-image',
  imports: [FormsModule, TooltipModule, FaIconComponent, ButtonCheckboxDirective, L10nTranslatePipe, L10nTranslateDirective],
  templateUrl: 'files-viewer-image.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FilesViewerImageComponent {
  file = model.required<FileModel>()
  directoryImages = input.required<FileModel[]>()
  currentHeight = input.required<number>()
  currentHeightWithOffset = computed(() => this.currentHeight() - 40)
  protected isInfoboxOpen = signal(false)
  protected isSlideshowActive = signal(false)
  protected imageCount = computed(() => this.directoryImages().length)
  protected imageIndex = computed(() => this.directoryImages().indexOf(this.file()))
  protected imageResolution = signal<string>('')
  protected readonly icons = { faAngleLeft, faAngleRight, faExpand, faInfo, faPlay, faStop }
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  private readonly slideDelay = 5000
  private destroyRef = inject(DestroyRef)
  private imageRef = viewChild.required<ElementRef>('image')
  private slideshowSub: Subscription

  protected onImageLoad() {
    const img = this.imageRef().nativeElement
    this.imageResolution.set(`${img.naturalWidth}x${img.naturalHeight}`)
  }

  protected nextImage() {
    this.file.set(this.directoryImages()[(this.imageIndex() + 1) % this.imageCount()])
  }

  protected previousImage() {
    this.file.set(this.directoryImages()[(this.imageCount() + this.imageIndex() - 1) % this.imageCount()])
  }

  protected fullscreen() {
    this.imageRef().nativeElement.requestFullscreen()
  }

  protected startSlideshow() {
    this.isSlideshowActive.set(true)
    this.slideshowSub = timer(this.slideDelay, this.slideDelay)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.nextImage())
  }
  protected stopSlideshow() {
    this.slideshowSub?.unsubscribe()
    this.isSlideshowActive.set(false)
  }
}
