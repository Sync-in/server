/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ChangeDetectionStrategy, Component, Input, OnChanges } from '@angular/core'

declare const DocsAPI: any

@Component({
  selector: 'app-only-office',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <div id="onlyofficeEditor"></div> `
})
export class OnlyOfficeComponent implements OnChanges {
  @Input() config: { script: string; editorConfig: any }
  protected editor: any

  ngOnChanges() {
    if (this.editor) {
      this.editor.destroyEditor()
    }
    this.createEditor()
  }

  loadScript(src: any) {
    return new Promise((resolve) => {
      const script: any = document.createElement('script')
      script.type = 'text/javascript'
      script.src = src
      if (script.readyState) {
        script.onreadystatechange = () => {
          if (script.readyState === 'loaded' || script.readyState === 'complete') {
            script.onreadystatechange = null
            resolve({ script: name, loaded: true, status: 'Loaded' })
          }
        }
      } else {
        script.onload = () => {
          resolve({ script: name, loaded: true, status: 'Loaded' })
        }
      }
      script.onerror = () => resolve({ script: name, loaded: false, status: 'Loaded' })
      document.getElementsByTagName('head')[0].appendChild(script)
    })
  }

  private createEditor() {
    if (typeof DocsAPI !== 'undefined') {
      this.editor = new DocsAPI.DocEditor('onlyofficeEditor', this.config.editorConfig)
    } else {
      this.loadScript(this.config.script)
        .then(() => {
          this.createEditor()
        })
        .catch(console.error)
    }
  }
}
