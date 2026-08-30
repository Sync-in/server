import { ChangeDetectionStrategy, Component, EventEmitter, Output } from '@angular/core'
import { LucideDynamicIcon, LucideGrid2X2, LucideList } from '@lucide/angular'
import { L10nTranslateDirective } from 'angular-l10n'
import { BsDropdownModule } from 'ngx-bootstrap/dropdown'
import type { ViewMode } from './interfaces/view-mode.interface'

const GALLERY_VIEW_MODE_STORAGE_KEY = 'galleryViewMode'
const VIEW_MODE_STORAGE_KEY = 'viewMode'

const GALLERY_VIEW_OPTIONS = [
  { key: 'th', label: 'S' },
  { key: 'thM', label: 'M' },
  { key: 'thL', label: 'L' },
  { key: 'thXl', label: 'XL' },
  { key: 'thXxl', label: 'XXL' }
] as const

type GalleryViewModeKey = (typeof GALLERY_VIEW_OPTIONS)[number]['key']
type ViewModeKey = 'tl' | GalleryViewModeKey

const DEFAULT_GALLERY_VIEW_MODE: GalleryViewModeKey = 'thM'
const DEFAULT_GALLERY_VIEW_MODE_INDEX = GALLERY_VIEW_OPTIONS.findIndex(({ key }) => key === DEFAULT_GALLERY_VIEW_MODE)

const VIEW_MODES = {
  tl: { enabled: false },
  th: { enabled: true, maxBadges: 0, badgeSize: 10, dimensions: 96, image: 56, imageRes: 128, iconSize: 30, textSize: 12 },
  thM: { enabled: true, maxBadges: 1, badgeSize: 11, dimensions: 112, image: 72, imageRes: 192, iconSize: 34, textSize: 12 },
  thL: { enabled: true, maxBadges: 2, badgeSize: 12, dimensions: 152, image: 112, imageRes: 256, iconSize: 50, textSize: 13 },
  thXl: { enabled: true, maxBadges: 6, badgeSize: 13, dimensions: 192, image: 152, imageRes: 512, iconSize: 65, textSize: 13 },
  thXxl: {
    enabled: true,
    maxBadges: 6,
    badgeSize: 14,
    dimensions: 232,
    image: 192,
    imageRes: 1024,
    iconSize: 80,
    textSize: 14
  }
} satisfies Record<ViewModeKey, ViewMode>

function isViewModeKey(value: string | null): value is ViewModeKey {
  return !!value && Object.hasOwn(VIEW_MODES, value)
}

export type { ViewMode } from './interfaces/view-mode.interface'

@Component({
  selector: 'app-navigation-view',
  templateUrl: 'navigation-view.component.html',
  styleUrls: ['navigation-view.component.scss'],
  imports: [BsDropdownModule, LucideDynamicIcon, L10nTranslateDirective],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NavigationViewComponent {
  @Output() switchView = new EventEmitter<ViewMode>()
  protected readonly icons = { LucideGrid2X2, LucideList }
  protected readonly galleryViewOptions = GALLERY_VIEW_OPTIONS
  protected viewMode = this.getStoredViewMode()

  currentView(): ViewMode {
    return VIEW_MODES[this.viewMode]
  }

  protected setView(view: ViewModeKey) {
    const currentViewMode = this.viewMode
    const selectedView = VIEW_MODES[view]
    if (view === currentViewMode) return
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

  protected get gallerySizeIndex() {
    const index = GALLERY_VIEW_OPTIONS.findIndex(({ key }) => key === this.viewMode)
    return index === -1 ? DEFAULT_GALLERY_VIEW_MODE_INDEX : index
  }

  protected get gallerySizeLabel() {
    return GALLERY_VIEW_OPTIONS[this.gallerySizeIndex].label
  }

  protected setGallerySize(event: Event) {
    const option = GALLERY_VIEW_OPTIONS[Number((event.target as HTMLInputElement).value)]
    if (option) this.setView(option.key)
  }

  protected selectGalleryMode() {
    if (this.galleryModeEnabled) return
    const storedGalleryViewMode = localStorage.getItem(GALLERY_VIEW_MODE_STORAGE_KEY)
    const galleryViewMode =
      isViewModeKey(storedGalleryViewMode) && VIEW_MODES[storedGalleryViewMode].enabled ? storedGalleryViewMode : DEFAULT_GALLERY_VIEW_MODE
    this.setView(galleryViewMode)
  }

  private getStoredViewMode(): ViewModeKey {
    const storedViewMode = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
    return isViewModeKey(storedViewMode) ? storedViewMode : 'tl'
  }
}
