export interface BreadCrumbUrl {
  url: string
  translating?: boolean
  sameLink?: boolean
  firstLink?: string
  splicing?: number
  mutateLevel?: Record<number, { setTitle?: string; translateTitle?: boolean; setUrl?: boolean; hide?: boolean }>
}
