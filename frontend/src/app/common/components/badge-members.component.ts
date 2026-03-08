import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faLink, faUser, faUsers } from '@fortawesome/free-solid-svg-icons'

export interface BadgeMembersCounts {
  users?: number
  groups?: number
  links?: number
}

interface BadgeEntry {
  key: keyof BadgeMembersCounts
  icon: typeof faUser
  value: number
}

@Component({
  selector: 'app-badge-members',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FaIconComponent],
  template: `
    @if (entries.length) {
      <span class="members-summary" [attr.title]="tooltipText">
        <span class="members-breakdown">
          @for (entry of entries; track entry.key) {
            <span class="members-part">
              <fa-icon [icon]="entry.icon" [class.members-icon-user]="entry.key === 'users'"></fa-icon>
              <span class="members-value">{{ entry.value }}</span>
            </span>
          }
        </span>
      </span>
    }
  `,
  styles: [
    `
      :host {
        --members-breakdown-color: #5f6f81;
        display: inline-block;
        max-width: 100%;
      }

      :host-context(body.theme-dark) {
        --members-breakdown-color: #a7b4c2;
      }

      .members-summary {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        max-width: 100%;
        line-height: 1.2;
        white-space: nowrap;
      }

      .members-breakdown {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        color: var(--members-breakdown-color);
        font-size: var(--font-size-base);
      }

      .members-part {
        display: inline-flex;
        align-items: center;
        gap: 0.2rem;
      }

      .members-icon-user {
        margin-right: -0.14rem;
      }

      .members-value {
        font-size: var(--font-size-sm);
        line-height: 1;
      }
    `
  ]
})
export class BadgeMembersComponent implements OnChanges {
  @Input({ required: true }) members: BadgeMembersCounts = { users: 0, groups: 0, links: 0 }
  protected entries: BadgeEntry[] = []
  protected tooltipText = ''

  ngOnChanges() {
    this.entries = this.buildEntries()
    this.tooltipText = this.entries.map((entry) => `${entry.key}: ${entry.value}`).join(' • ')
  }

  private buildEntries(): BadgeEntry[] {
    const members = this.members ?? {}
    const entries: BadgeEntry[] = [
      { key: 'users', icon: faUser, value: members.users ?? 0 },
      { key: 'groups', icon: faUsers, value: members.groups ?? 0 },
      { key: 'links', icon: faLink, value: members.links ?? 0 }
    ]

    return entries.filter((entry) => entry.value > 0)
  }
}
