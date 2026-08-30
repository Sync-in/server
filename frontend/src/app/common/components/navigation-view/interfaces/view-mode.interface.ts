interface ListViewMode {
  readonly enabled: false
  // Keep gallery properties visible to Angular's template type checker while forbidding values in list mode.
  readonly dimensions?: never
  readonly maxBadges?: never
  readonly badgeSize?: never
  readonly image?: never
  readonly imageRes?: never
  readonly iconSize?: never
  readonly textSize?: never
}

interface GalleryViewMode {
  readonly enabled: true
  readonly dimensions: number
  readonly maxBadges: number
  readonly badgeSize: number
  readonly image: number
  readonly imageRes: number
  readonly iconSize: number
  readonly textSize: number
}

export type ViewMode = ListViewMode | GalleryViewMode
