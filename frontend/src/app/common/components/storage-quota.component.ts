import { Component, computed, inject, input, model, OnInit, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { L10N_LOCALE, L10nLocale, L10nTranslateDirective, L10nTranslatePipe } from 'angular-l10n'
import { TooltipModule } from 'ngx-bootstrap/tooltip'
import { convertBytesToText, convertTextToBytes } from '../utils/functions'
import { quotaRegexp } from '../utils/regexp'

@Component({
  selector: 'app-storage-quota',
  imports: [L10nTranslatePipe, TooltipModule, FormsModule, L10nTranslateDirective],
  template: `
    <label for="storageQuota" class="form-label" l10nTranslate>Storage Quota</label>
    <div id="storageQuota">
      <input
        id="quota"
        [ngModel]="quotaText()"
        [ngModelOptions]="{ standalone: true }"
        (ngModelChange)="onQuotaInput($event)"
        (blur)="onQuotaBlur()"
        [placeholder]="'Unlimited' | translate: locale.language"
        class="form-control{{ invalid() ? 'is-invalid' : '' }}"
        [class.w-100]="fullWidth()"
        [style.max-width.%]="displayMaxWidth()"
        placement="top"
        tooltip='"512 MB" "12 GB" "2 TB" ...'
        triggers="focus"
        type="text"
      />
    </div>
  `
})
export class StorageQuotaComponent implements OnInit {
  readonly quota = model<number | null>(null)
  readonly maxWidthPercent = input(75)
  readonly fullWidth = input(false)
  protected readonly displayMaxWidth = computed(() => (this.fullWidth() ? 100 : this.maxWidthPercent()))
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly quotaText = signal('')
  protected readonly invalid = signal(false)

  ngOnInit() {
    const quota = this.quota()
    if (quota !== null && quota !== undefined) {
      this.quotaText.set(quota === 0 ? '0' : convertBytesToText(quota))
    }
  }

  onQuotaInput(value: string) {
    this.quotaText.set(value)
    this.validateQuota()
  }

  // called on blur (commit the numeric value back to the model)
  onQuotaBlur() {
    const t = this.quotaText()
    if (t) {
      if (t === '0') {
        this.quota.set(0)
        return
      }
      const b = quotaRegexp.exec(t)
      if (b) {
        const pretty = `${b[1]} ${b[2].toUpperCase()}`
        this.quotaText.set(pretty)
        this.quota.set(convertTextToBytes(parseInt(b[1], 10), b[2]))
        return
      }
    }
    this.quota.set(null)
  }

  private validateQuota() {
    const quotaText = this.quotaText()
    this.invalid.set(!!quotaText && quotaText !== '0' && !quotaRegexp.test(quotaText))
  }
}
