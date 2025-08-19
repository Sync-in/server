/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export interface ElectronIpcRenderer {
  on: (channel: string, listener: (event: any, ...args: any[]) => void) => this
  invoke: (channel: string, ...args: any[]) => Promise<any>
  send: (channel: string, ...args: any[]) => void
  showFilePath: (file: File) => string

  removeAllListeners(channel?: string): this
}
