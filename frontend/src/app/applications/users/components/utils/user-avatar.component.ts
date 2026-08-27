import { ChangeDetectionStrategy, Component, Input, OnInit } from '@angular/core'
import { LucideDynamicIcon, LucideLightbulb, LucideUserRoundKey, LucideUsersRound } from '@lucide/angular'
import { AvailableBSPositions } from 'ngx-bootstrap/positioning'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { OwnerType } from '../../interfaces/owner.interface'
import { MemberModel } from '../../models/member.model'
import { UserAvatarTooltipComponent } from './user-avatar-tooltip.component'

@Component({
  selector: 'app-user-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TooltipModule, LucideDynamicIcon, UserAvatarTooltipComponent],
  template: `
    @if (userHasAvatar()) {
      <img
        alt=""
        class="avatar-base-img cursor-pointer me-1"
        [height]="height"
        [width]="width"
        [src]="user.avatarUrl"
        [tooltip]="userTooltip"
        [isDisabled]="disableTooltip"
        [placement]="tooltipPlacement"
        [container]="container"
        containerClass="user-avatar-tooltip-container"
      />
    } @else {
      <span
        [class.circle-primary-icon]="isMember"
        [class.circle-gray-icon]="!isMember"
        class="cursor-pointer me-1"
        [tooltip]="userTooltip"
        [isDisabled]="disableTooltip"
        [placement]="tooltipPlacement"
        [container]="container"
        containerClass="user-avatar-tooltip-container"
        [style.min-width.px]="width"
        [style.min-height.px]="height"
        [style.font-size.px]="fontSize"
      >
        <svg [lucideIcon]="userIcon()"></svg>
      </span>
    }

    <ng-template #userTooltip>
      <app-user-avatar-tooltip [user]="user" [isMember]="isMember" [unknownUserAsInfo]="unknownUserAsInfo"></app-user-avatar-tooltip>
    </ng-template>
  `
})
export class UserAvatarComponent implements OnInit {
  @Input() user: OwnerType | MemberModel | any
  @Input() isMember = false
  @Input() unknownUserAsInfo = false
  @Input() height = 32
  @Input() width = 32
  @Input() fontSize = 16
  @Input() tooltipPlacement: AvailableBSPositions = 'auto'
  @Input() container: string = null
  @Input() disableTooltip = false
  protected readonly icons = { LucideUsersRound, LucideUserRoundKey, LucideLightbulb }

  ngOnInit(): void {
    if (this.height < 28) {
      this.fontSize = 13
    }
  }

  protected userHasAvatar(): boolean {
    return this.isMember ? this.user?.isUser : !!this.user?.login
  }

  protected userIcon() {
    return this.isMember ? this.icons.LucideUsersRound : this.unknownUserAsInfo ? this.icons.LucideLightbulb : this.icons.LucideUserRoundKey
  }
}
