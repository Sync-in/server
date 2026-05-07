import { Component, computed, inject, Signal } from '@angular/core'
import { Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faMagnifyingGlassMinus, faMagnifyingGlassPlus, faStar } from '@fortawesome/free-solid-svg-icons'
import type { FileFavorite } from '@sync-in-server/backend/src/applications/files/schemas/file-favorite.interface'
import { L10nTranslateDirective } from 'angular-l10n'
import { TimeAgoPipe } from '../../../../common/pipes/time-ago.pipe'
import { defaultMimeUrl, getAssetsMimeUrl } from '../../../files/files.constants'
import { FilesService } from '../../../files/services/files.service'
import { SPACES_PATH } from '../../../spaces/spaces.constants'
import { StoreService } from '../../../../store/store.service'

@Component({
  selector: 'app-files-favorites-widget',
  imports: [L10nTranslateDirective, FaIconComponent, TimeAgoPipe],
  templateUrl: './files-favorites-widget.component.html',
  styleUrl: './files-favorites-widget.component.scss'
})
export class FilesFavoritesWidgetComponent {
  protected moreElements = false
  protected readonly icons = { faStar, faMagnifyingGlassPlus, faMagnifyingGlassMinus }
  private readonly router = inject(Router)
  private readonly store = inject(StoreService)
  private readonly filesService = inject(FilesService)
  private nbInitialFiles = 10
  private nbFiles = this.nbInitialFiles
  protected files: Signal<FileFavorite[]> = computed(() => this.store.filesFavorites().slice(0, this.nbFiles))
  private readonly mimeUrlCache = new Map<string, string>()

  constructor() {
    this.load()
  }

  switchMore() {
    if (this.moreElements) {
      this.moreElements = false
      this.nbFiles = this.nbInitialFiles
    } else {
      this.moreElements = true
      this.nbFiles *= 5
    }
    this.load()
  }

  getMimeUrl(mime: string): string {
    if (!this.mimeUrlCache.has(mime)) {
      this.mimeUrlCache.set(mime, getAssetsMimeUrl(mime))
    }
    return this.mimeUrlCache.get(mime)!
  }

  onMimeError(mime: string) {
    this.mimeUrlCache.set(mime, defaultMimeUrl)
  }

  goToFile(f: FileFavorite) {
    this.router.navigate([SPACES_PATH.SPACES, ...f.navPath.split('/')], { queryParams: { select: f.name } }).catch(console.error)
  }

  private load() {
    this.filesService.loadFavorites(this.nbFiles)
  }
}
