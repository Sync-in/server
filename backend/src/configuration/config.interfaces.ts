import type { FileEditorProviders } from '../applications/files/modules/file-editor-providers.interface'

export interface ServerConfig {
  twoFaEnabled: boolean
  mailServerEnabled: boolean
  fileEditors: FileEditorProviders
}
