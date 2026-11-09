import { Component, DestroyRef, inject, input, OnChanges, OnDestroy, OnInit, output, SimpleChanges } from '@angular/core'
import type { OnlyOfficeConfig } from '@sync-in-server/backend/src/applications/files/editors/only-office/only-office.interface'
import loadScript from './only-office.utils'

@Component({
  selector: 'app-files-onlyoffice-document',
  template: '<div [id]="id()"></div>'
})
export class OnlyOfficeComponent implements OnInit, OnChanges, OnDestroy {
  readonly id = input.required<string>()
  readonly editorName = input.required<string>()
  readonly documentServerUrl = input.required<string>()
  readonly config = input.required<OnlyOfficeConfig>()
  readonly loadError = output<{ title: string; titleArgs: { editor: string }; message: string }>()
  private readonly destroyRef = inject(DestroyRef)
  private isFirstOnChanges = true

  ngOnInit(): void {
    let url = this.documentServerUrl()
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
      const id = this.id()
      if (window?.DocEditor?.instances[id]) {
        window.DocEditor.instances[id].destroyEditor()
        window.DocEditor.instances[id] = undefined
        console.warn('Important props have been changed, reloading ...')
        this.onLoad()
        return
      }
    }
  }

  ngOnDestroy() {
    const id = this.id()
    if (window?.DocEditor?.instances[id]) {
      window.DocEditor.instances[id].destroyEditor()
      window.DocEditor.instances[id] = undefined
      delete window.DocEditor.instances[id]
    }
  }

  private onLoad = () => {
    if (this.destroyRef.destroyed) return
    try {
      if (!window.DocsAPI) {
        this.onError(-3)
        return
      }

      const id = this.id()
      if (window?.DocEditor?.instances[id]) {
        console.log('Skip loading, instance already exists', id)
        return
      }

      if (!window?.DocEditor?.instances) {
        window.DocEditor = { instances: {} }
      }

      const config: OnlyOfficeConfig = JSON.parse(JSON.stringify(this.config()))
      window.DocEditor.instances[id] = window.DocsAPI.DocEditor(id, config)
    } catch (err) {
      console.error(err)
      this.onError(-1)
    }
  }

  private onError(errorCode: number) {
    if (this.destroyRef.destroyed) return
    const error = {
      title: 'office_editor_unknown_error',
      titleArgs: { editor: this.editorName() },
      message: `Code: ${errorCode}`
    }

    switch (errorCode) {
      case -2:
        error.title = 'office_editor_load_error'
        error.message = 'The document server may be unreachable or the configuration is invalid'
        break
      case -3:
        error.title = 'office_editor_init_error'
        error.message = 'DocsAPI not available'
        break
    }

    this.loadError.emit(error)
  }
}
