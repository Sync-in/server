/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ChangeDetectionStrategy, Component, input, InputSignal, inject } from '@angular/core'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { AutoResizeDirective } from '../../../../common/directives/auto-resize.directive'
import { TimeDateFormatPipe } from '../../../../common/pipes/time-date-format.pipe'
import { defaultCardImageSize, defaultResizeOffset } from '../../../../layout/layout.constants'
import { FilePermissionsComponent } from '../../../files/components/utils/file-permissions.component'
import { ShareRepositoryComponent } from '../../../shares/components/utils/share-repository.component'
import { ShareLinkModel } from '../../models/share-link.model'

@Component({
  selector: 'app-link-selection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AutoResizeDirective, L10nTranslateDirective, L10nTranslatePipe, TimeDateFormatPipe, ShareRepositoryComponent, FilePermissionsComponent],
  templateUrl: 'link-selection.component.html',
  styles: ['.card {width: 100%; background: transparent; border: none}']
})
export class LinkSelectionComponent {
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  link: InputSignal<ShareLinkModel> = input.required<ShareLinkModel>()
  protected readonly cardImageSize = defaultCardImageSize
  protected readonly resizeOffset = defaultResizeOffset
  protected accessHover = false
  protected lastAccessHover = false
}
