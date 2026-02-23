import { HttpErrorResponse } from '@angular/common/http'
import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faCog, faPlus, faSpinner, faUsers, faUserShield } from '@fortawesome/free-solid-svg-icons'
import type { FileSpace } from '@sync-in-server/backend/src/applications/files/interfaces/file-space.interface'
import { LINK_TYPE } from '@sync-in-server/backend/src/applications/links/constants/links'
import { SPACE_ALIAS, SPACE_OPERATION } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import type { SearchMembersDto } from '@sync-in-server/backend/src/applications/users/dto/search-members.dto'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective } from 'angular-l10n'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { TabsModule } from 'ngx-bootstrap/tabs'
import { Observable } from 'rxjs'
import { take } from 'rxjs/operators'
import { StorageQuotaComponent } from '../../../../common/components/storage-quota.component'
import { StorageUsageComponent } from '../../../../common/components/storage-usage.component'
import { AutofocusDirective } from '../../../../common/directives/auto-focus.directive'
import { TimeDateFormatPipe } from '../../../../common/pipes/time-date-format.pipe'
import { pathSlice } from '../../../../common/utils/functions'
import { LayoutService } from '../../../../layout/layout.service'
import { FilesTreeDialogComponent, FileTreeEvent } from '../../../files/components/dialogs/files-tree-dialog.component'
import { FilePermissionsComponent } from '../../../files/components/utils/file-permissions.component'
import { mimeDirectory } from '../../../files/files.constants'
import { FileModel } from '../../../files/models/file.model'
import { LinksService } from '../../../links/services/links.service'
import { ExternalFilePathEvent, SpaceRootPathDialogComponent } from '../../../spaces/components/dialogs/space-root-path-dialog.component'
import { SpacesService } from '../../../spaces/services/spaces.service'
import { SPACES_ICON } from '../../../spaces/spaces.constants'
import { UserSearchComponent } from '../../../users/components/utils/user-search.component'
import { MemberModel } from '../../../users/models/member.model'
import { UserService } from '../../../users/user.service'
import { ShareModel } from '../../models/share.model'
import { SharesService } from '../../services/shares.service'
import { ShareFileNameComponent } from '../utils/share-file-name.component'
import { ShareRepositoryComponent } from '../utils/share-repository.component'

@Component({
  selector: 'app-share-dialog',
  imports: [
    FaIconComponent,
    L10nTranslateDirective,
    TimeDateFormatPipe,
    TabsModule,
    AutofocusDirective,
    ReactiveFormsModule,
    FormsModule,
    UserSearchComponent,
    ShareRepositoryComponent,
    ShareFileNameComponent,
    FilePermissionsComponent,
    StorageQuotaComponent,
    StorageUsageComponent
  ],
  templateUrl: 'share-dialog.component.html'
})
export class ShareDialogComponent implements OnInit {
  @Input() share: ShareModel
  @Input() file: FileSpace & Pick<FileModel, 'root'>
  @Input() parentShareId: number = null
  @Input() parentSpaceId: number = null
  @Input() isSharesRepo = false
  @Input() inSharesList = false
  @Input() allowFilesOptions = true
  @Output() shareChange = new EventEmitter<['add' | 'update' | 'delete', ShareModel]>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  protected readonly icons = {
    SHARED: SPACES_ICON.SHARED_WITH_OTHERS,
    SHARES: SPACES_ICON.SHARES,
    LINKS: SPACES_ICON.LINKS,
    faPlus,
    faSpinner,
    faUserShield,
    faUsers,
    faCog
  }
  protected tabView: undefined | 'members' | 'links'
  protected allowedPermissions: Partial<`${SPACE_OPERATION}`>[] = []
  protected confirmDeletion = false
  protected loading = false
  protected submitted = false
  private readonly userService = inject(UserService)
  protected readonly user = this.userService.user
  private readonly sharesService = inject(SharesService)
  private readonly linksService = inject(LinksService)
  private readonly spacesService = inject(SpacesService)

  ngOnInit() {
    if (!this.share) {
      // new share
      ;[this.share, this.parentShareId] = this.sharesService.initShareFromFile(this.user, this.file, this.isSharesRepo, this.inSharesList)
    }
    this.allowedPermissions = Object.keys(this.share.hPerms) as `${SPACE_OPERATION}`[]
  }

  searchMembers(query: string): Observable<MemberModel[]> {
    const search: SearchMembersDto = {
      search: query,
      ignoreUserIds: [
        this.user.id,
        ...(this.share.parent?.ownerId ? [this.share.parent.ownerId] : []),
        ...this.share.members.filter((m: MemberModel) => m.isUser).map((m: MemberModel) => m.id)
      ],
      ignoreGroupIds: this.share.members.filter((m: MemberModel) => m.isGroup).map((m: MemberModel) => m.id)
    }
    return this.userService.searchMembers(search, [SPACE_OPERATION.SHARE_INSIDE])
  }

  openSelectRootDialog() {
    const modalRef: BsModalRef<FilesTreeDialogComponent> = this.layout.openDialog(FilesTreeDialogComponent, 'xl', {
      initialState: {
        toggleNodesAtStartup: false,
        allowSpaces: true,
        mustHaveShareOutsidePermission: true
      } as FilesTreeDialogComponent
    })
    modalRef.content.submitEvent.pipe(take(1)).subscribe((file: FileTreeEvent) => {
      const fileSplit: string[] = file.path.split('/')
      const f: FileSpace = {
        id: file.id,
        name: file.name,
        path: pathSlice(file.path, 2),
        permissions: file.permissions,
        mime: file.mime,
        ownerId: fileSplit[1] === SPACE_ALIAS.PERSONAL ? this.user.id : null,
        inTrash: false,
        isDir: file.mime === mimeDirectory,
        space: { alias: fileSplit[1], name: fileSplit[1], root: { alias: '', name: '' } }
      }
      const share = { ...this.share, file: f, externalPath: null }
      share.name = share.file.name
      this.share = new ShareModel(share)
      this.allowedPermissions = Object.keys(this.share.hPerms) as `${SPACE_OPERATION}`[]
    })
  }

  openAdminRootDialog() {
    const modalRef: BsModalRef<SpaceRootPathDialogComponent> = this.layout.openDialog(SpaceRootPathDialogComponent, null, {
      initialState: { withRootName: false } as SpaceRootPathDialogComponent
    })
    modalRef.content.submitEvent.pipe(take(1)).subscribe((file: ExternalFilePathEvent) => {
      const share = { ...this.share, file: null, externalPath: file.externalPath, name: file.externalPath.split('/').at(-1) }
      this.share = new ShareModel(share)
      this.allowedPermissions = Object.keys(this.share.hPerms) as `${SPACE_OPERATION}`[]
    })
  }

  openEditLinkDialog(member: MemberModel) {
    this.linksService.editLinkDialog(member, this.share, LINK_TYPE.SHARE)
  }

  openCreateLinkDialog() {
    this.linksService.createLinkDialog(this.share)
  }

  setShareStatus(status: boolean) {
    this.share.enabled = status
    this.share.disabledAt = status ? null : new Date()
  }

  cantSubmit() {
    return this.submitted || (!this.share.externalPath && !this.share.file)
  }

  onSubmit() {
    this.loading = true
    this.submitted = true
    if (this.confirmDeletion) {
      // delete
      const deleteShare: Observable<void> = this.parentShareId
        ? this.sharesService.deleteShareChild(this.parentShareId, this.share.id)
        : this.parentSpaceId
          ? this.spacesService.deleteSpaceShare(this.parentSpaceId, this.share.id)
          : this.sharesService.deleteShare(this.share.id)
      deleteShare.subscribe({
        next: () => {
          this.loading = false
          this.shareChange.emit(['delete', this.share])
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => {
          this.onError()
          this.layout.sendNotification('error', 'Delete share', this.share.name, e)
        }
      })
    } else if (this.share.id === 0) {
      // create
      this.sharesService.createShare(this.share).subscribe({
        next: (share: ShareModel) => {
          this.loading = false
          this.share = share
          this.shareChange.emit(['add', share])
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => {
          this.onError()
          this.layout.sendNotification('error', 'Create share', this.share.name, e)
        }
      })
    } else {
      // update
      const updateShare: Observable<ShareModel> = this.parentShareId
        ? this.sharesService.updateShareChild(this.parentShareId, this.share.id, this.share)
        : this.parentSpaceId
          ? this.spacesService.updateSpaceShare(this.parentSpaceId, this.share)
          : this.sharesService.updateShare(this.share)
      updateShare.subscribe({
        next: (share: ShareModel) => {
          this.loading = false
          this.share = share
          this.shareChange.emit(['update', share])
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => {
          this.onError()
          this.layout.sendNotification('error', 'Edit share', this.share.name, e)
        }
      })
    }
  }

  onCancel() {
    if (this.confirmDeletion) {
      this.confirmDeletion = false
    } else {
      this.layout.closeDialog()
    }
  }

  private onError() {
    this.confirmDeletion = false
    this.submitted = false
    this.loading = false
  }
}
