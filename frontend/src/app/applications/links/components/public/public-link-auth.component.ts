import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Params, RouterLink } from '@angular/router'
import { LucideDynamicIcon, LucideKeyRound, LucideLogIn } from '@lucide/angular'
import { USER_PASSWORD_MIN_LENGTH } from '@sync-in-server/backend/src/applications/users/constants/user'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { linkProtected, logoUrl } from '../../../files/files.constants'
import { LinksService } from '../../services/links.service'

@Component({
  selector: 'app-public-link-auth',
  imports: [RouterLink, FormsModule, LucideDynamicIcon, L10nTranslatePipe, L10nTranslateDirective],
  templateUrl: 'public-link-auth.component.html'
})
export class PublicLinkAuthComponent {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly logoUrl = logoUrl
  protected readonly linkProtected = linkProtected
  protected readonly icons = { LucideKeyRound, LucideLogIn }
  protected readonly passwordMinLength = USER_PASSWORD_MIN_LENGTH
  protected password = ''
  private readonly activatedRoute = inject(ActivatedRoute)
  private readonly linksService = inject(LinksService)
  private uuid: string

  constructor() {
    this.activatedRoute.params.subscribe((p: Params) => (this.uuid = p.uuid))
  }

  validPassword() {
    if (this.password && this.password.length >= this.passwordMinLength) {
      this.linksService.linkAuthentication(this.uuid, this.password).subscribe(() => (this.password = ''))
    }
  }
}
