/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DoCheck,
  ElementRef,
  EventEmitter,
  forwardRef,
  Input,
  KeyValueDiffer,
  KeyValueDiffers,
  NgZone,
  OnDestroy,
  Output,
  ViewChild
} from '@angular/core'
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms'
import { Editor, EditorChange, EditorFromTextArea, ScrollInfo } from 'codemirror'

function normalizeLineEndings(str: string) {
  if (!str) {
    return str
  }
  return str.replace(/\r\n|\r/g, '\n')
}

declare const CodeMirror: any

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'ngx-codemirror',
  template: `
    <textarea [name]="name" class="ngx-codemirror {{ className }}" [class.ngx-codemirror--focused]="isFocused" autocomplete="off" #ref> </textarea>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CodeMirrorComponent),
      multi: true
    }
  ],
  preserveWhitespaces: false,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CodeMirrorComponent implements AfterViewInit, OnDestroy, ControlValueAccessor, DoCheck {
  /* class applied to the created textarea */
  @Input() className = ''
  /* name applied to the created textarea */
  @Input() name = 'codemirror'
  /* autofocus setting applied to the created textarea */
  @Input() autoFocus = false
  /* preserve previous scroll position after updating value */
  @Input() preserveScrollPosition = false
  /* called when the text cursor is moved */
  @Output() cursorActivity = new EventEmitter<Editor>()
  /* called when the editor is focused or loses focus */
  @Output() focusChange = new EventEmitter<boolean>()
  /* called when the editor is scrolled */
  // eslint-disable-next-line @angular-eslint/no-output-native
  @Output() scroll = new EventEmitter<ScrollInfo>()
  @ViewChild('ref', { static: true }) ref: ElementRef
  value = ''
  disabled = false
  isFocused = false
  textArea: EditorFromTextArea
  codeMirror: any
  private _differ: KeyValueDiffer<string, any>

  constructor(
    private _differs: KeyValueDiffers,
    private readonly _ngZone: NgZone
  ) {
    this.codeMirror = CodeMirror ? CodeMirror : import('codemirror')
  }

  private _options: any

  /**
   * set options for codemirror
   * @link http://codemirror.net/doc/manual.html#config
   */
  @Input()
  set options(value: Record<string, any>) {
    this._options = value
    if (!this._differ && value) {
      this._differ = this._differs.find(value).create()
    }
  }

  ngAfterViewInit() {
    if (!this.ref) {
      return
    }
    this._ngZone.runOutsideAngular(() => {
      this.textArea = this.codeMirror.fromTextArea(this.ref.nativeElement, this._options)
      this.textArea.on('cursorActivity', (cm) => this._ngZone.run(() => this.cursorActive(cm)))
      this.textArea.on('scroll', this.scrollChanged.bind(this))
      this.textArea.on('blur', () => this._ngZone.run(() => this.focusChanged(false)))
      this.textArea.on('focus', () => this._ngZone.run(() => this.focusChanged(true)))
      this.textArea.on('change', (cm: Editor, change: EditorChange) => this._ngZone.run(() => this.codemirrorValueChanged(cm, change)))
      this.textArea.setValue(this.value)
    })
  }

  ngDoCheck() {
    if (!this._differ) {
      return
    }
    // check options have not changed
    const changes = this._differ.diff(this._options)
    if (changes) {
      changes.forEachChangedItem((option) => this.setOptionIfChanged(option.key, option.currentValue))
      changes.forEachAddedItem((option) => this.setOptionIfChanged(option.key, option.currentValue))
      changes.forEachRemovedItem((option) => this.setOptionIfChanged(option.key, option.currentValue))
    }
  }

  ngOnDestroy() {
    // is there a lighter-weight way to remove the cm instance?
    if (this.textArea) {
      this.textArea.toTextArea()
    }
  }

  codemirrorValueChanged(cm: Editor, change: EditorChange) {
    if (change.origin !== 'setValue') {
      this.value = cm.getValue()
      this.onChange(this.value)
    }
  }

  setOptionIfChanged(optionName: any, newValue: any) {
    if (!this.textArea) {
      return
    }
    this.textArea.setOption(optionName, newValue)
  }

  focusChanged(focused: boolean) {
    this.onTouched()
    this.isFocused = focused
    this.focusChange.emit(focused)
  }

  scrollChanged(cm: Editor) {
    this.scroll.emit(cm.getScrollInfo())
  }

  cursorActive(cm: Editor) {
    this.cursorActivity.emit(cm)
  }

  /** Implemented as part of ControlValueAccessor. */
  writeValue(value: string) {
    if (value === null || value === undefined) {
      return
    }
    if (!this.textArea) {
      this.value = value
      return
    }
    const cur = this.textArea.getValue()
    if (value !== cur && normalizeLineEndings(cur) !== normalizeLineEndings(value)) {
      this.value = value
      if (this.preserveScrollPosition) {
        const prevScrollPosition = this.textArea.getScrollInfo()
        this.textArea.setValue(this.value)
        this.textArea.scrollTo(prevScrollPosition.left, prevScrollPosition.top)
      } else {
        this.textArea.setValue(this.value)
      }
    }
  }

  /** Implemented as part of ControlValueAccessor. */
  registerOnChange(fn: (_value: string) => void) {
    this.onChange = fn
  }

  /** Implemented as part of ControlValueAccessor. */
  registerOnTouched(fn: () => void) {
    this.onTouched = fn
  }

  /** Implemented as part of ControlValueAccessor. */
  setDisabledState(isDisabled: boolean) {
    this.disabled = isDisabled
    this.setOptionIfChanged('readOnly', this.disabled)
  }

  /** Implemented as part of ControlValueAccessor. */
  private onChange = (_value: string) => void 0

  /** Implemented as part of ControlValueAccessor. */
  private onTouched = () => void 0
}
