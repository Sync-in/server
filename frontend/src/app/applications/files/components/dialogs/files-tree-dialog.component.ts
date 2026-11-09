import { Component, EventEmitter, inject, Input, Output, signal } from '@angular/core'
import { LucideDynamicIcon, LucideFile, LucideFolderClosed } from '@lucide/angular'
import { FileTree } from '@sync-in-server/backend/src/applications/files/interfaces/file-tree.interface'
import { SPACE_OPERATION } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import type { SpaceRootProps } from '@sync-in-server/backend/src/applications/spaces/models/space-root-props.model'
import { L10nTranslateDirective } from 'angular-l10n'
import { PathSlice } from '../../../../common/pipes/path-slice'
import { LayoutService } from '../../../../layout/layout.service'
import type { FileTreeEvent } from '../../interfaces/files-dialog.interface'
import { FilesTreeComponent } from '../sidebar/files-tree.component'

export type { FileTreeEvent } from '../../interfaces/files-dialog.interface'

@Component({
  selector: 'app-files-tree-dialog',
  imports: [L10nTranslateDirective, FilesTreeComponent, LucideDynamicIcon, PathSlice],
  templateUrl: 'files-tree-dialog.component.html'
})
export class FilesTreeDialogComponent {
  @Input() currentRoots: SpaceRootProps[] = []
  @Output() submitEvent = new EventEmitter<FileTreeEvent>()
  @Input() allowSpaces = false
  @Input() toggleNodesAtStartup = true
  // sharing case
  @Input() mustHaveShareOutsidePermission = false
  protected readonly layout = inject(LayoutService)
  protected readonly icons = { LucideFile, LucideFolderClosed }
  protected readonly errorSelection = signal<string | null>(null)
  protected readonly selection = signal<FileTree | null>(null)

  onSelect(file: FileTree) {
    if (file) {
      if (this.mustHaveShareOutsidePermission) {
        if (file.permissions.indexOf(SPACE_OPERATION.SHARE_OUTSIDE) === -1) {
          this.errorSelection.set(this.layout.translateString('You do not have share permission'))
          this.selection.set(null)
          return
        }
        if (file.path.split('/').length <= 2) {
          this.errorSelection.set(this.layout.translateString('You can not share a space'))
          this.selection.set(null)
          return
        }
      }
      const fileSelected = file
      let alreadySelected = this.currentRoots.find((r) => r.file.id === fileSelected.id)
      if (alreadySelected) {
        this.errorSelection.set(this.layout.translateString('This item is already selected'))
        this.selection.set(null)
      } else {
        alreadySelected = this.currentRoots.find((r) => fileSelected.path.startsWith(r.file.path))
        if (alreadySelected) {
          this.errorSelection.set(`${this.layout.translateString('Parent item is already selected')}: ${alreadySelected.file.path}`)
          this.selection.set(null)
        } else {
          this.errorSelection.set(null)
          this.selection.set(fileSelected)
        }
      }
    } else {
      this.selection.set(null)
      this.errorSelection.set(null)
    }
  }

  onSubmit() {
    this.submitEvent.emit({
      id: this.selection()!.id,
      name: this.selection()!.name,
      path: this.selection()!.path,
      mime: this.selection()!.mime,
      permissions: this.selection()!.permissions // permissions are useful only in share case
    })
    this.layout.closeDialog()
  }
}
