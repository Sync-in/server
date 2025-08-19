/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { Router } from '@angular/router'
import { LINK_ERROR, LINK_TYPE } from '@sync-in-server/backend/src/applications/links/constants/links'
import {
  API_PUBLIC_LINK_ACCESS,
  API_PUBLIC_LINK_AUTH,
  API_PUBLIC_LINK_VALIDATION
} from '@sync-in-server/backend/src/applications/links/constants/routes'
import type { CreateOrUpdateLinkDto } from '@sync-in-server/backend/src/applications/links/dto/create-or-update-link.dto'
import type { LinkGuest } from '@sync-in-server/backend/src/applications/links/interfaces/link-guest.interface'
import type { SpaceLink } from '@sync-in-server/backend/src/applications/links/interfaces/link-space.interface'
import {
  API_SHARES_LINKS,
  API_SHARES_LINKS_LIST,
  API_SHARES_LINKS_UUID,
  SHARES_ROUTE
} from '@sync-in-server/backend/src/applications/shares/constants/routes'
import { SPACE_OPERATION, SPACE_ROLE } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { MEMBER_TYPE } from '@sync-in-server/backend/src/applications/users/constants/member'
import type { UserPasswordDto } from '@sync-in-server/backend/src/applications/users/dto/user-password.dto'
import type { LoginResponseDto } from '@sync-in-server/backend/src/authentication/dto/login-response.dto'
import { BsModalRef } from 'ngx-bootstrap/modal'
import { ClipboardService } from 'ngx-clipboard'
import { catchError, map, Observable, of } from 'rxjs'
import { take } from 'rxjs/operators'
import { AuthService } from '../../../auth/auth.service'
import { downloadWithAnchor } from '../../../common/utils/functions'
import { LayoutService } from '../../../layout/layout.service'
import { ShareModel } from '../../shares/models/share.model'
import { SpaceModel } from '../../spaces/models/space.model'
import { SPACES_PATH } from '../../spaces/spaces.constants'
import { MemberModel } from '../../users/models/member.model'
import { LinkDialogComponent } from '../components/dialogs/link-dialog.component'
import { LINKS_PATH } from '../links.constants'
import { ShareLinkModel } from '../models/share-link.model'

@Injectable({
  providedIn: 'root'
})
export class LinksService {
  private readonly router = inject(Router)
  private readonly http = inject(HttpClient)
  private readonly layout = inject(LayoutService)
  private readonly authService = inject(AuthService)
  private readonly clipboard = inject(ClipboardService)

  shareLinksList(): Observable<ShareLinkModel[]> {
    return this.http.get<ShareLinkModel[]>(API_SHARES_LINKS_LIST).pipe(map((sls: Partial<ShareLinkModel>[]) => sls.map((s) => new ShareLinkModel(s))))
  }

  shareLink(shareId: number): Observable<ShareLinkModel> {
    return this.http.get<ShareLinkModel>(`${API_SHARES_LINKS}/${shareId}`).pipe(map((s: Partial<ShareLinkModel>) => new ShareLinkModel(s)))
  }

  shareLinkChild(shareId: number, childId: number): Observable<ShareLinkModel> {
    return this.http
      .get<ShareLinkModel>(`${API_SHARES_LINKS}/${shareId}/${SHARES_ROUTE.CHILDREN}/${childId}`)
      .pipe(map((s: Partial<ShareLinkModel>) => new ShareLinkModel(s)))
  }

  linkFromSpaceOrShare(linkId: number, shareOrSpaceId: number, type: LINK_TYPE): Observable<LinkGuest> {
    return this.http.get<LinkGuest>(`${API_SHARES_LINKS}/${linkId}/${type}/${shareOrSpaceId}`)
  }

  linkValidation(uuid: string): Observable<SpaceLink | false> {
    return this.http.get<{ ok: boolean; error: string | null; link: SpaceLink }>(`${API_PUBLIC_LINK_VALIDATION}/${uuid}`).pipe(
      map((r: { ok: boolean; error: string | null; link: SpaceLink }) => {
        if (r.ok) {
          return r.link
        }
        if (r.error) {
          if (r.error === LINK_ERROR.UNAUTHORIZED) {
            this.router.navigate([`${LINKS_PATH.LINK}/${uuid}/${LINKS_PATH.AUTH}`]).catch((e: Error) => console.error(e))
          } else {
            this.router.navigate([`${LINKS_PATH.LINK}/${uuid}/${r.error}`]).catch((e: Error) => console.error(e))
          }
        }
        return false
      }),
      catchError((): Observable<false> => {
        this.authService.logout()
        return of(false)
      })
    )
  }

  linkAccess(uuid: string, link: SpaceLink) {
    if (link.share?.isDir || link.space?.alias) {
      this.http.get<LoginResponseDto>(`${API_PUBLIC_LINK_ACCESS}/${uuid}`).subscribe((r) => {
        this.authService.initUserFromResponse(r)
        if (link.space) {
          this.router.navigate([SPACES_PATH.SPACES], { queryParams: { select: link.space.name } }).catch((e: Error) => console.error(e))
        } else {
          this.router.navigate([SPACES_PATH.SPACES_SHARES], { queryParams: { select: link.share.name } }).catch((e: Error) => console.error(e))
        }
      })
    } else {
      downloadWithAnchor(`${API_PUBLIC_LINK_ACCESS}/${uuid}`)
    }
  }

  linkAuthentication(uuid: string, password: string): Observable<boolean> {
    return this.http.post<LoginResponseDto>(`${API_PUBLIC_LINK_AUTH}/${uuid}`, { password } as UserPasswordDto).pipe(
      map((r: LoginResponseDto) => {
        this.authService.initUserFromResponse(r)
        this.router.navigate([`${LINKS_PATH.LINK}/${uuid}`]).catch((e: Error) => console.error(e))
        return true
      }),
      catchError((e) => {
        if (e.error.message === LINK_ERROR.UNAUTHORIZED) {
          this.layout.sendNotification('warning', 'Link', 'Bad password')
        } else {
          this.router.navigate([`${LINKS_PATH.LINK}/${uuid}/${e.error.message}`]).catch((e: Error) => console.error(e))
        }
        return of(false)
      })
    )
  }

  copyLinkToClipboard(link: string) {
    this.clipboard.copyFromContent(this.genLink(link))
  }

  genUUID(): Observable<string> {
    return this.http.get<{ uuid: string }>(API_SHARES_LINKS_UUID).pipe(map((r) => r.uuid))
  }

  createLinkDialog(obj: ShareModel | SpaceModel) {
    /* create link when space/share is submitted */
    this.genUUID().subscribe((uuid: string) => {
      const modalRef: BsModalRef<LinkDialogComponent> = this.layout.openDialog(LinkDialogComponent, 'md', {
        initialState: { link: { name: obj.name, uuid: uuid, isActive: true, nbAccess: 0 } } as LinkDialogComponent
      })
      this.subscribeToSubmitLinkModal(modalRef, obj)
    })
  }

  updateLinkFromSpaceOrShare(
    linkId: number,
    shareOrSpaceId: number,
    type: LINK_TYPE,
    createOrUpdateLinkDto: CreateOrUpdateLinkDto
  ): Observable<LinkGuest> {
    return this.http.put<LinkGuest>(`${API_SHARES_LINKS}/${linkId}/${type}/${shareOrSpaceId}`, createOrUpdateLinkDto)
  }

  editLinkDialog(member: MemberModel, obj: ShareModel | SpaceModel, type: LINK_TYPE) {
    /* update link when space/share is submitted */
    if (obj.id === 0 || member?.linkSettings?.uuid) {
      // update link on a new share
      const modalRef: BsModalRef<LinkDialogComponent> = this.layout.openDialog(LinkDialogComponent, 'md', {
        initialState: { link: member.linkSettings } as LinkDialogComponent
      })
      this.subscribeToSubmitLinkModal(modalRef, obj, member)
    } else {
      // update link on an existing share
      this.linkFromSpaceOrShare(member.linkId, obj.id, type).subscribe({
        next: (l: LinkGuest) => {
          const modalRef: BsModalRef<LinkDialogComponent> = this.layout.openDialog(LinkDialogComponent, 'md', {
            initialState: { link: { ...l, permissions: member.permissions } } as LinkDialogComponent
          })
          this.subscribeToSubmitLinkModal(modalRef, obj, member)
        },
        error: (e: HttpErrorResponse) => this.layout.sendNotification('error', 'Link error', member.name || obj.name, e)
      })
    }
  }

  shareLinkGuestToMember(userId: number, linkId: number, link: LinkGuest): MemberModel {
    return new MemberModel(
      {
        id: userId,
        linkId: linkId,
        name: link.name,
        description: link.email,
        createdAt: link.createdAt,
        permissions: link.permissions,
        type: MEMBER_TYPE.LINK,
        spaceRole: SPACE_ROLE.IS_MEMBER,
        linkSettings: link
      },
      [SPACE_OPERATION.SHARE_INSIDE, SPACE_OPERATION.SHARE_OUTSIDE]
    )
  }

  private subscribeToSubmitLinkModal(modalRef: BsModalRef<LinkDialogComponent>, obj: ShareModel | SpaceModel, member?: MemberModel) {
    modalRef.content.submitEvent.pipe(take(1)).subscribe((diffLink: CreateOrUpdateLinkDto) => {
      if (Object.keys(diffLink).length) {
        const linkGuest: LinkGuest = Object.assign(modalRef.content.link, diffLink)
        const linkMember = this.shareLinkGuestToMember(
          linkGuest.userId || -(obj.links.length + 1),
          member?.linkId || -(obj.links.length + 1),
          linkGuest
        )
        if (linkMember.linkId) {
          obj.links = [linkMember, ...obj.links.filter((l) => l.linkId !== linkMember.linkId)]
        } else {
          obj.links = [linkMember, ...obj.links]
        }
      }
      modalRef.content.layout.closeDialog()
    })
  }

  private genLink(link: string): string {
    return `${document.location.origin}/#/${LINKS_PATH.LINK}/${link}`
  }
}
