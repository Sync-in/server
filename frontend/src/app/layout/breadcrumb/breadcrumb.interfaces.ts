export interface BreadcrumbLevel {
  link: string
  title: string
}

export interface BreadcrumbLevelMutation {
  setTitle?: string
  translateTitle?: boolean
  setUrl?: boolean
}

export interface BreadCrumbUrl {
  url: string
  translating?: boolean
  sameLink?: boolean
  firstLink?: string
  splicing?: number
  mutateLevel?: Record<number, BreadcrumbLevelMutation>
}
