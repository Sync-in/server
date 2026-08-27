import { Component, Input } from '@angular/core'
import { LucideArrowUpDown, LucideDynamicIcon } from '@lucide/angular'
import { SYNC_PATH_MODE } from '@sync-in-server/backend/src/applications/sync/constants/sync'
import { SYNC_TRANSFER_SIDE, SYNC_TRANSFER_SIDE_CLASS, SYNC_TRANSFER_SIDE_ICON } from '../../constants/transfer'
import { SyncPathModel } from '../../models/sync-path.model'

@Component({
  selector: 'app-sync-path-direction-icon',
  imports: [LucideDynamicIcon],
  template: `
    <span class="d-flex justify-content-center">
      @if (small && syncPath.settings.mode === SYNC_PATH_MODE.BOTH) {
        <svg [lucideIcon]="SYNC_TRANSFER_BOTH_ICON"></svg>
      } @else {
        @if (syncPath.settings.mode === SYNC_PATH_MODE.UPLOAD || syncPath.settings.mode === SYNC_PATH_MODE.BOTH) {
          <span
            [class.me-1]="syncPath.settings.mode === SYNC_PATH_MODE.BOTH"
            class="{{ small ? '' : SYNC_TRANSFER_SIDE_CLASS[SYNC_TRANSFER_SIDE.REMOTE] }}"
          >
            <svg [lucideIcon]="SYNC_TRANSFER_SIDE_ICON[SYNC_TRANSFER_SIDE.REMOTE]"></svg>
          </span>
        }
        @if (syncPath.settings.mode === SYNC_PATH_MODE.DOWNLOAD || syncPath.settings.mode === SYNC_PATH_MODE.BOTH) {
          <span class="{{ small ? '' : SYNC_TRANSFER_SIDE_CLASS[SYNC_TRANSFER_SIDE.LOCAL] }}">
            <svg [lucideIcon]="SYNC_TRANSFER_SIDE_ICON[SYNC_TRANSFER_SIDE.LOCAL]"></svg>
          </span>
        }
      }
    </span>
  `
})
export class SyncPathDirectionIconComponent {
  @Input({ required: true }) syncPath: SyncPathModel
  @Input() small = false
  protected readonly SYNC_PATH_MODE = SYNC_PATH_MODE
  protected readonly SYNC_TRANSFER_SIDE_ICON = SYNC_TRANSFER_SIDE_ICON
  protected readonly SYNC_TRANSFER_SIDE = SYNC_TRANSFER_SIDE
  protected readonly SYNC_TRANSFER_SIDE_CLASS = SYNC_TRANSFER_SIDE_CLASS
  protected readonly SYNC_TRANSFER_BOTH_ICON = LucideArrowUpDown
}
