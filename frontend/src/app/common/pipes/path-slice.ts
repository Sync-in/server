import { Pipe, PipeTransform } from '@angular/core'
import { pathSlice } from '../utils/functions'

@Pipe({ name: 'pathSlice' })
export class PathSlice implements PipeTransform {
  transform(value: string, start = 0, end: number = undefined): string {
    return pathSlice(value, start, end)
  }
}
