import { type DynamicModule, Module, type Type } from '@nestjs/common'
import { configuration } from '../../../configuration/config.environment'

@Module({})
export class FileEditorsModule {
  static async register(): Promise<DynamicModule> {
    const editors = configuration.applications.files.editors
    const imports: Type[] = []

    if (editors.onlyoffice.enabled || editors.eurooffice.enabled) {
      imports.push((await import('./only-office/only-office.module')).OnlyOfficeModule)
    }
    if (editors.collabora.enabled) {
      imports.push((await import('./collabora-online/collabora-online.module')).CollaboraOnlineModule)
    }
    if (editors.drawio.enabled) {
      imports.push((await import('./drawio/drawio.module')).DrawioModule)
    }

    return { module: FileEditorsModule, imports }
  }
}
