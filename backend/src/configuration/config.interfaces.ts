import type { DocumentTypes } from '../applications/files/constants/samples'
import type { FileEditorProviders } from '../applications/files/editors/file-editor-providers.interface'

export interface ServerFilesConfig {
  editors: FileEditorProviders
  sampleDocuments: DocumentTypes
}

export interface ServerConfig {
  twoFaEnabled: boolean
  mailServerEnabled: boolean
  files: ServerFilesConfig
}
