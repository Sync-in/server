/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, OnDestroy, inject } from '@angular/core'
import { RouterLink, RouterLinkActive } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faChevronRight, faHome } from '@fortawesome/free-solid-svg-icons'
import { Subscription } from 'rxjs'
import { LayoutService } from '../layout.service'
import { BreadCrumbUrl } from './breadcrumb.interfaces'

@Component({
  selector: 'app-breadcrumb',
  templateUrl: 'breadcrumb.component.html',
  imports: [RouterLink, RouterLinkActive, FaIconComponent]
})
export class BreadcrumbComponent implements OnDestroy {
  private readonly layout = inject(LayoutService)
  protected readonly icons = { faChevronRight }
  protected breadcrumbIcon: IconDefinition = faHome
  protected levels: { link: string[] | string; title: string }[] = []
  private subscriptions: Subscription[] = []

  constructor() {
    this.subscriptions.push(this.layout.breadcrumbNav.subscribe((url) => this.updateNav(url)))
    this.subscriptions.push(this.layout.breadcrumbIcon.subscribe((icon) => (this.breadcrumbIcon = icon)))
  }

  ngOnDestroy() {
    this.subscriptions.forEach((s) => s.unsubscribe())
  }

  updateNav(url: BreadCrumbUrl) {
    const splicing = url.splicing || 1
    const translating = url.translating || false
    const sameLink = url.sameLink || false
    const firstLink = url.firstLink || null
    const mutateLevel = url.mutateLevel || null
    const urlTabs = url.url.split('/').slice(1)
    this.levels = []
    if (urlTabs.length >= 1 && urlTabs[0]) {
      // first item with breadcrumb icon only
      let link = `/${urlTabs.splice(0, splicing).join('/')}`
      this.levels.push({ link: firstLink || link, title: '' })
      for (const { index, item } of urlTabs.filter((i) => i !== '').map((item, index) => ({ index, item }))) {
        // ignore url args (ex: ?select=...)
        let sanitized_item = item.split('?')[0]
        if (!sameLink || (mutateLevel && mutateLevel[index] && mutateLevel[index].setUrl)) {
          link += '/' + sanitized_item
        }
        if (mutateLevel && mutateLevel[index]) {
          if (mutateLevel[index].hide) continue
          if (mutateLevel[index].setTitle) {
            sanitized_item = mutateLevel[index].translateTitle
              ? this.layout.translateString(mutateLevel[index].setTitle)
              : mutateLevel[index].setTitle
          }
        } else if (translating) {
          sanitized_item = this.layout.translateString(sanitized_item)
        }
        this.levels.push({ link, title: sanitized_item })
      }
    } else {
      this.levels.push({ link: ['/'], title: '' })
    }
  }
}
