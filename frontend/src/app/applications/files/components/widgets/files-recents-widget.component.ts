/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, computed, inject, Signal } from '@angular/core'
import { Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faFileLines } from '@fortawesome/free-regular-svg-icons'
import { faMagnifyingGlassMinus, faMagnifyingGlassPlus, faTrashAlt } from '@fortawesome/free-solid-svg-icons'
import { L10nTranslateDirective } from 'angular-l10n'
import { TimeAgoPipe } from '../../../../common/pipes/time-ago.pipe'
import { StoreService } from '../../../../store/store.service'
import { SPACES_PATH } from '../../../spaces/spaces.constants'
import { FileRecentModel } from '../../models/file-recent.model'
import { FilesService } from '../../services/files.service'

@Component({
  selector: 'app-files-recents-widget',
  imports: [L10nTranslateDirective, FaIconComponent, TimeAgoPipe],
  templateUrl: './files-recents-widget.component.html'
})
export class FilesRecentsWidgetComponent {
  private readonly router = inject(Router)
  private readonly store = inject(StoreService)
  private readonly filesService = inject(FilesService)
  private nbInitialFiles = 10
  private nbFiles = this.nbInitialFiles
  protected moreElements = false
  protected files: Signal<FileRecentModel[]> = computed(() => this.store.filesRecents().slice(0, this.nbFiles))
  protected readonly icons = { faFileLines, faMagnifyingGlassPlus, faMagnifyingGlassMinus, faTrashAlt }

  constructor() {
    this.load()
  }

  private load() {
    this.filesService.loadRecents(this.nbFiles)
  }

  switchMore() {
    if (this.moreElements) {
      this.moreElements = false
      this.nbFiles = this.nbInitialFiles
    } else {
      this.moreElements = true
      this.nbFiles *= 5
    }
    this.load()
  }

  goToFile(f: FileRecentModel) {
    this.router.navigate([SPACES_PATH.SPACES, ...f.path.split('/')], { queryParams: { select: f.name } }).catch(console.error)
  }
}
