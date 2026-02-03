import { KeyValuePipe } from '@angular/common'
import { Component, ElementRef, inject, Input, OnDestroy, OnInit, ViewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faPen, faTimes } from '@fortawesome/free-solid-svg-icons'
import { createSlug, regExpNumberSuffix } from '@sync-in-server/backend/src/common/shared'
import { L10N_LOCALE, L10nLocale, L10nTranslatePipe } from 'angular-l10n'
import { ButtonsModule } from 'ngx-bootstrap/buttons'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { Subject, Subscription } from 'rxjs'
import { InputEditDirective } from '../../../../common/directives/input-edit.directive'
import { PathSlice } from '../../../../common/pipes/path-slice'
import { TimeAgoPipe } from '../../../../common/pipes/time-ago.pipe'
import { originalOrderKeyValue, uniqueNameFromCollection } from '../../../../common/utils/functions'
import { FileTreeEvent } from '../../../files/components/dialogs/files-tree-dialog.component'
import { UserAvatarComponent } from '../../../users/components/utils/user-avatar.component'
import { OwnerType } from '../../../users/interfaces/owner.interface'
import { UserType } from '../../../users/interfaces/user.interface'
import { SpaceModel, SpaceRootModel } from '../../models/space.model'
import { SPACES_PERMISSIONS_TEXT } from '../../spaces.constants'
import { setStringPermission } from '../../spaces.functions'
import { ExternalFilePathEvent } from '../dialogs/space-root-path-dialog.component'

@Component({
  selector: 'app-space-manage-roots',
  imports: [
    ButtonsModule,
    FaIconComponent,
    KeyValuePipe,
    L10nTranslatePipe,
    TimeAgoPipe,
    UserAvatarComponent,
    TooltipModule,
    FormsModule,
    InputEditDirective,
    PathSlice
  ],
  templateUrl: 'space-manage-roots.component.html'
})
export class SpaceManageRootsComponent implements OnInit, OnDestroy {
  @ViewChild('InputRename') inputRename: ElementRef
  @Input({ required: true }) space: Partial<SpaceModel>
  @Input({ required: true }) user: UserType
  @Input() showInfo = true
  @Input() showUsers = true
  @Input() addRootFile: Subject<FileTreeEvent | ExternalFilePathEvent> = null
  protected locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly icons = { faTimes, faPen }
  protected readonly SPACES_PERMISSIONS_TEXT = SPACES_PERMISSIONS_TEXT
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  private subscription: Subscription = null

  ngOnInit() {
    if (this.addRootFile) {
      this.subscription = this.addRootFile.subscribe((file: FileTreeEvent | ExternalFilePathEvent) => this.addRoot(file))
    }
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe()
    }
  }

  addRoot(file: FileTreeEvent | ExternalFilePathEvent | any) {
    const root: Partial<SpaceRootModel> = {
      id: 0,
      alias: uniqueNameFromCollection(file.name, 'alias', this.space.roots).toLowerCase(),
      name: uniqueNameFromCollection(file.name, 'name', this.space.roots),
      permissions: '',
      createdAt: new Date()
    }
    if (file.externalPath) {
      // ExternalFilePathEvent
      root.externalPath = file.externalPath
      root.owner = { id: null, login: null, email: null, fullName: null } as OwnerType
      root.file = { id: 0, path: null, mime: null } as FileTreeEvent
    } else {
      // FileTreeEvent
      root.externalPath = null
      root.owner = { id: this.user.id, login: this.user.login, email: this.user.email, fullName: this.user.fullName } as OwnerType
      root.file = { id: file.id, path: file.path, mime: file.mime } as FileTreeEvent
    }
    this.space.addRoot(root, true)
  }

  removeRoot(root: SpaceRootModel) {
    this.space.roots = this.space.roots.filter((r: SpaceRootModel) => root.alias !== r.alias)
  }

  onRenameRoot(ev: { object: SpaceRootModel; name: string }): void {
    const spaceRoot: SpaceRootModel = ev.object
    spaceRoot.alias = uniqueNameFromCollection(
      createSlug(ev.name, true),
      'alias',
      this.space.roots.filter((r: SpaceRootModel) => r.id !== spaceRoot.id)
    ).toLowerCase()
    spaceRoot.name = uniqueNameFromCollection(
      ev.name.replace(regExpNumberSuffix, ''),
      'name',
      this.space.roots.filter((r: SpaceRootModel) => r.id !== spaceRoot.id)
    )
  }

  onPermissionChange(root: SpaceRootModel) {
    root.permissions = setStringPermission(root.hPerms)
  }

  setRenamed(root: SpaceRootModel) {
    if (root.isRenamed) {
      this.onRenameRoot({ object: root, name: this.inputRename.nativeElement.value })
      root.isRenamed = false
    } else {
      root.isRenamed = true
    }
  }
}
