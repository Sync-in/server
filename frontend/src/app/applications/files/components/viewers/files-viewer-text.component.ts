/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { CodeEditor } from '@acrodata/code-editor'
import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { Component, HostListener, inject, input, linkedSignal, OnDestroy, OnInit, signal, ViewChild, ViewEncapsulation } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { closeSearchPanel, openSearchPanel } from '@codemirror/search'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faArrowsLeftRightToLine, faFloppyDisk, faLock, faLockOpen, faMagnifyingGlass, faSpinner } from '@fortawesome/free-solid-svg-icons'
import { L10N_LOCALE, L10nLocale, L10nTranslatePipe } from 'angular-l10n'
import { ButtonCheckboxDirective } from 'ngx-bootstrap/buttons'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { themeDark } from '../../../../layout/layout.interfaces'
import { LayoutService } from '../../../../layout/layout.service'
import { FileModel } from '../../models/file.model'
import { FilesUploadService } from '../../services/files-upload.service'

@Component({
  selector: 'app-files-viewer-text',
  encapsulation: ViewEncapsulation.None,
  imports: [CodeEditor, TooltipModule, FormsModule, FaIconComponent, L10nTranslatePipe, ButtonCheckboxDirective],
  styles: [
    `
      .code-editor {
        height: calc(100% - 40px);
        font-size: 0.8rem;
      }

      .cm-focused {
        outline: none !important;
      }

      .cm-panel.cm-search {
        display: flex;
        align-items: center;
        text-wrap: nowrap;

        label {
          display: flex;
          align-items: center;
        }

        button[aria-label='close'] {
          right: 10px !important;
          font-size: 18px !important;
        }
      }
    `
  ],
  templateUrl: 'files-viewer-text.component.html'
})
export class FilesViewerTextComponent implements OnInit, OnDestroy {
  @ViewChild('editor') editor: CodeEditor
  currentHeight = input<number>()
  file = input<FileModel>()
  mode = input<'view' | 'edit'>('view')
  protected isReadonly = linkedSignal(() => this.mode() === 'view')
  protected isReadable = signal(false)
  protected isModified = signal(false)
  protected isSaving = signal(false)
  protected lineWrapping = signal(false)
  protected content: string
  protected currentLanguage = undefined
  protected readonly languages: LanguageDescription[] = languages
  protected currentTheme: any = 'light'
  protected readonly icons = { faFloppyDisk, faLock, faLockOpen, faMagnifyingGlass, faSpinner, faArrowsLeftRightToLine }
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected isSearchPanelOpen = signal(false)
  private isContentReady = false
  private readonly layout = inject(LayoutService)
  private readonly http = inject(HttpClient)
  private readonly filesUpload = inject(FilesUploadService)
  private subscription = this.layout.switchTheme.subscribe((layout: string) => (this.currentTheme = layout === themeDark ? 'dark' : 'light'))
  private readonly maxSize = 5242880 // 5MB

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    // ESC
    if (event.key === 'Escape' || event.key === 'Esc') {
      event.stopPropagation()
      event.preventDefault()
      if (this.isSearchPanelOpen) {
        this.toggleSearch()
      } else if (!this.isModified()) {
        if (this.isModified()) {
          // show dialog alert
        } else {
          this.layout.closeDialog()
        }
      }
      return
    }
    // Ctrl/Cmd+S | Ctrl/Cmd+F
    if (event.ctrlKey || event.metaKey) {
      switch (event.key.toLowerCase()) {
        case 's':
          event.preventDefault()
          this.save()
          return
        case 'f':
          event.preventDefault()
          event.stopPropagation()
          this.toggleSearch()
          return
      }
    }
  }

  ngOnInit() {
    const language: LanguageDescription = LanguageDescription.matchFilename(languages, this.file().name)
    if (language?.name || this.file().size <= this.maxSize) {
      this.currentLanguage = language?.name
      this.isReadable.set(true)
      this.http.get(this.file().dataUrl, { responseType: 'text' }).subscribe((data: string) => (this.content = data))
    } else {
      this.isReadable.set(false)
      this.content = this.layout.translateString('This file contains binary data that can not be read')
    }
  }

  toggleReadonly() {
    this.isReadonly.set(!this.isReadonly())
    if (this.isSearchPanelOpen()) {
      // reset search state when open to enable/disable the replace function
      setTimeout(() => {
        this.toggleSearch()
        this.toggleSearch()
      }, 100)
    }
  }

  save() {
    this.isSaving.set(true)
    this.filesUpload.uploadOneFile(this.file(), this.content, true).subscribe({
      next: () => {
        this.isModified.set(false)
        this.isSaving.set(false)
      },
      error: (e: HttpErrorResponse) => {
        this.isSaving.set(false)
        this.layout.sendNotification('error', 'Unable to save document', e.error.message)
      }
    })
  }

  toggleSearch() {
    this.isSearchPanelOpen.set(!this.isSearchPanelOpen())
    if (this.isSearchPanelOpen()) {
      openSearchPanel(this.editor.view)
    } else {
      closeSearchPanel(this.editor.view)
    }
  }

  contentChange() {
    // Ignore first call
    if (this.isContentReady) {
      this.isModified.set(true)
    } else {
      this.isContentReady = true
    }
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe()
    }
  }
}
