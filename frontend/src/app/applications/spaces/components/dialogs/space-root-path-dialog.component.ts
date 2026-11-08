import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, inject, Input, OnInit, Output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { LucideDynamicIcon, LucideFolderClosed } from '@lucide/angular'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { AutofocusDirective } from '../../../../common/directives/auto-focus.directive'
import { LayoutService } from '../../../../layout/layout.service'
import { SpaceRootModel } from '../../models/space.model'
import { SpacesService } from '../../services/spaces.service'

export interface ExternalFilePathEvent {
  name: string
  externalPath: string
}

@Component({
  selector: 'app-space-root-path-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon, L10nTranslateDirective, L10nTranslatePipe, FormsModule, AutofocusDirective],
  templateUrl: 'space-root-path-dialog.component.html'
})
export class SpaceRootPathDialogComponent implements OnInit {
  @Input() currentRoots: SpaceRootModel[] = []
  @Output() submitEvent = new EventEmitter<ExternalFilePathEvent>()
  @Input() withRootName = true
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly layout = inject(LayoutService)
  protected readonly icons = { LucideFolderClosed }
  protected readonly newSpaceRoot = signal<ExternalFilePathEvent>({ name: '', externalPath: '' })
  // states
  protected readonly error = signal<string>(undefined)
  protected readonly rootNameIsValid = signal(false)
  protected readonly rootPathIsValid = signal(false)
  protected readonly rootIsValid = signal(false)
  private readonly spacesService = inject(SpacesService)

  ngOnInit() {
    if (!this.withRootName) {
      this.rootNameIsValid.set(true)
    }
  }

  @HostListener('keyup.enter')
  keyEnter() {
    if (this.rootIsValid()) {
      this.onSubmit()
    } else {
      this.onValidRoot()
    }
  }

  onValidRoot() {
    if ((this.withRootName && !this.newSpaceRoot().name) || !this.newSpaceRoot().externalPath) {
      this.error.set('Name and location are required')
      return
    }
    if (this.newSpaceRoot().externalPath[0] !== '/') {
      this.newSpaceRoot.update((root) => ({ ...root, externalPath: `/${root.externalPath}` }))
    }
    for (const root of this.currentRoots) {
      const normalizedRoot = root.externalPath[root.externalPath.length - 1] === '/' ? root.externalPath : `${root.externalPath}/`
      if (this.newSpaceRoot().externalPath.startsWith(normalizedRoot)) {
        this.rootPathIsValid.set(false)
        this.error.set('Parent location already exists in files')
        return
      }
    }

    this.spacesService.checkSpaceRootPath(this.newSpaceRoot().externalPath).subscribe({
      next: () => {
        this.rootPathIsValid.set(true)
        this.rootNameIsValid.set(true)
        this.rootIsValid.set(true)
        this.error.set(null)
      },
      error: (e) => {
        this.rootPathIsValid.set(false)
        this.error.set(e.error.message)
      }
    })
  }

  onSubmit() {
    this.submitEvent.emit(this.newSpaceRoot())
    this.layout.closeDialog()
  }

  checkInput(value: string, isNameField = false) {
    if (isNameField) {
      this.newSpaceRoot.update((root) => ({ ...root, name: value }))
      this.rootNameIsValid.set(!!value)
    } else {
      this.newSpaceRoot.update((root) => ({ ...root, externalPath: value }))
      this.rootPathIsValid.set(!!value)
    }
    if (this.rootIsValid()) {
      this.rootIsValid.set(false)
    }
  }
}
