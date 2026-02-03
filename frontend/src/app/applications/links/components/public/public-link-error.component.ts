import { Component, inject } from '@angular/core'
import { ActivatedRoute, Params, RouterLink } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faExclamationCircle } from '@fortawesome/free-solid-svg-icons'
import { L10nTranslateDirective } from 'angular-l10n'
import { logoUrl } from '../../../files/files.constants'
import { LINK_ERROR_TRANSLATION } from '../../links.constants'

@Component({
  selector: 'app-public-link-error',
  imports: [RouterLink, L10nTranslateDirective, FaIconComponent],
  templateUrl: 'public-link-error.component.html'
})
export class PublicLinkErrorComponent {
  protected readonly logoUrl = logoUrl
  protected readonly icons = { faExclamationCircle }
  protected error: string
  private readonly activatedRoute = inject(ActivatedRoute)

  constructor() {
    this.activatedRoute.params.subscribe((params: Params) => (this.error = LINK_ERROR_TRANSLATION[params.error]))
  }
}
