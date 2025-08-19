/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, EventEmitter, inject, Input, Output } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faFile, faFolderClosed } from '@fortawesome/free-regular-svg-icons'
import { FileTree } from '@sync-in-server/backend/src/applications/files/interfaces/file-tree.interface'
import { SPACE_OPERATION } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import type { SpaceRootProps } from '@sync-in-server/backend/src/applications/spaces/models/space-root-props.model'
import { L10nTranslateDirective } from 'angular-l10n'
import { PathSlice } from '../../../../common/pipes/path-slice'
import { LayoutService } from '../../../../layout/layout.service'
import { FilesTreeComponent } from '../sidebar/files-tree.component'

export interface FileTreeEvent {
  id: number
  name: string
  path: string
  mime: string
  permissions?: string
}

@Component({
  selector: 'app-files-tree-dialog',
  imports: [L10nTranslateDirective, FilesTreeComponent, FaIconComponent, PathSlice],
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
  protected readonly icons = { faFile, faFolderClosed }
  protected errorSelection = null
  protected selection: FileTree = null

  onSelect(file: FileTree) {
    if (file) {
      if (this.mustHaveShareOutsidePermission) {
        if (file.permissions.indexOf(SPACE_OPERATION.SHARE_OUTSIDE) === -1) {
          this.errorSelection = this.layout.translateString('You do not have share permission')
          this.selection = null
          return
        }
        if (file.path.split('/').length <= 2) {
          this.errorSelection = this.layout.translateString('You can not share a space')
          this.selection = null
          return
        }
      }
      const fileSelected = file
      let alreadySelected = this.currentRoots.find((r) => r.file.id === fileSelected.id)
      if (alreadySelected) {
        this.errorSelection = this.layout.translateString('This item is already selected')
        this.selection = null
      } else {
        alreadySelected = this.currentRoots.find((r) => fileSelected.path.startsWith(r.file.path))
        if (alreadySelected) {
          this.errorSelection = `${this.layout.translateString('Parent item is already selected')}: ${alreadySelected.file.path}`
          this.selection = null
        } else {
          this.errorSelection = null
          this.selection = fileSelected
        }
      }
    } else {
      this.selection = null
      this.errorSelection = null
    }
  }

  onSubmit() {
    this.submitEvent.emit({
      id: this.selection.id,
      name: this.selection.name,
      path: this.selection.path,
      mime: this.selection.mime,
      permissions: this.selection.permissions // permissions are useful only in share case
    })
    this.layout.closeDialog()
  }
}
