/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Component, ElementRef, HostListener, inject, OnDestroy, signal, ViewChild } from '@angular/core'
import { FormBuilder, FormControl, ReactiveFormsModule } from '@angular/forms'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { faTimes } from '@fortawesome/free-solid-svg-icons'
import { L10N_LOCALE, L10nLocale, L10nTranslatePipe } from 'angular-l10n'
import { Subscription } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

@Component({
  selector: 'app-input-filter',
  imports: [ReactiveFormsModule, L10nTranslatePipe, FaIconComponent],
  template: `
    <div class="btn-group" style="height: 30px; max-width: 150px">
      <input
        #iFilter
        type="text"
        class="form-control form-control-sm"
        style="padding-right: 24px"
        (keyup.escape)="clear()"
        [placeholder]="'Filter' | translate: locale.language"
        [formControl]="searchControl"
      />
      @if (search()) {
        <span class="cursor-pointer" style="position: absolute; right: 5px; top: 3px; z-index: 1001; font-size: 1rem">
          <fa-icon (click)="clear()" [icon]="faTimes" role="button"></fa-icon>
        </span>
      }
    </div>
  `
})
export class FilterComponent implements OnDestroy {
  @ViewChild('iFilter', { static: true }) iFilter: ElementRef
  public search = signal('')
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly searchControl: FormControl
  protected readonly faTimes = faTimes
  private readonly fb = inject(FormBuilder)
  private readonly subscription: Subscription

  constructor() {
    this.searchControl = this.fb.control('')
    this.subscription = this.searchControl.valueChanges.pipe(debounceTime(300), distinctUntilChanged()).subscribe((value) => this.onType(value))
  }

  ngOnDestroy() {
    this.subscription.unsubscribe()
  }

  @HostListener('document:keydown', ['$event'])
  onKeyPress(ev: KeyboardEvent) {
    if ((ev.ctrlKey || ev.metaKey) && ev.keyCode === 70) {
      // ctrl/cmd + f
      ev.preventDefault()
      ev.stopPropagation()
      this.iFilter.nativeElement.focus()
    } else if (ev.keyCode === 27) {
      // escape key
      ev.preventDefault()
      ev.stopPropagation()
    }
  }

  clear() {
    if (this.searchControl) {
      this.searchControl.reset()
      this.iFilter.nativeElement.value = ''
    }
  }

  onType(value: string) {
    this.search.set(value)
  }
}
