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
        (ngModelChange)="onQuotaInput($event)"
        (blur)="onQuotaBlur()"
        [placeholder]="'Unlimited' | translate: locale.language"
        class="form-control form-control-sm {{ invalid() ? 'is-invalid' : '' }}"
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
  // two-way binding via banana in parent: [(quota)]="..."
  quota = model<number | null>(null)

  // plain inputs converted to signals
  maxWidthPercent = input<number>(75)
  fullWidth = input<boolean>(false)

  // derived: what we actually apply in the template
  displayMaxWidth = computed(() => (this.fullWidth() ? 100 : this.maxWidthPercent()))

  // locale as before
  protected locale = inject<L10nLocale>(L10N_LOCALE)

  // internal state as signals
  protected quotaText = signal<string>('') // text shown/edited in the input
  protected invalid = signal<boolean>(false)

  ngOnInit() {
    // initialize text from initial quota value (one-time on init)
    const q = this.quota()
    if (q !== null && q !== undefined) {
      this.quotaText.set(q === 0 ? '0' : convertBytesToText(q))
    }
    // keep initial max width behavior but via computed (no mutation of inputs)
    // -> handled by displayMaxWidth()
  }

  // called on each keystroke
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

  validateQuota() {
    const t = this.quotaText()
    this.invalid.set(!!t && t !== '0' && !quotaRegexp.test(t))
  }
}
