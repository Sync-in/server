import { KeyValuePipe } from '@angular/common'
import { Component, inject, Input, OnChanges } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { AvailableBSPositions } from 'ngx-bootstrap/positioning'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { originalOrderKeyValue } from '../../../../common/utils/functions'
import { SPACES_PERMISSIONS_TEXT } from '../../../spaces/spaces.constants'

@Component({
  selector: 'app-file-permissions',
  imports: [TooltipModule, L10nTranslateDirective, FaIconComponent, KeyValuePipe, L10nTranslatePipe],
  template: `
    @if (replaceEmptyPermissions && !hasPermissions) {
      <span l10nTranslate>No permissions</span>
    } @else {
      @for (p of permissions | keyvalue: originalOrderKeyValue; track p.key) {
        <fa-icon
          class="cursor-pointer fs-md"
          [icon]="p.value.icon"
          [tooltip]="p.value.text | translate: locale.language"
          [placement]="tooltipPlacement"
        ></fa-icon>
      }
    }
  `
})
export class FilePermissionsComponent implements OnChanges {
  @Input({ required: true }) permissions: Partial<typeof SPACES_PERMISSIONS_TEXT> = {}
  @Input() tooltipPlacement: AvailableBSPositions = 'top'
  @Input() replaceEmptyPermissions = false
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected hasPermissions = false
  protected readonly originalOrderKeyValue = originalOrderKeyValue

  ngOnChanges() {
    this.hasPermissions = !!Object.keys(this.permissions).length
  }
}
