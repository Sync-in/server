import { Component, computed, inject, signal, Signal } from '@angular/core'
import { Router } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faMagnifyingGlassMinus, faMagnifyingGlassPlus, faStar } from '@fortawesome/free-solid-svg-icons'
import { L10nTranslateDirective } from 'angular-l10n'
import { TimeAgoPipe } from '../../../../common/pipes/time-ago.pipe'
import { FilesService } from '../../../files/services/files.service'
import { SPACES_PATH } from '../../../spaces/spaces.constants'
import { StoreService } from '../../../../store/store.service'
import { FileFavoriteModel } from '../../models/file-favorite.model'

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
  private readonly nbFiles = signal(this.nbInitialFiles)
  protected files: Signal<FileFavoriteModel[]> = computed(() => this.store.filesFavorites().slice(0, this.nbFiles()))

  constructor() {
    this.load()
  }

  switchMore() {
    if (this.moreElements) {
      this.moreElements = false
      this.nbFiles.set(this.nbInitialFiles)
    } else {
      this.moreElements = true
      this.nbFiles.set(this.nbInitialFiles * 5)
    }
    this.load()
  }

  goToFile(f: FileFavoriteModel) {
    if (!f.navPath) return
    this.router.navigate([SPACES_PATH.SPACES, ...f.navPath.split('/')], { queryParams: { select: f.name } }).catch(console.error)
  }

  private load() {
    this.filesService.loadFavorites(this.nbFiles())
  }
}
