import { HttpErrorResponse } from '@angular/common/http'
import { Component, EventEmitter, inject, Input, OnInit } from '@angular/core'
import { LucideAnchor, LucideDynamicIcon, LucideLoader, LucidePlus } from '@lucide/angular'
import { SPACE_OPERATION } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { SpaceProps } from '@sync-in-server/backend/src/applications/spaces/models/space-props.model'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { Observable } from 'rxjs'
import { SelectComponent } from '../../../../common/components/select/select.component'
import { LayoutService } from '../../../../layout/layout.service'
import { resolveFileLocation } from '../../../files/components/utils/file-location.utils'
import { mimeDirectory } from '../../../files/files.constants'
import { FileModel } from '../../../files/models/file.model'
import { UserType } from '../../../users/interfaces/user.interface'
import { UserService } from '../../../users/user.service'
import { SpaceModel, SpaceRootModel } from '../../models/space.model'
import { SpacesService } from '../../services/spaces.service'
import { SPACES_ICON } from '../../spaces.constants'
import { setBooleanPermissions } from '../../spaces.functions'
import { SpaceManageRootsComponent } from '../utils/space-manage-roots.component'

@Component({
  selector: 'app-space-anchor-file-dialog',
  imports: [LucideDynamicIcon, L10nTranslateDirective, SpaceManageRootsComponent, L10nTranslatePipe, SelectComponent],
  templateUrl: 'space-anchor-file-dialog.component.html'
})
export class SpaceAnchorFileDialogComponent implements OnInit {
  @Input({ required: true }) files: FileModel[]
  public addAnchoredFiles = new EventEmitter<{ space: SpaceModel; rootFiles: { id: number; name: string }[] }>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  protected readonly icons = { LucideAnchor, LucidePlus, LucideLoader, SPACES: SPACES_ICON.SPACES }
  protected selectedSpace: SpaceModel
  // data
  protected space: Partial<SpaceModel> = { roots: [] }
  // states
  protected submitted = false
  protected loading = false
  private readonly userService = inject(UserService)
  protected readonly user: UserType = this.userService.user
  private spacesService = inject(SpacesService)

  ngOnInit() {
    for (const f of this.files) {
      const file = { ...f, path: resolveFileLocation(f.path)?.relativePath ?? f.path }
      this.space.roots.push({
        id: f.id,
        name: f.name,
        alias: f.name,
        permissions: '',
        createdAt: new Date(),
        isRenamed: false,
        hPerms: setBooleanPermissions('', [SPACE_OPERATION.SHARE_INSIDE]),
        isDir: f.mime === mimeDirectory,
        owner: { id: this.user.id, login: this.user.login },
        file
      })
    }
  }

  onSetSpace(space: SpaceModel) {
    this.selectedSpace = space
  }

  onSearchSpaces(search: string): Observable<SpaceProps[]> {
    return this.spacesService.searchSpaces({ search: search, shareInsidePermission: true, limit: 6 })
  }

  onSubmit() {
    if (!this.selectedSpace || !this.space.roots.length) {
      return
    }
    this.loading = true
    this.submitted = true
    this.spacesService.createUserSpaceRoots(this.selectedSpace.id, this.space.roots).subscribe({
      next: (roots: SpaceRootModel[]) => {
        if (roots.length) {
          this.addAnchoredFiles.emit({
            space: this.selectedSpace,
            rootFiles: roots.map((r: SpaceRootModel) => ({ id: r.file.id, name: r.file.path.split('/').at(-1) }))
          })
        }
        this.layout.closeDialog()
      },
      error: (e: HttpErrorResponse) => {
        this.layout.sendNotification('error', 'Anchor files to a space', e.error.message)
        this.loading = false
        this.submitted = false
      }
    })
  }
}
