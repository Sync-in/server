import { Component, input, output } from '@angular/core'
import { L10nTranslateDirective } from 'angular-l10n'

@Component({
  selector: 'app-files-viewer-unsaved-changes',
  imports: [L10nTranslateDirective],
  styles: [
    `
      :host {
        position: fixed;
        z-index: 10;
        top: 0;
        left: 50%;
        max-width: calc(100% - 1.5rem);
        transform: translateX(-50%);
      }

      .files-viewer-unsaved-changes {
        display: flex;
        flex-wrap: nowrap;
        justify-content: flex-end;
        max-width: 100%;
        gap: 0.5rem;
        padding: 0.5rem;
        border: 1px solid var(--app-menu-surface-border, var(--bs-border-color));
        border-radius: var(--bs-border-radius);
        color: var(--app-menu-item-color, var(--bs-body-color));
        background: var(--app-menu-surface-bg, var(--bs-body-bg));
        box-shadow: var(--bs-box-shadow);
      }

      @media (max-width: 575.98px) {
        :host {
          right: 0;
          left: 0;
          width: 100%;
          max-width: none;
          transform: none;
        }

        .files-viewer-unsaved-changes {
          width: 100%;
        }

        .files-viewer-unsaved-changes .btn {
          flex: 1 1 0;
          min-width: 0;
          padding-inline: 0.35rem;
          white-space: normal;
        }
      }
    `
  ],
  template: `
    <div class="files-viewer-unsaved-changes" role="alertdialog">
      <button (click)="saveAndExit.emit()" class="btn btn-sm btn-primary" type="button" l10nTranslate>Save And Exit</button>
      <button (click)="closeWithoutSaving.emit()" [disabled]="saving()" class="btn btn-sm btn-danger" type="button" l10nTranslate>
        Close Without Saving
      </button>
      <button (click)="keepEditing.emit()" class="btn btn-sm btn-default" type="button" l10nTranslate>Cancel</button>
    </div>
  `
})
export class FilesViewerUnsavedChangesComponent {
  readonly saving = input(false)
  readonly saveAndExit = output<void>()
  readonly closeWithoutSaving = output<void>()
  readonly keepEditing = output<void>()
}
