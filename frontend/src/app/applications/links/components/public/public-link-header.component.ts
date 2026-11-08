import { Component, DOCUMENT, effect, inject, Renderer2 } from '@angular/core'
import type { USER_THEME } from '@sync-in-server/backend/src/applications/users/constants/user-preferences'
import { APP_URL } from '@sync-in-server/backend/src/common/shared'
import { themeDark, themeLight } from '../../../../layout/layout.interfaces'
import { LayoutService } from '../../../../layout/layout.service'
import { ThemeSwitchComponent } from '../../../../layout/theme-switch.component'

@Component({
  selector: 'app-public-link-header',
  imports: [ThemeSwitchComponent],
  templateUrl: 'public-link-header.component.html'
})
export class PublicLinkHeaderComponent {
  protected readonly websiteUrl = APP_URL.WEBSITE
  private readonly document = inject<Document>(DOCUMENT)
  private readonly layout = inject(LayoutService)
  private readonly renderer = inject(Renderer2)

  constructor() {
    effect(() => {
      const theme = this.layout.switchTheme()
      this.renderer.removeClass(this.document.body, theme === themeDark ? themeLight : themeDark)
      this.renderer.addClass(this.document.body, theme)
    })
  }

  protected toggleTheme(theme: USER_THEME) {
    this.layout.setThemePreference(theme)
  }
}
