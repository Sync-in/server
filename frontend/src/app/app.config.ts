import { HashLocationStrategy, LocationStrategy } from '@angular/common'
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi, withXsrfConfiguration } from '@angular/common/http'
import { ApplicationConfig, importProvidersFrom, isDevMode, provideZoneChangeDetection } from '@angular/core'
import { provideAnimations } from '@angular/platform-browser/animations'
import { provideRouter } from '@angular/router'
import { CSRF_KEY } from '@sync-in-server/backend/src/authentication/constants/auth'
import { provideL10nIntl, provideL10nTranslation } from 'angular-l10n'
import { BsModalService } from 'ngx-bootstrap/modal'
import { TooltipConfig } from 'ngx-bootstrap/tooltip'
import { SocketIoModule } from 'ngx-socket-io'
import { provideToastr } from 'ngx-toastr'
import { l10nConfig, TranslationLoader, TranslationMissing, TranslationStorage } from '../i18n/l10n'
import { routes } from './app.routes'
import { AuthInterceptor } from './auth/auth.interceptor'
import { getToolTipConfig } from './layout/layout.tooltip.config'
import { webSocketOptions } from './websocket/websocket.constants'

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    { provide: LocationStrategy, useClass: HashLocationStrategy },
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    provideRouter(routes),
    provideHttpClient(withInterceptorsFromDi(), withXsrfConfiguration({ cookieName: CSRF_KEY, headerName: CSRF_KEY })),
    provideL10nTranslation(l10nConfig, {
      storage: TranslationStorage,
      translationLoader: TranslationLoader,
      ...(isDevMode() ? { missingTranslationHandler: TranslationMissing } : {})
    }),
    provideL10nIntl(),
    provideAnimations(),
    provideToastr({
      positionClass: 'toast-top-center',
      preventDuplicates: false,
      maxOpened: 6,
      autoDismiss: true,
      timeOut: 6000
    }),
    { provide: TooltipConfig, useFactory: getToolTipConfig },
    BsModalService,
    importProvidersFrom(SocketIoModule.forRoot(webSocketOptions))
  ]
}
