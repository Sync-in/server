import { OnDestroy, Pipe, PipeTransform, signal } from '@angular/core'
import { Dayjs } from 'dayjs/esm'
import { dJs } from '../utils/time'

@Pipe({ name: 'amLiveTimeAgo', pure: false })
export class LiveTimeAgoPipe implements PipeTransform, OnDestroy {
  private currentTimer: number | null = null
  private lastTime: number
  private lastValue: any
  private lastOmitSuffix?: boolean
  private lastLocale?: string
  private lastText = ''
  private readonly renderTick = signal(0)
  private formatFn: (d: Dayjs) => string

  format(d: Dayjs) {
    return d.from(dJs(), this.lastOmitSuffix)
  }

  transform(value: any, omitSuffix?: boolean, formatFn?: (m: Dayjs) => string): string {
    this.renderTick()
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
    if (this.currentTimer !== null) {
      return
    }

    const dayjsInstance = dJs(this.lastValue)
    const timeToUpdate = this.getSecondsUntilUpdate(dayjsInstance) * 1000

    if (typeof window === 'undefined') return
    this.currentTimer = window.setTimeout(() => {
      this.lastText = this.formatFn(dJs(this.lastValue))
      this.currentTimer = null
      this.createTimer()
      this.renderTick.update((tick) => tick + 1)
    }, timeToUpdate)
  }

  private removeTimer() {
    if (this.currentTimer) {
      window.clearTimeout(this.currentTimer)
      this.currentTimer = null
    }
  }

  private getSecondsUntilUpdate(dayJsInstance: Dayjs) {
    const howOld = Math.abs(dJs().diff(dayJsInstance, 'minute'))
    if (howOld < 5) {
      return 20
    } else if (howOld < 60) {
      return 60
    } else {
      return 300
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
