export class NormalizedMap<K extends string, V> extends Map<K, V> {
  // NFC-normalized path → actual key
  private index = new Map<string, K>()

  constructor(entries?: readonly (readonly [K, V])[] | null) {
    super()
    if (entries) {
      for (const [k, v] of entries) {
        this.set(k, v)
      }
    }
  }

  private normalizeKey(key: string): string {
    return key.normalize('NFC')
  }

  override set(key: K, value: V): this {
    this.index.set(this.normalizeKey(key), key) // store the "real" key used
    return super.set(key, value)
  }

  getResolvedKey(input: string): K | undefined {
    return this.index.get(this.normalizeKey(input))
  }

  override get(key: string): V | undefined {
    const resolved = this.getResolvedKey(key)
    return resolved ? super.get(resolved) : undefined
  }

  override has(key: string): boolean {
    return this.index.has(this.normalizeKey(key))
  }

  override delete(key: string): boolean {
    const resolved = this.getResolvedKey(key)
    if (resolved) {
      this.index.delete(this.normalizeKey(resolved))
      return super.delete(resolved)
    }
    return false
  }
}
