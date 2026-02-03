import { ChangeDetectionStrategy, Component, inject, input, InputSignal } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { TimeDateFormatPipe } from '../../../../common/pipes/time-date-format.pipe'
import { defaultCardImageSize, defaultResizeOffset } from '../../../../layout/layout.constants'
import { TrashModel } from '../../models/trash.model'
import { SPACES_ICON } from '../../spaces.constants'

@Component({
  selector: 'app-trash-selection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: 'trash-selection.component.html',
  imports: [AutoResizeDirective, FaIconComponent, L10nTranslateDirective, TimeDateFormatPipe, L10nTranslatePipe],
  styles: ['.card {width: 100%; background: transparent; border: none}']
})
export class TrashSelectionComponent {
  trash: InputSignal<TrashModel> = input.required<TrashModel>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly iconTrash = SPACES_ICON.TRASH
  protected readonly cardImageSize = defaultCardImageSize
  protected readonly resizeOffset = defaultResizeOffset
}
