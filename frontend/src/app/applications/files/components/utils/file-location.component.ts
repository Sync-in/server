import { Component, inject, Input } from '@angular/core'
import type { LucideIcon } from '@lucide/angular'
import { LucideDynamicIcon, LucideTrash2 } from '@lucide/angular'
import { L10N_LOCALE, L10nLocale, L10nTranslatePipe } from 'angular-l10n'

export interface FileLocationDisplay {
  icon?: LucideIcon
  iconClass: 'primary' | 'purple'
  showedPath?: string
  repositoryTitle?: string
  displayRootName?: string
  inTrash?: boolean | number
}

@Component({
  selector: 'app-file-location',
  imports: [LucideDynamicIcon, L10nTranslatePipe],
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
            <span [class]="displayedIconClass" class="me-2">
              <svg [lucideIcon]="displayedIcon"></svg>
            </span>
          }
        } @else {
          @if (location.inTrash) {
            <svg [lucideIcon]="LucideTrash2" class="file-location__icon"></svg>
          }
          @if (location.icon) {
            <svg [lucideIcon]="location.icon" class="file-location__icon"></svg>
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
        font-size: 0.875rem;
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
  protected readonly LucideTrash2 = LucideTrash2

  protected get displayedIcon(): LucideIcon | undefined {
    return this.location?.inTrash ? this.LucideTrash2 : this.location?.icon
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
