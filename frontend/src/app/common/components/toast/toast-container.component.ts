import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import type { LucideIcon } from '@lucide/angular'
import { LucideCircleCheck, LucideCircleX, LucideDynamicIcon, LucideInfo, LucideTriangleExclamationPoint, LucideX } from '@lucide/angular'
import { L10N_LOCALE, L10nLocale, L10nTranslatePipe } from 'angular-l10n'
import type { ToastType } from './interfaces/toast.interface'
import { ToastService } from './toast.service'

@Component({
  selector: 'app-toast-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon, L10nTranslatePipe],
  templateUrl: 'toast-container.component.html'
})
export class ToastContainerComponent {
  protected readonly toastService = inject(ToastService)
  protected readonly locale = inject<L10nLocale>(L10N_LOCALE)
  protected readonly icons = {
    success: LucideCircleCheck,
    info: LucideInfo,
    warning: LucideTriangleExclamationPoint,
    error: LucideCircleX
  } satisfies Record<ToastType, LucideIcon>
  protected readonly closeIcon = LucideX

  protected close(event: MouseEvent, id: number): void {
    event.stopPropagation()
    this.toastService.dismiss(id)
  }

  protected onKeydown(event: KeyboardEvent, id: number): void {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return

    event.preventDefault()
    this.toastService.tap(id)
  }

  protected onFocusOut(event: FocusEvent, id: number): void {
    const toastElement = event.currentTarget as HTMLElement
    if (event.relatedTarget && toastElement.contains(event.relatedTarget as Node)) return

    this.toastService.resume(id, 'focus')
  }
}
