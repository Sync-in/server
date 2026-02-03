export type Entries<T> = { [K in keyof T]: [K, T[K]] }[keyof T][]

export interface StorageQuota {
  storageUsage: number
  storageQuota: number
}
