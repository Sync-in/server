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
      <span>
        @for (entry of entries; track entry.key) {
          <span class="badge bg-secondary" [class.me-1]="!$last">
            <fa-icon [icon]="entry.icon"></fa-icon>
            {{ entry.value }}
          </span>
        }
      </span>
    }
  `
})
export class BadgeMembersComponent implements OnChanges {
  @Input({ required: true }) members: BadgeMembersCounts = { users: 0, groups: 0, links: 0 }
  protected entries: BadgeEntry[] = []

  ngOnChanges() {
    this.entries = this.buildEntries()
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
