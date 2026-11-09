import { Component, computed, inject, input } from '@angular/core'
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
    @let view = galleryMode();
    @let currentRepository = repository();
    @if (view?.enabled) {
      <span
        [class]="currentRepository.class"
        [style.min-width.px]="view.dimensions / 3.5"
        [style.min-height.px]="view.dimensions / 3.5"
        [style.font-size.px]="view.iconSize / 2.2"
      >
        <svg [lucideIcon]="currentRepository.icon"></svg>
      </span>
    } @else {
      <div class="d-flex align-items-center overflow-wrap-and-whitespace">
        @if (showIcon()) {
          <span [class]="currentRepository.class" class="me-2">
            <svg [lucideIcon]="currentRepository.icon"></svg>
          </span>
        }
        <span class="no-pointer-events" draggable="false">
          @if (currentRepository.translate) {
            {{ currentRepository.label | translate: locale.language }}
          } @else {
            {{ currentRepository.label }}
          }
        </span>
      </div>
    }
  `
})
export class ShareRepositoryComponent {
  readonly share = input.required<Partial<ShareModel> | ShareFileModel | ShareLinkModel>()
  readonly galleryMode = input<ViewMode>()
  readonly showIcon = input(true)
  readonly showFullPath = input(false)
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  private readonly unknownRepository: ShareRepository = {
    icon: LucideCircleQuestionMark,
    label: '',
    class: 'circle-primary-icon',
    translate: false
  }
  protected readonly repository = computed(() => {
    const share = this.share()
    let repository: ShareRepository
    if (share.parent?.id || share.parent?.id === 0) {
      repository = {
        icon: SPACES_ICON.SHARES,
        label: share.parent.name,
        class: 'circle-purple-icon',
        translate: false
      }
    } else if (share.file?.ownerId) {
      repository = {
        icon: SPACES_ICON.PERSONAL,
        label: SPACES_TITLE.PERSONAL_SPACE,
        class: 'circle-primary-icon',
        translate: true
      }
    } else if (share.file?.space?.alias) {
      repository = {
        icon: SPACES_ICON.SPACES,
        label: `${share.file.space.name}`,
        class: 'circle-primary-icon',
        translate: false
      }
    } else if (share.externalPath) {
      repository = {
        icon: SPACES_ICON.EXTERNAL,
        label: 'External',
        class: 'circle-primary-icon',
        translate: true
      }
    } else {
      repository = { ...this.unknownRepository }
    }
    if (this.showFullPath()) {
      return this.withFullPath(repository, share)
    }
    return repository
  })

  private withFullPath(repository: ShareRepository, share: Partial<ShareModel> | ShareFileModel | ShareLinkModel): ShareRepository {
    if (!repository.label) return repository
    repository = { ...repository }
    const paths: string[] = share.file?.path ? share.file.path.split('/').filter((p: string) => p && p !== '.') : []
    if (share.parent?.id && !share.file?.id && share.file?.path.indexOf('/') === -1) {
      // remove the first element, it is replaced by the share itself
      paths.shift()
    } else if (share.file?.space?.alias) {
      if (share.file.space?.root?.alias) {
        if (paths.length) {
          paths.unshift(share.file.space.root.name)
        } else {
          paths.push(share.file.space.root.name)
        }
      }
    }
    if (repository.label === SPACES_TITLE.PERSONAL_SPACE && paths.length) {
      repository.label = paths.join('/')
      repository.translate = false
    } else if (paths.length) {
      repository.label = `${repository.label}/${paths.join('/')}`
    }
    return repository
  }
}
