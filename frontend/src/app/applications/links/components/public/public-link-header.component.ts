import { Component, DOCUMENT, inject, OnDestroy, Renderer2 } from '@angular/core'
import { RouterLink } from '@angular/router'
import type { USER_THEME } from '@sync-in-server/backend/src/applications/users/constants/user-preferences'
import { Subscription } from 'rxjs'
import { themeDark, themeLight } from '../../../../layout/layout.interfaces'
import { LayoutService } from '../../../../layout/layout.service'
import { ThemeSwitchComponent } from '../../../../layout/theme-switch.component'

@Component({
  selector: 'app-public-link-header',
  imports: [RouterLink, ThemeSwitchComponent],
  templateUrl: 'public-link-header.component.html'
})
export class PublicLinkHeaderComponent implements OnDestroy {
  private readonly document = inject<Document>(DOCUMENT)
  private readonly layout = inject(LayoutService)
  private readonly renderer = inject(Renderer2)
  private readonly themeSubscription: Subscription

  constructor() {
    this.themeSubscription = this.layout.switchTheme.subscribe((theme: string) => {
      this.renderer.removeClass(this.document.body, theme === themeDark ? themeLight : themeDark)
      this.renderer.addClass(this.document.body, theme)
    })
  }

  ngOnDestroy() {
    this.themeSubscription.unsubscribe()
  }

  protected toggleTheme(theme: USER_THEME) {
    this.layout.setThemePreference(theme)
  }
}
