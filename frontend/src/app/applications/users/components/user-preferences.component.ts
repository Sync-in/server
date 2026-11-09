import { KeyValuePipe } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, computed, inject, OnInit, signal } from '@angular/core'
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
export class UserPreferencesComponent implements OnInit {
  protected readonly i18nLanguageText = i18nLanguageText
  protected readonly allNotifications = Object.values(USER_NOTIFICATION_TEXT)
  protected readonly USER_THEME = USER_THEME
  protected readonly USER_SIDEBAR_QUICK_ACCESS_VISIBILITY = USER_SIDEBAR_QUICK_ACCESS_VISIBILITY
  protected readonly USER_SIDEBAR_QUICK_ACCESS_POSITION = USER_SIDEBAR_QUICK_ACCESS_POSITION
  protected readonly store = inject(StoreService)
  protected readonly user = this.store.user
  protected readonly showEditorPreference = computed(
    () =>
      this.store.server().files.editors.collabora && (this.store.server().files.editors.onlyoffice || this.store.server().files.editors.eurooffice)
  )
  protected readonly updatingShowHiddenFiles = signal(false)
  private readonly onlyOfficeEditorEnabled = this.store.server().files.editors.onlyoffice
  protected readonly editors: Record<string, NonNullable<UserPreferences['editor']>> = {
    [COLLABORA_APP_LOCK]: COLLABORA_EDITOR,
    [this.onlyOfficeEditorEnabled ? ONLY_OFFICE_APP_LOCK : EURO_OFFICE_APP_LOCK]: this.onlyOfficeEditorEnabled
      ? ONLY_OFFICE_EDITOR
      : EURO_OFFICE_EDITOR
  }
  protected readonly userEditorPreference = computed<UserPreferences['editor']>(() => {
    const preference = this.user()?.preferences?.editor
    return preference && Object.values(this.editors).includes(preference) ? preference : null
  })
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  private readonly layout = inject(LayoutService)
  protected readonly languages = this.layout.getLanguages(true)
  private readonly authService = inject(AuthService)
  private readonly userService = inject(UserService)

  constructor() {
    this.layout.setBreadcrumbIcon(USER_ICON.PREFERENCES)
    this.layout.setBreadcrumbNav({
      url: `/${USER_PATH.BASE}/${USER_PATH.PREFERENCES}/${USER_TITLE.PREFERENCES}`,
      splicing: 2,
      translating: true,
      sameLink: true
    })
  }

  protected readonly language = computed(() => this.user()?.language || USER_LANGUAGE_AUTO)

  protected changeLanguage(value: string) {
    if (value === USER_LANGUAGE_AUTO) value = null
    this.userService.changeLanguage({ language: value }).subscribe({
      next: () => this.updateLanguage(value),
      error: () => this.layout.sendNotification('error', 'Configuration', 'Unable to update language')
    })
  }

  ngOnInit() {
    this.userService.refreshUser()
  }

  updateNotification(status: number) {
    this.userService.changeNotification({ notification: status }).subscribe({
      next: () => {
        this.updateUser({ notification: status })
        this.layout.sendNotification('info', 'Configuration', 'Notification preference updated')
      },
      error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Configuration', 'Unable to update notification preference', e)
    })
  }

  updateStorageIndexing(status: boolean) {
    this.userService.changeStorageIndexing({ storageIndexing: status }).subscribe({
      next: () => {
        this.updateUser({ storageIndexing: status })
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
    if (this.updatingShowHiddenFiles()) return
    this.updatingShowHiddenFiles.set(true)
    this.userService
      .changePreferences({ showHiddenFiles })
      .pipe(
        switchMap(() => this.authService.refreshToken()),
        finalize(() => {
          this.updatingShowHiddenFiles.set(false)
        })
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
    this.updateUser({ language })
    this.layout.setLanguage(language).then(() => this.layout.sendNotification('info', 'Configuration', 'Language updated'))
  }

  private updateUser(changes: Partial<UserType>) {
    const user = this.user()!
    Object.assign(user, changes)
    this.store.user.set(user)
  }
}
