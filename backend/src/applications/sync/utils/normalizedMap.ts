function hasNonAscii(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 0x7f) {
      return true
    }
  }
  return false
}

export class NormalizedMap<K extends string, V> extends Map<K, V> {
  // NFC-normalized path -> actual key
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
    return hasNonAscii(key) ? key.normalize('NFC') : key
  }

  override set(key: K, value: V): this {
    const normalizedKey = this.normalizeKey(key)
    const previousKey = this.index.get(normalizedKey)
    if (previousKey !== undefined && previousKey !== key) {
      // Canonically equivalent Unicode paths are the same logical sync path.
      super.delete(previousKey)
    }
    this.index.set(normalizedKey, key)
    return super.set(key, value)
  }

  getResolvedKey(input: string): K | undefined {
    return this.index.get(this.normalizeKey(input))
  }

  override get(key: string): V | undefined {
    const resolved = this.getResolvedKey(key)
    return resolved !== undefined ? super.get(resolved) : undefined
  }

  override has(key: string): boolean {
    return this.index.has(this.normalizeKey(key))
  }

  override delete(key: string): boolean {
    const normalizedKey = this.normalizeKey(key)
    const resolved = this.index.get(normalizedKey)
    if (resolved !== undefined) {
      this.index.delete(normalizedKey)
      return super.delete(resolved)
    }
    return false
  }

  override clear(): void {
    this.index.clear()
    super.clear()
  }
}
