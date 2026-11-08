import { afterNextRender, Component, effect, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core'
import { RouterLink } from '@angular/router'
import { LucideChevronDown, LucideChevronRight, LucideCornerDownRight, LucideDynamicIcon, LucideFolder } from '@lucide/angular'
import { BsDropdownDirective, BsDropdownMenuDirective, BsDropdownToggleDirective } from 'ngx-bootstrap/dropdown'
import { LayoutService } from '../layout.service'
import type { BreadcrumbLevel, BreadCrumbUrl } from './breadcrumb.interfaces'

@Component({
  selector: 'app-breadcrumb',
  templateUrl: 'breadcrumb.component.html',
  imports: [RouterLink, LucideDynamicIcon, BsDropdownDirective, BsDropdownMenuDirective, BsDropdownToggleDirective]
})
export class BreadcrumbComponent implements OnDestroy {
  private readonly breadcrumbContent = viewChild<ElementRef<HTMLElement>>('breadcrumbContent')
  private readonly breadcrumbMeasure = viewChild<ElementRef<HTMLElement>>('breadcrumbMeasure')
  private readonly pathToggle = viewChild<ElementRef<HTMLButtonElement>>('pathToggle')
  private readonly layout = inject(LayoutService)
  protected readonly icons = { LucideChevronDown, LucideChevronRight, LucideCornerDownRight, LucideFolder }
  protected readonly breadcrumbIcon = this.layout.breadcrumbIcon
  protected readonly isOverflowing = signal(false)
  protected readonly levels = signal<BreadcrumbLevel[]>([])
  private readonly canHoverPathMenu = window.matchMedia('(hover: hover) and (pointer: fine)')
  private menuFocusFrame: number = null
  private pathMenuHoverCloseTimeout: ReturnType<typeof setTimeout> = null
  private pathMenuOpenedByHover = false
  private resizeFrame: number = null
  private resizeObserver: ResizeObserver = null

  constructor() {
    effect(() => this.updateNav(this.layout.breadcrumbNav()))
    effect(() => {
      this.layout.breadcrumbIcon()
      this.scheduleOverflowMeasure()
    })
    afterNextRender(() => {
      const content = this.breadcrumbContent()?.nativeElement
      const measure = this.breadcrumbMeasure()?.nativeElement
      if (!content || !measure) return

      this.scheduleOverflowMeasure()
      // Observe both the available width and the full breadcrumb because either can change independently.
      this.resizeObserver = new ResizeObserver(() => this.scheduleOverflowMeasure())
      this.resizeObserver.observe(content)
      this.resizeObserver.observe(measure)
    })
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect()
    if (this.menuFocusFrame !== null) cancelAnimationFrame(this.menuFocusFrame)
    this.clearPathMenuHoverClose()
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame)
  }

  private updateNav(url: BreadCrumbUrl) {
    const urlTabs = url.url.split('/').slice(1)
    const levels: BreadcrumbLevel[] = []
    if (urlTabs[0]) {
      let link = `/${urlTabs.splice(0, url.splicing ?? 1).join('/')}`
      for (const [index, item] of urlTabs.filter((item) => item !== '').entries()) {
        // ignore url args (ex: ?select=...)
        let sanitizedItem = item.split('?')[0]
        const mutation = url.mutateLevel?.[index]
        if (!url.sameLink || mutation?.setUrl) {
          link += '/' + sanitizedItem
        }
        if (mutation) {
          if (mutation.setTitle) {
            sanitizedItem = mutation.translateTitle ? this.layout.translateString(mutation.setTitle) : mutation.setTitle
          }
        } else if (url.translating) {
          sanitizedItem = this.layout.translateString(sanitizedItem)
        }
        levels.push({ link: index === 0 && url.firstLink ? url.firstLink : link, title: sanitizedItem })
      }
    }
    this.levels.set(levels)
    this.scheduleOverflowMeasure()
  }

  protected onPathMenuOpenChange(isOpen: boolean) {
    if (this.menuFocusFrame !== null) {
      cancelAnimationFrame(this.menuFocusFrame)
      this.menuFocusFrame = null
    }
    if (!isOpen) {
      this.pathMenuOpenedByHover = false
      this.clearPathMenuHoverClose()
      return
    }
    if (this.pathMenuOpenedByHover) return
    this.focusFirstPathItem()
  }

  protected onPathMenuHoverEnter(dropdown: BsDropdownDirective) {
    if (!this.canHoverPathMenu.matches) return

    this.clearPathMenuHoverClose()
    if (dropdown.isOpen) return

    this.pathMenuOpenedByHover = true
    dropdown.show()
  }

  protected onPathMenuHoverLeave(dropdown: BsDropdownDirective) {
    if (!this.canHoverPathMenu.matches || !this.pathMenuOpenedByHover) return

    this.clearPathMenuHoverClose()
    this.pathMenuHoverCloseTimeout = setTimeout(() => {
      this.pathMenuHoverCloseTimeout = null
      dropdown.hide()
    }, 150)
  }

  protected preparePathMenuClick(dropdown: BsDropdownDirective) {
    if (this.pathMenuOpenedByHover && dropdown.isOpen) dropdown.hide()
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
      this.pathToggle()?.nativeElement.focus()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      dropdown.hide()
      this.pathToggle()?.nativeElement.focus()
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

  private clearPathMenuHoverClose() {
    if (this.pathMenuHoverCloseTimeout === null) return
    clearTimeout(this.pathMenuHoverCloseTimeout)
    this.pathMenuHoverCloseTimeout = null
  }

  private scheduleOverflowMeasure() {
    if (!this.breadcrumbContent()?.nativeElement || !this.breadcrumbMeasure()?.nativeElement) return
    // Coalesce consecutive resize and content updates into a single post-layout measurement.
    if (this.resizeFrame !== null) cancelAnimationFrame(this.resizeFrame)
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = null
      this.measureOverflow()
    })
  }

  private measureOverflow() {
    const content = this.breadcrumbContent().nativeElement
    // Allow one pixel for fractional layout rounding to prevent compact-mode flicker.
    const isOverflowing = this.levels().length > 1 && this.breadcrumbMeasure().nativeElement.scrollWidth > content.clientWidth + 1

    if (isOverflowing === this.isOverflowing()) return
    this.isOverflowing.set(isOverflowing)
  }
}
