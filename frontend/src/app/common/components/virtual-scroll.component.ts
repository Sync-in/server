import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostBinding,
  inject,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Renderer2,
  SimpleChanges,
  ViewChild
} from '@angular/core'
import { Subscription } from 'rxjs'
import { LayoutService } from '../../layout/layout.service'

@Component({
  selector: 'app-virtual-scroll',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="total-padding" #shim></div>
    <div class="scrollable-content" #content>
      <ng-content></ng-content>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        overflow-x: hidden;
        overflow-y: auto;
        position: relative;
        scrollbar-width: thin;
      }

      .scrollable-content {
        top: 0;
        left: 0;
        width: 100%;
        position: absolute;
        will-change: transform;
      }

      .total-padding {
        width: 1px;
        opacity: 0;
      }
    `
  ]
})
export class VirtualScrollComponent<T> implements OnInit, OnChanges, OnDestroy {
  @ViewChild('content', { read: ElementRef, static: true }) contentElementRef: ElementRef
  @ViewChild('shim', { read: ElementRef, static: true }) shimElementRef: ElementRef
  @Input() resizeOffset = 134
  @Input() galleryMode = false
  @Input() items: T[] = []
  @Input() childHeight = 35
  @Input() childWidth: number
  @Input() bufferAmount = 0
  protected viewPortItems: T[] = []
  private readonly element = inject(ElementRef)
  private readonly renderer = inject(Renderer2)
  private readonly ngZone = inject(NgZone)
  private readonly layout = inject(LayoutService)
  private subscriptions: Subscription[] = []
  private scrollbarWidth = 0
  private lastHeaderWidth = -1
  private previousStart: number
  private previousEnd: number
  private startupLoop = true
  private dimensionsView: any
  private scrollTimer: ReturnType<typeof setTimeout> | null = null
  private eventScrollHandler: () => void | undefined
  private resizeObserver: ResizeObserver | null = null
  private resizeTableHeaderRafId: number | null = null
  private calculateItemsRafId: number | null = null
  /** Cache of the last scroll height to prevent setting CSS when not needed. */
  private lastScrollHeight = -1
  /** Cache of the last top padding to prevent setting CSS when not needed. */
  private lastTopPadding = -1

  @HostBinding('class.virtual-scroll-border-top')
  get withBorderTop(): boolean {
    return !this.galleryMode
  }

  ngOnInit() {
    this.resizeOffsetHeight(true)
    this.addParentEventHandlers()
    if (!this.galleryMode) {
      this.observeTableHeaderWidth()
    }
  }

  ngOnDestroy() {
    if (this.eventScrollHandler) {
      this.eventScrollHandler()
      this.eventScrollHandler = undefined
    }
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer)
      this.scrollTimer = null
    }
    if (this.resizeTableHeaderRafId !== null) {
      cancelAnimationFrame(this.resizeTableHeaderRafId)
      this.resizeTableHeaderRafId = null
    }
    if (this.calculateItemsRafId !== null) {
      cancelAnimationFrame(this.calculateItemsRafId)
      this.calculateItemsRafId = null
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }
    this.subscriptions.forEach((s) => s.unsubscribe())
  }

  ngOnChanges(changes: SimpleChanges) {
    this.previousStart = undefined
    this.previousEnd = undefined
    if (this.galleryMode) {
      this.startupLoop = true
    } else {
      const items = (changes as any).items || undefined
      if (
        ((changes as any).items !== undefined && items.previousValue === undefined) ||
        (items.previousValue !== undefined && items.previousValue.length === 0)
      ) {
        this.startupLoop = true
      }
    }
    this.refresh(true)
  }

  refresh(updateDimensions = false) {
    this.ngZone.runOutsideAngular(() => {
      if (updateDimensions || !this.dimensionsView) {
        this.calculateDimensions()
      }
      if (this.calculateItemsRafId === null) {
        this.calculateItemsRafId = requestAnimationFrame(() => {
          this.calculateItemsRafId = null
          this.calculateItems()
        })
      }
    })
    if (!this.galleryMode && updateDimensions) {
      this.resizeTableHeader()
    }
  }

  scrollInto(item: any) {
    if (item === -1) {
      // scroll to top of elements
      this.element.nativeElement.scrollTo({ left: 0, top: 0, behavior: 'auto' })
      return
    } else if (item === -2) {
      // scroll to bottom of elements
      this.element.nativeElement.scrollTo({ left: 0, top: this.element.nativeElement.scrollHeight, behavior: 'smooth' })
      return
    } else if (item === 0) {
      // refresh current view
      this.refresh()
      return
    }
    const index: number = (this.items || []).indexOf(item)
    if (index < 0 || index >= (this.items || []).length) {
      return
    }
    const d = this.dimensionsView
    const s = Math.floor(index / d.itemsPerRow) * d.childHeight - d.childHeight * Math.min(index, this.bufferAmount)
    this.element.nativeElement.scrollTo({ left: 0, top: s, behavior: 'smooth' })
    this.refresh()
  }

  private tableScrollHovering = () => {
    clearTimeout(this.scrollTimer)
    if (!this.contentElementRef.nativeElement.classList.contains('table-disable-hover')) {
      this.renderer.addClass(this.contentElementRef.nativeElement, 'table-disable-hover')
    }
    this.scrollTimer = setTimeout(() => {
      this.renderer.removeClass(this.contentElementRef.nativeElement, 'table-disable-hover')
    }, 200)
    this.refresh()
  }

  private refreshWithDimensions = () => {
    this.resizeOffsetHeight()
    this.refresh(true)
  }

  private refreshWithoutDimensions = () => {
    this.refresh()
  }

  private resizeOffsetHeight(force = false) {
    const targetHeight = window.innerHeight - this.resizeOffset - 1
    if (force || this.element.nativeElement.offsetHeight !== targetHeight) {
      this.renderer.setStyle(this.element.nativeElement, 'height', `${targetHeight}px`)
    }
  }

  private resizeTableHeader(force = false) {
    if (
      !this.galleryMode &&
      this.element.nativeElement.previousElementSibling &&
      this.element.nativeElement.previousElementSibling.classList.contains('app-table')
    ) {
      const tableHeader = this.element.nativeElement.previousElementSibling
      const width = this.element.nativeElement.clientWidth
      if (!force && width === this.lastHeaderWidth) {
        return
      }
      this.lastHeaderWidth = width
      if (this.resizeTableHeaderRafId !== null) {
        cancelAnimationFrame(this.resizeTableHeaderRafId)
      }
      this.resizeTableHeaderRafId = requestAnimationFrame(() => {
        this.renderer.setStyle(tableHeader, 'width', `${width}px`)
        this.resizeTableHeaderRafId = null
      })
    }
  }

  private observeTableHeaderWidth() {
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    this.ngZone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver(() => this.resizeTableHeader())
      this.resizeObserver.observe(this.element.nativeElement)
    })
  }

  private addParentEventHandlers() {
    this.ngZone.runOutsideAngular(() => {
      if (this.galleryMode) {
        this.eventScrollHandler = this.renderer.listen(this.element.nativeElement, 'scroll', this.refreshWithoutDimensions)
      } else {
        this.eventScrollHandler = this.renderer.listen(this.element.nativeElement, 'scroll', this.tableScrollHovering)
      }
      this.subscriptions.push(this.layout.resizeEvent.subscribe(() => this.refreshWithDimensions()))
    })
  }

  private countItemsPerRow() {
    if (this.galleryMode) {
      // in rows mode we need to find real children
      let offsetTop: number = undefined
      let itemsPerRow: number
      let children = this.contentElementRef.nativeElement.children
      if (children[0]) {
        children = children[0].children
      }
      for (itemsPerRow = 0; itemsPerRow < children.length; itemsPerRow++) {
        if (offsetTop !== undefined && offsetTop !== children[itemsPerRow].offsetTop) {
          break
        }
        offsetTop = children[itemsPerRow].offsetTop
      }
      return itemsPerRow
    } else {
      // in table mode we need only 1 element per row
      return 1
    }
  }

  private calculateDimensions() {
    const el: HTMLElement = this.element.nativeElement
    const scrollbarWidth = el.offsetWidth - el.clientWidth

    if (this.scrollbarWidth != scrollbarWidth) {
      this.resizeTableHeader()
      this.scrollbarWidth = scrollbarWidth
    }

    const items = this.items || []
    const itemCount = items.length
    const viewWidth = el.clientWidth - this.scrollbarWidth
    const viewHeight = el.clientHeight

    let contentDimensions: any
    if (this.childWidth === undefined || this.childHeight === undefined) {
      const content = this.contentElementRef.nativeElement
      contentDimensions = content.children[0] ? content.children[0].getBoundingClientRect() : { width: viewWidth, height: viewHeight }
    }
    const childWidth = this.childWidth || contentDimensions.width
    const childHeight = this.childHeight || contentDimensions.height

    let itemsPerRow = this.countItemsPerRow()
    const itemsPerRowByCalc = Math.max(1, Math.floor(viewWidth / childWidth))
    // hook in rows mode, all elements are not displayed on initialization without this
    if (this.galleryMode && itemsPerRow === 0) {
      itemsPerRow = itemsPerRowByCalc
    } else {
      itemsPerRow = Math.max(1, itemsPerRow)
    }
    const itemsPerCol = Math.max(1, Math.floor(viewHeight / childHeight))
    const elScrollTop = el.scrollTop
    const scrollTop = Math.max(0, elScrollTop)
    const scrollHeight = childHeight * Math.ceil(itemCount / itemsPerRow)
    if (itemsPerCol === 1 && Math.floor((scrollTop / scrollHeight) * itemCount) + itemsPerRowByCalc >= itemCount) {
      itemsPerRow = itemsPerRowByCalc
    }
    if (scrollHeight !== this.lastScrollHeight) {
      this.renderer.setStyle(this.shimElementRef.nativeElement, 'height', `${scrollHeight}px`)
      this.lastScrollHeight = scrollHeight
    }

    this.dimensionsView = {
      itemCount,
      viewWidth,
      viewHeight,
      childWidth,
      childHeight,
      itemsPerRow,
      itemsPerCol,
      itemsPerRowByCalc,
      scrollHeight
    }
  }

  private calculateItems() {
    const el = this.element.nativeElement
    const d = this.dimensionsView
    const items = this.items || []
    const bufferAmount = this.galleryMode ? this.bufferAmount * d.itemsPerRowByCalc : this.bufferAmount
    let elScrollTop = el.scrollTop
    if (elScrollTop > d.scrollHeight) {
      elScrollTop = d.scrollHeight
    }
    const scrollTop = Math.max(0, elScrollTop)
    const indexByScrollTop = ((scrollTop / d.scrollHeight) * d.itemCount) / d.itemsPerRow
    let end = Math.min(d.itemCount, Math.ceil(indexByScrollTop) * d.itemsPerRow + d.itemsPerRow * (d.itemsPerCol + 1))

    let maxStartEnd = end
    const modEnd = end % d.itemsPerRow
    if (modEnd) {
      maxStartEnd = end + d.itemsPerRow - modEnd
    }
    const maxStart = Math.max(0, maxStartEnd - d.itemsPerCol * d.itemsPerRow - d.itemsPerRow)
    let start = Math.min(maxStart, Math.floor(indexByScrollTop) * d.itemsPerRow)

    const topPadding =
      items == null || items.length === 0 ? 0 : d.childHeight * Math.ceil(start / d.itemsPerRow) - d.childHeight * Math.min(start, this.bufferAmount)
    if (topPadding !== this.lastTopPadding) {
      this.renderer.setStyle(this.contentElementRef.nativeElement, 'transform', `translateY(${topPadding}px)`)
      this.renderer.setStyle(this.contentElementRef.nativeElement, 'webkitTransform', `translateY(${topPadding}px)`)
      this.lastTopPadding = topPadding
    }
    start = !isNaN(start) ? start : -1
    end = !isNaN(end) ? end : -1
    start -= bufferAmount
    start = Math.max(0, start)
    end += bufferAmount
    end = Math.min(items.length, end)
    if (start !== this.previousStart || end !== this.previousEnd) {
      this.ngZone.run(() => {
        // update the scroll list
        this.viewPortItems = items.slice(start, end >= 0 ? end : 0)
      })
      this.previousStart = start
      this.previousEnd = end
      if (this.startupLoop === true) {
        this.refresh()
      }
    } else if (this.startupLoop === true) {
      this.startupLoop = false
      this.refresh(true)
    }
  }
}
