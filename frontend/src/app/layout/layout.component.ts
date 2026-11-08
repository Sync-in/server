import { ChangeDetectionStrategy, Component, DOCUMENT, effect, HostListener, inject, OnInit, Renderer2 } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NavigationStart, Router, RouterOutlet } from '@angular/router'
import { filter } from 'rxjs'
import { themeLight } from './layout.interfaces'
import { LayoutService } from './layout.service'
import { NavBarComponent } from './navbar/navbar.component'
import { SideBarLeftComponent } from './sidebar/sidebar.left.component'
import { SideBarRightComponent } from './sidebar/sidebar.right.component'

@Component({
  selector: 'app-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: 'layout.component.html',
  imports: [RouterOutlet, NavBarComponent, SideBarLeftComponent, SideBarRightComponent]
})
export class LayoutComponent implements OnInit {
  protected themeMode = themeLight
  private readonly document = inject<Document>(DOCUMENT)
  private readonly layout = inject(LayoutService)
  private readonly renderer = inject(Renderer2)
  private readonly router = inject(Router)
  private rightSideBarClass = 'control-sidebar-open'
  private leftSideBarCollapsedClass = 'sidebar-collapse'
  private leftSideBarOpenedClass = 'sidebar-open'
  private isSmallerThanMediumScreen = false

  constructor() {
    effect(() => this.setTheme(this.layout.switchTheme()))
    this.layout.toggleRightSideBar.pipe(takeUntilDestroyed()).subscribe((status) => this.toggleRightSideBar(status))
    this.layout.toggleLeftSideBar.pipe(takeUntilDestroyed()).subscribe((status) => this.toggleLeftSideBar(status))
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationStart),
        takeUntilDestroyed()
      )
      .subscribe(() => this.layout.closeContextMenu())
  }

  ngOnInit() {
    this.isSmallerThanMediumScreen = this.layout.isSmallerMediumScreen()
    this.checkLeftSideBarCollapse()
  }

  @HostListener('window:resize')
  onResize() {
    this.layout.resizeEvent.next()
    const isSmallerThanMediumScreen = this.layout.isSmallerMediumScreen()
    if (this.isSmallerThanMediumScreen !== isSmallerThanMediumScreen) {
      this.isSmallerThanMediumScreen = isSmallerThanMediumScreen
      this.checkLeftSideBarCollapse()
    }
  }

  @HostListener('dragover', ['$event'])
  onDragOver(event: DragEvent) {
    event.preventDefault()
  }

  @HostListener('drop', ['$event'])
  onDrop(event: DragEvent) {
    event.preventDefault()
  }

  toggleLeftSideBar(status: number) {
    // 1: open / 2: collapse / 3: toggle
    if (status === 1) {
      this.openLeftSideBar()
      this.layout.leftSideBarIsOpen.set(true)
    } else if (status === 2) {
      this.collapseLeftSideBar()
      this.layout.leftSideBarIsOpen.set(false)
    } else if (this.document.body.classList.contains(this.leftSideBarOpenedClass)) {
      this.collapseLeftSideBar()
      this.layout.saveLeftSideBarIsOpen.set(false)
      this.layout.leftSideBarIsOpen.set(false)
    } else {
      this.openLeftSideBar()
      this.layout.saveLeftSideBarIsOpen.set(true)
      this.layout.leftSideBarIsOpen.set(true)
    }
  }

  toggleRightSideBar(show: boolean) {
    if (show) {
      this.renderer.addClass(this.document.body, this.rightSideBarClass)
    } else {
      this.renderer.removeClass(this.document.body, this.rightSideBarClass)
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

  private checkLeftSideBarCollapse() {
    if (this.isSmallerThanMediumScreen) {
      this.toggleLeftSideBar(2)
    } else {
      this.layout.saveLeftSideBarIsOpen.set(true)
      this.toggleLeftSideBar(1)
    }
  }

  private setTheme(theme: string) {
    this.renderer.removeClass(this.document.body, this.themeMode)
    this.themeMode = theme
    this.renderer.addClass(this.document.body, this.themeMode)
  }
}
