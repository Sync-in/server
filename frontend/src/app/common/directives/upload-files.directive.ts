/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { Directive, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, Renderer2, inject } from '@angular/core'

@Directive({ selector: '[appUploadFiles]' })
export class UploadFilesDirective implements OnInit, OnDestroy {
  private elementRef = inject(ElementRef)
  private readonly renderer = inject(Renderer2)
  @Input() options: { isMultiple?: boolean; isDirectory?: boolean }
  @Output() uploadFiles = new EventEmitter<{ files: File[]; isDirectory: boolean }>()
  private eventElement: () => void | undefined
  private eventInput: () => void | undefined

  ngOnInit() {
    const input = document.createElement('input')
    this.renderer.setAttribute(input, 'type', 'file')
    this.renderer.setStyle(input, 'display', 'none')
    this.renderer.setStyle(input, 'position', 'absolute')
    this.elementRef.nativeElement.appendChild(input)

    this.eventElement = this.renderer.listen(this.elementRef.nativeElement, 'click', () => input.click())

    if (this.options?.isMultiple) {
      this.renderer.setAttribute(input, 'multiple', 'multiple')
    }
    if (this.options?.isDirectory) {
      this.renderer.setAttribute(input, 'webkitdirectory', 'webkitdirectory')
    }

    this.eventInput = this.renderer.listen(input, 'change', (e: any) => {
      if (e.target.value) {
        this.uploadFiles.next({ files: e.target.files, isDirectory: this.options?.isDirectory || false })
        e.target.value = ''
      }
    })
  }

  ngOnDestroy() {
    try {
      this.eventElement()
      this.eventInput()
    } catch (e) {
      console.warn(e)
    }
  }
}
