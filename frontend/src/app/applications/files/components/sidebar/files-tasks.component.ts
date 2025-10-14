/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, inject, OnDestroy } from '@angular/core'
import { Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faClock, faFile, faFileArchive, faFolderClosed, faTrashCan } from '@fortawesome/free-regular-svg-icons'
import {
  faArrowsAlt,
  faCheck,
  faClone,
  faExclamation,
  faFileArrowDown,
  faFlag,
  faGlobe,
  faSpinner,
  faTrashAlt
} from '@fortawesome/free-solid-svg-icons'
import { FILE_OPERATION } from '@sync-in-server/backend/src/applications/files/constants/operations'
import { FileTask } from '@sync-in-server/backend/src/applications/files/models/file-task'
import { L10N_LOCALE, L10nLocale, L10nTranslatePipe } from 'angular-l10n'
import { ProgressbarComponent } from 'ngx-bootstrap/progressbar'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { Subscription } from 'rxjs'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { TimeAgoPipe } from '../../../../common/pipes/time-ago.pipe'
import { ToBytesPipe } from '../../../../common/pipes/to-bytes.pipe'
import { StoreService } from '../../../../store/store.service'
import { SPACES_PATH } from '../../../spaces/spaces.constants'
import { FilesTasksService } from '../../services/files-tasks.service'
import { FilesService } from '../../services/files.service'

@Component({
  selector: 'app-files-tasks',
  imports: [FaIconComponent, L10nTranslatePipe, AutoResizeDirective, TooltipModule, ProgressbarComponent, TimeAgoPipe, ToBytesPipe],
  templateUrl: 'files-tasks.component.html'
})
export class FilesTasksComponent implements OnDestroy {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly icons = { faTrashAlt, faFlag, faClock, faFile, faFolderClosed }
  protected readonly iconsStatus: IconDefinition[] = [faSpinner, faCheck, faExclamation]
  protected readonly iconsOperation = {
    [FILE_OPERATION.DELETE]: faTrashCan,
    [FILE_OPERATION.MOVE]: faArrowsAlt,
    [FILE_OPERATION.COPY]: faClone,
    [FILE_OPERATION.DOWNLOAD]: faGlobe,
    [FILE_OPERATION.UPLOAD]: faFileArrowDown,
    [FILE_OPERATION.COMPRESS]: faFileArchive,
    [FILE_OPERATION.DECOMPRESS]: faFileArchive
  } as const
  protected nbActiveTasks = 0
  protected nbEndedTasks = 0
  protected nbTotalTasks = 0
  protected tasks: FileTask[] = []
  private readonly router = inject(Router)
  private readonly store = inject(StoreService)
  private readonly filesService = inject(FilesService)
  private readonly filesTasksService = inject(FilesTasksService)
  private subscriptions: Subscription[] = []

  constructor() {
    this.subscriptions.push(this.store.filesActiveTasks.subscribe((tasks: FileTask[]) => this.updateTasks(tasks, true)))
    this.subscriptions.push(this.store.filesEndedTasks.subscribe((tasks: FileTask[]) => this.updateTasks(tasks, false)))
  }

  ngOnDestroy() {
    this.subscriptions.forEach((s) => s.unsubscribe())
  }

  updateTasks(tasks: any[], active = false) {
    if (active) {
      this.tasks = [...tasks, ...this.store.filesEndedTasks.getValue()]
      this.nbActiveTasks = tasks.length
      this.nbEndedTasks = this.store.filesEndedTasks.getValue().length
    } else {
      this.tasks = [...this.store.filesActiveTasks.getValue(), ...tasks]
      this.nbEndedTasks = tasks.length
      this.nbActiveTasks = this.store.filesActiveTasks.getValue().length
    }
    this.nbTotalTasks = this.nbActiveTasks + this.nbEndedTasks
  }

  removeTasks() {
    this.filesTasksService.removeAll()
  }

  goToFile(task: FileTask) {
    if (task.status === 1) {
      if (task.type === FILE_OPERATION.COMPRESS && task.props.compressInDirectory === false) {
        this.filesService.downloadTaskArchive(task.id)
        return
      } else if (task.type === FILE_OPERATION.DELETE) {
        if (task.path.startsWith(SPACES_PATH.FILES)) {
          task.path = task.path.replace(SPACES_PATH.FILES, SPACES_PATH.TRASH)
        } else if (task.path.startsWith(SPACES_PATH.SHARES)) {
          // cannot access to the space referenced by the share
          return
        }
      }
      this.router.navigate([`${SPACES_PATH.SPACES}/${task.path}`], { queryParams: { select: task.name } }).catch(console.error)
    }
  }
}
