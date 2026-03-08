import { Pipe, PipeTransform } from '@angular/core'
import { filterArray } from '../utils/functions'

@Pipe({
  name: 'searchFilter'
})
export class SearchFilterPipe implements PipeTransform {
  transform<T>(collection: T[] | null | undefined, search: string, field?: string): T[] {
    if (!collection?.length || !search) {
      return collection ?? []
    }
    return filterArray(search, collection, field)
  }
}
