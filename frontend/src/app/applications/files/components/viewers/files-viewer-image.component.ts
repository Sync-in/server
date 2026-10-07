import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  inject,
  input,
  model,
  signal,
  viewChild
} from '@angular/core'
import {
  LucideChevronLeft,
  LucideChevronRight,
  LucideDynamicIcon,
  LucideExpand,
  LucideFocus,
  LucideGrid2x2,
  LucideInfo,
  LucideLoader,
  LucidePlay,
  LucideRotateCcwSquare,
  LucideRotateCwSquare,
  LucideSquare,
  LucideZoomIn,
  LucideZoomOut
} from '@lucide/angular'
import { L10N_LOCALE, type L10nLocale, L10nTranslatePipe } from 'angular-l10n'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import type { FileModel } from '../../models/file.model'

@Component({
  selector: 'app-files-viewer-image',
  imports: [TooltipModule, LucideDynamicIcon, L10nTranslatePipe],
  styleUrl: 'files-viewer-image.component.scss',
  templateUrl: 'files-viewer-image.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FilesViewerImageComponent {
  readonly file = model.required<FileModel>()
  readonly directoryImages = input.required<FileModel[]>()
  protected readonly galleryFailedThumbnailIds = signal<ReadonlySet<number>>(new Set())
  protected readonly isInfoboxOpen = signal(false)
  protected readonly isGalleryOpen = signal(false)
  protected readonly isSlideshowActive = signal(false)
  protected readonly imageCount = computed(() => this.directoryImages().length)
  protected readonly imageIndex = computed(() => {
    const currentFileId = this.file().id
    return this.directoryImages().findIndex(({ id }) => id === currentFileId)
  })
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
    LucideGrid2x2,
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
  private readonly imageWheelThreshold = 40
  private readonly slideDelay = 5000
  private readonly swipeThreshold = 50
  private readonly activeTouchPointers = new Map<number, PointerEvent>()
  private readonly canvasRef = viewChild.required<ElementRef<HTMLElement>>('canvas')
  private readonly destroyRef = inject(DestroyRef)
  private readonly imageRef = viewChild<ElementRef<HTMLImageElement>>('image')
  private readonly viewerRef = viewChild.required<ElementRef<HTMLElement>>('viewer')
  private controlsHovered = false
  private controlsIdleDeadline = 0
  private controlsIdleTimer: ReturnType<typeof setTimeout> | null = null
  private galleryRenderTimer: ReturnType<typeof setTimeout> | null = null
  private returnToGalleryOnEscape = false
  private imageLoadingStartedAt = Date.now()
  private imageLoadingTimer: ReturnType<typeof setTimeout> | null = null
  private imageWheelDelta = 0
  private imageZoomAnchorClientX: number | null = null
  private imageZoomAnchorClientY: number | null = null
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
  private slideshowTimer: ReturnType<typeof setInterval> | null = null
  private swipePointerId: number | null = null
  private swipeStartX: number | null = null
  private swipeStartY: number | null = null

  constructor() {
    this.scheduleControlsHide()
    this.destroyRef.onDestroy(() => {
      this.clearControlsIdleTimer()
      this.clearGalleryRenderTimer()
      this.clearImageLoadingTimer()
      this.clearSlideshowTimer()
    })
    afterNextRender(() => {
      const canvas = this.canvasRef().nativeElement
      const galleryGestureListenerOptions: AddEventListenerOptions = { capture: true, passive: false }
      const preventGalleryGesture = (event: Event) => {
        // Safari gesture events are not part of Angular's template event typings.
        if (this.isGalleryOpen() && event.cancelable) event.preventDefault()
      }
      const resizeObserver = new ResizeObserver(() => {
        if (!this.isGalleryOpen()) this.clampCurrentImagePosition()
      })
      canvas.addEventListener('gesturestart', preventGalleryGesture, galleryGestureListenerOptions)
      canvas.addEventListener('gesturechange', preventGalleryGesture, galleryGestureListenerOptions)
      resizeObserver.observe(canvas)
      this.destroyRef.onDestroy(() => {
        canvas.removeEventListener('gesturestart', preventGalleryGesture, galleryGestureListenerOptions)
        canvas.removeEventListener('gesturechange', preventGalleryGesture, galleryGestureListenerOptions)
        resizeObserver.disconnect()
      })
    })
  }

  protected onImageLoad() {
    const img = this.imageRef()?.nativeElement
    if (!img) return

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

  protected toggleGallery() {
    if (this.isGalleryOpen()) {
      this.returnToGalleryOnEscape = false
      this.showImageView()
    } else {
      this.openGallery()
    }
  }

  private openGallery() {
    if (this.imageCount() < 2) return

    this.stopSlideshow()
    this.cancelActiveGesture()
    this.clearImageLoadingTimer()
    this.isInfoboxOpen.set(false)
    this.imageWheelDelta = 0
    this.clearImageZoomAnchor()
    this.returnToGalleryOnEscape = true
    this.isGalleryOpen.set(true)
    this.showControlsTemporarily()
    this.scheduleGalleryFocus()
  }

  protected selectGalleryImage(selectedFile: FileModel) {
    this.setCurrentFile(selectedFile)
    this.showImageView()
  }

  protected onViewerEscape(event: Event) {
    // Escape follows the navigation hierarchy: photo opened from gallery, then gallery, then modal.
    if (!this.returnToGalleryOnEscape || this.isGalleryOpen()) return

    event.preventDefault()
    event.stopPropagation()
    this.openGallery()
  }

  protected onGalleryThumbnailError(fileId: number) {
    this.galleryFailedThumbnailIds.update((failedThumbnailIds) => {
      const nextFailedThumbnailIds = new Set(failedThumbnailIds)
      nextFailedThumbnailIds.add(fileId)
      return nextFailedThumbnailIds
    })
  }

  protected onGalleryMultiTouch(event: TouchEvent) {
    if (event.touches.length > 1 && event.cancelable) event.preventDefault()
  }

  protected onImageWheel(event: WheelEvent) {
    // Trackpads emit small deltas, so accumulate them to keep zoom steps stable across devices.
    event.preventDefault()
    this.setImageZoomAnchor(event.clientX, event.clientY)
    const deltaMultiplier =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? this.canvasRef().nativeElement.clientHeight
          : 1
    const delta = event.deltaY * deltaMultiplier
    if (!delta) return

    if (this.imageWheelDelta && Math.sign(this.imageWheelDelta) !== Math.sign(delta)) this.imageWheelDelta = 0
    this.imageWheelDelta += delta
    if (Math.abs(this.imageWheelDelta) < this.imageWheelThreshold) return

    const shouldZoomIn = this.imageWheelDelta < 0
    this.imageWheelDelta = 0
    if (shouldZoomIn) {
      this.zoomIn()
    } else {
      this.zoomOut()
    }
    this.showControlsTemporarily()
  }

  protected onGesturePointerDown(event: PointerEvent) {
    if (this.isGalleryOpen()) {
      if (event.pointerType === 'touch') this.showControlsTemporarily()
      return
    }
    if (event.button !== 0) return

    const canvas = event.currentTarget as HTMLElement
    const image = this.imageRef()?.nativeElement
    if (!image) return

    if (event.pointerType === 'touch') {
      event.preventDefault()
      this.showControlsTemporarily()
      this.activeTouchPointers.set(event.pointerId, event)
      canvas.setPointerCapture?.(event.pointerId)

      if (this.activeTouchPointers.size >= 2) {
        this.startPinch()
      } else if (event.target === image && this.isImagePannable()) {
        this.startPan(event)
      } else {
        this.startSwipe(event)
      }
      return
    }

    if (!event.isPrimary || event.target !== image || !this.isImagePannable()) return

    canvas.setPointerCapture?.(event.pointerId)
    this.startPan(event)
  }

  protected onGesturePointerMove(event: PointerEvent) {
    if (this.isGalleryOpen()) return

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
    if (this.isGalleryOpen()) return

    if (this.releaseTouchPointer(event)) return

    if (event.pointerId === this.panPointerId) {
      this.stopPan()
    } else if (event.pointerId === this.swipePointerId) {
      this.completeSwipe(event)
    }
  }

  protected onGesturePointerCancel(event: PointerEvent) {
    if (this.isGalleryOpen()) return

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

  protected zoomIn(event?: MouseEvent) {
    this.updateImageZoomAnchor(event)

    const scale = this.imageScale()
    const nextScale =
      scale < this.imageZoomStepThreshold ? Math.min(scale + this.imageZoomFineStep, this.imageZoomStepThreshold) : scale + this.imageZoomCoarseStep
    this.setImageScale(Math.min(nextScale, this.imageZoomMax))
  }

  protected zoomOut(event?: MouseEvent) {
    this.updateImageZoomAnchor(event)

    const scale = this.imageScale()
    const nextScale =
      scale > this.imageZoomStepThreshold ? Math.max(scale - this.imageZoomCoarseStep, this.imageZoomStepThreshold) : scale - this.imageZoomFineStep
    this.setImageScale(Math.max(nextScale, this.imageZoomMin))
  }

  protected rotateLeft() {
    this.rotateImage(-this.imageRotationStep)
  }

  protected rotateRight() {
    this.rotateImage(this.imageRotationStep)
  }

  protected resetImageTransform() {
    this.resetImageTransformState()
  }

  protected toggleInfobox() {
    this.isInfoboxOpen.update((isOpen) => !isOpen)
  }

  protected fullscreen() {
    const viewer = this.viewerRef().nativeElement
    const viewerDocument = viewer.ownerDocument

    if (viewerDocument.fullscreenElement === viewer) {
      void viewerDocument.exitFullscreen()
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
    this.clearSlideshowTimer()
    this.isSlideshowActive.set(true)
    this.slideshowTimer = setInterval(() => this.nextImage(), this.slideDelay)
  }

  private stopSlideshow() {
    this.clearSlideshowTimer()
    this.isSlideshowActive.set(false)
  }

  private clearSlideshowTimer() {
    if (this.slideshowTimer === null) return

    clearInterval(this.slideshowTimer)
    this.slideshowTimer = null
  }

  private showImageAtOffset(offset: number) {
    // Keep cyclic navigation safe if the current file disappeared from a refreshed directory.
    const images = this.directoryImages()
    if (!images.length) return

    const currentIndex = this.imageIndex()
    const nextIndex = currentIndex < 0 ? 0 : (images.length + currentIndex + offset) % images.length
    const nextFile = images[nextIndex]
    if (!nextFile || nextFile.id === this.file().id) return

    this.cancelActiveGesture()
    if (!this.isGalleryOpen()) this.startImageLoading()
    this.setCurrentFile(nextFile)
    if (this.isGalleryOpen()) this.scrollCurrentGalleryImageIntoView()
  }

  private setCurrentFile(nextFile: FileModel) {
    if (nextFile.id === this.file().id) return

    this.imageWheelDelta = 0
    this.imageResolution.set('')
    this.resetImageTransformState()
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

    // Resume one-finger panning without turning the end of a pinch into an accidental swipe.
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

  private setImageScale(scale: number) {
    // Preserve the image point under the pointer while changing scale.
    const previousScale = this.imageScale()
    if (scale === previousScale) return

    const canvasRect = this.canvasRef().nativeElement.getBoundingClientRect()
    const anchorX = (this.imageZoomAnchorClientX ?? canvasRect.left + canvasRect.width / 2) - canvasRect.left - canvasRect.width / 2
    const anchorY = (this.imageZoomAnchorClientY ?? canvasRect.top + canvasRect.height / 2) - canvasRect.top - canvasRect.height / 2
    const scaleRatio = scale / previousScale

    this.imageScale.set(scale)
    this.setImagePosition(anchorX - (anchorX - this.imageOffsetX()) * scaleRatio, anchorY - (anchorY - this.imageOffsetY()) * scaleRatio)
  }

  private setImageZoomAnchor(clientX: number, clientY: number) {
    this.imageZoomAnchorClientX = clientX
    this.imageZoomAnchorClientY = clientY
  }

  private updateImageZoomAnchor(event?: MouseEvent) {
    if (!event) return

    if (event.detail) {
      this.setImageZoomAnchor(event.clientX, event.clientY)
    } else {
      this.clearImageZoomAnchor()
    }
  }

  private clearImageZoomAnchor() {
    this.imageZoomAnchorClientX = null
    this.imageZoomAnchorClientY = null
  }

  private setImagePosition(x: number, y: number) {
    // Clamp translation to the transformed image bounds to avoid exposing empty canvas space.
    const canvas = this.canvasRef().nativeElement
    const image = this.imageRef()?.nativeElement
    if (!image) {
      this.isImagePannable.set(false)
      return
    }

    const scale = this.imageScale()
    const isQuarterTurn = this.imageRotation() % 180 !== 0
    const imageWidth = (isQuarterTurn ? image.offsetHeight : image.offsetWidth) * scale
    const imageHeight = (isQuarterTurn ? image.offsetWidth : image.offsetHeight) * scale
    const maxX = Math.max(0, (imageWidth - canvas.clientWidth) / 2)
    const maxY = Math.max(0, (imageHeight - canvas.clientHeight) / 2)

    this.isImagePannable.set(maxX > 0 || maxY > 0)
    this.imageOffsetX.set(Math.max(-maxX, Math.min(x, maxX)))
    this.imageOffsetY.set(Math.max(-maxY, Math.min(y, maxY)))
  }

  private resetImageTransformState() {
    this.imageScale.set(1)
    this.imageRotation.set(0)
    this.imageOffsetX.set(0)
    this.imageOffsetY.set(0)
    this.isImagePannable.set(false)
    this.isImagePanning.set(false)
    this.clearImageZoomAnchor()
  }

  private showImageView() {
    if (!this.isGalleryOpen()) return

    this.imageWheelDelta = 0
    this.startImageLoading()
    this.isGalleryOpen.set(false)
    this.showControlsTemporarily()
    this.scheduleGalleryControlFocus()
  }

  private scheduleGalleryFocus() {
    // Wait for Angular to render the gallery before moving focus and restoring its scroll position.
    this.clearGalleryRenderTimer()
    this.galleryRenderTimer = setTimeout(() => {
      this.galleryRenderTimer = null
      if (!this.isGalleryOpen()) return

      const canvas = this.canvasRef().nativeElement
      canvas.focus({ preventScroll: true })
      this.getCurrentGalleryItem()?.scrollIntoView({ block: 'center', inline: 'nearest' })
    })
  }

  private scrollCurrentGalleryImageIntoView() {
    this.getCurrentGalleryItem()?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  private getCurrentGalleryItem() {
    return this.canvasRef().nativeElement.querySelector<HTMLElement>(`[data-gallery-file-id="${this.file().id}"]`)
  }

  private scheduleGalleryControlFocus() {
    // Restore keyboard focus to the gallery control after the photo view has been rendered.
    this.clearGalleryRenderTimer()
    this.galleryRenderTimer = setTimeout(() => {
      this.galleryRenderTimer = null
      if (this.isGalleryOpen()) return

      this.viewerRef().nativeElement.querySelector<HTMLElement>('.app-viewer-image-control-gallery')?.focus({ preventScroll: true })
    })
  }

  private clearGalleryRenderTimer() {
    if (this.galleryRenderTimer === null) return

    clearTimeout(this.galleryRenderTimer)
    this.galleryRenderTimer = null
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
    // Move one deadline instead of recreating a timer on every pointer movement.
    if (this.controlsHovered && !this.isViewerFullscreen()) {
      this.clearControlsIdleTimer()
      return
    }

    this.controlsIdleDeadline = Date.now() + this.controlsIdleDelay
    this.ensureControlsIdleTimer()
  }

  private ensureControlsIdleTimer() {
    if (this.controlsIdleTimer !== null) return

    const remainingDuration = Math.max(0, this.controlsIdleDeadline - Date.now())
    this.controlsIdleTimer = setTimeout(() => this.onControlsIdleTimer(), remainingDuration)
  }

  private onControlsIdleTimer() {
    this.controlsIdleTimer = null
    if (this.controlsHovered && !this.isViewerFullscreen()) return

    const remainingDuration = this.controlsIdleDeadline - Date.now()
    if (remainingDuration > 0) {
      this.controlsIdleTimer = setTimeout(() => this.onControlsIdleTimer(), remainingDuration)
      return
    }

    this.isControlsVisible.set(false)
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
