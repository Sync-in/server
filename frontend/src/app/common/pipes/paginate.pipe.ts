import { Pipe, PipeTransform } from '@angular/core'

@Pipe({
  name: 'paginate'
})
export class PaginatePipe implements PipeTransform {
  transform(items: any[], page: number = 1, itemsPerPage: number): any[] {
    if (!items?.length) {
      return []
    }
    const start = (page - 1) * itemsPerPage
    return items.slice(start, start + itemsPerPage)
  }
}
