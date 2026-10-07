import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  model,
  signal,
  viewChild
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import {
  LucideChevronLeft,
  LucideChevronRight,
  LucideDynamicIcon,
  LucideExpand,
  LucideFocus,
  LucideInfo,
  LucideLoader,
  LucidePlay,
  LucideRotateCcwSquare,
  LucideRotateCwSquare,
  LucideSquare,
  LucideZoomIn,
  LucideZoomOut
} from '@lucide/angular'
import { L10N_LOCALE, L10nLocale, L10nTranslatePipe } from 'angular-l10n'
import { ButtonCheckboxDirective } from 'ngx-bootstrap/buttons'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { Subscription, timer } from 'rxjs'
import { FileModel } from '../../models/file.model'

@Component({
  selector: 'app-files-viewer-image',
  imports: [FormsModule, TooltipModule, LucideDynamicIcon, ButtonCheckboxDirective, L10nTranslatePipe],
  styleUrl: 'files-viewer-image.component.scss',
  templateUrl: 'files-viewer-image.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FilesViewerImageComponent {
  readonly file = model.required<FileModel>()
  readonly directoryImages = input.required<FileModel[]>()
  protected readonly isInfoboxOpen = signal(false)
  protected readonly isSlideshowActive = signal(false)
  protected readonly imageCount = computed(() => this.directoryImages().length)
  protected readonly imageIndex = computed(() => this.directoryImages().indexOf(this.file()))
  protected readonly imageResolution = signal('')
  protected readonly imageScale = signal(1)
  protected readonly imageRotation = signal(0)
  protected readonly imageOffsetX = signal(0)
  protected readonly imageOffsetY = signal(0)
  protected readonly isImagePannable = signal(false)
  protected readonly isImagePanning = signal(false)
  protected readonly isImageLoading = signal(true)
  protected readonly isControlsVisible = signal(true)
  protected readonly imageTransform = computed(
    () => `translate3d(${this.imageOffsetX()}px, ${this.imageOffsetY()}px, 0) rotate(${this.imageRotation()}deg) scale(${this.imageScale()})`
  )
  protected readonly canZoomIn = computed(() => this.imageScale() < this.imageZoomMax)
  protected readonly canZoomOut = computed(() => this.imageScale() > this.imageZoomMin)
  protected readonly icons = {
    LucideChevronLeft,
    LucideChevronRight,
    LucideExpand,
    LucideFocus,
    LucideInfo,
    LucideLoader,
    LucideRotateCcwSquare,
    LucideRotateCwSquare,
    LucideZoomIn,
    LucideZoomOut
  }
  protected readonly slideshowAction = computed(() =>
    this.isSlideshowActive() ? { icon: LucideSquare, label: 'Stop slideshow' } : { icon: LucidePlay, label: 'Start Slideshow' }
  )
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  private readonly imageZoomMin = 0.5
  private readonly imageZoomMax = 8
  private readonly imageZoomStepThreshold = 2
  private readonly imageZoomFineStep = 0.5
  private readonly imageZoomCoarseStep = 1
  private readonly imageRotationStep = 90
  private readonly controlsIdleDelay = 2500
  private readonly imageLoadingMinDuration = 250
  private readonly slideDelay = 5000
  private readonly swipeThreshold = 50
  private readonly activeTouchPointers = new Map<number, PointerEvent>()
  private readonly canvasRef = viewChild.required<ElementRef<HTMLElement>>('canvas')
  private readonly destroyRef = inject(DestroyRef)
  private readonly imageRef = viewChild.required<ElementRef<HTMLImageElement>>('image')
  private readonly viewerRef = viewChild.required<ElementRef<HTMLElement>>('viewer')
  private controlsHovered = false
  private controlsIdleTimer: ReturnType<typeof setTimeout> | null = null
  private imageLoadingStartedAt = Date.now()
  private imageLoadingTimer: ReturnType<typeof setTimeout> | null = null
  private panPointerId: number | null = null
  private panStartX = 0
  private panStartY = 0
  private panOriginX = 0
  private panOriginY = 0
  private pinchCanvasCenterX = 0
  private pinchCanvasCenterY = 0
  private pinchStartCenterX = 0
  private pinchStartCenterY = 0
  private pinchStartDistance: number | null = null
  private pinchStartOffsetX = 0
  private pinchStartOffsetY = 0
  private pinchStartScale = 1
  private slideshowSub: Subscription | null = null
  private swipePointerId: number | null = null
  private swipeStartX: number | null = null
  private swipeStartY: number | null = null

  constructor() {
    this.scheduleControlsHide()
    this.destroyRef.onDestroy(() => {
      this.clearControlsIdleTimer()
      this.clearImageLoadingTimer()
    })
    afterNextRender(() => {
      const resizeObserver = new ResizeObserver(() => this.clampCurrentImagePosition())
      resizeObserver.observe(this.canvasRef().nativeElement)
      this.destroyRef.onDestroy(() => resizeObserver.disconnect())
    })
  }

  protected onImageLoad() {
    const img = this.imageRef().nativeElement
    this.imageResolution.set(`${img.naturalWidth}x${img.naturalHeight}`)
    this.clampCurrentImagePosition()
    this.finishImageLoading()
  }

  protected onImageError() {
    this.isImagePannable.set(false)
    this.finishImageLoading()
  }

  protected nextImage() {
    this.showImageAtOffset(1)
  }

  protected previousImage() {
    this.showImageAtOffset(-1)
  }

  protected onGesturePointerDown(event: PointerEvent) {
    if (event.button !== 0) return

    const canvas = event.currentTarget as HTMLElement

    if (event.pointerType === 'touch') {
      event.preventDefault()
      this.showControlsTemporarily()
      this.activeTouchPointers.set(event.pointerId, event)
      canvas.setPointerCapture?.(event.pointerId)

      if (this.activeTouchPointers.size >= 2) {
        this.startPinch()
      } else if (event.target === this.imageRef().nativeElement && this.isImagePannable()) {
        this.startPan(event)
      } else {
        this.startSwipe(event)
      }
      return
    }

    if (!event.isPrimary || event.target !== this.imageRef().nativeElement || !this.isImagePannable()) return

    canvas.setPointerCapture?.(event.pointerId)
    this.startPan(event)
  }

  protected onGesturePointerMove(event: PointerEvent) {
    if (event.pointerType === 'touch' && this.activeTouchPointers.has(event.pointerId)) {
      this.activeTouchPointers.set(event.pointerId, event)

      if (this.activeTouchPointers.size >= 2) {
        event.preventDefault()
        this.updatePinch()
        this.showControlsTemporarily()
        return
      }
    }

    if (event.pointerId !== this.panPointerId) return

    event.preventDefault()
    this.setImagePosition(this.panOriginX + event.clientX - this.panStartX, this.panOriginY + event.clientY - this.panStartY)
    if (event.pointerType === 'touch') this.showControlsTemporarily()
  }

  protected onGesturePointerUp(event: PointerEvent) {
    if (this.releaseTouchPointer(event)) return

    if (event.pointerId === this.panPointerId) {
      this.stopPan()
    } else if (event.pointerId === this.swipePointerId) {
      this.completeSwipe(event)
    }
  }

  protected onGesturePointerCancel(event: PointerEvent) {
    if (this.releaseTouchPointer(event)) return

    if (event.pointerId === this.panPointerId) this.stopPan()
    if (event.pointerId === this.swipePointerId) this.resetSwipe()
  }

  protected onViewerPointerMove(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return

    this.showControlsTemporarily()
  }

  protected onViewerPointerLeave(event: PointerEvent) {
    if (event.pointerType === 'mouse') this.scheduleControlsHide()
  }

  protected onControlsPointerEnter(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return

    this.controlsHovered = true
    if (this.isViewerFullscreen()) {
      this.showControlsTemporarily()
    } else {
      this.isControlsVisible.set(true)
      this.clearControlsIdleTimer()
    }
  }

  protected onControlsPointerDown(event: PointerEvent) {
    event.stopPropagation()
    if (event.pointerType === 'touch') this.showControlsTemporarily()
  }

  protected onControlsPointerLeave(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return

    this.controlsHovered = false
    this.scheduleControlsHide()
  }

  protected zoomIn() {
    this.imageScale.update((scale) => {
      const nextScale =
        scale < this.imageZoomStepThreshold ? Math.min(scale + this.imageZoomFineStep, this.imageZoomStepThreshold) : scale + this.imageZoomCoarseStep
      return Math.min(nextScale, this.imageZoomMax)
    })
    this.clampCurrentImagePosition()
  }

  protected zoomOut() {
    this.imageScale.update((scale) => {
      const nextScale =
        scale > this.imageZoomStepThreshold ? Math.max(scale - this.imageZoomCoarseStep, this.imageZoomStepThreshold) : scale - this.imageZoomFineStep
      return Math.max(nextScale, this.imageZoomMin)
    })
    this.clampCurrentImagePosition()
  }

  protected rotateLeft() {
    this.rotateImage(-this.imageRotationStep)
  }

  protected rotateRight() {
    this.rotateImage(this.imageRotationStep)
  }

  protected resetImageTransform() {
    this.imageScale.set(1)
    this.imageRotation.set(0)
    this.setImagePosition(0, 0)
  }

  protected fullscreen() {
    const viewer = this.viewerRef().nativeElement
    const viewerDocument = viewer.ownerDocument

    if (viewerDocument.fullscreenElement === viewer) {
      viewerDocument.exitFullscreen()
    } else {
      void viewer.requestFullscreen().then(() => this.showControlsTemporarily())
    }
  }

  protected toggleSlideshow() {
    if (this.isSlideshowActive()) {
      this.stopSlideshow()
    } else {
      this.startSlideshow()
    }
  }

  private startSlideshow() {
    this.isSlideshowActive.set(true)
    this.slideshowSub = timer(this.slideDelay, this.slideDelay)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.nextImage())
  }

  private stopSlideshow() {
    this.slideshowSub?.unsubscribe()
    this.slideshowSub = null
    this.isSlideshowActive.set(false)
  }

  private showImageAtOffset(offset: number) {
    const nextFile = this.directoryImages()[(this.imageCount() + this.imageIndex() + offset) % this.imageCount()]
    if (!nextFile || nextFile === this.file()) return

    this.cancelActiveGesture()
    this.startImageLoading()
    this.imageResolution.set('')
    this.resetImageTransform()
    this.file.set(nextFile)
  }

  private rotateImage(degrees: number) {
    this.imageRotation.update((rotation) => (rotation + degrees + 360) % 360)
    this.clampCurrentImagePosition()
  }

  private startPan(event: PointerEvent) {
    this.resetSwipe()
    this.panPointerId = event.pointerId
    this.panStartX = event.clientX
    this.panStartY = event.clientY
    this.panOriginX = this.imageOffsetX()
    this.panOriginY = this.imageOffsetY()
    this.isImagePanning.set(true)
  }

  private stopPan() {
    this.panPointerId = null
    this.isImagePanning.set(false)
  }

  private cancelActiveGesture() {
    const canvas = this.canvasRef().nativeElement
    const pointerIds = new Set(this.activeTouchPointers.keys())
    if (this.panPointerId !== null) pointerIds.add(this.panPointerId)
    if (this.swipePointerId !== null) pointerIds.add(this.swipePointerId)

    for (const pointerId of pointerIds) {
      if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId)
    }

    this.activeTouchPointers.clear()
    this.pinchStartDistance = null
    this.stopPan()
    this.resetSwipe()
  }

  private releaseTouchPointer(event: PointerEvent) {
    if (event.pointerType !== 'touch') return false

    const wasPinching = this.pinchStartDistance !== null
    this.activeTouchPointers.delete(event.pointerId)
    if (!wasPinching) return false

    this.continueGestureAfterPinch()
    return true
  }

  private startSwipe(event: PointerEvent) {
    this.stopPan()
    this.swipePointerId = event.pointerId
    this.swipeStartX = event.clientX
    this.swipeStartY = event.clientY
  }

  private completeSwipe(event: PointerEvent) {
    if (this.swipeStartX === null || this.swipeStartY === null) return

    const deltaX = event.clientX - this.swipeStartX
    const deltaY = event.clientY - this.swipeStartY
    this.resetSwipe()

    if (Math.abs(deltaX) < this.swipeThreshold || Math.abs(deltaX) <= Math.abs(deltaY)) return

    if (deltaX < 0) {
      this.nextImage()
    } else {
      this.previousImage()
    }
  }

  private startPinch() {
    const pointers = this.activeTouchPointers.values()
    const firstPointer = pointers.next().value
    const secondPointer = pointers.next().value
    if (!firstPointer || !secondPointer) return

    const canvasRect = this.canvasRef().nativeElement.getBoundingClientRect()
    const centerX = (firstPointer.clientX + secondPointer.clientX) / 2
    const centerY = (firstPointer.clientY + secondPointer.clientY) / 2

    this.resetSwipe()
    this.stopPan()
    this.pinchCanvasCenterX = canvasRect.left + canvasRect.width / 2
    this.pinchCanvasCenterY = canvasRect.top + canvasRect.height / 2
    this.pinchStartDistance = Math.max(this.getPointerDistance(firstPointer, secondPointer), 1)
    this.pinchStartScale = this.imageScale()
    this.pinchStartOffsetX = this.imageOffsetX()
    this.pinchStartOffsetY = this.imageOffsetY()
    this.pinchStartCenterX = centerX - this.pinchCanvasCenterX
    this.pinchStartCenterY = centerY - this.pinchCanvasCenterY
  }

  private updatePinch() {
    if (this.pinchStartDistance === null) return

    const pointers = this.activeTouchPointers.values()
    const firstPointer = pointers.next().value
    const secondPointer = pointers.next().value
    if (!firstPointer || !secondPointer) return

    const distance = this.getPointerDistance(firstPointer, secondPointer)
    const scale = Math.max(this.imageZoomMin, Math.min(this.pinchStartScale * (distance / this.pinchStartDistance), this.imageZoomMax))
    const centerX = (firstPointer.clientX + secondPointer.clientX) / 2 - this.pinchCanvasCenterX
    const centerY = (firstPointer.clientY + secondPointer.clientY) / 2 - this.pinchCanvasCenterY
    const scaleRatio = scale / this.pinchStartScale

    this.imageScale.set(scale)
    this.setImagePosition(
      centerX - (this.pinchStartCenterX - this.pinchStartOffsetX) * scaleRatio,
      centerY - (this.pinchStartCenterY - this.pinchStartOffsetY) * scaleRatio
    )
  }

  private continueGestureAfterPinch() {
    if (this.activeTouchPointers.size >= 2) {
      this.startPinch()
      return
    }

    this.pinchStartDistance = null
    this.clampCurrentImagePosition()
    const remainingPointer = this.activeTouchPointers.values().next().value
    if (remainingPointer && this.isImagePannable()) this.startPan(remainingPointer)
  }

  private getPointerDistance(firstPointer: PointerEvent, secondPointer: PointerEvent) {
    return Math.hypot(secondPointer.clientX - firstPointer.clientX, secondPointer.clientY - firstPointer.clientY)
  }

  private clampCurrentImagePosition() {
    this.setImagePosition(this.imageOffsetX(), this.imageOffsetY())
  }

  private setImagePosition(x: number, y: number) {
    const canvas = this.canvasRef().nativeElement
    const image = this.imageRef().nativeElement
    const isQuarterTurn = this.imageRotation() % 180 !== 0
    const imageWidth = (isQuarterTurn ? image.offsetHeight : image.offsetWidth) * this.imageScale()
    const imageHeight = (isQuarterTurn ? image.offsetWidth : image.offsetHeight) * this.imageScale()
    const maxX = Math.max(0, (imageWidth - canvas.clientWidth) / 2)
    const maxY = Math.max(0, (imageHeight - canvas.clientHeight) / 2)

    this.isImagePannable.set(maxX > 0 || maxY > 0)
    this.imageOffsetX.set(Math.max(-maxX, Math.min(x, maxX)))
    this.imageOffsetY.set(Math.max(-maxY, Math.min(y, maxY)))
  }

  private showControlsTemporarily() {
    this.isControlsVisible.set(true)
    this.scheduleControlsHide()
  }

  private startImageLoading() {
    this.clearImageLoadingTimer()
    this.imageLoadingStartedAt = Date.now()
    this.isImageLoading.set(true)
  }

  private finishImageLoading() {
    this.clearImageLoadingTimer()
    const remainingDuration = this.imageLoadingMinDuration - (Date.now() - this.imageLoadingStartedAt)

    if (remainingDuration <= 0) {
      this.isImageLoading.set(false)
      return
    }

    this.imageLoadingTimer = setTimeout(() => {
      this.isImageLoading.set(false)
      this.imageLoadingTimer = null
    }, remainingDuration)
  }

  private clearImageLoadingTimer() {
    if (this.imageLoadingTimer === null) return

    clearTimeout(this.imageLoadingTimer)
    this.imageLoadingTimer = null
  }

  private isViewerFullscreen() {
    const viewer = this.viewerRef().nativeElement
    return viewer.ownerDocument.fullscreenElement === viewer
  }

  private scheduleControlsHide() {
    this.clearControlsIdleTimer()
    if (this.controlsHovered && !this.isViewerFullscreen()) return

    this.controlsIdleTimer = setTimeout(() => {
      this.isControlsVisible.set(false)
      this.controlsIdleTimer = null
    }, this.controlsIdleDelay)
  }

  private clearControlsIdleTimer() {
    if (this.controlsIdleTimer === null) return

    clearTimeout(this.controlsIdleTimer)
    this.controlsIdleTimer = null
  }

  private resetSwipe() {
    this.swipePointerId = null
    this.swipeStartX = null
    this.swipeStartY = null
  }
}
