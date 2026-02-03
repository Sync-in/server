export interface ElectronIpcRenderer {
  on: (channel: string, listener: (event: any, ...args: any[]) => void) => this
  invoke: (channel: string, ...args: any[]) => Promise<any>
  send: (channel: string, ...args: any[]) => void
  showFilePath: (file: File) => string

  removeAllListeners(channel?: string): this
}
