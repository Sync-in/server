/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ChangeDetectionStrategy, Component, computed, Signal, inject } from '@angular/core'
import { FilesSelectionComponent } from '../../../applications/files/components/sidebar/files-selection.component'
import { LinkSelectionComponent } from '../../../applications/links/components/sidebar/link-selection.component'
import { ShareSelectionComponent } from '../../../applications/shares/components/sidebar/share-selection.component'
import { SpaceSelectionComponent } from '../../../applications/spaces/components/sidebar/space-selection.component'
import { TrashSelectionComponent } from '../../../applications/spaces/components/sidebar/trash-selection.component'
import { SPACES_PATH } from '../../../applications/spaces/spaces.constants'
import { StoreService } from '../../../store/store.service'

@Component({
  selector: 'app-selection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FilesSelectionComponent, ShareSelectionComponent, SpaceSelectionComponent, TrashSelectionComponent, LinkSelectionComponent],
  templateUrl: 'selection.component.html'
})
export class SelectionComponent {
  protected readonly store = inject(StoreService)
  protected SPACES_PATH = SPACES_PATH
  protected selectionType: Signal<(typeof SPACES_PATH)[keyof typeof SPACES_PATH]> = computed(() => this.setRepository(this.store.repository()))

  private setRepository(repository: string) {
    if ([SPACES_PATH.SPACES, SPACES_PATH.SHARED, SPACES_PATH.LINKS, SPACES_PATH.TRASHES].indexOf(repository) > -1) {
      return repository
    }
    return SPACES_PATH.FILES
  }
}
