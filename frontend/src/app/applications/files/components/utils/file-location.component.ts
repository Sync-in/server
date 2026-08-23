import { Component, inject, Input } from '@angular/core'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faTrashAlt } from '@fortawesome/free-solid-svg-icons'
import { L10N_LOCALE, L10nLocale, L10nTranslatePipe } from 'angular-l10n'

export interface FileLocationDisplay {
  icon?: IconDefinition
  iconClass: 'primary' | 'purple'
  showedPath?: string
  repositoryTitle?: string
  displayRootName?: string
  inTrash?: boolean | number
}

@Component({
  selector: 'app-file-location',
  imports: [FaIconComponent, L10nTranslatePipe],
  template: `
    @if (location) {
      <span
        class="file-location d-flex align-items-center"
        [class.file-location--repository]="displayAsRepository"
        [class.overflow-wrap-and-whitespace]="displayAsRepository"
        [class.text-primary]="!displayAsRepository && location.iconClass === 'primary'"
        [class.text-purple]="!displayAsRepository && location.iconClass === 'purple'"
      >
        @if (displayAsRepository) {
          @if (displayedIcon) {
            <fa-icon [icon]="displayedIcon" [class]="displayedIconClass" class="me-2"></fa-icon>
          }
        } @else {
          @if (location.inTrash) {
            <fa-icon [icon]="faTrashAlt" class="file-location__icon"></fa-icon>
          }
          @if (location.icon) {
            <fa-icon [icon]="location.icon" class="file-location__icon"></fa-icon>
          }
        }
        <span class="file-location__label no-pointer-events" draggable="false">
          @if (translateLabel) {
            {{ label | translate: locale.language }}
          } @else {
            {{ label }}
          }
        </span>
      </span>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }

      .file-location {
        column-gap: 0.15rem;
        line-height: 1.15;
        min-width: 0;
        white-space: nowrap;
      }

      .file-location--repository {
        column-gap: 0;
      }

      .file-location__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        font-size: 1.1em;
        line-height: 1;
      }

      .file-location__label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    `
  ]
})
export class FileLocationComponent {
  @Input({ required: true }) location: FileLocationDisplay
  @Input() displayAsRepository = false
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly faTrashAlt = faTrashAlt

  protected get displayedIcon(): IconDefinition | undefined {
    return this.location?.inTrash ? this.faTrashAlt : this.location?.icon
  }

  protected get displayedIconClass(): string {
    return this.location?.inTrash ? 'circle-error-icon' : `circle-${this.location?.iconClass || 'primary'}-icon`
  }

  protected get label(): string {
    return this.location?.showedPath || this.location?.displayRootName || this.location?.repositoryTitle || ''
  }

  protected get translateLabel(): boolean {
    return !this.location?.showedPath && !this.location?.displayRootName && !!this.location?.repositoryTitle
  }
}
