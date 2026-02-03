export class SelectItem {
  id: string
  name: string
  description: string

  constructor(source: any) {
    if (typeof source === 'string') {
      this.id = this.name = source
      this.description = ''
    }
    if (typeof source === 'object') {
      this.id = source.id || source.name
      this.name = source.name
      this.description = source.description || ''
    }
  }
}
