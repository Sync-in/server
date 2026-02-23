import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  inject,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  Renderer2,
  SimpleChanges,
  ViewChild
} from '@angular/core'
import { of, repeat, skip, Subject, Subscription } from 'rxjs'
import { debounceTime, switchMap } from 'rxjs/operators'
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
  @Output() isScrollBottom = new EventEmitter<boolean>()
  @Output() isScrollTop = new EventEmitter<boolean>()
  @Input() resizeOffset = 130
  @Input() galleryMode = false
  @Input() selectedChat: any = null
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
  private _scrollChat = new Subject<void>()
  private scrollChat = this._scrollChat.asObservable().pipe(debounceTime(50))
  private previousStart: number
  private previousEnd: number
  private startupLoop = true
  private dimensionsView: any
  private scrollTimer: any = null
  private eventScrollHandler: () => void | undefined
  /** Cache of the last scroll height to prevent setting CSS when not needed. */
  private lastScrollHeight = -1
  /** Cache of the last top padding to prevent setting CSS when not needed. */
  private lastTopPadding = -1
  // Watch sidebars actions to adapt layout
  private toggleLeftSidebar = this.layout.toggleLeftSideBar.pipe(
    skip(1),
    switchMap((state) => of(state).pipe(repeat({ count: 30, delay: 10 })))
  )

  @HostBinding('class.virtual-scroll-border-top')
  get withBorderTop(): boolean {
    return !this.galleryMode
  }

  ngOnInit() {
    this.resizeOffsetHeight(true)
    this.addParentEventHandlers()
    if (this.selectedChat) {
      this.childHeight = 1
      this.subscriptions.push(this.scrollChat.subscribe(() => this.checkScrollChat()))
    } else if (!this.galleryMode) {
      this.subscriptions.push(this.toggleLeftSidebar.subscribe(() => this.resizeTableHeader()))
    }
  }

  ngOnDestroy() {
    if (this.eventScrollHandler) {
      this.eventScrollHandler()
      this.eventScrollHandler = undefined
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
    this.checkChangesOnChat(changes)
  }

  refresh(updateDimensions = false) {
    this.ngZone.runOutsideAngular(() => {
      if (updateDimensions || !this.dimensionsView) {
        this.calculateDimensions()
      }
      requestAnimationFrame(() => this.calculateItems())
    })
    this.resizeTableHeader()
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

  private checkChangesOnChat(changes) {
    if (this.selectedChat) {
      if ((changes as any).selectedChat) {
        this.renderer.setStyle(this.element.nativeElement, 'visibility', 'hidden')
        setTimeout(() => {
          if (this.selectedChat.lastScrollPosition === null) {
            this.saveChatScrollPosition(this.element.nativeElement.scrollHeight)
          }
          this.element.nativeElement.scrollTo({ left: 0, top: this.selectedChat.lastScrollPosition, behavior: 'auto' })
          this.checkScrollChat()
          this.renderer.setStyle(this.element.nativeElement, 'visibility', 'visible')
        }, 50)
      } else if (this.chatIsScrolledToBottom()) {
        this.restoreBottomScrollChat()
      } else if (this.chatIsScrolledToTop()) {
        this.restoreTopScrollChat()
      }
    }
  }

  private checkScrollChat() {
    const isOnBottom = this.chatIsScrolledToBottom()
    const isOnTop = this.chatIsScrolledToTop()
    if (isOnTop) {
      this.saveChatScrollPosition(this.element.nativeElement.scrollHeight - this.element.nativeElement.scrollTop)
    } else if (isOnBottom) {
      this.saveChatScrollPosition(this.element.nativeElement.scrollHeight)
    } else {
      this.saveChatScrollPosition()
    }
    this.ngZone.run(() => {
      this.isScrollBottom.next(isOnBottom)
      this.isScrollTop.next(isOnTop)
    })
  }

  private saveChatScrollPosition(value = null) {
    this.selectedChat.lastScrollPosition = value ? value : this.element.nativeElement.scrollTop
  }

  private chatIsScrolledToBottom() {
    return (
      Math.ceil(this.element.nativeElement.clientHeight / 10) * 10 ===
      Math.ceil((this.element.nativeElement.scrollHeight - this.element.nativeElement.scrollTop) / 10) * 10
    )
  }

  private chatIsScrolledToTop() {
    return this.element.nativeElement.scrollTop <= 300
  }

  private restoreBottomScrollChat() {
    setTimeout(() => {
      this.element.nativeElement.scrollTo({ left: 0, top: this.element.nativeElement.scrollHeight, behavior: 'smooth' })
    }, 50)
  }

  private restoreTopScrollChat() {
    setTimeout(() => {
      this.element.nativeElement.scrollTop = this.element.nativeElement.scrollHeight - this.selectedChat.lastScrollPosition
    }, 50)
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

  private refreshChatWithoutDimensions = () => {
    if (this.chatIsScrolledToTop() && !this.selectedChat.allHistoryLoaded) {
      this.element.nativeElement.scrollTo({ left: 0, top: this.element.nativeElement.scrollTop, behavior: 'auto' })
    } else {
      this.refreshWithoutDimensions()
      this._scrollChat.next()
    }
  }

  private refreshChatWithDimensions = () => {
    this.resizeOffsetHeight()
    this.refresh(true)
    if (this.selectedChat.isScrolledToBottom) {
      this.scrollInto(-2)
    } else {
      this._scrollChat.next()
    }
  }

  private resizeOffsetHeight(force = false) {
    const offset = window.innerHeight - this.resizeOffset
    if (force || this.element.nativeElement.offsetHeight !== offset) {
      this.renderer.setStyle(this.element.nativeElement, 'height', `${offset - 1}px`)
    }
  }

  private resizeTableHeader() {
    if (
      !this.selectedChat &&
      !this.galleryMode &&
      this.element.nativeElement.previousElementSibling &&
      this.element.nativeElement.previousElementSibling.classList.contains('app-table')
    ) {
      setTimeout(
        () => this.renderer.setStyle(this.element.nativeElement.previousElementSibling, 'width', `${this.element.nativeElement.clientWidth}px`),
        50
      )
    }
  }

  private addParentEventHandlers() {
    this.ngZone.runOutsideAngular(() => {
      if (this.galleryMode) {
        this.eventScrollHandler = this.renderer.listen(this.element.nativeElement, 'scroll', this.refreshWithoutDimensions)
      } else if (this.selectedChat) {
        this.eventScrollHandler = this.renderer.listen(this.element.nativeElement, 'scroll', this.refreshChatWithoutDimensions)
      } else {
        this.eventScrollHandler = this.renderer.listen(this.element.nativeElement, 'scroll', this.tableScrollHovering)
      }
      if (this.selectedChat) {
        this.subscriptions.push(this.layout.resizeEvent.subscribe(() => this.refreshChatWithDimensions()))
      } else {
        this.subscriptions.push(this.layout.resizeEvent.subscribe(() => this.refreshWithDimensions()))
      }
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
