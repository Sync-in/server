import { inject, Pipe, PipeTransform, SecurityContext } from '@angular/core'
import { DomSanitizer } from '@angular/platform-browser'

@Pipe({ name: 'linkify' })
export class LinkifyPipe implements PipeTransform {
  private readonly sanitizer = inject(DomSanitizer)

  transform(value: any): any {
    return this.sanitizer.sanitize(SecurityContext.HTML, this.stylize(value))
  }

  // Modify this method according to your custom logic
  private stylize(text: string): string {
    let stylizedText = ''
    if (text?.length && text.indexOf('http') > -1) {
      for (const t of text.split(' ')) {
        if (t.startsWith('http') && t.length > 7) {
          stylizedText += `<a href="${t}" target="${t.startsWith(document.location.origin) ? '_self' : '_blank'}">${t}</a> `
        } else stylizedText += `${t} `
      }
      return stylizedText
    } else {
      return text
    }
  }
}
