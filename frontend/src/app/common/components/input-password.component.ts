import { Component, ElementRef, inject, input, linkedSignal, OnInit, output, viewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { LucideDices, LucideDynamicIcon, LucideEye, LucideEyeOff } from '@lucide/angular'
import { USER_PASSWORD_MIN_LENGTH } from '@sync-in-server/backend/src/applications/users/constants/user'
import { genPassword } from '@sync-in-server/backend/src/common/shared'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { togglePasswordType } from '../utils/functions'

let nextInputPasswordId = 0

@Component({
  selector: 'app-input-password',
  imports: [FormsModule, L10nTranslatePipe, LucideDynamicIcon, L10nTranslateDirective],
  template: `@if (showLabel()) {
      <label [for]="inputId()" class="form-label" l10nTranslate>Password</label>
    }
    <div class="input-group" style="min-width: 150px">
      <input
        #Password
        [id]="inputId()"
        autocomplete="off"
        [ngModel]="passwordValue()"
        (ngModelChange)="passwordValue.set($event)"
        (keyup)="passwordChange.emit(Password.value)"
        [disabled]="disabled()"
        [class.is-invalid]="isRequired() && passwordValue()?.length < passwordMinLength()"
        type="password"
        class="form-control pe-0"
        [class.text-center]="centered()"
        [style.padding-left]="centered() ? '2rem' : ''"
        [attr.placeholder]="placeholder() ? (placeholder() | translate: locale.language) : null"
        [required]="isRequired()"
      />
      @if (showGenerator()) {
        <button
          (click)="randomPassword()"
          [attr.aria-label]="'Generate' | translate: locale.language"
          [disabled]="disabled()"
          class="input-group-text"
          type="button"
        >
          <span>
            <svg [lucideIcon]="icons.LucideDices"></svg>
          </span>
        </button>
      }
      <button
        (click)="toggleVisiblePassword(Password)"
        [attr.aria-label]="'Visibility' | translate: locale.language"
        [attr.aria-pressed]="Password.type === 'text'"
        [disabled]="disabled()"
        class="input-group-text"
        type="button"
      >
        <span>
          <svg [lucideIcon]="Password.type === 'text' ? icons.LucideEye : icons.LucideEyeOff"></svg>
        </span>
      </button>
    </div> `,
  styles: `
    .input-group-text .lucide {
      font-size: var(--font-size-lg);
    }

    button.input-group-text:not(:disabled) {
      cursor: pointer;
    }

    button.input-group-text:disabled {
      cursor: not-allowed;
      opacity: 0.65;
    }
  `
})
export class InputPasswordComponent implements OnInit {
  readonly passwordElement = viewChild.required<ElementRef<HTMLInputElement>>('Password')
  readonly password = input<string | undefined>(undefined)
  readonly passwordChange = output<string>()
  readonly passwordMinLength = input(USER_PASSWORD_MIN_LENGTH)
  readonly placeholder = input<string | null>(null)
  readonly inputId = input(`input-password-${nextInputPasswordId++}`)
  readonly showGenerator = input(false)
  readonly showLabel = input(false)
  readonly disabled = input(false)
  readonly isRequired = input(false)
  readonly focus = input(false)
  readonly centered = input(false)
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly toggleVisiblePassword = togglePasswordType
  protected readonly icons = { LucideEye, LucideEyeOff, LucideDices }
  protected readonly passwordValue = linkedSignal(() => this.password())

  ngOnInit() {
    if (!this.focus()) return
    setTimeout(() => {
      this.passwordElement().nativeElement.focus()
      this.passwordElement().nativeElement.select()
    }, 0)
  }

  randomPassword() {
    if (!this.disabled()) {
      this.passwordChange.emit(genPassword(this.passwordMinLength() + 10))
    }
  }
}
