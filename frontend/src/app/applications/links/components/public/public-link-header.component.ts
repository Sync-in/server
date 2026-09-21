import { Component, DOCUMENT, inject, OnDestroy, Renderer2 } from '@angular/core'
import { RouterLink } from '@angular/router'
import { LucideContrast, LucideDynamicIcon } from '@lucide/angular'
import { L10N_LOCALE, L10nLocale, L10nTranslatePipe } from 'angular-l10n'
import { Subscription } from 'rxjs'
import { themeDark, themeLight } from '../../../../layout/layout.interfaces'
import { LayoutService } from '../../../../layout/layout.service'

@Component({
  selector: 'app-public-link-header',
  imports: [RouterLink, LucideDynamicIcon, L10nTranslatePipe],
  templateUrl: 'public-link-header.component.html'
})
export class PublicLinkHeaderComponent implements OnDestroy {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly icons = { LucideContrast }
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

  protected toggleTheme() {
    this.layout.toggleTheme()
  }
}
