import { HttpErrorResponse } from '@angular/common/http'
import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faAnchor, faCog, faPen, faPlus, faSpinner, faUsers, faUserShield } from '@fortawesome/free-solid-svg-icons'
import { LINK_TYPE } from '@sync-in-server/backend/src/applications/links/constants/links'
import { SPACE_MAX_DISABLED_DAYS, SPACE_OPERATION, SPACE_ROLE } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { SpaceProps } from '@sync-in-server/backend/src/applications/spaces/models/space-props.model'
import type { SpaceRootProps } from '@sync-in-server/backend/src/applications/spaces/models/space-root-props.model'
import type { SearchMembersDto } from '@sync-in-server/backend/src/applications/users/dto/search-members.dto'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective } from 'angular-l10n'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { TabsModule } from 'ngx-bootstrap/tabs'
import { Observable, Subject } from 'rxjs'
import { take } from 'rxjs/operators'
import { StorageQuotaComponent } from '../../../../common/components/storage-quota.component'
import { StorageUsageComponent } from '../../../../common/components/storage-usage.component'
import { AutofocusDirective } from '../../../../common/directives/auto-focus.directive'
import { TimeAddPipe } from '../../../../common/pipes/time-add.pipe'
import { TimeAgoPipe } from '../../../../common/pipes/time-ago.pipe'
import { TimeDateFormatPipe } from '../../../../common/pipes/time-date-format.pipe'
import { TimeDurationPipe } from '../../../../common/pipes/time-duration.pipe'
import { LayoutService } from '../../../../layout/layout.service'
import { FilesTreeDialogComponent, FileTreeEvent } from '../../../files/components/dialogs/files-tree-dialog.component'
import { LinksService } from '../../../links/services/links.service'
import { UserSearchComponent } from '../../../users/components/utils/user-search.component'
import { UserType } from '../../../users/interfaces/user.interface'
import { MemberModel, ownerToMember } from '../../../users/models/member.model'
import { UserService } from '../../../users/user.service'
import { SpaceModel, SpaceRootModel } from '../../models/space.model'
import { SpacesService } from '../../services/spaces.service'
import { SPACES_ICON } from '../../spaces.constants'
import { SpaceManageRootsComponent } from '../utils/space-manage-roots.component'
import { ExternalFilePathEvent, SpaceRootPathDialogComponent } from './space-root-path-dialog.component'

@Component({
  selector: 'app-space-dialog',
  imports: [
    L10nTranslateDirective,
    TimeAgoPipe,
    TimeAddPipe,
    TimeDurationPipe,
    TimeDateFormatPipe,
    FaIconComponent,
    TabsModule,
    FormsModule,
    AutofocusDirective,
    StorageQuotaComponent,
    UserSearchComponent,
    SpaceManageRootsComponent,
    StorageUsageComponent
  ],
  templateUrl: 'space-dialog.component.html'
})
export class SpaceDialogComponent implements OnInit {
  @Input({ required: true }) space: SpaceModel = new SpaceModel({
    id: 0,
    name: '',
    createdAt: new Date(),
    enabled: true,
    storageUsage: 0,
    storageQuota: null
  } as SpaceProps)
  @Output() spaceChange = new EventEmitter<['add' | 'update' | 'delete', SpaceModel]>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  protected readonly icons = {
    SPACES: SPACES_ICON.SPACES,
    LINKS: SPACES_ICON.LINKS,
    faPen,
    faAnchor,
    faUserShield,
    faPlus,
    faSpinner,
    faCog,
    faUsers
  }
  protected readonly SPACE_MAX_DISABLED_DAYS = SPACE_MAX_DISABLED_DAYS
  // states
  protected addRootFileEvent = new Subject<FileTreeEvent | ExternalFilePathEvent>()
  protected tabView: undefined | 'roots' | 'members' | 'links'
  protected allowedLinkPermissions: SPACE_OPERATION[] = [SPACE_OPERATION.ADD, SPACE_OPERATION.DELETE, SPACE_OPERATION.MODIFY]
  protected editManagers = false
  protected confirmDeletion = false
  protected loading = false
  protected submitted = false
  private readonly userService = inject(UserService)
  protected readonly user: UserType = this.userService.user
  private readonly spacesService = inject(SpacesService)
  private readonly linksService = inject(LinksService)

  ngOnInit() {
    if (!this.space.id) {
      this.space.managers.unshift(ownerToMember(this.user, SPACE_ROLE.IS_MANAGER))
    }
  }

  searchManagers(query: string): Observable<MemberModel[]> {
    const search: SearchMembersDto = {
      search: query,
      ignoreUserIds: [
        ...this.space.managers.map((m: MemberModel) => m.id),
        ...this.space.members.filter((m: MemberModel) => m.isUser).map((m: MemberModel) => m.id)
      ],
      onlyUsers: true
    }
    return this.userService.searchMembers(search)
  }

  searchMembers(query: string): Observable<MemberModel[]> {
    const search: SearchMembersDto = {
      search: query,
      ignoreUserIds: [
        ...this.space.managers.map((m: MemberModel) => m.id),
        ...this.space.members.filter((m: MemberModel) => m.isUser).map((m: MemberModel) => m.id)
      ],
      ignoreGroupIds: this.space.members.filter((m: MemberModel) => m.isGroup).map((m: MemberModel) => m.id)
    }
    return this.userService.searchMembers(search)
  }

  openSelectRootDialog() {
    const modalRef: BsModalRef<FilesTreeDialogComponent> = this.layout.openDialog(FilesTreeDialogComponent, 'xl', {
      initialState: {
        currentRoots: this.space.roots.filter((r: SpaceRootModel) => r.owner.id === this.user.id) as SpaceRootProps[]
      } as FilesTreeDialogComponent
    })
    modalRef.content.submitEvent.pipe(take(1)).subscribe((file: FileTreeEvent) => this.addRootFileEvent.next(file))
  }

  openAdminRootDialog() {
    const modalRef: BsModalRef<SpaceRootPathDialogComponent> = this.layout.openDialog(SpaceRootPathDialogComponent, null, {
      initialState: { currentRoots: this.space.roots.filter((r: SpaceRootModel) => r.externalPath) } as SpaceRootPathDialogComponent
    })
    modalRef.content.submitEvent.pipe(take(1)).subscribe((file: ExternalFilePathEvent) => this.addRootFileEvent.next(file))
  }

  openEditLinkDialog(member: MemberModel) {
    this.linksService.editLinkDialog(member, this.space, LINK_TYPE.SPACE)
  }

  openCreateLinkDialog() {
    this.linksService.createLinkDialog(this.space)
  }

  setSpaceStatus(status: boolean) {
    this.space.enabled = status
    this.space.disabledAt = status ? null : new Date()
  }

  toggleSpaceStatusFromCard() {
    this.setSpaceStatus(!this.space.enabled)
  }

  toggleFullTextSearchFromCard() {
    this.space.storageIndexing = !this.space.storageIndexing
  }

  onCancel() {
    if (this.confirmDeletion) {
      this.confirmDeletion = false
    } else {
      this.layout.closeDialog()
    }
  }

  onSubmit() {
    this.loading = true
    this.submitted = true
    if (this.confirmDeletion) {
      if (this.space.id === 0) {
        this.layout.closeDialog()
      }
      this.spacesService.deleteSpace(this.space.id, { deleteNow: true }).subscribe({
        next: () => {
          this.loading = false
          this.spaceChange.emit(['delete', this.space])
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => {
          this.onError()
          this.layout.sendNotification('error', 'Delete space', this.space.name, e)
        }
      })
    } else {
      if (this.space.id === 0) {
        this.spacesService.createSpace(this.space).subscribe({
          next: (space: SpaceModel) => {
            this.loading = false
            this.space = space
            this.spaceChange.emit(['add', space])
            this.layout.closeDialog()
          },
          error: (e: HttpErrorResponse) => {
            this.onError()
            this.layout.sendNotification('error', 'Create space', this.space.name, e)
          }
        })
      } else {
        this.spacesService.updateSpace(this.space).subscribe({
          next: (space: SpaceModel) => {
            this.loading = false
            if (space) {
              this.space = space
              this.spaceChange.emit(['update', space])
            } else {
              this.spaceChange.emit(['delete', this.space])
            }
            this.layout.closeDialog()
          },
          error: (e: HttpErrorResponse) => {
            this.onError()
            this.layout.sendNotification('error', 'Edit space', this.space.name, e)
          }
        })
      }
    }
  }

  cantSubmit() {
    return this.submitted || !this.space.name || !this.space.managers.length
  }

  private onError() {
    this.confirmDeletion = false
    this.submitted = false
    this.loading = false
  }
}
