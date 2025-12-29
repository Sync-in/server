/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core'
import type { OnlyOfficeConfig } from '@sync-in-server/backend/src/applications/files/modules/only-office/only-office.interface'
import loadScript from './only-office.utils'

@Component({
  selector: 'app-files-onlyoffice-document',
  template: '<div [id]="id"></div>'
})
export class OnlyOfficeComponent implements OnInit, OnChanges, OnDestroy {
  @Input() id: string
  @Input() documentServerUrl: string
  @Input() config: OnlyOfficeConfig
  @Output() loadError = new EventEmitter<{ title: string; message: string }>()
  @Output() wasSaved = new EventEmitter<string>()
  private isFirstOnChanges = true

  ngOnInit(): void {
    let url = this.documentServerUrl
    if (!url.endsWith('/')) url += '/'
    const docApiUrl = `${url}web-apps/apps/api/documents/api.js`
    loadScript(docApiUrl, 'onlyoffice-api-script')
      .then(() => this.onLoad())
      .catch(() => {
        this.onError(-2)
      })
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.isFirstOnChanges) {
      this.isFirstOnChanges = false
      return
    }

    if ('config' in changes) {
      if (window?.DocEditor?.instances[this.id]) {
        window.DocEditor.instances[this.id].destroyEditor()
        window.DocEditor.instances[this.id] = undefined
        console.warn('Important props have been changed, reloading ...')
        this.onLoad()
        return
      }
    }
  }

  ngOnDestroy() {
    if (window?.DocEditor?.instances[this.id]) {
      window.DocEditor.instances[this.id].destroyEditor()
      window.DocEditor.instances[this.id] = undefined
      delete window.DocEditor.instances[this.id]
    }
  }

  private onLoad = () => {
    try {
      if (!window.DocsAPI) {
        this.onError(-3)
      }

      if (window?.DocEditor?.instances[this.id]) {
        console.log('Skip loading, instance already exists', this.id)
        return
      }

      if (!window?.DocEditor?.instances) {
        window.DocEditor = { instances: {} }
      }

      const config: OnlyOfficeConfig = JSON.parse(JSON.stringify(this.config))
      config.events = { onDocumentStateChange: (e: { data: boolean }) => (e.data ? this.wasSaved.emit() : null) }
      window.DocEditor.instances[this.id] = window.DocsAPI.DocEditor(this.id, config)
    } catch (err) {
      console.error(err)
      this.onError(-1)
    }
  }

  private onError(errorCode: number) {
    const error = { title: 'Unknown OnlyOffice error', message: `Code: ${errorCode}` }

    switch (errorCode) {
      case -2:
        error.title = 'Unable to load OnlyOffice editor'
        error.message = 'The document server may be unreachable or the configuration is invalid'
        break
      case -3:
        error.title = 'OnlyOffice editor failed to initialize'
        error.message = 'DocsAPI not available'
        break
    }

    this.loadError.emit(error)
  }
}
