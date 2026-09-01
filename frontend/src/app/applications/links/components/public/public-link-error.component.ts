import { Component, inject } from '@angular/core'
import { ActivatedRoute, Params, RouterLink } from '@angular/router'
import { LucideCircleAlert, LucideDynamicIcon } from '@lucide/angular'
import { L10nTranslateDirective } from 'angular-l10n'
import { LINK_ERROR_TRANSLATION } from '../../links.constants'

@Component({
  selector: 'app-public-link-error',
  imports: [RouterLink, L10nTranslateDirective, LucideDynamicIcon],
  templateUrl: 'public-link-error.component.html'
})
export class PublicLinkErrorComponent {
  protected readonly icons = { LucideCircleAlert }
  protected error: string
  private readonly activatedRoute = inject(ActivatedRoute)

  constructor() {
    this.activatedRoute.params.subscribe((params: Params) => (this.error = LINK_ERROR_TRANSLATION[params.error]))
  }
}
