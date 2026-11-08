import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { pathSlice } from '../../../../common/utils/functions'
import { ShareLinkModel } from '../../../links/models/share-link.model'
import { ShareModel } from '../../models/share.model'

@Component({
  selector: 'app-share-file-name',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  template: ` <div class="d-flex align-items-center">
    <img [src]="share().mimeUrl" draggable="false" height="30" width="30" alt="" (error)="share().fallBackMimeUrl()" />
    <div class="d-flex flex-column overflow-wrap-and-whitespace ms-2">
      {{ fileName() }}
    </div>
  </div>`
})
export class ShareFileNameComponent {
  readonly share = input.required<ShareModel | ShareLinkModel>()
  protected readonly fileName = computed(() => {
    const share = this.share()
    const fName: string = share.file ? pathSlice(share.file.name, -1) : ''
    if (!fName) {
      if (share.parent?.id) {
        return share.parent.name
      } else if (share instanceof ShareModel && share.externalPath) {
        return share.externalPath
      }
      return ''
    }
    return fName
  })
}
