import { Component, inject, Input, OnChanges, OnInit } from '@angular/core'
import type { LucideIcon } from '@lucide/angular'
import { LucideCircleQuestionMark, LucideDynamicIcon } from '@lucide/angular'
import { L10N_LOCALE, L10nLocale, L10nTranslatePipe } from 'angular-l10n'
import type { ViewMode } from '../../../../common/components/navigation-view/navigation-view.component'
import { ShareLinkModel } from '../../../links/models/share-link.model'
import { SPACES_ICON, SPACES_TITLE } from '../../../spaces/spaces.constants'
import { ShareFileModel } from '../../models/share-file.model'
import { ShareModel } from '../../models/share.model'

interface ShareRepository {
  icon: LucideIcon
  label: string
  class: string
  translate: boolean
}

@Component({
  selector: 'app-share-repository',
  imports: [L10nTranslatePipe, LucideDynamicIcon],
  template: `
    @if (galleryMode?.enabled) {
      <span
        [class]="repository.class"
        [style.min-width.px]="galleryMode.dimensions / 3.5"
        [style.min-height.px]="galleryMode.dimensions / 3.5"
        [style.font-size.px]="galleryMode.iconSize / 2.2"
      >
        <svg [lucideIcon]="repository.icon"></svg>
      </span>
    } @else {
      <div class="d-flex align-items-center overflow-wrap-and-whitespace">
        @if (showIcon) {
          <span [class]="repository.class" class="me-2">
            <svg [lucideIcon]="repository.icon"></svg>
          </span>
        }
        <span class="no-pointer-events" draggable="false">
          @if (repository.translate) {
            {{ repository.label | translate: locale.language }}
          } @else {
            {{ repository.label }}
          }
        </span>
      </div>
    }
  `
})
export class ShareRepositoryComponent implements OnInit, OnChanges {
  @Input({ required: true }) share: Partial<ShareModel> | ShareFileModel | ShareLinkModel
  @Input() galleryMode: ViewMode
  @Input() showIcon = true
  @Input() showFullPath = false
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected repository: ShareRepository
  private unknownRepository: ShareRepository = {
    icon: LucideCircleQuestionMark,
    label: '',
    class: 'circle-primary-icon',
    translate: false
  }

  ngOnInit() {
    this.setRepository()
  }

  ngOnChanges() {
    this.setRepository()
  }

  private setRepository() {
    if (this.share.parent?.id || this.share.parent?.id === 0) {
      this.repository = {
        icon: SPACES_ICON.SHARES,
        label: this.share.parent.name,
        class: 'circle-purple-icon',
        translate: false
      }
    } else if (this.share.file?.ownerId) {
      this.repository = {
        icon: SPACES_ICON.PERSONAL,
        label: SPACES_TITLE.PERSONAL_SPACE,
        class: 'circle-primary-icon',
        translate: true
      }
    } else if (this.share.file?.space?.alias) {
      this.repository = {
        icon: SPACES_ICON.SPACES,
        label: `${this.share.file.space.name}`,
        class: 'circle-primary-icon',
        translate: false
      }
    } else if (this.share.externalPath) {
      this.repository = {
        icon: SPACES_ICON.EXTERNAL,
        label: 'External',
        class: 'circle-primary-icon',
        translate: true
      }
    } else {
      this.repository = { ...this.unknownRepository }
    }
    if (this.showFullPath) {
      this.setFullPath()
    }
  }

  private setFullPath() {
    if (!this.repository.label) return
    const paths: string[] = this.share.file?.path ? this.share.file.path.split('/').filter((p: string) => p && p !== '.') : []
    if (this.share.parent?.id && !this.share.file?.id && this.share.file?.path.indexOf('/') === -1) {
      // remove the first element, it is replaced by the share itself
      paths.shift()
    } else if (this.share.file?.space?.alias) {
      if (this.share.file.space?.root?.alias) {
        if (paths.length) {
          paths.unshift(this.share.file.space.root.name)
        } else {
          paths.push(this.share.file.space.root.name)
        }
      }
    }
    if (this.repository.label === SPACES_TITLE.PERSONAL_SPACE && paths.length) {
      this.repository.label = paths.join('/')
      this.repository.translate = false
    } else if (paths.length) {
      this.repository.label = `${this.repository.label}/${paths.join('/')}`
    }
  }
}
