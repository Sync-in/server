import { PlatformLocation } from '@angular/common'
import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest, HttpXsrfTokenExtractor } from '@angular/common/http'
import { inject, Injectable, Injector } from '@angular/core'
import { HTTP_CSRF_IGNORED_METHODS } from '@sync-in-server/backend/src/applications/applications.constants'
import { API_ADMIN_IMPERSONATE_LOGOUT } from '@sync-in-server/backend/src/applications/users/constants/routes'
import { CSRF_KEY } from '@sync-in-server/backend/src/authentication/constants/auth'
import { API_AUTH_LOGIN, API_AUTH_LOGOUT, API_AUTH_REFRESH } from '@sync-in-server/backend/src/authentication/constants/routes'
import { Observable, retry, shareReplay, throwError, timer } from 'rxjs'
import { catchError, finalize, switchMap } from 'rxjs/operators'
import { SERVICE_UNAVAILABLE_ERROR } from '../app.constants'
import { hasReservedUrlChars } from '../common/utils/functions'
import { AuthService } from './auth.service'

@Injectable({
  providedIn: 'root'
})
export class AuthInterceptor implements HttpInterceptor {
  private readonly injector = inject(Injector)
  private readonly platformLocation = inject(PlatformLocation)
  private readonly xsrfTokenExtractor = inject(HttpXsrfTokenExtractor)
  private _auth?: AuthService
  private refreshToken$?: Observable<boolean>
  private readonly retryCount = 3
  private readonly retryWaitMilliSeconds = 2000

  private get auth(): AuthService {
    return (this._auth ??= this.injector.get(AuthService))
  }

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // File API paths may contain raw reserved characters that must be encoded before the request is sent.
    const encodedUrl = hasReservedUrlChars(request.url)
    if (encodedUrl) {
      request = request.clone({ url: encodedUrl })
    }

    return next.handle(request).pipe(
      retry({
        count: this.retryCount,
        delay: (error: HttpErrorResponse) => {
          if (error.status !== 0 || request.body instanceof FormData || request.url === API_AUTH_LOGOUT) {
            return throwError(() => error)
          }
          return timer(this.retryWaitMilliSeconds)
        }
      }),
      catchError((e: HttpErrorResponse) => {
        if (e.status === 401 && this.isSameOrigin(request.url)) {
          return this.handleAuthorizationError(request, next, e)
        } else if (e.status === 503) {
          return this.handleServiceUnavailable(request, e)
        } else if (e.status === 0) {
          // Do not retry multipart uploads on a transport error: the connection may have
          // been closed after a quota or size rejection, and replaying would resend all files.
          if (request.body instanceof FormData || request.url === API_AUTH_LOGOUT) {
            return throwError(() => e)
          }
          return this.handleServiceUnavailable(request, e, SERVICE_UNAVAILABLE_ERROR)
        }
        return throwError(() => e)
      })
    )
  }

  private handleServiceUnavailable(request: HttpRequest<any>, error: HttpErrorResponse, message?: string): Observable<never> {
    if (request.url !== API_AUTH_LOGOUT) {
      this.auth.logout(true, false, message ?? error.error?.message ?? SERVICE_UNAVAILABLE_ERROR)
    }
    return throwError(() => error)
  }

  private handleAuthorizationError(request: HttpRequest<any>, next: HttpHandler, error: HttpErrorResponse): Observable<HttpEvent<any>> {
    console.debug('AuthInterceptor:', request.url, error.status)
    if ([API_AUTH_REFRESH, API_AUTH_LOGIN, API_AUTH_LOGOUT, API_ADMIN_IMPERSONATE_LOGOUT].indexOf(request.url) === -1) {
      return this.getRefreshToken().pipe(
        switchMap((authenticated) => (authenticated ? next.handle(this.refreshCSRFHeader(request)) : throwError(() => error)))
      )
    }
    return throwError(() => error)
  }

  private getRefreshToken(): Observable<boolean> {
    if (this.refreshToken$) {
      console.debug('AuthInterceptor: wait for refresh token')
      return this.refreshToken$
    }

    console.debug('AuthInterceptor: refreshing token')
    this.refreshToken$ = this.auth.refreshToken().pipe(
      finalize(() => (this.refreshToken$ = undefined)),
      shareReplay({ bufferSize: 1, refCount: false })
    )
    return this.refreshToken$
  }

  private refreshCSRFHeader(request: HttpRequest<any>): HttpRequest<any> {
    if (HTTP_CSRF_IGNORED_METHODS.has(request.method) || !this.isSameOrigin(request.url)) {
      return request
    }

    const csrfToken = this.xsrfTokenExtractor.getToken()
    if (!csrfToken || request.headers.get(CSRF_KEY) === csrfToken) {
      return request
    }
    return request.clone({ headers: request.headers.set(CSRF_KEY, csrfToken) })
  }

  private isSameOrigin(url: string): boolean {
    try {
      const locationUrl = new URL(this.platformLocation.href)
      return new URL(url, locationUrl).origin === locationUrl.origin
    } catch {
      return false
    }
  }
}
