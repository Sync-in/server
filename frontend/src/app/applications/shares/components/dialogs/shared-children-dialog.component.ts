import { NgTemplateOutlet } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import type { ShareChild } from '@sync-in-server/backend/src/applications/shares/models/share-child.model'
import { L10nTranslateDirective } from 'angular-l10n'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { Observable } from 'rxjs'
import { take } from 'rxjs/operators'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { LayoutService } from '../../../../layout/layout.service'
import { LinkDialogComponent } from '../../../links/components/dialogs/link-dialog.component'
import { ShareLinkModel } from '../../../links/models/share-link.model'
import { LinksService } from '../../../links/services/links.service'
import { SpaceModel } from '../../../spaces/models/space.model'
import { SpacesService } from '../../../spaces/services/spaces.service'
import { SPACES_ICON } from '../../../spaces/spaces.constants'
import { UserAvatarComponent } from '../../../users/components/utils/user-avatar.component'
import { ShareChildModel } from '../../models/share-child.model'
import { ShareFileModel } from '../../models/share-file.model'
import { ShareModel } from '../../models/share.model'
import { SharesService } from '../../services/shares.service'
import { ShareDialogComponent } from './share-dialog.component'

@Component({
  selector: 'app-shared-children-dialog',
  templateUrl: 'shared-children-dialog.component.html',
  imports: [AutoResizeDirective, NgTemplateOutlet, L10nTranslateDirective, FaIconComponent, UserAvatarComponent],
  styleUrls: ['shared-children-dialog.component.scss']
})
export class SharedChildrenDialogComponent implements OnInit {
  @Input() fromAdmin = false
  @Input() share: ShareFileModel
  @Input() space: SpaceModel
  @Output() sharesCountEvent = new EventEmitter<number>()
  protected readonly layout = inject(LayoutService)
  protected readonly icons = { SHARED: SPACES_ICON.SHARED_WITH_OTHERS, LINKS: SPACES_ICON.LINKS }
  protected loading = false
  protected childSharesLength = 0
  protected childShares: ShareChildModel[]
  protected selected: ShareChildModel
  private readonly sharesService = inject(SharesService)
  private readonly linksService = inject(LinksService)
  private readonly spacesService = inject(SpacesService)

  ngOnInit() {
    this.loadChildShares()
  }

  toShares(shares: ShareChildModel[]): ShareChildModel[] {
    // for typing only
    return shares
  }

  loadChildShares() {
    this.loading = true
    let req: Observable<ShareChild[]>
    if (this.share) {
      req = this.sharesService.listChildShares(this.share.id)
    } else if (this.space) {
      req = this.spacesService.listSpaceShares(this.space.id)
    } else {
      console.error('share or space not defined')
      return
    }
    req.subscribe({
      next: (shares: ShareChild[]) => {
        this.childSharesLength = shares.length
        this.sharesCountEvent.emit(shares.length)
        this.setShares(shares.map((s) => new ShareChildModel(s)))
        this.loading = false
      },
      error: (e: HttpErrorResponse) => {
        this.childShares = []
        this.childSharesLength = 0
        this.loading = false
        this.layout.sendNotification('error', 'Child shares', e.error.message)
      }
    })
  }

  onSelect(share: ShareChildModel) {
    this.selected = share
  }

  openChildShare() {
    if (this.selected.isShareLink) {
      let req: Observable<ShareLinkModel>
      if (this.share) {
        req = this.linksService.shareLinkChild(this.share.id, this.selected.id)
      } else if (this.space) {
        req = this.spacesService.getSpaceShareLink(this.space.id, this.selected.id)
      } else {
        console.error('share or space not defined')
        return
      }
      req.subscribe({
        next: (share: ShareLinkModel) => {
          const modalRef: BsModalRef<LinkDialogComponent> = this.layout.openDialog(LinkDialogComponent, 'md', {
            initialState: { share: share } as LinkDialogComponent
          })
          modalRef.content.shareChange.pipe(take(1)).subscribe((r: ['update' | 'delete', ShareLinkModel] | ['add', ShareModel]) => {
            const [action, s] = r
            if (action === 'update') {
              this.selected.name = s.name
            } else {
              this.loadChildShares()
            }
          })
        },
        error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Edit children shares', this.selected.name, e)
      })
    } else {
      let req: Observable<ShareModel>
      if (this.share) {
        req = this.sharesService.getShareChild(this.share.id, this.selected.id)
      } else if (this.space) {
        req = this.spacesService.getSpaceShare(this.space.id, this.selected.id)
      } else {
        console.error('share or space not defined')
        return
      }
      req.subscribe({
        next: (share: ShareModel) => {
          const modalRef: BsModalRef<ShareDialogComponent> = this.layout.openDialog(ShareDialogComponent, 'lg', {
            initialState: {
              ...(this.share ? { parentShareId: this.share.id } : {}),
              ...(this.space ? { parentSpaceId: this.space.id } : {}),
              share: share
            } as ShareDialogComponent
          })
          modalRef.content.shareChange.pipe(take(1)).subscribe((r: ['update' | 'delete' | string, ShareModel]) => {
            const [action, s] = r
            if (action === 'update') {
              this.selected.name = s.name
              this.selected.alias = s.alias
            } else {
              this.loadChildShares()
            }
          })
        },
        error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Edit children shares', this.selected.name, e)
      })
    }
  }

  private setShares(shares: ShareChildModel[]) {
    const root = { id: this.share?.id || 0, children: [] }
    this.recurseChildrenShares(shares, root as ShareChildModel)
    this.childShares = root.children
  }

  private recurseChildrenShares(shares: ShareChildModel[], parent: ShareChildModel) {
    for (const s of shares) {
      if (s.parentId === parent.id) {
        parent.children = parent.children ?? []
        parent.children.push(s)
        this.recurseChildrenShares(shares, s)
      } else if (parent.id === 0 && !s.parentId) {
        parent.children = parent.children ?? []
        parent.children.push(s)
        this.recurseChildrenShares(shares, s)
      }
    }
  }
}
