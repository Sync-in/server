/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { KeyValuePipe } from '@angular/common'
import { Component, ElementRef, EventEmitter, Input, NgZone, OnInit, Output, ViewChild, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faPen, faTimes } from '@fortawesome/free-solid-svg-icons'
import { SPACE_OPERATION } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { MEMBER_TYPE } from '@sync-in-server/backend/src/applications/users/constants/member'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { ButtonsModule } from 'ngx-bootstrap/buttons'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { TypeaheadModule } from 'ngx-bootstrap/typeahead'
import { mergeMap, Observable } from 'rxjs'
import { tap } from 'rxjs/operators'
import { HighlightPipe } from '../../../../common/pipes/highlight.pipe'
import { TimeAgoPipe } from '../../../../common/pipes/time-ago.pipe'
import { originalOrderKeyValue } from '../../../../common/utils/functions'
import { SPACES_ICON, SPACES_PERMISSIONS_TEXT } from '../../../spaces/spaces.constants'
import { setStringPermission } from '../../../spaces/spaces.functions'
import { MemberModel } from '../../models/member.model'
import { USER_ICON } from '../../user.constants'

@Component({
  selector: 'app-user-search',
  imports: [
    L10nTranslatePipe,
    TimeAgoPipe,
    TypeaheadModule,
    FormsModule,
    HighlightPipe,
    FaIconComponent,
    L10nTranslateDirective,
    ButtonsModule,
    KeyValuePipe,
    TooltipModule
  ],
  templateUrl: 'users-search.component.html'
})
export class UserSearchComponent implements OnInit {
  protected locale = inject<L10nLocale>(L10N_LOCALE)
  private readonly ngZone = inject(NgZone)
  @ViewChild('InputTypeHead') inputTypeHead: ElementRef
  @Input() members: MemberModel[] = []
  @Output() membersChange = new EventEmitter<MemberModel[]>()
  @Input() withPermissions = false
  @Input() filterPermissions = false
  @Input() allowedPermissions: Partial<`${SPACE_OPERATION}`>[] = []
  @Input() editMode = true
  @Input() hideInput = false
  @Input() searchFunction: (search: string) => any
  @Input() editFunction: (member: MemberModel) => void = null
  @Input() customPlaceholder: string
  protected readonly MEMBER_TYPE = MEMBER_TYPE
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly SPACES_PERMISSIONS_TEXT = SPACES_PERMISSIONS_TEXT
  protected readonly icons = { GROUPS: USER_ICON.GROUPS, LINKS: SPACES_ICON.LINKS, faTimes, faPen }
  private defaultPlaceholder = 'Type to search for users or groups to add'
  private lastResults: MemberModel[] = []
  protected placeHolder = this.defaultPlaceholder
  protected selection = ''
  protected asyncSearchUsersOrGroups: Observable<any> = new Observable((observer: any) => observer.next(this.selection)).pipe(
    mergeMap((search: any) => this.searchFunction(search || '').pipe(tap((results: MemberModel[]) => (this.lastResults = results))))
  )

  ngOnInit() {
    this.setDefaultPlaceHolder()
  }

  private setDefaultPlaceHolder() {
    this.placeHolder = this.customPlaceholder || this.defaultPlaceholder
  }

  onSelect(selection: { item: MemberModel }) {
    // remove selection from input
    this.ngZone.run(() => {
      this.selection = ''
      this.inputTypeHead.nativeElement.value = ''
    })
    const member: MemberModel = selection.item
    if (!member.createdAt) member.createdAt = new Date()
    this.members.unshift(selection.item)
    this.membersChange.emit(this.members)
    this.lastResults = this.lastResults.filter((m: MemberModel) => m.mid !== member.mid)
  }

  onPermissionChange(member: MemberModel) {
    member.permissions = setStringPermission(member.hPerms)
  }

  removeMember(member: MemberModel) {
    this.members = this.members.filter((m: MemberModel) => m.mid !== member.mid)
    this.membersChange.emit(this.members)
    this.lastResults.push(member)
  }

  onLoading() {
    this.placeHolder = 'Loading...'
  }

  onNoResults() {
    this.placeHolder = 'No results'
  }

  onPreview() {
    this.setDefaultPlaceHolder()
  }
}
