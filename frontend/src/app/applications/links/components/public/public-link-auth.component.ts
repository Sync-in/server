import { Component, inject, OnDestroy } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Params, RouterLink } from '@angular/router'
import { LucideDynamicIcon, LucideKeyRound, LucideLogIn } from '@lucide/angular'
import { USER_PASSWORD_MIN_LENGTH } from '@sync-in-server/backend/src/applications/users/constants/user'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { finalize } from 'rxjs/operators'
import { getAuthRetryAfter } from '../../../../auth/auth.utils'
import { linkProtected } from '../../../files/files.constants'
import { LinksService } from '../../services/links.service'

@Component({
  selector: 'app-public-link-auth',
  imports: [RouterLink, FormsModule, LucideDynamicIcon, L10nTranslatePipe, L10nTranslateDirective],
  templateUrl: 'public-link-auth.component.html'
})
export class PublicLinkAuthComponent implements OnDestroy {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly linkProtected = linkProtected
  protected readonly icons = { LucideKeyRound, LucideLogIn }
  protected readonly passwordMinLength = USER_PASSWORD_MIN_LENGTH
  protected password = ''
  protected retryAfter = 0
  protected submitted = false
  private readonly activatedRoute = inject(ActivatedRoute)
  private readonly linksService = inject(LinksService)
  private retryTimer: ReturnType<typeof setInterval> | null = null
  private uuid: string

  constructor() {
    this.activatedRoute.params.subscribe((p: Params) => (this.uuid = p.uuid))
  }

  ngOnDestroy() {
    this.clearRetryCountdown()
  }

  validPassword() {
    if (!this.password || this.password.length < this.passwordMinLength || this.submitted || this.retryAfter > 0) return

    this.submitted = true
    this.linksService
      .linkAuthentication(this.uuid, this.password)
      .pipe(finalize(() => (this.submitted = false)))
      .subscribe({
        next: () => (this.password = ''),
        error: (e) => {
          this.password = ''
          const retryAfter = getAuthRetryAfter(e)
          if (retryAfter) this.startRetryCountdown(retryAfter)
        }
      })
  }

  protected retryDelayLabel(): string {
    return new Intl.RelativeTimeFormat(this.locale.language, { numeric: 'always' }).format(this.retryAfter, 'second')
  }

  private startRetryCountdown(delay: number) {
    this.clearRetryCountdown()
    const retryAt = Date.now() + delay * 1000
    const updateRetryAfter = () => {
      this.retryAfter = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000))
      if (this.retryAfter === 0) this.clearRetryCountdown()
    }
    updateRetryAfter()
    if (this.retryAfter > 0) this.retryTimer = setInterval(updateRetryAfter, 1000)
  }

  private clearRetryCountdown() {
    if (this.retryTimer !== null) clearInterval(this.retryTimer)
    this.retryTimer = null
    this.retryAfter = 0
  }
}
