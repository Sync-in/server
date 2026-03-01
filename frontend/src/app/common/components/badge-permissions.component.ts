import { ChangeDetectionStrategy, Component, inject, Input, OnChanges } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { AvailableBSPositions } from 'ngx-bootstrap/positioning'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { SPACES_PERMISSIONS_TEXT } from '../../applications/spaces/spaces.constants'

interface FilePermissionEntry {
  key: string
  value: (typeof SPACES_PERMISSIONS_TEXT)[keyof typeof SPACES_PERMISSIONS_TEXT]
}

@Component({
  selector: 'app-badge-permissions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TooltipModule, L10nTranslateDirective, FaIconComponent, L10nTranslatePipe],
  template: `
    @if (replaceEmptyPermissions && !permissionEntries.length) {
      <span l10nTranslate>No permissions</span>
    } @else {
      @if (permissionEntries.length) {
        <span class="badge bg-secondary-alt permission-badge">
          @for (p of permissionEntries; track p.key) {
            <span class="permission-icon" [tooltip]="p.value.text | translate: locale.language" [placement]="tooltipPlacement" [container]="'body'">
              <fa-icon class="cursor-pointer" [icon]="p.value.icon"></fa-icon>
            </span>
          }
        </span>
      }
    }
  `,
  styles: [
    `
      :host {
        --permission-icon-color: #2f4558;
        --permission-icon-hover-color: #22384b;
        display: inline-block;
        max-width: 100%;
        vertical-align: middle;
      }

      :host-context(body.theme-dark) {
        --permission-icon-color: #c2ccd8;
        --permission-icon-hover-color: #d8e3ef;
      }

      .permission-badge {
        display: inline-block;
        width: fit-content;
        max-width: 100%;
        min-width: 0;
        box-sizing: border-box;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.2;
      }

      .permission-icon {
        display: inline-block;
        margin-right: 0.25rem;
        vertical-align: middle;
      }

      .permission-icon:last-child {
        margin-right: 0;
      }

      .permission-icon fa-icon {
        display: inline-block;
        color: var(--permission-icon-color);
        vertical-align: 0;
        font-size: 0.8125rem;
      }
    `
  ]
})
export class BadgePermissionsComponent implements OnChanges {
  @Input({ required: true }) permissions: Partial<typeof SPACES_PERMISSIONS_TEXT> = {}
  @Input() tooltipPlacement: AvailableBSPositions = 'top'
  @Input() replaceEmptyPermissions = false
  protected permissionEntries: FilePermissionEntry[] = []
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)

  ngOnChanges() {
    this.permissionEntries = this.buildPermissionEntries()
  }

  private buildPermissionEntries(): FilePermissionEntry[] {
    return Object.entries(this.permissions)
      .filter((entry): entry is [string, FilePermissionEntry['value']] => entry[1] !== undefined)
      .map(([key, value]) => ({ key, value }))
  }
}
