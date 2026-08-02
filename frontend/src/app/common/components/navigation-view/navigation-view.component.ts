import { ChangeDetectionStrategy, Component, EventEmitter, Output } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faTableCellsLarge, faThList } from '@fortawesome/free-solid-svg-icons'
import { L10nTranslateDirective } from 'angular-l10n'
import { BsDropdownModule } from 'ngx-bootstrap/dropdown'

const DEFAULT_GALLERY_VIEW_MODE = 'thM'
const GALLERY_VIEW_MODE_STORAGE_KEY = 'galleryViewMode'
const VIEW_MODE_STORAGE_KEY = 'viewMode'

export interface ViewMode {
  enabled: boolean
  dimensions?: number
  maxBadges?: number
  image?: number
  imageRes?: number
  faSize?: number
  textSize?: number
  margins?: number
}

const GALLERY_VIEW_OPTIONS = [
  { key: 'th', label: 'S' },
  { key: 'thM', label: 'M' },
  { key: 'thL', label: 'L' },
  { key: 'thXl', label: 'XL' },
  { key: 'thXxl', label: 'XXL' }
] as const

const VIEW_MODES: Record<string, ViewMode> = {
  tl: { enabled: false },
  th: { enabled: true, maxBadges: 0, dimensions: 96, image: 56, imageRes: 128, faSize: 30, textSize: 12, margins: 18 },
  thM: { enabled: true, maxBadges: 1, dimensions: 112, image: 72, imageRes: 192, faSize: 34, textSize: 12, margins: 18 },
  thL: { enabled: true, maxBadges: 2, dimensions: 152, image: 112, imageRes: 256, faSize: 50, textSize: 13, margins: 18 },
  thXl: { enabled: true, maxBadges: 6, dimensions: 192, image: 152, imageRes: 512, faSize: 65, textSize: 13, margins: 18 },
  thXxl: {
    enabled: true,
    maxBadges: 6,
    dimensions: 232,
    image: 192,
    imageRes: 1024,
    faSize: 80,
    textSize: 14,
    margins: 18
  }
}

@Component({
  selector: 'app-navigation-view',
  templateUrl: 'navigation-view.component.html',
  styleUrls: ['navigation-view.component.scss'],
  imports: [BsDropdownModule, FaIconComponent, L10nTranslateDirective],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavigationViewComponent {
  @Output() switchView = new EventEmitter<ViewMode>()
  protected readonly icons = { faTableCellsLarge, faThList }
  protected readonly galleryViewOptions = GALLERY_VIEW_OPTIONS
  protected viewMode = this.getStoredViewMode()

  currentView() {
    return VIEW_MODES[this.viewMode]
  }

  setView(view: string) {
    const currentViewMode = this.viewMode
    const selectedView = VIEW_MODES[view]
    if (!selectedView || view === currentViewMode) return
    if (selectedView.enabled) {
      localStorage.setItem(GALLERY_VIEW_MODE_STORAGE_KEY, view)
    } else if (VIEW_MODES[currentViewMode].enabled) {
      localStorage.setItem(GALLERY_VIEW_MODE_STORAGE_KEY, currentViewMode)
    }
    this.viewMode = view
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, view)
    this.switchView.emit(selectedView)
  }

  protected get galleryModeEnabled() {
    return this.currentView().enabled
  }

  protected selectGalleryMode() {
    if (this.galleryModeEnabled) return
    const storedGalleryViewMode = localStorage.getItem(GALLERY_VIEW_MODE_STORAGE_KEY)
    const galleryViewMode = storedGalleryViewMode && VIEW_MODES[storedGalleryViewMode]?.enabled ? storedGalleryViewMode : DEFAULT_GALLERY_VIEW_MODE
    this.setView(galleryViewMode)
  }

  private getStoredViewMode() {
    const storedViewMode = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
    return storedViewMode && VIEW_MODES[storedViewMode] ? storedViewMode : 'tl'
  }
}
