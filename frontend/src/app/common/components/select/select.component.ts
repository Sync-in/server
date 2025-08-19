/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { NgTemplateOutlet } from '@angular/common'
import { Component, ElementRef, EventEmitter, forwardRef, Input, OnDestroy, OnInit, Output, TemplateRef, inject } from '@angular/core'
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms'
import { DomSanitizer, SafeHtml } from '@angular/platform-browser'
import { FaIconComponent } from '@fortawesome/angular-fontawesome'
import { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import { faQuestion } from '@fortawesome/free-solid-svg-icons'
import { Subscription } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'
import { OffClickDirective } from '../../directives/off-click.directive'
import { HighlightPipe } from '../../pipes/highlight.pipe'
import { SelectItem } from './select.model'

@Component({
  selector: 'app-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss'],
  imports: [OffClickDirective, HighlightPipe, FaIconComponent, NgTemplateOutlet],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SelectComponent),
      multi: true
    }
  ]
})
export class SelectComponent implements OnInit, OnDestroy, ControlValueAccessor {
  private readonly sanitizer = inject(DomSanitizer)
  public element: ElementRef = inject(ElementRef)
  @Input({ required: true }) searchFunction: (search: string) => any
  @Input() customTemplateOptions: TemplateRef<any>
  @Input() customTemplateSelect: TemplateRef<any>
  @Input() itemIcon: IconDefinition = faQuestion
  @Input() allowClear = true
  @Input() placeholder = ''
  @Input() idField = 'id'
  @Input() nameField = 'name'
  @Input() descriptionField = 'description'
  @Output() data = new EventEmitter<any>()
  @Output() selected = new EventEmitter<any>()
  @Output() removed = new EventEmitter<any>()
  @Output() typed = new EventEmitter<any>()
  @Output() opened = new EventEmitter<any>()
  private subscription: Subscription
  private _items: any[] = []
  private _optionsOpened = false
  private _disabled = false
  private _active: SelectItem | any = null
  public options: SelectItem[] = []
  public itemObjects: SelectItem[] = []
  public activeOption: SelectItem
  public inputMode = false
  public inputValue = ''
  protected onChange: any = Function.prototype
  protected onTouched: any = Function.prototype
  private behavior: GenericBehavior

  public constructor() {
    this.clickedOutside = this.clickedOutside.bind(this)
  }

  get optionsOpened(): boolean {
    return this._optionsOpened
  }

  set optionsOpened(value: boolean) {
    this._optionsOpened = value
    this.opened.emit(value)
  }

  public set items(value: any[]) {
    if (!value.length) {
      this._items = this.itemObjects = []
      this.itemObjects = []
      return
    }
    this._items = value.filter((item: any) => {
      if (typeof item === 'string' || (typeof item === 'object' && item && item[this.nameField] && item[this.idField])) {
        return item
      }
    })

    this.itemObjects = this._items.map((item: any) =>
      typeof item === 'string'
        ? new SelectItem(item)
        : new SelectItem({
            id: item[this.idField],
            name: item[this.nameField],
            description: item[this.descriptionField]
          })
    )
  }

  public get disabled(): boolean {
    return this._disabled
  }

  @Input()
  public set disabled(value: boolean) {
    this._disabled = value
    if (this._disabled === true) {
      this.hideOptions()
    }
  }

  public get active(): SelectItem | any {
    return this._active
  }

  @Input()
  public set active(selectedItem: any) {
    if (!selectedItem) {
      this._active = null
    } else {
      this._active =
        typeof selectedItem === 'string'
          ? selectedItem
          : new SelectItem({
              id: selectedItem[this.idField],
              name: selectedItem[this.nameField],
              description: selectedItem[this.descriptionField]
            })
    }
  }

  public sanitize(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html)
  }

  public inputEvent(e: any, isUpMode = false) {
    // tab
    if (e.keyCode === 9) {
      return
    }
    if (isUpMode && (e.keyCode === 37 || e.keyCode === 39 || e.keyCode === 38 || e.keyCode === 40 || e.keyCode === 13)) {
      e.preventDefault()
      return
    }
    // backspace
    if (!isUpMode && e.keyCode === 8) {
      const el: any = this.element.nativeElement.querySelector('div.ui-select-container > input')
      if (!el.value || el.value.length <= 0) {
        if (this.active) {
          this.remove(this.active)
        }
        e.preventDefault()
      }
    }
    // esc
    if (!isUpMode && e.keyCode === 27) {
      this.hideOptions()
      e.preventDefault()
      return
    }
    // del
    if (!isUpMode && e.keyCode === 46) {
      if (this.active) {
        this.remove(this.active)
      }
      e.preventDefault()
    }
    // left
    if (!isUpMode && e.keyCode === 37 && this._items.length > 0) {
      this.behavior.first()
      e.preventDefault()
      return
    }
    // right
    if (!isUpMode && e.keyCode === 39 && this._items.length > 0) {
      this.behavior.last()
      e.preventDefault()
      return
    }
    // up
    if (!isUpMode && e.keyCode === 38) {
      this.behavior.prev()
      e.preventDefault()
      return
    }
    // down
    if (!isUpMode && e.keyCode === 40) {
      this.behavior.next()
      e.preventDefault()
      return
    }
    // enter
    if (!isUpMode && e.keyCode === 13) {
      if (!this.active || this.active.id !== this.activeOption.id) {
        this.selectActiveMatch()
        this.behavior.next()
      }
      e.preventDefault()
      return
    }

    const target = e.target || e.srcElement
    if (target) {
      this.inputValue = target.value
      this.doEvent('typed', this.inputValue || ' ')
    } else {
      this.open()
    }
  }

  ngOnInit() {
    this.subscription = this.typed
      .asObservable()
      .pipe(debounceTime(200), distinctUntilChanged())
      .subscribe((search: string) => this.doSearch(search))
    this.behavior = new GenericBehavior(this)
    this.doEvent('typed', ' ')
  }

  ngOnDestroy() {
    this.subscription.unsubscribe()
  }

  private doSearch(search: string) {
    this.searchFunction(search).subscribe({
      next: (items: any[]) => {
        this.items = items
      },
      error: (e: any) => {
        console.error(e)
        this.items = []
      },
      complete: () => this.behavior.filter()
    })
  }

  remove(item: SelectItem) {
    if (this._disabled === true) {
      return
    }
    this.active = null
    this.data.next(this.active)
    this.doEvent('removed', item)
    this.inputValue = ''
    this.doEvent('typed', ' ')
  }

  doEvent(type: 'typed' | 'removed' | 'selected', value: any) {
    if (this[type] && value) {
      this[type].next(value)
    }
    this.onTouched()
    if (type === 'selected' || type === 'removed') {
      this.onChange(this.active)
    }
  }

  clickedOutside() {
    this.inputMode = false
    this.optionsOpened = false
  }

  writeValue(val: any) {
    this.active = val
    this.data.emit(this.active)
  }

  registerOnChange(fn: (_: any) => any) {
    this.onChange = fn
  }

  registerOnTouched(fn: () => any) {
    this.onTouched = fn
  }

  matchClick(_e: any) {
    if (this._disabled === true) {
      return
    }
    this.inputMode = !this.inputMode
    if (this.inputMode === true) {
      this.focusToInput()
      this.open()
    }
  }

  mainClick(event: any) {
    if (this.inputMode === true || this._disabled === true) {
      return
    }
    if (event.keyCode === 46) {
      event.preventDefault()
      this.inputEvent(event)
      return
    }
    if (event.keyCode === 8) {
      event.preventDefault()
      this.inputEvent(event, true)
      return
    }
    if (event.keyCode === 9 || event.keyCode === 13 || event.keyCode === 27 || (event.keyCode >= 37 && event.keyCode <= 40)) {
      event.preventDefault()
      return
    }
    this.inputMode = true
    const value = String.fromCharCode(96 <= event.keyCode && event.keyCode <= 105 ? event.keyCode - 48 : event.keyCode).toLowerCase()
    this.focusToInput(value)
    this.open()
    const target = event.target || event.srcElement
    target.value = value
    this.inputEvent(event)
  }

  selectActive(value: SelectItem) {
    this.activeOption = value
  }

  isActive(value: SelectItem): boolean {
    return this.activeOption.id === value.id
  }

  removeClick(value: SelectItem, event: any) {
    event.stopPropagation()
    this.remove(value)
  }

  focusToInput(value = '') {
    setTimeout(() => {
      const el = this.element.nativeElement.querySelector('div.ui-select-container > input')
      if (el) {
        el.focus()
        el.value = value
      }
    }, 0)
  }

  selectMatch(value: SelectItem, e: Event = void 0) {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    if (this.options.length <= 0) {
      return
    }
    this.active = value
    this.data.next(this.active)
    this.doEvent('selected', value)
    this.hideOptions()
    this.focusToInput(value.name)
    this.element.nativeElement.querySelector('.ui-select-container').focus()
  }

  private open() {
    this.options = this.itemObjects
    if (this.options.length > 0) {
      this.behavior.first()
    }
    this.optionsOpened = true
  }

  private hideOptions() {
    this.inputMode = false
    this.optionsOpened = false
  }

  private selectActiveMatch() {
    this.selectMatch(this.activeOption)
  }
}

export class GenericBehavior {
  public actor: SelectComponent

  constructor(actor: SelectComponent) {
    this.actor = actor
  }

  first() {
    this.actor.activeOption = this.actor.options[0]
    this.ensureHighlightVisible()
  }

  last() {
    this.actor.activeOption = this.actor.options[this.actor.options.length - 1]
    this.ensureHighlightVisible()
  }

  prev() {
    const index = this.actor.options.indexOf(this.actor.activeOption)
    this.actor.activeOption = this.actor.options[index - 1 < 0 ? this.actor.options.length - 1 : index - 1]
    this.ensureHighlightVisible()
  }

  next() {
    const index = this.actor.options.indexOf(this.actor.activeOption)
    this.actor.activeOption = this.actor.options[index + 1 > this.actor.options.length - 1 ? 0 : index + 1]
    this.ensureHighlightVisible()
  }

  ensureHighlightVisible(optionsMap: Map<string, number> = void 0) {
    const container = this.actor.element.nativeElement.querySelector('.ui-select-choices-content')
    if (!container) {
      return
    }
    const choices = container.querySelectorAll('.ui-select-choices-row')
    if (choices.length < 1) {
      return
    }
    const activeIndex = this.getActiveIndex(optionsMap)
    if (activeIndex < 0) {
      return
    }
    const highlighted: any = choices[activeIndex]
    if (!highlighted) {
      return
    }
    const posY: number = highlighted.offsetTop + highlighted.clientHeight - container.scrollTop
    const height: number = container.offsetHeight
    if (posY > height) {
      container.scrollTop += posY - height
    } else if (posY < highlighted.clientHeight) {
      container.scrollTop -= highlighted.clientHeight - posY
    }
  }

  filter() {
    this.actor.options = [...this.actor.itemObjects]
    if (this.actor.options.length > 0) {
      this.actor.activeOption = this.actor.options[0]
      this.ensureHighlightVisible()
    }
  }

  private getActiveIndex(optionsMap: Map<string, number> = void 0): number {
    let ai = this.actor.options.indexOf(this.actor.activeOption)
    if (ai < 0 && optionsMap !== void 0) {
      ai = optionsMap.get(this.actor.activeOption.id)
    }
    return ai
  }
}
