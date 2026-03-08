import { ChangeDetectionStrategy, Component, inject, input, InputSignal } from '@angular/core'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BadgePermissionsComponent } from '../../../../common/components/badge-permissions.component'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { TimeDateFormatPipe } from '../../../../common/pipes/time-date-format.pipe'
import { defaultCardImageSize, defaultResizeOffset } from '../../../../layout/layout.constants'
import { ShareRepositoryComponent } from '../../../shares/components/utils/share-repository.component'
import { ShareLinkModel } from '../../models/share-link.model'

@Component({
  selector: 'app-link-selection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AutoResizeDirective, L10nTranslateDirective, L10nTranslatePipe, TimeDateFormatPipe, ShareRepositoryComponent, BadgePermissionsComponent],
  templateUrl: 'link-selection.component.html',
  styles: ['.card {width: 100%; background: transparent; border: none}']
})
export class LinkSelectionComponent {
  link: InputSignal<ShareLinkModel> = input.required<ShareLinkModel>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly cardImageSize = defaultCardImageSize
  protected readonly resizeOffset = defaultResizeOffset
  protected accessHover = false
  protected lastAccessHover = false
}
