/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export interface FileEditorProvider {
  collabora: boolean
  onlyoffice: boolean
}

export interface ServerConfig {
  twoFaEnabled: boolean
  mailServerEnabled: boolean
  fileEditors: FileEditorProvider
}
