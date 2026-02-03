import { Component, Input } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faLongArrowAltDown, faLongArrowAltUp } from '@fortawesome/free-solid-svg-icons'
import { SYNC_PATH_MODE } from '@sync-in-server/backend/src/applications/sync/constants/sync'
import { SYNC_TRANSFER_SIDE, SYNC_TRANSFER_SIDE_CLASS, SYNC_TRANSFER_SIDE_ICON } from '../../constants/transfer'
import { SyncPathModel } from '../../models/sync-path.model'

@Component({
  selector: 'app-sync-path-direction-icon',
  imports: [FaIconComponent],
  template: `
    <span class="d-flex justify-content-center">
      @if (syncPath.settings.mode === SYNC_PATH_MODE.DOWNLOAD || syncPath.settings.mode === SYNC_PATH_MODE.BOTH) {
        @if (small) {
          <fa-icon [icon]="icons.faLongArrowAltDown" [fixedWidth]="syncPath.settings.mode !== SYNC_PATH_MODE.BOTH"></fa-icon>
        } @else {
          <fa-icon [icon]="SYNC_TRANSFER_SIDE_ICON[SYNC_TRANSFER_SIDE.LOCAL]" class="{{ SYNC_TRANSFER_SIDE_CLASS[SYNC_TRANSFER_SIDE.LOCAL] }}">
          </fa-icon>
        }
      }
      @if (syncPath.settings.mode === SYNC_PATH_MODE.UPLOAD || syncPath.settings.mode === SYNC_PATH_MODE.BOTH) {
        @if (small) {
          <fa-icon [icon]="icons.faLongArrowAltUp" [fixedWidth]="syncPath.settings.mode !== SYNC_PATH_MODE.BOTH"></fa-icon>
        } @else {
          <fa-icon
            [icon]="SYNC_TRANSFER_SIDE_ICON[SYNC_TRANSFER_SIDE.REMOTE]"
            [class.ms-1]="syncPath.settings.mode === SYNC_PATH_MODE.BOTH"
            class="{{ SYNC_TRANSFER_SIDE_CLASS[SYNC_TRANSFER_SIDE.REMOTE] }}"
          ></fa-icon>
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
  protected readonly icons = { faLongArrowAltDown, faLongArrowAltUp }
  protected readonly SYNC_TRANSFER_SIDE = SYNC_TRANSFER_SIDE
  protected readonly SYNC_TRANSFER_SIDE_CLASS = SYNC_TRANSFER_SIDE_CLASS
}
