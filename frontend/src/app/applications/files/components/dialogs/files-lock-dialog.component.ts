/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpErrorResponse } from '@angular/common/http'
import { Component, HostListener, inject, Input, OnInit } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faLock, faUnlock } from '@fortawesome/free-solid-svg-icons'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { firstValueFrom } from 'rxjs'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { SpacesBrowserService } from '../../../spaces/services/spaces-browser.service'
import { userAvatarUrl } from '../../../users/user.functions'
import { FileModel } from '../../models/file.model'
import { FilesService } from '../../services/files.service'

@Component({
  selector: 'app-files-lock-dialog',
  imports: [FaIconComponent, L10nTranslateDirective, L10nTranslatePipe],
  templateUrl: 'files-lock-dialog.component.html'
})
export class FilesLockDialogComponent implements OnInit {
  @Input({ required: true }) file: FileModel
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected layout = inject(LayoutService)
  protected readonly icons = { faLock, faUnlock }
  protected submitted = false
  protected readonly store = inject(StoreService)
  protected readonly userLogin = this.store.user.getValue().login
  protected isFileOwner = false
  protected isLockOwner = false
  protected hasExclusiveLock = true
  protected userAvatarUrl: string
  private readonly spacesBrowserService = inject(SpacesBrowserService)
  private readonly filesService = inject<FilesService>(FilesService)

  ngOnInit() {
    this.hasExclusiveLock = this.file.lock.isExclusive
    this.isFileOwner = this.spacesBrowserService.inPersonalSpace || this.file.root?.owner?.login === this.userLogin
    this.isLockOwner = this.file.lock.ownerLogin === this.userLogin
    this.userAvatarUrl = userAvatarUrl(this.file.lock.ownerLogin)
  }

  @HostListener('document:keyup.enter')
  async onEnter() {
    if (this.isLockOwner || this.isFileOwner) {
      await this.onUnlock()
    } else {
      this.onSendUnLockRequest()
    }
  }

  @HostListener('document:keyup.escape')
  onEsc() {
    this.layout.closeDialog()
  }

  async onUnlock() {
    try {
      this.submitted = true
      await firstValueFrom(this.filesService.unlock(this.file, this.isFileOwner))
      this.file.removeLock()
      this.layout.closeDialog()
    } catch (e: any) {
      this.submitted = false
      this.layout.sendNotification('warning', this.file.name, e.error.message)
    }
  }

  onSendUnLockRequest() {
    this.submitted = true
    this.filesService.unlockRequest(this.file).subscribe({
      next: () => this.layout.closeDialog(),
      error: (e: HttpErrorResponse) => {
        this.submitted = false
        this.layout.sendNotification('warning', this.file.name, e.error.message)
      }
    })
  }
}
