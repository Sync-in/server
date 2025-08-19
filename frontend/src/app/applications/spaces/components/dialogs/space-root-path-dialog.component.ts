/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, EventEmitter, HostListener, inject, Input, OnInit, Output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faFolderClosed } from '@fortawesome/free-solid-svg-icons'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { AutofocusDirective } from '../../../../common/directives/auto-focus.directive'
import { LayoutService } from '../../../../layout/layout.service'
import { SpaceRootModel } from '../../models/space.model'
import { SpacesService } from '../../services/spaces.service'

export interface ExternalFilePathEvent {
  name: string
  externalPath: string
}

@Component({
  selector: 'app-space-root-path-dialog',
  imports: [FaIconComponent, L10nTranslateDirective, L10nTranslatePipe, FormsModule, AutofocusDirective],
  templateUrl: 'space-root-path-dialog.component.html'
})
export class SpaceRootPathDialogComponent implements OnInit {
  @Input() currentRoots: SpaceRootModel[] = []
  @Output() submitEvent = new EventEmitter<ExternalFilePathEvent>()
  @Input() withRootName = true
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  protected readonly icons = { faFolderClosed }
  protected newSpaceRoot: { name: string; externalPath: string } = { name: '', externalPath: '' }
  // states
  protected error: string
  protected rootNameIsValid = false
  protected rootPathIsValid = false
  protected rootIsValid = false
  private readonly spacesService = inject(SpacesService)

  ngOnInit() {
    if (!this.withRootName) {
      this.rootNameIsValid = true
    }
  }

  @HostListener('keyup.enter')
  keyEnter() {
    if (this.rootIsValid) {
      this.onSubmit()
    } else {
      this.onValidRoot()
    }
  }

  onValidRoot() {
    if ((this.withRootName && !this.newSpaceRoot.name) || !this.newSpaceRoot.externalPath) {
      this.error = 'Name and location are required'
      return
    }
    if (this.newSpaceRoot.externalPath[0] !== '/') {
      this.newSpaceRoot.externalPath = '/' + this.newSpaceRoot.externalPath
    }
    for (const root of this.currentRoots) {
      if (this.newSpaceRoot.externalPath.startsWith(root.externalPath)) {
        this.rootPathIsValid = false
        this.error = 'Parent location already exists in files'
        return
      }
    }

    this.spacesService.checkSpaceRootPath(this.newSpaceRoot.externalPath).subscribe({
      next: () => {
        this.rootPathIsValid = true
        this.rootNameIsValid = true
        this.rootIsValid = true
        this.error = null
      },
      error: (e) => {
        this.rootPathIsValid = false
        this.error = e.error.message
      }
    })
  }

  onSubmit() {
    this.submitEvent.emit(this.newSpaceRoot)
    this.layout.closeDialog()
  }

  checkInput(value: string, isNameField = false) {
    if (isNameField) {
      this.newSpaceRoot.name = value
      this.rootNameIsValid = !!value
    } else {
      this.newSpaceRoot.externalPath = value
      this.rootPathIsValid = !!value
    }
    if (this.rootIsValid) {
      this.rootIsValid = false
    }
  }
}
