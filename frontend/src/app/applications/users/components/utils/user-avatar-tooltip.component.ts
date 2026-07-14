import { ChangeDetectionStrategy, Component, inject, Input, ViewEncapsulation } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faLightbulb, faUsers, faUserShield } from '@fortawesome/free-solid-svg-icons'
import { L10N_LOCALE, L10nLocale, L10nTranslatePipe } from 'angular-l10n'
import { OwnerType } from '../../interfaces/owner.interface'
import { MemberModel } from '../../models/member.model'

@Component({
  selector: 'app-user-avatar-tooltip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [FaIconComponent, L10nTranslatePipe],
  styles: [
    `
      .user-avatar-tooltip {
        display: flex;
        flex-direction: column;
        gap: 6px;
        width: max-content;
        max-width: 100%;
        text-align: left;
      }

      .user-avatar-tooltip-container .tooltip-inner {
        max-width: min(90vw, 520px);
      }

      .user-avatar-tooltip-user {
        display: flex;
        align-items: center;
        min-width: 0;
        max-width: 100%;
      }

      .user-avatar-tooltip-avatar {
        margin-right: 0.2rem;
      }

      .user-avatar-tooltip-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .user-avatar-tooltip-title,
      .user-avatar-tooltip-subtitle {
        overflow: hidden;
      }

      .user-avatar-tooltip-title {
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 600;
      }

      .user-avatar-tooltip-subtitle {
        opacity: 0.8;
        font-size: 0.75rem;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `
  ],
  template: `
    <div class="user-avatar-tooltip">
      @for (tooltipUser of tooltipUsers; track trackUser($index, tooltipUser)) {
        <div class="user-avatar-tooltip-user">
          @if (userHasAvatar(tooltipUser)) {
            <img alt="" class="avatar-base-img user-avatar-tooltip-avatar" height="24" width="24" [src]="tooltipUser.avatarUrl" />
          } @else {
            <fa-icon
              [icon]="userIcon()"
              [class.circle-primary-icon]="isMember"
              [class.circle-gray-icon]="!isMember"
              class="user-avatar-tooltip-avatar"
              [style.min-width.px]="24"
              [style.min-height.px]="24"
              [style.font-size.px]="12"
            >
            </fa-icon>
          }
          <div class="user-avatar-tooltip-text">
            @if (translateTitle(tooltipUser)) {
              <span class="user-avatar-tooltip-title">{{ userTitle(tooltipUser) | translate: locale.language }}</span>
            } @else {
              <span class="user-avatar-tooltip-title">{{ userTitle(tooltipUser) }}</span>
            }
            @if (userSubtitle(tooltipUser); as subtitle) {
              @if (translateSubtitle(tooltipUser)) {
                <span class="user-avatar-tooltip-subtitle">{{ subtitle | translate: locale.language }}</span>
              } @else {
                <span class="user-avatar-tooltip-subtitle">{{ subtitle }}</span>
              }
            }
          </div>
        </div>
      }
    </div>
  `
})
export class UserAvatarTooltipComponent {
  @Input() user: OwnerType | MemberModel | any
  @Input() users: (OwnerType | MemberModel | any)[] = []
  @Input() isMember = false
  @Input() unknownUserAsInfo = false
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly icons = { faUsers, faUserShield, faLightbulb }

  protected get tooltipUsers(): (OwnerType | MemberModel | any)[] {
    if (this.users?.length) {
      return this.users
    }
    return this.user ? [this.user] : []
  }

  protected trackUser(index: number, user: OwnerType | MemberModel | any): string | number {
    return user?.mid ?? user?.id ?? user?.login ?? user?.name ?? index
  }

  protected userHasAvatar(user: OwnerType | MemberModel | any): boolean {
    return this.isMember ? user?.isUser : !!user?.login
  }

  protected userIcon() {
    return this.isMember ? this.icons.faUsers : this.unknownUserAsInfo ? this.icons.faLightbulb : this.icons.faUserShield
  }

  protected userTitle(user: OwnerType | MemberModel | any): string {
    if (this.isMember) {
      return user?.name
    }
    if (user?.login) {
      return user?.fullName
    }
    return this.unknownUserAsInfo ? 'Info' : 'Administrator'
  }

  protected userSubtitle(user: OwnerType | MemberModel | any): string {
    if (this.isMember) {
      return user?.description ?? user?.type
    }
    if (user?.login) {
      return user?.email
    }
    return null
  }

  protected translateTitle(user: OwnerType | MemberModel | any): boolean {
    return !this.isMember && !user?.login
  }

  protected translateSubtitle(user: OwnerType | MemberModel | any): boolean {
    return this.isMember && !user?.isUser && !!user?.type
  }
}
