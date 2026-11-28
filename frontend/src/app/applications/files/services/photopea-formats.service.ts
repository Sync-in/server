import { HttpClient } from '@angular/common/http'
import { inject, Injectable, signal } from '@angular/core'
import { firstValueFrom, timeout } from 'rxjs'
import { StoreService } from '../../../store/store.service'
import { PHOTOPEA_FALLBACK_OPENABLE_EXTENSIONS, getPhotopeaFormat } from '../files.constants'

@Injectable({ providedIn: 'root' })
export class PhotopeaFormatsService {
  private readonly http = inject(HttpClient)
  private readonly store = inject(StoreService)
  private readonly openableExtensionsSignal = signal<ReadonlySet<string>>(new Set(PHOTOPEA_FALLBACK_OPENABLE_EXTENSIONS))
  private manifestUrl: string | null = null
  private manifestRequest: Promise<void> | null = null

  readonly openableExtensions = this.openableExtensionsSignal.asReadonly()

  async loadManifest(): Promise<void> {
    const files = this.store.server().files
    const externalServer = files.photopeaExternalServer
    if (!files.editors.photopea || !externalServer) {
      this.reset()
      return
    }

    const manifestUrl = new URL('manifest.json', externalServer).toString()
    if (this.manifestUrl === manifestUrl && this.manifestRequest) return this.manifestRequest

    this.manifestUrl = manifestUrl
    this.openableExtensionsSignal.set(new Set(PHOTOPEA_FALLBACK_OPENABLE_EXTENSIONS))
    this.manifestRequest = this.fetchManifest(manifestUrl)
    return this.manifestRequest
  }

  canOpenWithPhotopea(extension: string): boolean {
    return this.openableExtensionsSignal().has(extension.toLowerCase())
  }

  getSaveFormat(extension: string): string | undefined {
    return getPhotopeaFormat(extension)
  }

  private async fetchManifest(manifestUrl: string): Promise<void> {
    let manifest: unknown
    try {
      manifest = await firstValueFrom(this.http.get<unknown>(manifestUrl).pipe(timeout({ first: 5_000 })))
    } catch (error) {
      if (this.manifestUrl === manifestUrl) {
        this.openableExtensionsSignal.set(new Set(PHOTOPEA_FALLBACK_OPENABLE_EXTENSIONS))
        console.warn('Unable to load Photopea manifest; using bundled openable formats.', error)
      }
      return
    }

    const extensions = parseOpenableExtensions(manifest)
    if (!extensions) {
      if (this.manifestUrl === manifestUrl) {
        this.openableExtensionsSignal.set(new Set(PHOTOPEA_FALLBACK_OPENABLE_EXTENSIONS))
        console.warn('Photopea manifest has no valid file handlers; using bundled openable formats.')
      }
      return
    }
    if (this.manifestUrl === manifestUrl) this.openableExtensionsSignal.set(extensions)
  }

  private reset() {
    this.manifestUrl = null
    this.manifestRequest = null
    this.openableExtensionsSignal.set(new Set(PHOTOPEA_FALLBACK_OPENABLE_EXTENSIONS))
  }
}

function parseOpenableExtensions(manifest: unknown): ReadonlySet<string> | null {
  if (!isRecord(manifest) || !Array.isArray(manifest['file_handlers'])) return null

  const extensions = new Set<string>()
  for (const handler of manifest['file_handlers']) {
    if (!isRecord(handler) || !isRecord(handler['accept'])) continue
    for (const acceptedExtensions of Object.values(handler['accept'])) {
      if (!Array.isArray(acceptedExtensions)) continue
      for (const extension of acceptedExtensions) {
        if (typeof extension === 'string' && /^\.[a-z\d]+$/i.test(extension)) {
          extensions.add(extension.slice(1).toLowerCase())
        }
      }
    }
  }
  return extensions.size ? extensions : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
