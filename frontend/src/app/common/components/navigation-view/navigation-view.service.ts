import { computed, Injectable, signal } from '@angular/core'
import type { GalleryViewModeKey, GalleryViewOption, ViewMode, ViewModeKey } from './interfaces/view-mode.interface'

const GALLERY_VIEW_MODE_STORAGE_KEY = 'galleryViewMode'
const VIEW_MODE_STORAGE_KEY = 'viewMode'

const GALLERY_VIEW_OPTIONS = [
  { key: 'th', label: 'S' },
  { key: 'thM', label: 'M' },
  { key: 'thL', label: 'L' },
  { key: 'thXl', label: 'XL' },
  { key: 'thXxl', label: 'XXL' }
] as const satisfies readonly GalleryViewOption[]

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

@Injectable({ providedIn: 'root' })
export class NavigationViewService {
  readonly galleryViewOptions = GALLERY_VIEW_OPTIONS
  private readonly viewModeState = signal<ViewModeKey>(this.getStoredViewMode())
  readonly viewMode = this.viewModeState.asReadonly()
  readonly currentView = computed(() => VIEW_MODES[this.viewModeState()])
  readonly galleryModeEnabled = computed(() => this.currentView().enabled)
  readonly gallerySizeIndex = computed(() => {
    const index = GALLERY_VIEW_OPTIONS.findIndex(({ key }) => key === this.viewModeState())
    return index === -1 ? DEFAULT_GALLERY_VIEW_MODE_INDEX : index
  })
  readonly gallerySizeLabel = computed(() => GALLERY_VIEW_OPTIONS[this.gallerySizeIndex()].label)

  setView(view: ViewModeKey): ViewMode | null {
    const currentViewMode = this.viewModeState()
    const selectedView = VIEW_MODES[view]
    if (view === currentViewMode) return null
    if (selectedView.enabled) {
      localStorage.setItem(GALLERY_VIEW_MODE_STORAGE_KEY, view)
    } else if (VIEW_MODES[currentViewMode].enabled) {
      localStorage.setItem(GALLERY_VIEW_MODE_STORAGE_KEY, currentViewMode)
    }
    this.viewModeState.set(view)
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, view)
    return selectedView
  }

  selectGalleryMode(): ViewMode | null {
    if (this.galleryModeEnabled()) return null
    const storedGalleryViewMode = localStorage.getItem(GALLERY_VIEW_MODE_STORAGE_KEY)
    const galleryViewMode =
      isViewModeKey(storedGalleryViewMode) && VIEW_MODES[storedGalleryViewMode].enabled ? storedGalleryViewMode : DEFAULT_GALLERY_VIEW_MODE
    return this.setView(galleryViewMode)
  }

  private getStoredViewMode(): ViewModeKey {
    const storedViewMode = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
    return isViewModeKey(storedViewMode) ? storedViewMode : 'tl'
  }
}
