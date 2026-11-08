import { Component, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { LucideDynamicIcon, LucideFunnel, LucideX } from '@lucide/angular'
import { L10N_LOCALE, L10nLocale, L10nTranslatePipe } from 'angular-l10n'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'

@Component({
  selector: 'app-input-filter',
  imports: [ReactiveFormsModule, L10nTranslatePipe, LucideDynamicIcon],
  template: `
    <div class="filter-shell" [class.has-value]="!!search()">
      <svg class="filter-icon" [lucideIcon]="filterIcon"></svg>
      <input
        #iFilter
        type="text"
        autocomplete="off"
        (keyup.escape)="clear()"
        [placeholder]="('Filter' | translate: locale.language) + ' (' + shortcutHint + ')'"
        [formControl]="searchControl"
      />
      @if (search()) {
        <button (click)="clear()" type="button" class="clear-btn" aria-label="Clear filter">
          <svg [lucideIcon]="LucideX"></svg>
        </button>
      }
    </div>
  `
})
export class FilterComponent {
  readonly iFilter = viewChild.required<ElementRef<HTMLInputElement>>('iFilter')
  public readonly search = signal('')
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly searchControl = new FormControl('')
  protected readonly filterIcon = LucideFunnel
  protected readonly LucideX = LucideX
  protected readonly shortcutHint = this.getShortcutHint()

  constructor() {
    this.searchControl.valueChanges.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed()).subscribe((value) => this.onType(value))
  }

  @HostListener('document:keydown', ['$event'])
  onKeyPress(ev: KeyboardEvent) {
    if ((ev.ctrlKey || ev.metaKey) && ev.keyCode === 70) {
      // ctrl/cmd + f
      ev.preventDefault()
      ev.stopPropagation()
      this.iFilter().nativeElement.focus()
    } else if (ev.keyCode === 27) {
      // escape key
      ev.preventDefault()
    }
  }

  clear() {
    this.searchControl.reset()
    this.iFilter().nativeElement.value = ''
  }

  onType(value: string) {
    this.search.set(value)
  }

  private getShortcutHint(): string {
    if (typeof navigator === 'undefined') {
      return 'Ctrl+F'
    }

    const platform = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`
    return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘+F' : 'Ctrl+F'
  }
}
