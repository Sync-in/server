import { HttpErrorResponse } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, inject, Input, OnInit, output, signal } from '@angular/core'
import { LucideAnchor, LucideDynamicIcon, LucideLoader, LucidePlus } from '@lucide/angular'
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon, L10nTranslateDirective, SpaceManageRootsComponent],
  templateUrl: 'space-user-anchors-dialog.component.html'
})
export class SpaceUserAnchorsDialogComponent implements OnInit {
  @Input({ required: true }) space: SpaceModel
  @Input({ required: true }) user: UserType
  readonly rootsChange = output<SpaceModel>()
  protected readonly layout = inject(LayoutService)
  protected readonly addRootFileEvent = new Subject<FileTreeEvent | ExternalFilePathEvent>()
  protected readonly icons = { LucideAnchor, LucidePlus, LucideLoader, SPACES: SPACES_ICON.SPACES }
  // states
  protected readonly submitted = signal(false)
  protected readonly loading = signal(false)
  protected readonly roots = signal<SpaceRootModel[]>([])
  private readonly spacesService = inject(SpacesService)

  ngOnInit() {
    if (this.space?.roots.length) {
      // re-added after
      this.space.roots = []
    }
    this.roots.set(this.space.roots)
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
        currentRoots: this.roots().filter((root: SpaceRootModel) => root.owner.id === this.user.id) as SpaceRootProps[]
      } as FilesTreeDialogComponent
    })
    modalRef.content.submitEvent.pipe(take(1)).subscribe((file: FileTreeEvent) => this.addRootFileEvent.next(file))
  }

  onSubmit() {
    this.loading.set(true)
    this.submitted.set(true)
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
          this.submitted.set(false)
          this.loading.set(false)
        }
      })
  }

  private setSpaceRoots(roots: SpaceRootModel[]) {
    this.space.roots = []
    for (const root of roots) {
      this.space.addRoot({ ...root, owner: this.user }, true)
    }
    this.space.counts.roots = this.space.roots.length
    this.roots.set([...this.space.roots])
    this.rootsChange.emit(this.space)
  }
}
