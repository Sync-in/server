import { Pipe, PipeTransform } from '@angular/core'

@Pipe({ name: 'split' })
export class SplitPipe implements PipeTransform {
  transform(input: string, separator = ','): string[] {
    if (!input?.length) {
      return []
    }
    return input.split(separator)
  }
}
