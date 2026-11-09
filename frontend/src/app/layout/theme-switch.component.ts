import { Component, computed, inject, input, output } from '@angular/core'
import { LucideDynamicIcon } from '@lucide/angular'
import type { USER_THEME } from '@sync-in-server/backend/src/applications/users/constants/user-preferences'
import { L10N_LOCALE, L10nLocale, L10nTranslatePipe } from 'angular-l10n'
import { THEME_OPTIONS } from './layout.constants'
import { LayoutService } from './layout.service'

@Component({
  selector: 'app-theme-switch',
  imports: [LucideDynamicIcon, L10nTranslatePipe],
  template: `
    <button
      type="button"
      [class]="buttonClass()"
      [attr.aria-label]="('Theme' | translate: locale.language) + ': ' + (currentOption().label | translate: locale.language)"
      [title]="('Theme' | translate: locale.language) + ': ' + (currentOption().label | translate: locale.language)"
      (click)="switchTheme()"
    >
      <svg [lucideIcon]="currentOption().icon"></svg>
    </button>
  `
})
export class ThemeSwitchComponent {
  buttonClass = input('btn btn-default')
  themeChange = output<USER_THEME>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  private readonly layout = inject(LayoutService)
  protected readonly currentOption = computed(
    () => THEME_OPTIONS.find((option) => option.value === this.layout.themePreference()) ?? THEME_OPTIONS[0]
  )
  protected switchTheme() {
    const index = THEME_OPTIONS.indexOf(this.currentOption())
    this.themeChange.emit(THEME_OPTIONS[(index + 1) % THEME_OPTIONS.length].value)
  }
}
