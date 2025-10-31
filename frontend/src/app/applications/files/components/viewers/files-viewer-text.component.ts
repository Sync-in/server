/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { CodeEditor } from '@acrodata/code-editor'
import { HttpClient } from '@angular/common/http'
import { Component, inject, Input, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { themeDark } from '../../../../layout/layout.interfaces'
import { LayoutService } from '../../../../layout/layout.service'
import { FileModel } from '../../models/file.model'

@Component({
  selector: 'app-files-viewer-text',
  encapsulation: ViewEncapsulation.None,
  imports: [CodeEditor, FormsModule],
  styles: [
    `
      .code-editor {
        height: 100%;
        font-size: 0.75rem;
      }
    `
  ],
  template: ` <div [style.height.px]="currentHeight">
    <code-editor [languages]="languages" [language]="currentLanguage" [ngModel]="content" [readonly]="true" [theme]="currentTheme"></code-editor>
  </div>`
})
export class FilesViewerTextComponent implements OnInit, OnDestroy {
  @Input() currentHeight: number
  @Input() file: FileModel
  protected content: string
  protected currentLanguage = undefined
  protected readonly languages: LanguageDescription[] = languages
  protected currentTheme: any = 'light'
  private readonly layout = inject(LayoutService)
  private readonly http = inject(HttpClient)
  private subscription = this.layout.switchTheme.subscribe((layout: string) => (this.currentTheme = layout === themeDark ? 'dark' : 'light'))
  private readonly maxSize = 5242880 // 5MB

  ngOnInit() {
    const language: LanguageDescription = LanguageDescription.matchFilename(languages, this.file.name)
    if (language?.name || this.file.size <= this.maxSize) {
      this.currentLanguage = language.name
      this.http.get(this.file.dataUrl, { responseType: 'text' }).subscribe((data: string) => (this.content = data))
    } else {
      this.content = this.layout.translateString('This file contains binary data that can not be read')
    }
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe()
    }
  }
}
