export interface FileEditorProvider {
  collabora: boolean
  onlyoffice: boolean
}

export interface ServerConfig {
  twoFaEnabled: boolean
  mailServerEnabled: boolean
  fileEditors: FileEditorProvider
}
