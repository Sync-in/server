import { Component, ElementRef, EventEmitter, inject, Input, OnInit, Output, ViewChild } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { LucideDices, LucideDynamicIcon, LucideEye, LucideEyeOff } from '@lucide/angular'
import { USER_PASSWORD_MIN_LENGTH } from '@sync-in-server/backend/src/applications/users/constants/user'
import { genPassword } from '@sync-in-server/backend/src/common/shared'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { togglePasswordType } from '../utils/functions'

@Component({
  selector: 'app-input-password',
  imports: [FormsModule, ReactiveFormsModule, L10nTranslatePipe, LucideDynamicIcon, L10nTranslateDirective],
  template: `@if (showLabel) {
      <label for="password" class="form-label" l10nTranslate>Password</label>
    }
    <div id="password" class="input-group" style="min-width: 150px">
      <input
        #Password
        autocomplete="off"
        [(ngModel)]="password"
        [disabled]="disabled"
        [class.is-invalid]="isRequired && password?.length < passwordMinLength"
        (keyup)="passwordChange.emit(password)"
        type="password"
        class="form-control pe-0"
        [class.text-center]="centered"
        [style.padding-left]="centered ? '2rem' : ''"
        [attr.placeholder]="placeholder ? (placeholder | translate: locale.language) : null"
        [required]="isRequired"
      />
      @if (showGenerator) {
        <div (click)="randomPassword()" class="input-group-text cursor-pointer">
          <span>
            <svg [lucideIcon]="icons.LucideDices"></svg>
          </span>
        </div>
      }
      <div (click)="toggleVisiblePassword(Password)" class="input-group-text cursor-pointer">
        <span>
          <svg [lucideIcon]="Password.type === 'text' ? icons.LucideEye : icons.LucideEyeOff"></svg>
        </span>
      </div>
    </div> `,
  styles: `
    .input-group-text .lucide {
      font-size: var(--font-size-lg);
    }
  `
})
export class InputPasswordComponent implements OnInit {
  @ViewChild('Password', { static: true }) passwordElement: ElementRef
  @Input() password: string
  @Output() passwordChange = new EventEmitter<string>()
  @Input() passwordMinLength = USER_PASSWORD_MIN_LENGTH
  @Input() placeholder: string | null = null
  @Input() showGenerator = false
  @Input() showLabel = false
  @Input() disabled = false
  @Input() isRequired = false
  @Input() focus = false
  @Input() centered = false
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly toggleVisiblePassword = togglePasswordType
  protected readonly icons = { LucideEye, LucideEyeOff, LucideDices }

  ngOnInit() {
    if (this.focus) {
      setTimeout(() => {
        this.passwordElement.nativeElement.focus()
        this.passwordElement.nativeElement.select()
      }, 0)
    }
  }

  randomPassword() {
    if (!this.disabled) {
      this.passwordChange.emit(genPassword(this.passwordMinLength + 8))
    }
  }
}
