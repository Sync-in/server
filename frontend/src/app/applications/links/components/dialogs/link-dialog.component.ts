/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { KeyValuePipe } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faClipboard, faClipboardCheck, faEye, faEyeSlash, faLock, faLockOpen } from '@fortawesome/free-solid-svg-icons'
import type { FileSpace } from '@sync-in-server/backend/src/applications/files/interfaces/file-space.interface'
import { LINK_TYPE } from '@sync-in-server/backend/src/applications/links/constants/links'
import type { CreateOrUpdateLinkDto } from '@sync-in-server/backend/src/applications/links/dto/create-or-update-link.dto'
import type { LinkGuest } from '@sync-in-server/backend/src/applications/links/interfaces/link-guest.interface'
import { SHARE_TYPE } from '@sync-in-server/backend/src/applications/shares/constants/shares'
import type { CreateOrUpdateShareDto } from '@sync-in-server/backend/src/applications/shares/dto/create-or-update-share.dto'
import { SPACE_OPERATION } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { USER_PASSWORD_MIN_LENGTH } from '@sync-in-server/backend/src/applications/users/constants/user'
import { currentDate, popFromObject } from '@sync-in-server/backend/src/common/shared'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { ButtonsModule } from 'ngx-bootstrap/buttons'
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { Observable } from 'rxjs'
import { i18nLanguageText } from '../../../../../i18n/l10n'
import { InputPasswordComponent } from '../../../../common/components/input-password.component'
import { PasswordStrengthBarComponent } from '../../../../common/components/password-strength-bar.component'
import { originalOrderKeyValue } from '../../../../common/utils/functions'
import { LayoutService } from '../../../../layout/layout.service'
import { FileModel } from '../../../files/models/file.model'
import { ShareRepositoryComponent } from '../../../shares/components/utils/share-repository.component'
import type { ShareModel } from '../../../shares/models/share.model'
import { SharesService } from '../../../shares/services/shares.service'
import { SpacesService } from '../../../spaces/services/spaces.service'
import { SPACES_ICON, SPACES_PERMISSIONS_TEXT } from '../../../spaces/spaces.constants'
import { setAllowedBooleanPermissions, setStringPermission } from '../../../spaces/spaces.functions'
import { MemberModel } from '../../../users/models/member.model'
import { USER_PASSWORD_CHANGE_TEXT } from '../../../users/user.constants'
import { UserService } from '../../../users/user.service'
import type { ShareLinkModel } from '../../models/share-link.model'
import { LinksService } from '../../services/links.service'

@Component({
  selector: 'app-link-dialog',
  imports: [
    FaIconComponent,
    L10nTranslateDirective,
    BsDatepickerModule,
    ButtonsModule,
    FormsModule,
    InputPasswordComponent,
    KeyValuePipe,
    TooltipModule,
    L10nTranslatePipe,
    ReactiveFormsModule,
    ShareRepositoryComponent,
    PasswordStrengthBarComponent
  ],
  templateUrl: 'link-dialog.component.html'
})
export class LinkDialogComponent implements OnInit {
  readonly layout = inject(LayoutService)
  // from links component or children dialog component
  @Input() share: ShareLinkModel | (Partial<ShareModel> & { link: LinkGuest })
  @Input() parentSpaceId: number = null
  // from space or share dialog component
  @Input() link: LinkGuest & { linkId: number }
  // from spaces browser component
  @Input() file: FileSpace & Pick<FileModel, 'root'>
  @Input() isSharesRepo = false
  @Input() inSharesList = false
  // submit event
  @Output() submitEvent = new EventEmitter<CreateOrUpdateLinkDto>()
  @Output() shareChange = new EventEmitter<['update' | 'delete', ShareLinkModel] | ['add', ShareModel]>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected confirmDeletion = false
  protected submitted = false
  protected readonly SPACES_PERMISSIONS_TEXT = SPACES_PERMISSIONS_TEXT
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly icons = { faEye, faEyeSlash, links: SPACES_ICON.LINKS, faClipboard, faClipboardCheck, faLock, faLockOpen }
  protected readonly languages: string[] = this.layout.getLanguages()
  protected readonly minDate: Date = currentDate()
  protected readonly defaultPassword: string = this.layout.translateString(USER_PASSWORD_CHANGE_TEXT)
  protected readonly passwordMinLength = USER_PASSWORD_MIN_LENGTH
  protected password = ''
  protected permissions: Partial<Record<`${SPACE_OPERATION}`, boolean>>
  protected linkIsExpired = false
  protected linkIsHovered = false
  protected linkWasCopied = false
  protected linkForm: FormGroup<{
    shareName: FormControl<string>
    shareDescription: FormControl<string>
    name: FormControl<string>
    email: FormControl<string>
    language: FormControl<string>
    limitAccess: FormControl<number>
    expiresAt: FormControl<Date>
    requireAuth: FormControl<boolean>
    permissions: FormControl<string | null>
    isActive: FormControl<boolean>
  }>
  protected readonly i18nLanguageText = i18nLanguageText
  private readonly userService = inject(UserService)
  private readonly sharesService = inject(SharesService)
  private readonly linksService = inject(LinksService)
  private readonly spacesService = inject(SpacesService)

  constructor() {
    // set picker expiration to current date + 1 day
    this.minDate.setDate(this.minDate.getDate() + 1)
  }

  ngOnInit() {
    if (this.link) {
      // from space or share dialog component
      this.initLink()
    } else if (this.file) {
      // from spaces browser component
      this.initFile()
    } else {
      // from links component or children dialog component
      this.initShareLink()
    }

    if (this.linkForm.value.requireAuth) {
      this.password = this.defaultPassword
    }
    if (this.linkForm.value.expiresAt) {
      this.isLinkIsExpired(this.share ? this.share.link.expiresAt : this.link.expiresAt)
    }
    this.linkForm.controls.expiresAt.valueChanges.subscribe((date: Date) => this.isLinkIsExpired(date))
  }

  onPermissionChange() {
    const perms: string = setStringPermission(this.permissions)
    this.linkForm.controls.permissions.setValue(perms)
    if (perms !== this.share.link.permissions) {
      this.linkForm.controls.permissions.markAsDirty()
    } else {
      this.linkForm.controls.permissions.markAsPristine()
    }
  }

  toggleRequireAuth() {
    this.linkForm.controls.requireAuth.setValue(!this.linkForm.value.requireAuth)
    this.linkForm.controls.requireAuth.markAsDirty()
  }

  copyToClipboard() {
    this.linksService.copyLinkToClipboard(this.share ? this.share.link.uuid : this.link.uuid)
    this.linkWasCopied = true
    this.layout.sendNotification('info', `Link copied`, this.linkForm.value.name || this.linkForm.value.shareName)
    setTimeout(() => (this.linkWasCopied = false), 3000)
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
      // share case only
      const deleteShare: Observable<void> = this.parentSpaceId
        ? this.spacesService.deleteSpaceShare(this.parentSpaceId, this.share.id)
        : this.sharesService.deleteShare(this.share.id)
      deleteShare.subscribe({
        next: () => {
          // this.loading = false
          this.layout.sendNotification('success', `Link deleted`, this.share.link.name || this.share.name)
          this.shareChange.emit(['delete', this.share as ShareLinkModel])
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => {
          this.layout.sendNotification('error', 'Delete share', this.share.name, e)
          this.layout.closeDialog()
        }
      })
      return
    }

    if (this.file?.id) {
      // create new share link
      const { link, ...share } = this.share
      const linkGuest: LinkGuest & { password: string } = {
        ...link,
        ...this.linkForm.value,
        password: this.mustIncludePassword() ? this.password : undefined
      }
      share.name = popFromObject('shareName', linkGuest)
      share.description = popFromObject('shareDescription', linkGuest)
      const linkMember: MemberModel = this.linksService.shareLinkGuestToMember(-1, -1, linkGuest)
      this.sharesService.createShare({ ...share, type: SHARE_TYPE.LINK, links: [linkMember] } as CreateOrUpdateShareDto).subscribe({
        next: (share: ShareModel) => {
          this.shareChange.emit(['add', share])
          this.layout.sendNotification('success', `Link created`, link.name || share.name)
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => {
          this.layout.sendNotification('error', 'Link error', this.share.name, e)
          this.layout.closeDialog()
        }
      })
      return
    }

    const update: CreateOrUpdateLinkDto = {}
    for (const k in this.linkForm.controls) {
      if (this.linkForm.controls[k].dirty) {
        update[k] = this.linkForm.controls[k].value
      }
    }
    if (this.mustIncludePassword()) {
      update['password'] = this.password
    }

    if (this.share?.id) {
      // update link from links component
      if (Object.keys(update).length) {
        this.linksService.updateLinkFromSpaceOrShare(this.share.link.id, this.share.id, LINK_TYPE.SHARE, update).subscribe({
          next: (link: LinkGuest) => {
            this.share.name = this.linkForm.value.shareName
            this.share.description = this.linkForm.value.shareDescription
            this.share.link = Object.assign(this.share.link, link)
            ;(this.share as ShareLinkModel).updateTimes()
            ;(this.share as ShareLinkModel).updatePermission()
            this.shareChange.emit(['update', this.share as ShareLinkModel])
            this.layout.closeDialog()
          },
          error: (e: HttpErrorResponse) => {
            this.layout.sendNotification('error', 'Link error', this.share.link.name || this.share.name, e)
            this.layout.closeDialog()
          }
        })
      }
      this.layout.closeDialog()
      return
    }

    // create or update link from shares or spaces
    // can submit empty object
    // the manager that received the update will close this dialog
    this.submitEvent.emit(update)
  }

  private initFile() {
    const fileShare: ShareModel = this.sharesService.initShareFromFile(this.userService.user, this.file, this.isSharesRepo, this.inSharesList)[0]
    this.share = {
      ...fileShare,
      link: {
        id: -1,
        userId: -1,
        uuid: '',
        isActive: true,
        requireAuth: false,
        permissions: '',
        nbAccess: 0,
        limitAccess: 0
      } as LinkGuest
    }
    this.linksService.genUUID().subscribe((uuid: string) => (this.share.link.uuid = uuid))
    this.initShareLink()
    // update permissions (text)
    this.onPermissionChange()
  }

  private initShareLink() {
    this.linkForm = new FormGroup({
      shareName: new FormControl<string>(this.share.name, Validators.required),
      shareDescription: new FormControl<string>(this.share.description || ''),
      name: new FormControl<string>(this.share.link?.name || ''),
      email: new FormControl<string>(this.share.link?.email || '', Validators.email),
      language: new FormControl<string>(this.share.link.language || null),
      limitAccess: new FormControl<number>(this.share.link.limitAccess || null),
      expiresAt: new FormControl<Date | null>(this.share.link.expiresAt || null),
      requireAuth: new FormControl<boolean>(this.share.link.requireAuth || false),
      permissions: new FormControl<string>(this.share.link.permissions),
      isActive: new FormControl<boolean>(this.share.link.isActive)
    })
    this.permissions = setAllowedBooleanPermissions(this.share.file.permissions, this.share.link.permissions, [
      SPACE_OPERATION.SHARE_INSIDE,
      SPACE_OPERATION.SHARE_OUTSIDE,
      ...(this.share.file.isDir ? [] : [SPACE_OPERATION.DELETE, SPACE_OPERATION.ADD])
    ])
  }

  private initLink() {
    this.linkForm = new FormGroup({
      shareName: new FormControl<string>(''),
      shareDescription: new FormControl<string>(''),
      name: new FormControl<string>(this.link.name || ''),
      email: new FormControl<string>(this.link.email || '', Validators.email),
      language: new FormControl<string>(this.link.language || null),
      limitAccess: new FormControl<number>(this.link.limitAccess || null),
      expiresAt: new FormControl<Date | null>(this.link.expiresAt || null),
      requireAuth: new FormControl<boolean>(this.link.requireAuth || false),
      permissions: new FormControl<string>(this.link.permissions),
      isActive: new FormControl<boolean>(this.link.isActive)
    })
    if (!this.link.id) {
      this.linkForm.controls.name.markAsDirty()
      this.linkForm.controls.isActive.markAsDirty()
    }
  }

  private isLinkIsExpired(date: Date) {
    if (date === undefined || date === null) {
      this.linkIsExpired = false
      if (date === null) return
      // change value from undefined to null
      this.linkForm.controls.expiresAt.setValue(null)
    }
    this.linkIsExpired = currentDate() >= date
  }

  private mustIncludePassword(): boolean {
    return !!this.password.length && this.password !== this.defaultPassword
  }
}
