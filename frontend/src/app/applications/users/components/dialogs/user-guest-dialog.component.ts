/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { TitleCasePipe } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faAddressCard, faPen, faPlus, faShieldHalved, faSpinner, faUsers, faUsersGear } from '@fortawesome/free-solid-svg-icons'
import { USER_LOGIN_VALIDATION, USER_NOTIFICATION_TEXT, USER_ROLE } from '@sync-in-server/backend/src/applications/users/constants/user'
import type { CreateUserDto, UpdateUserDto } from '@sync-in-server/backend/src/applications/users/dto/create-or-update-user.dto'
import type { SearchMembersDto } from '@sync-in-server/backend/src/applications/users/dto/search-members.dto'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { TabDirective, TabHeadingDirective, TabsetComponent } from 'ngx-bootstrap/tabs'
import { Observable } from 'rxjs'
import { InputPasswordComponent } from '../../../../common/components/input-password.component'
import { PasswordStrengthBarComponent } from '../../../../common/components/password-strength-bar.component'
import { AutofocusDirective } from '../../../../common/directives/auto-focus.directive'
import { TimeDateFormatPipe } from '../../../../common/pipes/time-date-format.pipe'
import { LayoutService } from '../../../../layout/layout.service'
import { UserType } from '../../interfaces/user.interface'
import { GuestUserModel } from '../../models/guest.model'
import { MemberModel, ownerToMember } from '../../models/member.model'
import { USER_ICON, USER_LANGUAGE_AUTO, USER_PASSWORD_CHANGE_TEXT } from '../../user.constants'
import { UserService } from '../../user.service'
import { UserSearchComponent } from '../utils/user-search.component'

@Component({
  selector: 'app-user-guest-dialog',
  imports: [
    FaIconComponent,
    L10nTranslateDirective,
    TimeDateFormatPipe,
    ReactiveFormsModule,
    InputPasswordComponent,
    PasswordStrengthBarComponent,
    AutofocusDirective,
    AutofocusDirective,
    PasswordStrengthBarComponent,
    InputPasswordComponent,
    TimeDateFormatPipe,
    L10nTranslatePipe,
    TitleCasePipe,
    UserSearchComponent,
    TabsetComponent,
    TabDirective,
    TabHeadingDirective
  ],
  templateUrl: 'user-guest-dialog.component.html'
})
export class UserGuestDialogComponent implements OnInit {
  @Input() guest: GuestUserModel = null
  @Output() guestChange = new EventEmitter<['add' | 'update' | 'delete', GuestUserModel]>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  protected readonly userService = inject(UserService)
  protected readonly user: UserType = this.userService.user
  protected readonly icons = { GROUPS: USER_ICON.GROUPS, faPlus, faPen, faUsersGear, faSpinner, faAddressCard, faUsers, faShieldHalved }
  protected readonly allNotifications = Object.values(USER_NOTIFICATION_TEXT)
  protected readonly defaultPassword: string = this.layout.translateString(USER_PASSWORD_CHANGE_TEXT)
  protected readonly languages: string[] = this.layout.getLanguages(true)
  // states
  protected submitted = false
  protected loading = false
  protected confirmDeletion = false
  protected tabView: undefined | 'managers'
  // form
  protected guestForm: FormGroup<{
    login: FormControl<string>
    email: FormControl<string>
    firstName: FormControl<string>
    lastName: FormControl<string>
    password: FormControl<string>
    language: FormControl<string>
    notification: FormControl<number>
    isActive: FormControl<boolean>
    managers: FormControl<MemberModel[]>
  }>

  ngOnInit() {
    this.guestForm = new FormGroup({
      login: new FormControl<string>(this.guest?.login || '', [Validators.required, Validators.pattern(USER_LOGIN_VALIDATION)]),
      email: new FormControl<string>(this.guest?.email || '', [Validators.required, Validators.maxLength(255), Validators.email]),
      firstName: new FormControl<string>(this.guest?.firstName || '', [Validators.required, Validators.maxLength(255)]),
      lastName: new FormControl<string>(this.guest?.lastName || '', Validators.maxLength(255)),
      password: new FormControl<string>(this.guest ? this.defaultPassword : '', Validators.maxLength(255)),
      language: new FormControl<string>(this.guest?.language || null),
      notification: new FormControl<number>(
        this.guest?.notification || Object.values(USER_NOTIFICATION_TEXT).indexOf(USER_NOTIFICATION_TEXT.APPLICATION_EMAIL)
      ),
      isActive: new FormControl<boolean>(this.guest ? this.guest.isActive : true),
      managers: new FormControl<MemberModel[]>(this.guest?.managers || [ownerToMember(this.user)])
    })
  }

  updatePassword(password: string) {
    this.guestForm.controls.password.setValue(password)
    this.guestForm.controls.password.markAsDirty()
  }

  updateManagers(managers: MemberModel[]) {
    this.guestForm.controls.managers.setValue(managers)
    this.guestForm.controls.managers.markAsDirty()
    this.guestForm.controls.managers.setErrors(managers.length ? null : { incorrect: true })
  }

  searchMembers(query: string): Observable<MemberModel[]> {
    const search: SearchMembersDto = {
      search: query,
      ignoreUserIds: this.guestForm.value.managers.map((m: MemberModel) => m.id),
      usersRole: USER_ROLE.USER,
      onlyUsers: true
    }
    return this.userService.searchMembers(search)
  }

  onCancel() {
    if (this.confirmDeletion) {
      this.confirmDeletion = false
    } else {
      this.layout.closeDialog()
    }
  }

  onSubmit() {
    this.submitted = true
    if (this.confirmDeletion) {
      // delete
      this.userService.deleteGuest(this.guest.id).subscribe({
        next: () => {
          this.guestChange.emit(['delete', this.guest])
          this.layout.sendNotification('success', 'Guest deleted', this.guest.login)
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => this.onError(e)
      })
    } else if (!this.guest) {
      // create
      this.userService.createGuest(this.makeDto(true)).subscribe({
        next: (g: GuestUserModel) => {
          this.guestChange.emit(['add', g])
          this.layout.sendNotification('success', 'Guest created', this.guestForm.value.login)
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => this.onError(e)
      })
    } else {
      // update
      const updateDto = this.makeDto()
      if (!Object.keys(updateDto).length) {
        this.loading = false
        this.submitted = false
        return
      }
      this.userService.updateGuest(this.guest.id, updateDto).subscribe({
        next: (g: GuestUserModel) => {
          if (g) {
            this.guestChange.emit(['update', g])
          } else {
            this.guestChange.emit(['delete', this.guest])
          }
          this.layout.sendNotification('success', 'Guest updated', this.guestForm.value.login)
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => this.onError(e)
      })
    }
  }

  protected makeDto(create: true): CreateUserDto
  protected makeDto(create?: false): UpdateUserDto
  protected makeDto(create = false): CreateUserDto | UpdateUserDto {
    let dto = {}
    if (create) {
      dto = { ...this.guestForm.value }
    } else {
      for (const k in this.guestForm.controls) {
        if (this.guestForm.controls[k].dirty) {
          dto[k] = this.guestForm.controls[k].value
        }
      }
    }
    for (const k in dto) {
      switch (k) {
        case 'language':
          dto[k] = dto[k] === USER_LANGUAGE_AUTO ? null : dto[k]
          break
        case 'managers':
          dto[k] = dto[k].map((m: MemberModel) => m.id)
          break
      }
    }
    return dto
  }

  protected onError(e: HttpErrorResponse) {
    this.layout.sendNotification('error', 'Guest error', this.guestForm.value.login, e)
    this.submitted = false
    this.confirmDeletion = false
  }
}
