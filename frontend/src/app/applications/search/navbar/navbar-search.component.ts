import { Component, computed, effect, ElementRef, HostListener, inject, signal, ViewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { NavigationStart, Router } from '@angular/router'
import { LucideChevronDown, LucideDynamicIcon, LucideFunnel, LucideLoader, LucideSearch, LucideType, LucideX } from '@lucide/angular'
import { L10N_LOCALE, L10nLocale, L10nTranslatePipe } from 'angular-l10n'
import { BsDropdownModule } from 'ngx-bootstrap/dropdown'
import { filter } from 'rxjs'
import { isNavbarGlobalSearchMode, NAVBAR_SEARCH_MODE, type NavbarSearchOption } from '../../../layout/navbar/interfaces/navbar-search.interface'
import { NavbarSearchService } from '../../../layout/navbar/services/navbar-search.service'

@Component({
  selector: 'app-navbar-search',
  imports: [ReactiveFormsModule, LucideDynamicIcon, L10nTranslatePipe, BsDropdownModule],
  templateUrl: 'navbar-search.component.html'
})
export class NavbarSearchComponent {
  @ViewChild('searchInput', { static: true }) searchInput: ElementRef<HTMLInputElement>
  protected readonly search = inject(NavbarSearchService)
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly searchControl = new FormControl('', { nonNullable: true })
  protected readonly mobileOpen = signal(false)
  protected readonly shortcutModifier = this.getShortcutModifier()
  protected readonly modes: NavbarSearchOption[] = [
    { mode: NAVBAR_SEARCH_MODE.VIEW, label: 'Current view', shortcut: `${this.shortcutModifier} D`, icon: LucideFunnel },
    { mode: NAVBAR_SEARCH_MODE.NAME, label: 'Search for files', shortcut: `${this.shortcutModifier} K`, icon: LucideSearch },
    { mode: NAVBAR_SEARCH_MODE.CONTENT, label: 'Search for content', shortcut: `${this.shortcutModifier} B`, icon: LucideType }
  ]
  protected readonly currentMode = computed(() => this.modes.find(({ mode }) => mode === this.search.mode()) ?? this.modes[1])
  protected readonly globalMode = computed(() => isNavbarGlobalSearchMode(this.search.mode()))
  protected readonly icons = { LucideChevronDown, LucideLoader, LucideSearch, LucideX }
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef as any)
  private readonly router = inject(Router)

  constructor() {
    effect(() => {
      const query = this.search.query()
      if (this.searchControl.value !== query) {
        this.searchControl.setValue(query, { emitEvent: false })
      }
    })
    this.searchControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((query) => this.search.setQuery(query))
    this.search.focusRequested.pipe(takeUntilDestroyed()).subscribe(() => this.openAndFocus())
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationStart),
        takeUntilDestroyed()
      )
      .subscribe(() => this.mobileOpen.set(false))
  }

  protected selectMode(mode: NAVBAR_SEARCH_MODE) {
    this.activateMode(mode)
  }

  protected submit() {
    if (this.search.mode() === NAVBAR_SEARCH_MODE.VIEW) {
      this.search.flushViewFilter()
      return
    }
    this.mobileOpen.set(false)
    this.search.submitGlobalSearch().catch(console.error)
  }

  protected clear() {
    this.search.clear()
    this.focusInput()
  }

  protected onEscape(event: Event) {
    if (this.search.query()) {
      event.preventDefault()
      this.clear()
      return
    }
    this.mobileOpen.set(false)
  }

  protected toggleMobileSearch() {
    this.mobileOpen.update((open) => !open)
    if (this.mobileOpen()) this.focusInput()
  }

  protected modeDisabled(mode: NAVBAR_SEARCH_MODE): boolean {
    return mode === NAVBAR_SEARCH_MODE.VIEW && !this.search.viewFilterEnabled()
  }

  @HostListener('document:keydown', ['$event'])
  protected onDocumentKeydown(event: KeyboardEvent) {
    if (
      event.defaultPrevented ||
      (!event.ctrlKey && !event.metaKey) ||
      event.altKey ||
      event.shiftKey ||
      (this.isEditableTarget(event.target) && event.target !== this.searchInput.nativeElement) ||
      document.querySelector('.modal.show')
    ) {
      return
    }

    let mode: NAVBAR_SEARCH_MODE
    switch (event.key.toLowerCase()) {
      case 'd':
        mode = NAVBAR_SEARCH_MODE.VIEW
        break
      case 'k':
        mode = NAVBAR_SEARCH_MODE.NAME
        break
      case 'b':
        mode = NAVBAR_SEARCH_MODE.CONTENT
        break
      default:
        return
    }
    if (mode === NAVBAR_SEARCH_MODE.VIEW && !this.search.viewFilterEnabled()) return

    event.preventDefault()
    event.stopPropagation()
    this.activateMode(mode)
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent) {
    if (this.mobileOpen() && !this.host.nativeElement.contains(event.target as Node)) {
      this.mobileOpen.set(false)
    }
  }

  private openAndFocus() {
    this.mobileOpen.set(true)
    this.focusInput()
  }

  private activateMode(mode: NAVBAR_SEARCH_MODE) {
    this.search
      .openMode(mode)
      .then(() => this.openAndFocus())
      .catch(console.error)
  }

  private focusInput() {
    setTimeout(() => this.searchInput.nativeElement.focus())
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  }

  private getShortcutModifier(): '⌘' | 'Ctrl' {
    if (typeof navigator === 'undefined') return 'Ctrl'

    const platform = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`
    return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘' : 'Ctrl'
  }
}
