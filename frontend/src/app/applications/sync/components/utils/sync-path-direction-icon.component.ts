import { Component, input } from '@angular/core'
import { LucideArrowUpDown, LucideDynamicIcon } from '@lucide/angular'
import { SYNC_PATH_MODE } from '@sync-in-server/backend/src/applications/sync/constants/sync'
import { SYNC_TRANSFER_SIDE, SYNC_TRANSFER_SIDE_CLASS, SYNC_TRANSFER_SIDE_ICON } from '../../constants/transfer'

@Component({
  selector: 'app-sync-path-direction-icon',
  imports: [LucideDynamicIcon],
  template: `
    <span class="d-flex justify-content-center">
      @if (small() && mode() === SYNC_PATH_MODE.BOTH) {
        <svg [lucideIcon]="SYNC_TRANSFER_BOTH_ICON"></svg>
      } @else {
        @if (mode() === SYNC_PATH_MODE.UPLOAD || mode() === SYNC_PATH_MODE.BOTH) {
          <span [class.me-1]="mode() === SYNC_PATH_MODE.BOTH" class="{{ small() ? '' : SYNC_TRANSFER_SIDE_CLASS[SYNC_TRANSFER_SIDE.REMOTE] }}">
            <svg [class]="small() ? '' : 'fs-lg'" [lucideIcon]="SYNC_TRANSFER_SIDE_ICON[SYNC_TRANSFER_SIDE.REMOTE]"></svg>
          </span>
        }
        @if (mode() === SYNC_PATH_MODE.DOWNLOAD || mode() === SYNC_PATH_MODE.BOTH) {
          <span class="{{ small() ? '' : SYNC_TRANSFER_SIDE_CLASS[SYNC_TRANSFER_SIDE.LOCAL] }}">
            <svg [class]="small() ? '' : 'fs-lg'" [lucideIcon]="SYNC_TRANSFER_SIDE_ICON[SYNC_TRANSFER_SIDE.LOCAL]"></svg>
          </span>
        }
      }
    </span>
  `
})
export class SyncPathDirectionIconComponent {
  readonly mode = input.required<SYNC_PATH_MODE>()
  readonly small = input(false)
  protected readonly SYNC_PATH_MODE = SYNC_PATH_MODE
  protected readonly SYNC_TRANSFER_SIDE_ICON = SYNC_TRANSFER_SIDE_ICON
  protected readonly SYNC_TRANSFER_SIDE = SYNC_TRANSFER_SIDE
  protected readonly SYNC_TRANSFER_SIDE_CLASS = SYNC_TRANSFER_SIDE_CLASS
  protected readonly SYNC_TRANSFER_BOTH_ICON = LucideArrowUpDown
}
