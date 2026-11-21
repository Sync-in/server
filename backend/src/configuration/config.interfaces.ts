import type { DocumentTypes } from '../applications/files/core/constants/samples.js'
import type { FileEditorProviders } from '../applications/files/editors/file-editor-providers.interface.js'

export interface ServerFilesTransfersConfig {
  maxChunkSize: number | null
}

export interface ServerFilesConfig {
  transfers: ServerFilesTransfersConfig
  editors: FileEditorProviders
  sampleDocuments: DocumentTypes
}

export interface ServerConfig {
  twoFaEnabled: boolean
  mailServerEnabled: boolean
  files: ServerFilesConfig
}
