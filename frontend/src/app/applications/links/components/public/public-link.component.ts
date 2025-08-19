/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, inject } from '@angular/core'
import { ActivatedRoute, Data, Params, RouterLink } from '@angular/router'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { SpaceLink } from '@sync-in-server/backend/src/applications/links/interfaces/link-space.interface'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { getAssetsMimeUrl, logoUrl, mimeDirectory, mimeDirectoryShare } from '../../../files/files.constants'
import { SPACES_ICON } from '../../../spaces/spaces.constants'
import { LinksService } from '../../services/links.service'

@Component({
  selector: 'app-public-link',
  imports: [RouterLink, FaIconComponent, L10nTranslatePipe, L10nTranslateDirective],
  templateUrl: 'public-link.component.html'
})
export class PublicLinkComponent {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly icons = { SPACES: SPACES_ICON.SPACES }
  protected readonly logoUrl = logoUrl
  protected mimeUrl: string = null
  protected link: SpaceLink
  private readonly activatedRoute = inject(ActivatedRoute)
  private readonly linksService = inject(LinksService)
  private linkUUID: string

  constructor() {
    this.activatedRoute.params.subscribe((params: Params) => (this.linkUUID = params.uuid))
    this.activatedRoute.data.subscribe((data: Data) => this.setLink(data.link))
  }

  setLink(link: SpaceLink) {
    if (!link.space) {
      this.mimeUrl = getAssetsMimeUrl(link.share.isDir ? (link.share.hasParent ? mimeDirectoryShare : mimeDirectory) : link.share.mime)
    }
    this.link = link
  }

  followLink() {
    this.linksService.linkAccess(this.linkUUID, this.link)
  }
}
