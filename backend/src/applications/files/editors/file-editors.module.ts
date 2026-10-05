import { type DynamicModule, Module, type Type } from '@nestjs/common'
import { configuration } from '../../../configuration/config.environment'

@Module({})
export class FileEditorsModule {
  static async register(): Promise<DynamicModule> {
    const editors = configuration.applications.files.editors
    const imports: Type[] = []

    if (editors.onlyoffice.enabled || editors.eurooffice.enabled) {
      imports.push((await import('./only-office/only-office.module.js')).OnlyOfficeModule)
    }
    if (editors.collabora.enabled) {
      imports.push((await import('./collabora-online/collabora-online.module.js')).CollaboraOnlineModule)
    }
    if (editors.drawio.enabled) {
      imports.push((await import('./drawio/drawio.module.js')).DrawioModule)
    }

    return { module: FileEditorsModule, imports }
  }
}
