/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ChangeDetectionStrategy, Component, inject, Input, OnInit } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faLightbulb, faUsers, faUserShield } from '@fortawesome/free-solid-svg-icons'
import { L10N_LOCALE, L10nLocale, L10nTranslatePipe } from 'angular-l10n'
import { AvailableBSPositions } from 'ngx-bootstrap/positioning'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { OwnerType } from '../../interfaces/owner.interface'
import { MemberModel } from '../../models/member.model'

@Component({
  selector: 'app-user-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TooltipModule, FaIconComponent, L10nTranslatePipe],
  template: `
    @if (isMember) {
      @if (user.isUser) {
        <img
          alt=""
          class="avatar-base-img cursor-pointer me-1"
          [height]="height"
          [width]="width"
          [src]="user.avatarUrl"
          tooltip="{{ user.name }} ({{ user.description }})"
          [placement]="tooltipPlacement"
          [container]="container"
        />
      } @else {
        <fa-icon
          [icon]="icons.faUsers"
          class="circle-primary-icon cursor-pointer me-1"
          tooltip="{{ user.name }} ({{ user.type | translate: locale.language }})"
          [placement]="tooltipPlacement"
          [container]="container"
          [style.min-width.px]="width"
          [style.min-height.px]="height"
          [style.font-size.px]="fontSize"
        >
        </fa-icon>
      }
    } @else {
      @if (user.login) {
        <img
          alt=""
          class="avatar-base-img cursor-pointer me-1"
          [height]="height"
          [width]="width"
          [src]="user.avatarUrl"
          tooltip="{{ user.fullName }} ({{ user.email }})"
          [placement]="tooltipPlacement"
          [container]="container"
        />
      } @else {
        <fa-icon
          [icon]="unknownUserAsInfo ? icons.faLightbulb : icons.faUserShield"
          class="circle-gray-icon cursor-pointer me-1"
          [tooltip]="(unknownUserAsInfo ? 'Information' : 'Administrator') | translate: locale.language"
          [placement]="tooltipPlacement"
          [container]="container"
          [style.min-width.px]="width"
          [style.min-height.px]="height"
          [style.font-size.px]="fontSize"
        >
        </fa-icon>
      }
    }
  `
})
export class UserAvatarComponent implements OnInit {
  @Input() user: OwnerType | MemberModel | any
  @Input() isMember = false
  @Input() unknownUserAsInfo = false
  @Input() height = 30
  @Input() width = 30
  @Input() fontSize = 16
  @Input() tooltipPlacement: AvailableBSPositions = 'auto'
  @Input() container: string = null
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly icons = { faUsers, faUserShield, faLightbulb }

  ngOnInit(): void {
    if (this.height < 28) {
      this.fontSize = 13
    }
  }
}
