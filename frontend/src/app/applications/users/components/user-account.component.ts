import { HttpErrorResponse, HttpHeaders } from '@angular/common/http'
import { Component, inject, OnDestroy, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { LucideCopy, LucideDynamicIcon, LucideKeyRound } from '@lucide/angular'
import { USER_PASSWORD_MIN_LENGTH } from '@sync-in-server/backend/src/applications/users/constants/user'
import { UserAppPassword } from '@sync-in-server/backend/src/applications/users/interfaces/user-secrets.interface'
import { WEBDAV_BASE_PATH } from '@sync-in-server/backend/src/applications/webdav/constants/routes'
import { TWO_FA_HEADER_CODE, TWO_FA_HEADER_PASSWORD } from '@sync-in-server/backend/src/authentication/constants/auth'
import { AUTH_SESSION } from '@sync-in-server/backend/src/authentication/providers/auth-providers.constants'
import type { TwoFaSetup } from '@sync-in-server/backend/src/authentication/providers/two-fa/auth-two-fa.interfaces'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { ClipboardService } from 'ngx-clipboard'
import { Subscription } from 'rxjs'
import { filter, take } from 'rxjs/operators'
import { AuthService } from '../../../auth/auth.service'
import { InputPasswordComponent } from '../../../common/components/input-password.component'
import { PasswordStrengthBarComponent } from '../../../common/components/password-strength-bar.component'
import { StorageUsageComponent } from '../../../common/components/storage-usage.component'
import { AutoResizeDirective } from '../../../common/directives/auto-resize.directive'
import { CapitalizePipe } from '../../../common/pipes/capitalize.pipe'
import { TimeAgoPipe } from '../../../common/pipes/time-ago.pipe'
import { TimeDateFormatPipe } from '../../../common/pipes/time-date-format.pipe'
import { LayoutService } from '../../../layout/layout.service'
import { StoreService } from '../../../store/store.service'
import { UserType } from '../interfaces/user.interface'
import { USER_ICON, USER_ONLINE_STATUS_LIST, USER_PATH, USER_TITLE } from '../user.constants'
import { UserService } from '../user.service'
import { UserAuth2faEnableDialogComponent } from './dialogs/user-auth-2fa-enable-dialog.component'
import { UserAuthManageAppPasswordsDialogComponent } from './dialogs/user-auth-manage-app-passwords-dialog.component'

@Component({
  selector: 'app-user-account',
  imports: [
    AutoResizeDirective,
    FormsModule,
    CapitalizePipe,
    L10nTranslatePipe,
    TimeDateFormatPipe,
    TimeAgoPipe,
    PasswordStrengthBarComponent,
    L10nTranslateDirective,
    LucideDynamicIcon,
    StorageUsageComponent,
    InputPasswordComponent
  ],
  templateUrl: 'user-account.component.html'
})
export class UserAccountComponent implements OnInit, OnDestroy {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly allOnlineStatus = USER_ONLINE_STATUS_LIST
  protected readonly passwordMinLength = USER_PASSWORD_MIN_LENGTH
  protected readonly icons = { LucideCopy, LucideKeyRound }
  protected user: UserType
  protected userAvatar: string = null
  protected webdavUrl = `${window.location.origin}/${WEBDAV_BASE_PATH}`
  // password
  protected oldPassword: string
  protected newPassword: string
  protected readonly store = inject(StoreService)
  private readonly layout = inject(LayoutService)
  private readonly authService = inject(AuthService)
  private readonly userService = inject(UserService)
  private readonly clipBoardService = inject(ClipboardService)
  private subscriptions: Subscription[] = []

  constructor() {
    this.subscriptions.push(this.store.user.subscribe((user: UserType) => (this.user = user)))
    this.subscriptions.push(this.store.userAvatarUrl.subscribe((avatarUrl) => (this.userAvatar = avatarUrl)))
    this.layout.setBreadcrumbIcon(USER_ICON.ACCOUNT)
    this.layout.setBreadcrumbNav({
      url: `/${USER_PATH.BASE}/${USER_PATH.ACCOUNT}/${USER_TITLE.ACCOUNT}`,
      splicing: 2,
      translating: true,
      sameLink: true
    })
  }

  get requiresCurrentPassword() {
    return this.user?.authSession !== AUTH_SESSION.OIDC
  }

  ngOnInit() {
    this.userService.refreshUser()
  }

  ngOnDestroy() {
    this.subscriptions.forEach((s) => s.unsubscribe())
  }

  logOut() {
    this.authService.logout()
  }

  setOnlineStatus(status: number) {
    this.userService.changeOnlineStatus(status)
  }

  genAvatar() {
    this.userService.genAvatar()
  }

  uploadAvatar(ev: any) {
    this.userService.uploadAvatar(ev.target.files[0])
  }

  async submitPassword() {
    if (this.requiresCurrentPassword && !this.oldPassword) {
      this.layout.sendNotification('error', 'Configuration', 'Current password missing !')
      return
    }
    if (!this.newPassword) {
      this.layout.sendNotification('error', 'Configuration', 'New password missing !')
      return
    }
    if (this.newPassword.length < USER_PASSWORD_MIN_LENGTH) {
      this.layout.sendNotification('warning', 'Configuration', 'New password must have 8 characters minimum')
      return
    }
    const auth2FaHeaders = await this.userService.auth2FaVerifyDialog()
    if (auth2FaHeaders === false) {
      return
    }
    const oldPassword = this.requiresCurrentPassword ? this.oldPassword : this.newPassword
    this.userService.changePassword({ oldPassword, newPassword: this.newPassword }, auth2FaHeaders).subscribe({
      next: () => {
        this.oldPassword = ''
        this.newPassword = ''
        this.layout.sendNotification('info', 'Configuration', 'Password has been updated')
      },
      error: (e: HttpErrorResponse) => {
        this.oldPassword = ''
        if (e.status === 403) {
          this.layout.sendNotification('error', 'Configuration', 'Unable to update password', e)
        } else {
          this.layout.sendNotification('warning', 'Configuration', 'Current password does not match')
        }
      }
    })
  }

  clipBoardLink() {
    this.clipBoardService.copyFromContent(this.webdavUrl)
    this.layout.sendNotification('info', 'Link copied', this.webdavUrl)
  }

  async enable2Fa() {
    this.userService.init2Fa().subscribe({
      next: (init: TwoFaSetup) => {
        const modalRef: BsModalRef<UserAuth2faEnableDialogComponent> = this.layout.openDialog(
          UserAuth2faEnableDialogComponent,
          'xs',
          { initialState: { qrDataUrl: init.qrDataUrl, secret: init.secret } as UserAuth2faEnableDialogComponent },
          { keyboard: false }
        )
        modalRef.content.isValid
          .pipe(
            filter((isValid: boolean) => isValid),
            take(1)
          )
          .subscribe(() => {
            this.layout.sendNotification('success', 'Configuration', 'Two-Factor Authentication is enabled')
            this.store.user.next({ ...this.store.user.getValue(), twoFaEnabled: true })
          })
      },
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Configuration', 'Two-Factor Authentication', e)
    })
  }

  async disable2Fa() {
    const auth2FaHeaders: false | HttpHeaders = await this.userService.auth2FaVerifyDialog(true)
    if (!auth2FaHeaders) {
      // two-fa is already enabled to be disabled
      return
    }
    this.userService.disable2Fa({ code: auth2FaHeaders.get(TWO_FA_HEADER_CODE), password: auth2FaHeaders.get(TWO_FA_HEADER_PASSWORD) }).subscribe({
      next: () => {
        this.layout.sendNotification('success', 'Configuration', 'Two-Factor Authentication is disabled')
        this.store.user.next({ ...this.store.user.getValue(), twoFaEnabled: false })
      },
      error: (e: HttpErrorResponse) => {
        this.layout.sendNotification('error', 'Configuration', 'Two-Factor Authentication', e)
      }
    })
  }

  async manageAppPasswords() {
    this.userService.listAppPasswords().subscribe({
      next: (appPasswords: Omit<UserAppPassword, 'password'>[]) => {
        const modalRef: BsModalRef<UserAuthManageAppPasswordsDialogComponent> = this.layout.openDialog(
          UserAuthManageAppPasswordsDialogComponent,
          'md',
          { initialState: { appPasswords: appPasswords } as UserAuthManageAppPasswordsDialogComponent }
        )
        modalRef.content.nbAppPasswords.subscribe((nb: number) => {
          this.store.user.next({ ...this.store.user.getValue(), appPasswords: nb })
        })
      },
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Configuration', 'Unable to get app passwords', e)
    })
  }
}
