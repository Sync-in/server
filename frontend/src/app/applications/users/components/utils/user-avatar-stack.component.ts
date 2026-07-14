import { ChangeDetectionStrategy, Component, Input } from '@angular/core'
import { AvailableBSPositions } from 'ngx-bootstrap/positioning'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { OwnerType } from '../../interfaces/owner.interface'
import { MemberModel } from '../../models/member.model'
import { UserAvatarComponent } from './user-avatar.component'
import { UserAvatarTooltipComponent } from './user-avatar-tooltip.component'

@Component({
  selector: 'app-user-avatar-stack',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TooltipModule, UserAvatarComponent, UserAvatarTooltipComponent],
  styles: [
    `
      :host {
        display: inline-flex;
        max-width: 100%;
      }

      .avatar-stack {
        --avatar-overlap: 18px;
        display: inline-flex;
        align-items: center;
      }

      .avatar-stack > app-user-avatar + app-user-avatar {
        margin-left: calc(var(--avatar-overlap) * -1);
      }

      .avatar-stack > app-user-avatar {
        position: relative;
      }
    `
  ],
  template: `
    <span
      class="avatar-stack"
      [tooltip]="usersTooltip"
      [isDisabled]="!users?.length"
      [placement]="tooltipPlacement"
      [container]="container"
      containerClass="user-avatar-tooltip-container"
    >
      @for (user of users || []; track trackUser($index, user)) {
        <app-user-avatar
          [user]="user"
          [isMember]="isMember"
          [unknownUserAsInfo]="unknownUserAsInfo"
          [height]="height"
          [width]="width"
          [fontSize]="fontSize"
          [disableTooltip]="true"
        >
        </app-user-avatar>
      }
    </span>

    <ng-template #usersTooltip>
      <app-user-avatar-tooltip [users]="users" [isMember]="isMember" [unknownUserAsInfo]="unknownUserAsInfo"></app-user-avatar-tooltip>
    </ng-template>
  `
})
export class UserAvatarStackComponent {
  @Input() users: (OwnerType | MemberModel | any)[] = []
  @Input() isMember = false
  @Input() unknownUserAsInfo = false
  @Input() height = 32
  @Input() width = 32
  @Input() fontSize = 16
  @Input() tooltipPlacement: AvailableBSPositions = 'auto'
  @Input() container: string = null

  protected trackUser(index: number, user: OwnerType | MemberModel | any): string | number {
    return user?.mid ?? user?.id ?? user?.login ?? user?.name ?? index
  }
}
