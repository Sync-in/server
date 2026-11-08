import { HttpErrorResponse } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, HostListener, inject, Input, OnInit, signal } from '@angular/core'
import { LucideDynamicIcon, LucideLock, LucideLockOpen } from '@lucide/angular'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective } from 'angular-l10n'
import { firstValueFrom } from 'rxjs'
import { LayoutService } from '../../../../layout/layout.service'
import { StoreService } from '../../../../store/store.service'
import { SpacesBrowserService } from '../../../spaces/services/spaces-browser.service'
import { userAvatarUrl } from '../../../users/user.functions'
import { FileModel } from '../../models/file.model'
import { FilesService } from '../../services/files.service'
import { FileLockFormatPipe } from '../utils/file-lock.utils'

@Component({
  selector: 'app-files-lock-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon, L10nTranslateDirective, FileLockFormatPipe],
  templateUrl: 'files-lock-dialog.component.html'
})
export class FilesLockDialogComponent implements OnInit {
  @Input({ required: true }) file: FileModel
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected layout = inject(LayoutService)
  protected readonly icons = { LucideLock, LucideLockOpen }
  protected readonly submitted = signal(false)
  protected readonly store = inject(StoreService)
  private readonly spacesBrowserService = inject(SpacesBrowserService)
  private readonly filesService = inject<FilesService>(FilesService)
  protected readonly userLogin = this.store.user().login
  protected readonly hasExclusiveLock = signal(true)
  protected readonly isFileOwner = signal(false)
  protected readonly isLockOwner = signal(false)
  protected readonly userAvatarUrl = signal('')
  protected readonly canUnlock = computed(() => this.isLockOwner() || this.isFileOwner())
  protected readonly canRequestUnlock = computed(() => this.hasExclusiveLock() && !this.isLockOwner())
  protected readonly hasAction = computed(() => this.canUnlock() || this.canRequestUnlock())

  ngOnInit() {
    this.hasExclusiveLock.set(this.file.lock.isExclusive)
    this.isFileOwner.set(this.spacesBrowserService.inPersonalSpace || this.file.root?.owner?.login === this.userLogin)
    this.isLockOwner.set(this.file.lock.owner.login === this.userLogin)
    this.userAvatarUrl.set(userAvatarUrl(this.file.lock.owner.login))
  }

  @HostListener('document:keyup.enter')
  async onEnter() {
    if (this.canUnlock()) {
      await this.onUnlock()
    } else if (this.canRequestUnlock()) {
      this.onSendUnLockRequest()
    } else {
      this.layout.closeDialog()
    }
  }

  @HostListener('document:keyup.escape')
  onEsc() {
    this.layout.closeDialog()
  }

  async onUnlock() {
    try {
      this.submitted.set(true)
      await firstValueFrom(this.filesService.unlock(this.file, this.isFileOwner()))
      this.file.removeLock()
      this.filesService.notifyFileLockChange(this.file)
      this.store.filesSelection.update((files) => [...files])
      this.layout.closeDialog()
    } catch (e: any) {
      this.submitted.set(false)
      this.layout.sendNotification('warning', this.file.name, e.error.message)
    }
  }

  onSendUnLockRequest() {
    this.submitted.set(true)
    this.filesService.unlockRequest(this.file).subscribe({
      next: () => this.layout.closeDialog(),
      error: (e: HttpErrorResponse) => {
        this.submitted.set(false)
        this.layout.sendNotification('warning', this.file.name, e.error.message)
      }
    })
  }
}
