import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { LucideDynamicIcon, LucideTrash } from '@lucide/angular'
import { L10N_LOCALE, L10nLocale, L10nTranslatePipe } from 'angular-l10n'
import type { FileLocationDisplay } from '../../interfaces/file-location.interface'

export type { FileLocationDisplay } from '../../interfaces/file-location.interface'

@Component({
  selector: 'app-file-location',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon, L10nTranslatePipe],
  template: `
    @if (location(); as fileLocation) {
      <span
        class="file-location d-flex align-items-center"
        [class.file-location--repository]="displayAsRepository()"
        [class.overflow-wrap-and-whitespace]="displayAsRepository()"
        [class.text-primary]="!displayAsRepository() && fileLocation.iconClass === 'primary'"
        [class.text-purple]="!displayAsRepository() && fileLocation.iconClass === 'purple'"
      >
        @if (displayAsRepository()) {
          @if (displayedIcon(); as icon) {
            <span [class]="displayedIconClass()" class="me-2">
              <svg [lucideIcon]="icon"></svg>
            </span>
          }
        } @else {
          @if (fileLocation.inTrash) {
            <svg [lucideIcon]="LucideTrash" class="file-location__icon"></svg>
          }
          @if (fileLocation.icon) {
            <svg [lucideIcon]="fileLocation.icon" class="file-location__icon"></svg>
          }
        }
        <span class="file-location__label no-pointer-events" draggable="false">
          @if (translateLabel()) {
            {{ label() | translate: locale.language }}
          } @else {
            {{ label() }}
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
  readonly displayAsRepository = input(false)
  readonly location = input.required<FileLocationDisplay>()
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly LucideTrash = LucideTrash
  protected readonly displayedIcon = computed(() => (this.location().inTrash ? this.LucideTrash : this.location().icon))
  protected readonly displayedIconClass = computed(() =>
    this.location().inTrash ? 'circle-error-icon' : `circle-${this.location().iconClass || 'primary'}-icon`
  )
  protected readonly label = computed(() => this.location().showedPath || this.location().displayRootName || this.location().repositoryTitle || '')
  protected readonly translateLabel = computed(
    () => !this.location().showedPath && !this.location().displayRootName && !!this.location().repositoryTitle
  )
}
