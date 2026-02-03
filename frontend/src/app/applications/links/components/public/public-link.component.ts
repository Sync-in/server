import { Component, inject } from '@angular/core'
import { ActivatedRoute, Data, Params, RouterLink } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faDownload, faEye, faPen } from '@fortawesome/free-solid-svg-icons'
import type { SpaceLink } from '@sync-in-server/backend/src/applications/links/interfaces/link-space.interface'
import { SPACE_OPERATION, SPACE_REPOSITORY } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { logoUrl } from '../../../files/files.constants'
import { FileModel } from '../../../files/models/file.model'
import { SPACES_ICON } from '../../../spaces/spaces.constants'
import { LinksService } from '../../services/links.service'

@Component({
  selector: 'app-public-link',
  imports: [RouterLink, FaIconComponent, L10nTranslatePipe, L10nTranslateDirective],
  templateUrl: 'public-link.component.html'
})
export class PublicLinkComponent {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly icons = { SPACES: SPACES_ICON.SPACES, faEye, faDownload, faPen }
  protected readonly logoUrl = logoUrl
  protected file: FileModel
  protected fileCanBeModified: boolean
  protected link: SpaceLink
  private readonly activatedRoute = inject(ActivatedRoute)
  private readonly linksService = inject(LinksService)
  private linkUUID: string

  constructor() {
    this.activatedRoute.params.subscribe((params: Params) => (this.linkUUID = params.uuid))
    this.activatedRoute.data.subscribe((data: Data) => this.setLink(data.link))
  }

  openLink() {
    this.linksService.linkAccessOrView(this.linkUUID, this.link, this.file)
  }

  downloadLink() {
    this.linksService.linkDownload(this.linkUUID)
  }

  followLink() {
    this.linksService.linkAccessOrView(this.linkUUID, this.link)
  }

  fallBackMimeUrl() {
    this.file.fallBackMimeUrl()
  }

  private setLink(link: SpaceLink) {
    if (!link.space) {
      this.file = new FileModel(
        {
          id: -1,
          name: link.share.name,
          path: '',
          isDir: link.share.isDir,
          size: link.share.size,
          mime: link.share.mime,
          mtime: link.share.mtime,
          root: { alias: link.share.alias }
        } as FileModel,
        SPACE_REPOSITORY.SHARES,
        link.share.hasParent,
        link.fileEditors
      )
      this.fileCanBeModified = link.share.permissions.indexOf(SPACE_OPERATION.MODIFY) > -1
    }
    this.link = link
  }
}
