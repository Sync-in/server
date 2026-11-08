import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
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
        [height]="height()"
        [width]="width()"
        [src]="user().avatarUrl"
        [tooltip]="userTooltip"
        [isDisabled]="disableTooltip()"
        [placement]="tooltipPlacement()"
        [container]="container()"
        containerClass="user-avatar-tooltip-container"
      />
    } @else {
      <span
        [class.circle-primary-icon]="isMember()"
        [class.circle-gray-icon]="!isMember()"
        class="cursor-pointer me-1"
        [tooltip]="userTooltip"
        [isDisabled]="disableTooltip()"
        [placement]="tooltipPlacement()"
        [container]="container()"
        containerClass="user-avatar-tooltip-container"
        [style.min-width.px]="width()"
        [style.min-height.px]="height()"
        [style.font-size.px]="effectiveFontSize()"
      >
        <svg [lucideIcon]="userIcon()"></svg>
      </span>
    }

    <ng-template #userTooltip>
      <app-user-avatar-tooltip [user]="user()" [isMember]="isMember()" [unknownUserAsInfo]="unknownUserAsInfo()"></app-user-avatar-tooltip>
    </ng-template>
  `
})
export class UserAvatarComponent {
  readonly user = input<OwnerType | MemberModel | any>()
  readonly isMember = input(false)
  readonly unknownUserAsInfo = input(false)
  readonly height = input(32)
  readonly width = input(32)
  readonly fontSize = input(16)
  readonly tooltipPlacement = input<AvailableBSPositions>('auto')
  readonly container = input<string | null>(null)
  readonly disableTooltip = input(false)
  protected readonly icons = { LucideUsersRound, LucideUserRoundKey, LucideLightbulb }
  protected readonly effectiveFontSize = computed(() => (this.height() < 28 ? 13 : this.fontSize()))
  protected readonly userHasAvatar = computed(() => (this.isMember() ? this.user()?.isUser : !!this.user()?.login))
  protected readonly userIcon = computed(() =>
    this.isMember() ? this.icons.LucideUsersRound : this.unknownUserAsInfo() ? this.icons.LucideLightbulb : this.icons.LucideUserRoundKey
  )
}
