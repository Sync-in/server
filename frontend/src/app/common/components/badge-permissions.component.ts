import { ChangeDetectionStrategy, Component, inject, Input, OnChanges } from '@angular/core'
import { LucideDynamicIcon } from '@lucide/angular'
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
  imports: [TooltipModule, L10nTranslateDirective, LucideDynamicIcon, L10nTranslatePipe],
  template: `
    @if (replaceEmptyPermissions && !permissionEntries.length) {
      <span l10nTranslate>No permissions</span>
    } @else {
      @if (permissionEntries.length) {
        <span class="badge bg-secondary-alt permission-badge" [tooltip]="permissionsTooltip" [placement]="tooltipPlacement" [container]="'body'">
          @for (p of permissionEntries; track p.key) {
            <span class="permission-icon">
              <svg [lucideIcon]="p.value.icon"></svg>
            </span>
          }
        </span>
        <ng-template #permissionsTooltip>
          @for (p of permissionEntries; track p.key) {
            <div>{{ p.value.text | translate: locale.language }}</div>
          }
        </ng-template>
      }
    }
  `,
  styles: [
    `
      :host {
        --permission-icon-color: #2f4558;
        --permission-icon-hover-color: #22384b;
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        vertical-align: middle;
      }

      :host-context(body.theme-dark) {
        --permission-icon-color: #c2ccd8;
        --permission-icon-hover-color: #d8e3ef;
      }

      .permission-badge {
        display: inline-flex;
        align-items: center;
        gap: 0.1rem;
        width: fit-content;
        max-width: 100%;
        min-width: 0;
        box-sizing: border-box;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .permission-icon {
        display: inline-flex;
        align-items: center;
      }

      .permission-icon .lucide {
        color: var(--permission-icon-color);
        font-size: var(--font-size-md);
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
