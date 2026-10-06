import type { DocumentTypes } from '../applications/files/constants/samples.js'
import type { FileEditorProviders } from '../applications/files/editors/file-editor-providers.interface.js'

export interface ServerFilesConfig {
  editors: FileEditorProviders
  sampleDocuments: DocumentTypes
}

export interface ServerConfig {
  twoFaEnabled: boolean
  mailServerEnabled: boolean
  files: ServerFilesConfig
}
