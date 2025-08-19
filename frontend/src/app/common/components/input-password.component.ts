/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, ElementRef, EventEmitter, inject, Input, OnInit, Output, ViewChild } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faDice, faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons'
import { USER_PASSWORD_MIN_LENGTH } from '@sync-in-server/backend/src/applications/users/constants/user'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { genPassword, togglePasswordType } from '../utils/functions'

@Component({
  selector: 'app-input-password',
  imports: [FormsModule, ReactiveFormsModule, L10nTranslatePipe, FaIconComponent, L10nTranslateDirective],
  template: `@if (showLabel) {
      <label for="password" l10nTranslate>Password</label>
    }
    <div id="password" class="input-group input-group-sm" style="min-width: 150px">
      <input
        #Password
        autocomplete="off"
        [(ngModel)]="password"
        [disabled]="disabled"
        [class.is-invalid]="isRequired && password?.length < passwordMinLength"
        (keyup)="passwordChange.emit(password)"
        type="password"
        class="form-control form-control-sm"
        [placeholder]="placeholder | translate: locale.language"
        [required]="isRequired"
      />
      @if (showGenerator) {
        <div (click)="randomPassword()" class="input-group-text cursor-pointer">
          <span>
            <fa-icon [icon]="icons.faDice"></fa-icon>
          </span>
        </div>
      }
      <div (click)="toggleVisiblePassword(Password)" class="input-group-text cursor-pointer">
        <span>
          <fa-icon [icon]="Password.type === 'text' ? icons.faEye : icons.faEyeSlash"></fa-icon>
        </span>
      </div>
    </div> `
})
export class InputPasswordComponent implements OnInit {
  @ViewChild('Password', { static: true }) passwordElement: ElementRef
  @Input() password: string
  @Output() passwordChange = new EventEmitter<string>()
  @Input() passwordMinLength = USER_PASSWORD_MIN_LENGTH
  @Input() placeholder: string
  @Input() showGenerator = false
  @Input() showLabel = false
  @Input() disabled = false
  @Input() isRequired = false
  @Input() focus = false
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly toggleVisiblePassword = togglePasswordType
  protected readonly icons = { faEye, faEyeSlash, faDice }

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
      this.passwordChange.emit(genPassword(this.passwordMinLength + 2))
    }
  }
}
