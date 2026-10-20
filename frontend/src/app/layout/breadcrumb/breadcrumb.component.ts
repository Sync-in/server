import { AfterViewChecked, AfterViewInit, Component, ElementRef, inject, OnDestroy, ViewChild } from '@angular/core'
import { RouterLink, RouterLinkActive } from '@angular/router'
import type { LucideIcon } from '@lucide/angular'
import { LucideChevronRight, LucideDynamicIcon } from '@lucide/angular'
import { Subscription } from 'rxjs'
import { LayoutService } from '../layout.service'
import { BreadCrumbUrl } from './breadcrumb.interfaces'

@Component({
  selector: 'app-breadcrumb',
  templateUrl: 'breadcrumb.component.html',
  imports: [RouterLink, RouterLinkActive, LucideDynamicIcon]
})
export class BreadcrumbComponent implements AfterViewChecked, AfterViewInit, OnDestroy {
  @ViewChild('breadcrumbContent') private breadcrumbContent!: ElementRef<HTMLDivElement>
  protected readonly icons = { LucideChevronRight }
  protected breadcrumbIcon: LucideIcon = null
  protected levels: { link: string[] | string; title: string }[] = []
  private readonly layout = inject(LayoutService)
  private subscriptions: Subscription[] = []
  private scrollToCurrentFolder = false
  private resizeObserver: ResizeObserver | null = null

  constructor() {
    this.subscriptions.push(this.layout.breadcrumbNav.subscribe((url) => this.updateNav(url)))
    this.subscriptions.push(this.layout.breadcrumbIcon.subscribe((icon) => (this.breadcrumbIcon = icon)))
  }

  ngOnDestroy() {
    this.subscriptions.forEach((s) => s.unsubscribe())
    this.resizeObserver?.disconnect()
  }

  ngAfterViewInit() {
    const content = this.breadcrumbContent?.nativeElement
    if (content) {
      this.resizeObserver = new ResizeObserver(() => this.updateOverflow(content))
      this.resizeObserver.observe(content)
      this.updateOverflow(content)
    }
  }

  ngAfterViewChecked() {
    const content = this.breadcrumbContent?.nativeElement
    if (content) this.updateOverflow(content)
    if (this.scrollToCurrentFolder) {
      this.scrollToCurrentFolder = false
      if (content) content.scrollLeft = content.scrollWidth
    }
  }

  private updateOverflow(content: HTMLDivElement) {
    content.classList.toggle('breadcrumb-content--overflowing', content.scrollWidth > content.clientWidth)
  }

  updateNav(url: BreadCrumbUrl) {
    this.scrollToCurrentFolder = true
    const splicing = url.splicing || 1
    const translating = url.translating || false
    const sameLink = url.sameLink || false
    const firstLink = url.firstLink || null
    const mutateLevel = url.mutateLevel || null
    const urlTabs = url.url.split('/').slice(1)
    this.levels = []
    if (urlTabs[0]) {
      let link = `/${urlTabs.splice(0, splicing).join('/')}`
      for (const { index, item } of urlTabs.filter((i) => i !== '').map((item, index) => ({ index, item }))) {
        // ignore url args (ex: ?select=...)
        let sanitized_item = item.split('?')[0]
        const mutation = mutateLevel?.[index]
        if (!sameLink || mutation?.setUrl) {
          link += '/' + sanitized_item
        }
        if (mutation) {
          if (mutation.hide) continue
          if (mutation.setTitle) {
            sanitized_item = mutation.translateTitle ? this.layout.translateString(mutation.setTitle) : mutation.setTitle
          }
        } else if (translating) {
          sanitized_item = this.layout.translateString(sanitized_item)
        }
        this.levels.push({ link: index === 0 && firstLink ? firstLink : link, title: sanitized_item })
      }
    }
  }
}
