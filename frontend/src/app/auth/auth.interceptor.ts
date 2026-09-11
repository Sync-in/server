import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http'
import { inject, Injectable, Injector } from '@angular/core'
import { API_ADMIN_IMPERSONATE_LOGOUT } from '@sync-in-server/backend/src/applications/users/constants/routes'
import { API_AUTH_LOGIN, API_AUTH_LOGOUT, API_AUTH_REFRESH } from '@sync-in-server/backend/src/authentication/constants/routes'
import { BehaviorSubject, Observable, retry, throwError, timer } from 'rxjs'
import { catchError, filter, finalize, switchMap, take } from 'rxjs/operators'
import { SERVICE_UNAVAILABLE_ERROR } from '../app.constants'
import { hasReservedUrlChars } from '../common/utils/functions'
import { AuthService } from './auth.service'

@Injectable({
  providedIn: 'root'
})
export class AuthInterceptor implements HttpInterceptor {
  private readonly injector = inject(Injector)
  private _auth?: AuthService
  private isRefreshingToken = false
  private readonly waitForRefreshToken = new BehaviorSubject<boolean>(false)
  private readonly retryCount = 3
  private readonly retryWaitMilliSeconds = 2000

  private get auth(): AuthService {
    return (this._auth ??= this.injector.get(AuthService))
  }

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
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
        if (e.status === 401) {
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

  private handleAuthorizationError(request: HttpRequest<any>, next: HttpHandler, error: HttpErrorResponse): Observable<any> {
    console.debug('AuthInterceptor:', request.url, error.status)
    if ([API_AUTH_REFRESH, API_AUTH_LOGIN, API_AUTH_LOGOUT, API_ADMIN_IMPERSONATE_LOGOUT].indexOf(request.url) === -1) {
      if (this.isRefreshingToken) {
        console.debug('AuthInterceptor: wait for refresh token')
        return this.waitForRefreshToken.pipe(
          filter((result) => !result),
          take(1),
          switchMap(() => next.handle(this.auth.checkCSRF(request)))
        )
      } else {
        console.debug('AuthInterceptor: refreshing token')
        this.isRefreshingToken = true
        this.waitForRefreshToken.next(true)
        return this.auth.refreshToken().pipe(
          switchMap(() => {
            this.waitForRefreshToken.next(false)
            return next.handle(this.auth.checkCSRF(request))
          }),
          finalize(() => (this.isRefreshingToken = false))
        )
      }
    }
    return throwError(() => error)
  }
}
