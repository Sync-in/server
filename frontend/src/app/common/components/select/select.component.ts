import { NgTemplateOutlet } from '@angular/common'
import {
  Component,
  DestroyRef,
  effect,
  ElementRef,
  forwardRef,
  inject,
  input,
  linkedSignal,
  OnInit,
  output,
  signal,
  TemplateRef
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms'
import type { LucideIcon } from '@lucide/angular'
import { LucideCircleQuestionMark, LucideDynamicIcon, LucideX } from '@lucide/angular'
import { Subject } from 'rxjs'
import { debounceTime, distinctUntilChanged } from 'rxjs/operators'
import { OffClickDirective } from '../../directives/off-click.directive'
import { HighlightPipe } from '../../pipes/highlight.pipe'
import { SelectItem } from './select.model'

@Component({
  selector: 'app-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss'],
  imports: [OffClickDirective, HighlightPipe, LucideDynamicIcon, NgTemplateOutlet],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SelectComponent),
      multi: true
    }
  ]
})
export class SelectComponent implements OnInit, ControlValueAccessor {
  public element: ElementRef = inject(ElementRef)
  readonly searchFunction = input.required<(search: string) => any>()
  readonly customTemplateOptions = input<TemplateRef<any> | null>(null)
  readonly customTemplateSelect = input<TemplateRef<any> | null>(null)
  readonly itemIcon = input<LucideIcon>(LucideCircleQuestionMark)
  readonly allowClear = input(true)
  readonly disabled = input(false)
  readonly active = input<any>(null)
  readonly placeholder = input('')
  readonly idField = input('id')
  readonly nameField = input('name')
  readonly descriptionField = input('description')
  readonly data = output<any>()
  readonly selected = output<any>()
  readonly removed = output<any>()
  readonly typed = output<any>()
  readonly opened = output<any>()
  protected xMarkIcon = LucideX
  readonly options = signal<SelectItem[]>([])
  public itemObjects: SelectItem[] = []
  readonly activeOption = signal<SelectItem>(undefined)
  readonly inputMode = signal(false)
  readonly inputValue = signal('')
  protected onChange: any = Function.prototype
  protected onTouched: any = Function.prototype
  private readonly destroyRef = inject(DestroyRef)
  private readonly typedSearch = new Subject<string>()
  private behavior: GenericBehavior

  public constructor() {
    this.clickedOutside = this.clickedOutside.bind(this)
    this.typedSearch.pipe(debounceTime(200), distinctUntilChanged(), takeUntilDestroyed()).subscribe((search: string) => this.doSearch(search))
    effect(() => {
      if (this.disabled()) this.hideOptions()
    })
  }

  private _items: any[] = []

  public set items(value: any[]) {
    if (!value.length) {
      this._items = this.itemObjects = []
      this.itemObjects = []
      return
    }
    this._items = value.filter((item: any) => {
      if (typeof item === 'string' || (typeof item === 'object' && item && item[this.nameField()] && item[this.idField()])) {
        return item
      }
    })

    this.itemObjects = this._items.map((item: any) =>
      typeof item === 'string'
        ? new SelectItem(item)
        : new SelectItem({
            id: item[this.idField()],
            name: item[this.nameField()],
            description: item[this.descriptionField()]
          })
    )
  }

  readonly optionsOpened = signal(false)

  protected readonly activeState = linkedSignal<any>(() =>
    this.createActiveState(this.active(), this.idField(), this.nameField(), this.descriptionField())
  )

  private setActive(selectedItem: any, idField: string, nameField: string, descriptionField: string) {
    this.activeState.set(this.createActiveState(selectedItem, idField, nameField, descriptionField))
  }

  private createActiveState(selectedItem: any, idField: string, nameField: string, descriptionField: string): any {
    if (!selectedItem) return null
    return typeof selectedItem === 'string'
      ? selectedItem
      : new SelectItem({
          id: selectedItem[idField],
          name: selectedItem[nameField],
          description: selectedItem[descriptionField]
        })
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
        if (this.activeState()) {
          this.remove(this.activeState())
        }
        e.preventDefault()
      }
    }
    // esc
    if (!isUpMode && e.keyCode === 27) {
      this.hideOptions()
      e.preventDefault()
      e.stopPropagation()
      return
    }
    // del
    if (!isUpMode && e.keyCode === 46) {
      if (this.activeState()) {
        this.remove(this.activeState())
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
      if (!this.activeState() || this.activeState().id !== this.activeOption().id) {
        this.selectActiveMatch()
        this.behavior.next()
      }
      e.preventDefault()
      return
    }

    const target = e.target || e.srcElement
    if (target) {
      this.inputValue.set(target.value)
      this.doEvent('typed', this.inputValue() || ' ')
    } else {
      this.open()
    }
  }

  ngOnInit() {
    this.behavior = new GenericBehavior(this)
    this.doEvent('typed', ' ')
  }

  remove(item: SelectItem) {
    if (this.disabled() === true) {
      return
    }
    this.setActive(null, this.idField(), this.nameField(), this.descriptionField())
    this.data.emit(this.activeState())
    this.doEvent('removed', item)
    this.inputValue.set('')
    this.doEvent('typed', ' ')
  }

  doEvent(type: 'typed' | 'removed' | 'selected', value: any) {
    if (this[type] && value) {
      this[type].emit(value)
      if (type === 'typed') this.typedSearch.next(value)
    }
    this.onTouched()
    if (type === 'selected' || type === 'removed') {
      this.onChange(this.activeState())
    }
  }

  clickedOutside() {
    this.inputMode.set(false)
    this.setOptionsOpened(false)
  }

  writeValue(val: any) {
    this.setActive(val, this.idField(), this.nameField(), this.descriptionField())
    this.data.emit(this.activeState())
  }

  registerOnChange(fn: (_: any) => any) {
    this.onChange = fn
  }

  registerOnTouched(fn: () => any) {
    this.onTouched = fn
  }

  matchClick(_e: any) {
    if (this.disabled() === true) {
      return
    }
    this.inputMode.update((inputMode) => !inputMode)
    if (this.inputMode()) {
      this.focusToInput()
      this.open()
    }
  }

  mainClick(event: any) {
    if (this.inputMode() === true || this.disabled() === true) {
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
    this.inputMode.set(true)
    const value = String.fromCharCode(96 <= event.keyCode && event.keyCode <= 105 ? event.keyCode - 48 : event.keyCode).toLowerCase()
    this.focusToInput(value)
    this.open()
    const target = event.target || event.srcElement
    target.value = value
    this.inputEvent(event)
  }

  selectActive(value: SelectItem) {
    this.activeOption.set(value)
  }

  isActive(value: SelectItem): boolean {
    return this.activeOption().id === value.id
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
    if (this.options().length <= 0) {
      return
    }
    this.setActive(value, this.idField(), this.nameField(), this.descriptionField())
    this.data.emit(this.activeState())
    this.doEvent('selected', value)
    this.hideOptions()
    this.focusToInput(value.name)
    this.element.nativeElement.querySelector('.ui-select-container').focus()
  }

  private doSearch(search: string) {
    this.searchFunction()(search).subscribe({
      next: (items: any[]) => {
        this.items = items
      },
      error: (e: any) => {
        console.error(e)
        this.items = []
      },
      complete: () => {
        this.behavior.filter()
      }
    })
  }

  private open() {
    this.options.set(this.itemObjects)
    if (this.options().length > 0) {
      this.behavior.first()
    }
    this.setOptionsOpened(true)
  }

  private hideOptions() {
    this.inputMode.set(false)
    this.setOptionsOpened(false)
  }

  private selectActiveMatch() {
    this.selectMatch(this.activeOption())
  }

  private setOptionsOpened(value: boolean) {
    if (this.destroyRef.destroyed || this.optionsOpened() === value) return
    this.optionsOpened.set(value)
    this.opened.emit(value)
  }
}

export class GenericBehavior {
  public actor: SelectComponent

  constructor(actor: SelectComponent) {
    this.actor = actor
  }

  first() {
    this.actor.activeOption.set(this.actor.options()[0])
    this.ensureHighlightVisible()
  }

  last() {
    const options = this.actor.options()
    this.actor.activeOption.set(options[options.length - 1])
    this.ensureHighlightVisible()
  }

  prev() {
    const options = this.actor.options()
    const index = options.indexOf(this.actor.activeOption())
    this.actor.activeOption.set(options[index - 1 < 0 ? options.length - 1 : index - 1])
    this.ensureHighlightVisible()
  }

  next() {
    const options = this.actor.options()
    const index = options.indexOf(this.actor.activeOption())
    this.actor.activeOption.set(options[index + 1 > options.length - 1 ? 0 : index + 1])
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
    this.actor.options.set([...this.actor.itemObjects])
    if (this.actor.options().length > 0) {
      this.actor.activeOption.set(this.actor.options()[0])
      this.ensureHighlightVisible()
    }
  }

  private getActiveIndex(optionsMap: Map<string, number> = void 0): number {
    let ai = this.actor.options().indexOf(this.actor.activeOption())
    if (ai < 0 && optionsMap !== void 0) {
      ai = optionsMap.get(this.actor.activeOption().id)
    }
    return ai
  }
}
