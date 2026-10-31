import { KeyValuePipe } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, inject, OnDestroy, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import {
  COLLABORA_APP_LOCK,
  COLLABORA_EDITOR
} from '@sync-in-server/backend/src/applications/files/editors/collabora-online/collabora-online.constants'
import {
  EURO_OFFICE_APP_LOCK,
  EURO_OFFICE_EDITOR,
  ONLY_OFFICE_APP_LOCK,
  ONLY_OFFICE_EDITOR
} from '@sync-in-server/backend/src/applications/files/editors/only-office/only-office.constants'
import {
  USER_SIDEBAR_QUICK_ACCESS_POSITION,
  USER_SIDEBAR_QUICK_ACCESS_VISIBILITY,
  USER_THEME
} from '@sync-in-server/backend/src/applications/users/constants/user-preferences'
import type { UserPreferences } from '@sync-in-server/backend/src/applications/users/interfaces/user-preferences.interface'
import { L10nTranslateDirective } from 'angular-l10n'
import { Subscription } from 'rxjs'
import { finalize, switchMap } from 'rxjs/operators'
import { i18nLanguageText } from '../../../../i18n/l10n'
import { AuthService } from '../../../auth/auth.service'
import { AutoResizeDirective } from '../../../common/directives/auto-resize.directive'
import { originalOrderKeyValue } from '../../../common/utils/functions'
import { LayoutService } from '../../../layout/layout.service'
import { StoreService } from '../../../store/store.service'
import { UserType } from '../interfaces/user.interface'
import { USER_ICON, USER_LANGUAGE_AUTO, USER_NOTIFICATION_TEXT, USER_PATH, USER_TITLE } from '../user.constants'
import { UserService } from '../user.service'

@Component({
  selector: 'app-user-preferences',
  imports: [AutoResizeDirective, FormsModule, KeyValuePipe, L10nTranslateDirective],
  templateUrl: 'user-preferences.component.html'
})
export class UserPreferencesComponent implements OnInit, OnDestroy {
  protected readonly i18nLanguageText = i18nLanguageText
  protected readonly allNotifications = Object.values(USER_NOTIFICATION_TEXT)
  protected readonly USER_THEME = USER_THEME
  protected readonly USER_SIDEBAR_QUICK_ACCESS_VISIBILITY = USER_SIDEBAR_QUICK_ACCESS_VISIBILITY
  protected readonly USER_SIDEBAR_QUICK_ACCESS_POSITION = USER_SIDEBAR_QUICK_ACCESS_POSITION
  protected user: UserType
  protected readonly store = inject(StoreService)
  protected showEditorPreference = false
  protected updatingShowHiddenFiles = false
  private readonly onlyOfficeEditorEnabled = this.store.server().files.editors.onlyoffice
  protected readonly editors: Record<string, NonNullable<UserPreferences['editor']>> = {
    [COLLABORA_APP_LOCK]: COLLABORA_EDITOR,
    [this.onlyOfficeEditorEnabled ? ONLY_OFFICE_APP_LOCK : EURO_OFFICE_APP_LOCK]: this.onlyOfficeEditorEnabled
      ? ONLY_OFFICE_EDITOR
      : EURO_OFFICE_EDITOR
  }
  protected userEditorPreference: UserPreferences['editor'] = null
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  private readonly layout = inject(LayoutService)
  protected languages = this.layout.getLanguages(true)
  private readonly authService = inject(AuthService)
  private readonly userService = inject(UserService)
  private subscriptions: Subscription[] = []

  constructor() {
    this.subscriptions.push(
      this.store.user.subscribe((user: UserType) => {
        this.user = user
        const preference = user?.preferences?.editor
        this.userEditorPreference = preference && Object.values(this.editors).includes(preference) ? preference : null
      })
    )
    this.layout.setBreadcrumbIcon(USER_ICON.PREFERENCES)
    this.layout.setBreadcrumbNav({
      url: `/${USER_PATH.BASE}/${USER_PATH.PREFERENCES}/${USER_TITLE.PREFERENCES}`,
      splicing: 2,
      translating: true,
      sameLink: true
    })
    this.showEditorPreference =
      this.store.server().files.editors.collabora && (this.store.server().files.editors.onlyoffice || this.store.server().files.editors.eurooffice)
  }

  get language() {
    return this.user?.language || USER_LANGUAGE_AUTO
  }

  set language(value: string) {
    if (value === USER_LANGUAGE_AUTO) value = null
    this.userService.changeLanguage({ language: value }).subscribe({
      next: () => this.updateLanguage(value),
      error: () => this.layout.sendNotification('error', 'Configuration', 'Unable to update language')
    })
  }

  ngOnInit() {
    this.userService.refreshUser()
  }

  ngOnDestroy() {
    this.subscriptions.forEach((s) => s.unsubscribe())
  }

  updateNotification(status: number) {
    this.userService.changeNotification({ notification: status }).subscribe({
      next: () => {
        this.user.notification = status
        this.layout.sendNotification('info', 'Configuration', 'Notification preference updated')
      },
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Configuration', 'Unable to update notification preference', e)
    })
  }

  updateStorageIndexing(status: boolean) {
    this.userService.changeStorageIndexing({ storageIndexing: status }).subscribe({
      next: () => {
        this.user.storageIndexing = status
        this.layout.sendNotification('info', 'Configuration', 'Full-text search preference updated')
      },
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Configuration', 'Unable to update full-text search preference', e)
    })
  }

  updateTheme(theme: UserPreferences['theme']) {
    this.userService.changePreferences({ theme }).subscribe()
  }

  updateEditorPreference(editor: UserPreferences['editor']) {
    this.userService.changePreferences({ editor }).subscribe()
  }

  updateSingleClickNavigation(singleClickNavigation: UserPreferences['singleClickNavigation']) {
    this.userService.changePreferences({ singleClickNavigation }).subscribe()
  }

  updateShowHiddenFiles(showHiddenFiles: UserPreferences['showHiddenFiles']) {
    if (this.updatingShowHiddenFiles) return
    this.updatingShowHiddenFiles = true
    this.userService
      .changePreferences({ showHiddenFiles })
      .pipe(
        switchMap(() => this.authService.refreshToken()),
        finalize(() => (this.updatingShowHiddenFiles = false))
      )
      .subscribe()
  }

  updateSidebarQuickAccessVisibility(sidebarQuickAccessVisibility: UserPreferences['sidebarQuickAccessVisibility']) {
    this.userService.changePreferences({ sidebarQuickAccessVisibility }).subscribe()
  }

  updateSidebarQuickAccessPosition(sidebarQuickAccessPosition: UserPreferences['sidebarQuickAccessPosition']) {
    this.userService.changePreferences({ sidebarQuickAccessPosition }).subscribe()
  }

  updateSystemNotificationsPreference(useSystemNotifications: UserPreferences['useSystemNotifications']) {
    this.userService.changePreferences({ useSystemNotifications }).subscribe()
  }

  private updateLanguage(language: string) {
    this.user.language = language
    this.layout.setLanguage(language).then(() => this.layout.sendNotification('info', 'Configuration', 'Language updated'))
  }
}
