import { Component, inject, signal } from '@angular/core'
import { ActivatedRoute, Data, Params } from '@angular/router'
import { LucideDynamicIcon, LucideEye, LucideHardDriveDownload, LucidePencil } from '@lucide/angular'
import type { SpaceLink } from '@sync-in-server/backend/src/applications/links/interfaces/link-space.interface'
import { SPACE_OPERATION, SPACE_REPOSITORY } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { FileModel } from '../../../files/models/file.model'
import { SPACES_ICON } from '../../../spaces/spaces.constants'
import { LinksService } from '../../services/links.service'
import { PublicLinkHeaderComponent } from './public-link-header.component'

@Component({
  selector: 'app-public-link',
  imports: [LucideDynamicIcon, L10nTranslatePipe, L10nTranslateDirective, PublicLinkHeaderComponent],
  templateUrl: 'public-link.component.html'
})
export class PublicLinkComponent {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly icons = { SPACES: SPACES_ICON.SPACES, LucideEye, LucideHardDriveDownload, LucidePencil }
  protected readonly file = signal<FileModel>(undefined)
  protected readonly fileCanBeModified = signal(false)
  protected readonly link = signal<SpaceLink>(undefined)
  private readonly activatedRoute = inject(ActivatedRoute)
  private readonly linksService = inject(LinksService)
  private linkUUID: string

  constructor() {
    this.activatedRoute.params.subscribe((params: Params) => (this.linkUUID = params.uuid))
    this.activatedRoute.data.subscribe((data: Data) => this.setLink(data.link))
  }

  openLink() {
    this.linksService.linkAccessOrView(this.linkUUID, this.link(), true)
  }

  downloadLink() {
    this.linksService.linkDownload(this.linkUUID)
  }

  followLink() {
    this.linksService.linkAccessOrView(this.linkUUID, this.link())
  }

  fallBackMimeUrl() {
    this.file().fallBackMimeUrl()
  }

  private setLink(link: SpaceLink) {
    if (!link.space) {
      this.file.set(
        new FileModel(
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
      )
      this.fileCanBeModified.set(link.share.permissions.indexOf(SPACE_OPERATION.MODIFY) > -1)
    }
    this.link.set(link)
  }
}
