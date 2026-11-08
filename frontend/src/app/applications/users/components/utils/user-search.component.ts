import { KeyValuePipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, ElementRef, inject, input, model, OnInit, signal, viewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { LucideDynamicIcon, LucidePencil, LucideX } from '@lucide/angular'
import { SPACE_OPERATION } from '@sync-in-server/backend/src/applications/spaces/constants/spaces'
import { MEMBER_TYPE } from '@sync-in-server/backend/src/applications/users/constants/member'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { ButtonsModule } from 'ngx-bootstrap/buttons'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { TypeaheadModule } from 'ngx-bootstrap/typeahead'
import { mergeMap, Observable, of } from 'rxjs'
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    L10nTranslatePipe,
    TimeAgoPipe,
    TypeaheadModule,
    FormsModule,
    HighlightPipe,
    LucideDynamicIcon,
    L10nTranslateDirective,
    ButtonsModule,
    KeyValuePipe,
    TooltipModule
  ],
  templateUrl: 'users-search.component.html',
  styles: `
    .lucide {
      margin: 2px;
      font-size: 1rem;
    }

    .user-search-member-row {
      max-height: 38px;
    }

    @media (max-width: 767.98px) {
      .user-search-member-row--with-permissions {
        align-items: stretch !important;
        flex-direction: column;
        max-height: none;
      }

      .user-search-member-row--with-permissions .user-search-member-actions {
        justify-content: flex-start;
        margin-top: 0.5rem;
        width: 100%;
      }

      .user-search-member-row--with-permissions .user-search-member-actions__separator {
        display: none;
      }
    }
  `
})
export class UserSearchComponent implements OnInit {
  private readonly inputTypeHead = viewChild<ElementRef>('InputTypeHead')
  readonly members = model<MemberModel[]>([])
  readonly withPermissions = input(false)
  readonly filterPermissions = input(false)
  readonly allowedPermissions = input<Partial<`${SPACE_OPERATION}`>[]>([])
  readonly editMode = input(true)
  readonly hideInput = input(false)
  readonly searchFunction = input<((search: string) => any) | null>(null)
  readonly editFunction = input<((member: MemberModel) => void) | null>(null)
  readonly customPlaceholder = input<string>()
  readonly rowBackgroundClass = input('bg-theme')
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly MEMBER_TYPE = MEMBER_TYPE
  protected readonly originalOrderKeyValue = originalOrderKeyValue
  protected readonly SPACES_PERMISSIONS_TEXT = SPACES_PERMISSIONS_TEXT
  protected readonly icons = { GROUPS: USER_ICON.GROUPS, LINKS: SPACES_ICON.LINKS, LucideX, LucidePencil }
  protected readonly selection = signal('')
  private readonly defaultPlaceholder = 'Type to search for users or groups to add'
  protected readonly placeHolder = signal(this.defaultPlaceholder)
  private lastResults: MemberModel[] = []
  protected readonly asyncSearchUsersOrGroups: Observable<any> = new Observable((observer: any) => observer.next(this.selection())).pipe(
    mergeMap((search: any) => {
      const searchFunction = this.searchFunction()
      return searchFunction ? searchFunction(search || '').pipe(tap((results: MemberModel[]) => (this.lastResults = results))) : of([])
    })
  )

  ngOnInit() {
    this.setDefaultPlaceHolder()
  }

  onSelect(selection: { item: MemberModel }) {
    // remove selection from input
    this.selection.set('')
    this.inputTypeHead()!.nativeElement.value = ''
    const member: MemberModel = selection.item
    if (!member.createdAt) member.createdAt = new Date()
    this.members.update((members) => [selection.item, ...members])
    this.lastResults = this.lastResults.filter((m: MemberModel) => m.mid !== member.mid)
  }

  onPermissionChange(member: MemberModel) {
    member.permissions = setStringPermission(member.hPerms)
    this.members.update((members) => [...members])
  }

  editMember(member: MemberModel) {
    this.editFunction()?.(member)
  }

  removeMember(member: MemberModel) {
    this.members.update((members) => members.filter((m: MemberModel) => m.mid !== member.mid))
    this.lastResults.push(member)
  }

  onLoading() {
    this.placeHolder.set('Loading...')
  }

  onNoResults() {
    this.placeHolder.set('No results')
  }

  onPreview() {
    this.setDefaultPlaceHolder()
  }

  private setDefaultPlaceHolder() {
    this.placeHolder.set(this.customPlaceholder() || this.defaultPlaceholder)
  }
}
