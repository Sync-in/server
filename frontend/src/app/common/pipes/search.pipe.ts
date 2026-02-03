import { Pipe, PipeTransform } from '@angular/core'
import { filterArray } from '../utils/functions'

@Pipe({
  name: 'searchFilter'
})
export class SearchFilterPipe implements PipeTransform {
  transform(collection: any[], search: string, field?: string): any[] {
    if (!collection?.length || !search) {
      return collection
    }
    return filterArray(search, collection, field)
  }
}
