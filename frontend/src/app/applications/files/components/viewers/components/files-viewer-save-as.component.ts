import { Component, computed, inject, Input, OnInit, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { L10nTranslateDirective } from 'angular-l10n'
import { AutofocusDirective } from '../../../../../common/directives/auto-focus.directive'
import { LayoutService } from '../../../../../layout/layout.service'

@Component({
  selector: 'app-files-viewer-save-as',
  imports: [AutofocusDirective, FormsModule, L10nTranslateDirective],
  template: `
    <div class="modal-header">
      <h4 class="modal-title" l10nTranslate>Save in the current directory</h4>
      <button (click)="layout.closeDialog()" [disabled]="saving()" aria-label="Close" class="btn-close btn-close-white" type="button"></button>
    </div>
    <div class="modal-body">
      <label class="form-label" for="drawio-file-name" l10nTranslate>File name</label>
      <div class="input-group">
        <input
          id="drawio-file-name"
          [ngModel]="fileName()"
          (ngModelChange)="fileName.set($event); normalizeName()"
          (keyup.enter)="submit()"
          class="form-control"
          type="text"
          autocomplete="off"
          appAutofocus
        />
        <span class="input-group-text">.drawio</span>
      </div>
    </div>
    <div class="modal-footer">
      <div class="me-auto">
        @if (nameExists()) {
          <span class="text-danger fs-sm" l10nTranslate>This name is already used</span>
        } @else if (error()) {
          <span class="text-danger fs-sm">{{ error() }}</span>
        }
      </div>
      <button (click)="layout.closeDialog()" [disabled]="saving()" class="btn btn-secondary" type="button" l10nTranslate>Cancel</button>
      <button (click)="submit()" [disabled]="!canSubmit()" class="btn btn-primary" type="button" l10nTranslate>Save</button>
    </div>
  `
})
export class FilesViewerSaveAsComponent implements OnInit {
  @Input({ required: true }) suggestedName: string
  @Input({ required: true }) existingNames: readonly string[] = []
  readonly confirmSave = output<string>()
  protected readonly layout = inject(LayoutService)
  protected readonly fileName = signal('')
  protected readonly saving = signal(false)
  protected readonly error = signal('')
  protected readonly nameExists = computed(() => {
    const targetName = `${this.fileName().trim()}.drawio`.normalize().toLowerCase()
    return this.existingNames.some((name) => name.normalize().toLowerCase() === targetName)
  })
  protected readonly canSubmit = computed(() => !!this.fileName().trim() && !this.nameExists() && !this.saving())

  ngOnInit() {
    this.fileName.set(this.suggestedName)
  }

  setSaving(saving: boolean) {
    this.saving.set(saving)
  }

  setError(error: string) {
    this.error.set(error)
  }

  protected normalizeName() {
    this.fileName.update((fileName) => fileName.replace(/\.drawio$/i, ''))
    this.error.set('')
  }

  protected submit() {
    if (this.canSubmit()) this.confirmSave.emit(this.fileName().trim())
  }
}
