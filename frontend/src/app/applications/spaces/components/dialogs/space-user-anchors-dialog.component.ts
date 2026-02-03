import { HttpErrorResponse } from '@angular/common/http'
import { Component, inject, Input, OnInit } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faAnchor, faPlus, faSpinner } from '@fortawesome/free-solid-svg-icons'
import type { SpaceRootProps } from '@sync-in-server/backend/src/applications/spaces/models/space-root-props.model'
import { L10nTranslateDirective } from 'angular-l10n'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { Subject } from 'rxjs'
import { take } from 'rxjs/operators'
import { LayoutService } from '../../../../layout/layout.service'
import { FilesTreeDialogComponent, FileTreeEvent } from '../../../files/components/dialogs/files-tree-dialog.component'
import { UserType } from '../../../users/interfaces/user.interface'
import { SpaceModel, SpaceRootModel } from '../../models/space.model'
import { SpacesService } from '../../services/spaces.service'
import { SPACES_ICON } from '../../spaces.constants'
import { SpaceManageRootsComponent } from '../utils/space-manage-roots.component'
import { ExternalFilePathEvent } from './space-root-path-dialog.component'

@Component({
  selector: 'app-space-user-anchors-dialog',
  imports: [FaIconComponent, L10nTranslateDirective, SpaceManageRootsComponent],
  templateUrl: 'space-user-anchors-dialog.component.html'
})
export class SpaceUserAnchorsDialogComponent implements OnInit {
  @Input({ required: true }) space: SpaceModel
  @Input({ required: true }) user: UserType
  protected readonly layout = inject(LayoutService)
  protected addRootFileEvent = new Subject<FileTreeEvent | ExternalFilePathEvent>()
  protected readonly icons = { faAnchor, faPlus, faSpinner, SPACES: SPACES_ICON.SPACES }
  // states
  protected submitted = false
  protected loading = false
  private readonly spacesService = inject(SpacesService)

  ngOnInit() {
    if (this.space?.roots.length) {
      // re-added after
      this.space.roots = []
    }
    this.spacesService.getUserSpaceRoots(this.space.id).subscribe({
      next: (roots: SpaceRootModel[]) => this.setSpaceRoots(roots),
      error: (e: HttpErrorResponse) => {
        this.layout.sendNotification('error', 'Manage my anchored files', e.error.message)
      }
    })
  }

  openSelectRootDialog() {
    const modalRef: BsModalRef<FilesTreeDialogComponent> = this.layout.openDialog(FilesTreeDialogComponent, 'xl', {
      initialState: {
        currentRoots: this.space.roots.filter((r: SpaceRootModel) => r.owner.id === this.user.id) as SpaceRootProps[]
      } as FilesTreeDialogComponent
    })
    modalRef.content.submitEvent.pipe(take(1)).subscribe((file: FileTreeEvent) => this.addRootFileEvent.next(file))
  }

  onSubmit() {
    this.loading = true
    this.submitted = true
    this.spacesService
      .updateUserSpaceRoots(
        this.space.id,
        this.space.roots.map(
          (r: SpaceRootModel) =>
            ({
              id: r.id,
              alias: r.alias,
              name: r.name,
              permissions: r.permissions,
              file: { id: r.file.id, path: r.file.path, mime: r.file.mime }
            }) as Partial<SpaceRootModel>
        )
      )
      .subscribe({
        next: (roots: SpaceRootModel[]) => {
          this.setSpaceRoots(roots)
          this.layout.closeDialog()
        },
        error: (e: HttpErrorResponse) => {
          this.layout.sendNotification('error', 'Manage my anchored files', e.error.message)
          this.submitted = false
          this.loading = false
        }
      })
  }

  private setSpaceRoots(roots: SpaceRootModel[]) {
    this.space.roots = []
    for (const r of roots) {
      this.space.addRoot({ ...r, owner: this.user }, true)
    }
    this.space.counts.roots = this.space.roots.length
  }
}
