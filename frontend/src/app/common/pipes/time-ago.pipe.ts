/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { ChangeDetectorRef, NgZone, OnDestroy, Pipe, PipeTransform, inject } from '@angular/core'
import { Dayjs } from 'dayjs'
import { dJs } from '../utils/time'

@Pipe({ name: 'amTimeAgo', pure: false })
export class TimeAgoPipe implements PipeTransform, OnDestroy {
  private readonly cdRef = inject(ChangeDetectorRef)
  private ngZone = inject(NgZone)
  private currentTimer: number | null
  private lastTime: number
  private lastValue: any
  private lastOmitSuffix: boolean
  private lastLocale?: string
  private lastText: string
  private formatFn: (d: Dayjs) => string

  format(d: Dayjs) {
    return d.from(dJs(), this.lastOmitSuffix)
  }

  transform(value: any, omitSuffix?: boolean, formatFn?: (m: Dayjs) => string): string {
    if (this.hasChanged(value, omitSuffix)) {
      this.lastTime = this.getTime(value)
      this.lastValue = value
      this.lastOmitSuffix = omitSuffix
      this.lastLocale = this.getLocale(value)
      this.formatFn = formatFn || this.format.bind(this)
      this.removeTimer()
      this.createTimer()
      this.lastText = this.formatFn(dJs(value))
    } else {
      this.createTimer()
    }

    return this.lastText
  }

  ngOnDestroy() {
    this.removeTimer()
  }

  private createTimer() {
    if (this.currentTimer) {
      return
    }

    const dayjsInstance = dJs(this.lastValue)
    const timeToUpdate = this.getSecondsUntilUpdate(dayjsInstance) * 1000

    this.currentTimer = this.ngZone.runOutsideAngular(() => {
      if (typeof window !== 'undefined') {
        return window.setTimeout(() => {
          this.lastText = this.formatFn(dJs(this.lastValue))

          this.currentTimer = null
          this.ngZone.run(() => this.cdRef.markForCheck())
        }, timeToUpdate)
      } else {
        return null
      }
    })
  }

  private removeTimer() {
    if (this.currentTimer) {
      window.clearTimeout(this.currentTimer)
      this.currentTimer = null
    }
  }

  private getSecondsUntilUpdate(dayJsInstance: Dayjs) {
    const howOld = Math.abs(dJs().diff(dayJsInstance, 'minute'))
    if (howOld < 1) {
      return 1
    } else if (howOld < 60) {
      return 30
    } else if (howOld < 180) {
      return 300
    } else {
      return 3600
    }
  }

  private hasChanged(value: any, omitSuffix?: boolean): boolean {
    return this.getTime(value) !== this.lastTime || this.getLocale(value) !== this.lastLocale || omitSuffix !== this.lastOmitSuffix
  }

  private getTime(value: any): number {
    if (value instanceof Date) {
      return value.getTime()
    } else if (dJs.isDayjs(value)) {
      return value.valueOf()
    } else {
      return dJs(value).valueOf()
    }
  }

  private getLocale(value: any): string | null {
    return dJs.isDayjs(value) ? value.locale() : dJs.locale()
  }
}
