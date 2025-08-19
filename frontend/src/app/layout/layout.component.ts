/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, HostListener, OnDestroy, Renderer2, DOCUMENT, inject } from '@angular/core'
import { RouterOutlet } from '@angular/router'
import { Subscription } from 'rxjs'
import { themeLight } from './layout.interfaces'
import { LayoutService } from './layout.service'
import { NavBarComponent } from './navbar/navbar.component'
import { SideBarLeftComponent } from './sidebar/sidebar.left.component'
import { SideBarRightComponent } from './sidebar/sidebar.right.component'

@Component({
  selector: 'app-layout',
  templateUrl: 'layout.component.html',
  imports: [RouterOutlet, NavBarComponent, SideBarLeftComponent, SideBarRightComponent]
})
export class LayoutComponent implements OnDestroy {
  private readonly document = inject<Document>(DOCUMENT)
  private readonly layout = inject(LayoutService)
  private readonly renderer = inject(Renderer2)
  protected themeMode = themeLight
  private rightSideBarClass = 'control-sidebar-open'
  private leftSideBarCollapsedClass = 'sidebar-collapse'
  private leftSideBarOpenedClass = 'sidebar-open'
  private isSmallerThanMediumScreen = false
  private subscriptions: Subscription[] = []

  constructor() {
    this.subscriptions.push(this.layout.switchTheme.subscribe((theme: string) => this.setTheme(theme)))
    this.subscriptions.push(this.layout.toggleRightSideBar.subscribe((status: boolean) => this.toggleRightSideBar(status)))
    this.subscriptions.push(this.layout.toggleLeftSideBar.subscribe((status) => this.toggleLeftSideBar(status)))
  }

  ngOnDestroy() {
    this.subscriptions.forEach((s) => s.unsubscribe())
  }

  @HostListener('window:resize')
  onResize() {
    this.layout.resizeEvent.next()
    if (this.isSmallerThanMediumScreen !== this.layout.isSmallerMediumScreen()) {
      this.isSmallerThanMediumScreen = !this.isSmallerThanMediumScreen
      this.checkLeftSideBarCollapse()
    }
  }

  toggleLeftSideBar(status: number) {
    // 1: open / 2: collapse / 3: toggle
    if (status === 1) {
      this.openLeftSideBar()
      this.layout.leftSideBarIsOpen.next(true)
    } else if (status === 2) {
      this.collapseLeftSideBar()
      this.layout.leftSideBarIsOpen.next(false)
    } else if (this.document.body.classList.contains(this.leftSideBarOpenedClass)) {
      this.collapseLeftSideBar()
      this.layout.saveLeftSideBarIsOpen.next(false)
      this.layout.leftSideBarIsOpen.next(false)
    } else {
      this.openLeftSideBar()
      this.layout.saveLeftSideBarIsOpen.next(true)
      this.layout.leftSideBarIsOpen.next(true)
    }
  }

  private openLeftSideBar() {
    this.renderer.removeClass(this.document.body, this.leftSideBarCollapsedClass)
    this.renderer.addClass(this.document.body, this.leftSideBarOpenedClass)
  }

  private collapseLeftSideBar() {
    this.renderer.removeClass(this.document.body, this.leftSideBarOpenedClass)
    this.renderer.addClass(this.document.body, this.leftSideBarCollapsedClass)
  }

  toggleRightSideBar(show: boolean) {
    if (show) {
      this.renderer.addClass(this.document.body, this.rightSideBarClass)
    } else {
      this.renderer.removeClass(this.document.body, this.rightSideBarClass)
    }
  }

  private checkLeftSideBarCollapse() {
    if (this.isSmallerThanMediumScreen) {
      this.toggleLeftSideBar(2)
    } else {
      this.toggleLeftSideBar(this.layout.saveLeftSideBarIsOpen.getValue() ? 1 : 2)
    }
  }

  private setTheme(theme: string) {
    this.renderer.removeClass(this.document.body, this.themeMode)
    this.themeMode = theme
    this.renderer.addClass(this.document.body, this.themeMode)
  }
}
