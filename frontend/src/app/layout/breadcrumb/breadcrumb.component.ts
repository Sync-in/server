import { afterNextRender, ChangeDetectorRef, Component, ElementRef, inject, OnDestroy, ViewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { RouterLink, RouterLinkActive } from '@angular/router'
import type { LucideIcon } from '@lucide/angular'
import { LucideChevronDown, LucideChevronRight, LucideCornerDownRight, LucideDynamicIcon, LucideFolder } from '@lucide/angular'
import { BsDropdownDirective, BsDropdownMenuDirective, BsDropdownToggleDirective } from 'ngx-bootstrap/dropdown'
import { LayoutService } from '../layout.service'
import type { BreadcrumbLevel, BreadCrumbUrl } from './breadcrumb.interfaces'

@Component({
  selector: 'app-breadcrumb',
  templateUrl: 'breadcrumb.component.html',
  imports: [RouterLink, RouterLinkActive, LucideDynamicIcon, BsDropdownDirective, BsDropdownMenuDirective, BsDropdownToggleDirective]
})
export class BreadcrumbComponent implements OnDestroy {
  @ViewChild('breadcrumbContent') private breadcrumbContent: ElementRef<HTMLElement>
  @ViewChild('breadcrumbMeasure') private breadcrumbMeasure: ElementRef<HTMLElement>
  @ViewChild('pathToggle') private pathToggle: ElementRef<HTMLButtonElement>
  protected readonly icons = { LucideChevronDown, LucideChevronRight, LucideCornerDownRight, LucideFolder }
  protected breadcrumbIcon: LucideIcon = null
  protected fullPathLabels: string[] = []
  protected isOverflowing = false
  protected levels: BreadcrumbLevel[] = []
  private readonly cdr = inject(ChangeDetectorRef)
  private readonly layout = inject(LayoutService)
  private menuFocusFrame: number = null
  private resizeFallback: () => void = null
  private resizeFrame: number = null
  private resizeObserver: ResizeObserver = null

  constructor() {
    this.layout.breadcrumbNav.pipe(takeUntilDestroyed()).subscribe((url) => this.updateNav(url))
    this.layout.breadcrumbIcon.pipe(takeUntilDestroyed()).subscribe((icon) => {
      this.breadcrumbIcon = icon
      this.scheduleOverflowMeasure()
    })
    afterNextRender(() => {
      const content = this.breadcrumbContent?.nativeElement
      const measure = this.breadcrumbMeasure?.nativeElement
      if (!content || !measure) return

      this.scheduleOverflowMeasure()
      if (typeof ResizeObserver === 'undefined') {
        this.resizeFallback = () => this.scheduleOverflowMeasure()
        window.addEventListener('resize', this.resizeFallback)
        return
      }
      // Observe both the available width and the full breadcrumb because either can change independently.
      this.resizeObserver = new ResizeObserver(() => this.scheduleOverflowMeasure())
      this.resizeObserver.observe(content)
      this.resizeObserver.observe(measure)
    })
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect()
    if (this.resizeFallback) window.removeEventListener('resize', this.resizeFallback)
    if (this.menuFocusFrame !== null) cancelAnimationFrame(this.menuFocusFrame)
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame)
  }

  private updateNav(url: BreadCrumbUrl) {
    const splicing = url.splicing ?? 1
    const translating = url.translating ?? false
    const sameLink = url.sameLink ?? false
    const firstLink = url.firstLink ?? null
    const mutateLevel = url.mutateLevel ?? null
    const urlTabs = url.url.split('/').slice(1)
    this.levels = []
    if (urlTabs[0]) {
      let link = `/${urlTabs.splice(0, splicing).join('/')}`
      for (const [index, item] of urlTabs.filter((item) => item !== '').entries()) {
        // ignore url args (ex: ?select=...)
        let sanitizedItem = item.split('?')[0]
        const mutation = mutateLevel?.[index]
        if (!sameLink || mutation?.setUrl) {
          link += '/' + sanitizedItem
        }
        if (mutation) {
          if (mutation.hide) continue
          if (mutation.setTitle) {
            sanitizedItem = mutation.translateTitle ? this.layout.translateString(mutation.setTitle) : mutation.setTitle
          }
        } else if (translating) {
          sanitizedItem = this.layout.translateString(sanitizedItem)
        }
        this.levels.push({ link: index === 0 && firstLink ? firstLink : link, title: sanitizedItem })
      }
    }
    this.fullPathLabels = this.levels.map((_, index) =>
      this.levels
        .slice(0, index + 1)
        .map(({ title }) => title)
        .join(' / ')
    )
    this.scheduleOverflowMeasure()
  }

  protected onPathMenuOpenChange(isOpen: boolean) {
    if (this.menuFocusFrame !== null) {
      cancelAnimationFrame(this.menuFocusFrame)
      this.menuFocusFrame = null
    }
    if (!isOpen || typeof requestAnimationFrame === 'undefined') return
    this.focusFirstPathItem()
  }

  private focusFirstPathItem(attempt = 0) {
    // A body-mounted ngx-bootstrap menu stays hidden during its initial positioning frame.
    this.menuFocusFrame = requestAnimationFrame(() => {
      this.menuFocusFrame = null
      const item = document.querySelector<HTMLElement>('.breadcrumb-path-menu.show .breadcrumb-path-item')
      const isVisible = item && item.getClientRects().length > 0 && getComputedStyle(item).visibility !== 'hidden'

      if (isVisible) {
        item.focus()
      } else if (attempt < 2) {
        this.focusFirstPathItem(attempt + 1)
      }
    })
  }

  protected onPathMenuKeydown(event: KeyboardEvent, dropdown: BsDropdownDirective) {
    if (event.key === 'Tab') {
      dropdown.hide()
      this.pathToggle?.nativeElement.focus()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      dropdown.hide()
      this.pathToggle?.nativeElement.focus()
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

    const items = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.breadcrumb-path-item'))
    if (!items.length) return
    const currentIndex = items.indexOf(document.activeElement as HTMLElement)
    let nextIndex: number
    if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = items.length - 1
    } else if (event.key === 'ArrowUp') {
      nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1
    } else {
      nextIndex = currentIndex === -1 || currentIndex === items.length - 1 ? 0 : currentIndex + 1
    }
    event.preventDefault()
    event.stopPropagation()
    items[nextIndex].focus()
  }

  protected preventCurrentNavigation(event: Event) {
    event.preventDefault()
    event.stopPropagation()
  }

  private scheduleOverflowMeasure() {
    if (!this.breadcrumbContent?.nativeElement || typeof requestAnimationFrame === 'undefined') return
    // Coalesce consecutive resize and content updates into a single post-layout measurement.
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame)
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = null
      this.measureOverflow()
    })
  }

  private measureOverflow() {
    const content = this.breadcrumbContent.nativeElement
    // Allow one pixel for fractional layout rounding to prevent compact-mode flicker.
    const isOverflowing = this.levels.length > 1 && this.breadcrumbMeasure.nativeElement.scrollWidth > content.clientWidth + 1

    if (isOverflowing === this.isOverflowing) return
    this.isOverflowing = isOverflowing
    this.cdr.detectChanges()
  }
}
