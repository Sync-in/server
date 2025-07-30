/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http'
import { Injectable, Injector } from '@angular/core'
import { API_AUTH_LOGIN, API_AUTH_LOGOUT, API_AUTH_REFRESH } from '@sync-in-server/backend/src/authentication/constants/routes'
import { BehaviorSubject, concatMap, delay, Observable, of, retryWhen, throwError } from 'rxjs'
import { catchError, filter, finalize, switchMap, take } from 'rxjs/operators'
import { hasReservedUrlChars } from '../common/utils/functions'
import { AuthService } from './auth.service'

@Injectable({
  providedIn: 'root'
})
export class AuthInterceptor implements HttpInterceptor {
  private auth: AuthService | null
  private isRefreshingToken = false
  private waitForRefreshToken: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false)
  private retryCount = 3
  private retryWaitMilliSeconds = 2000

  constructor(private readonly injector: Injector) {
    this.auth = null
  }

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const encodedUrl = hasReservedUrlChars(request.url)
    if (encodedUrl) {
      request = request.clone({ url: encodedUrl })
    }

    return next.handle(request).pipe(
      catchError((e: HttpErrorResponse) => {
        if (e.status === 401) {
          return this.handleAuthorizationError(request, next, e)
        } else if (e.status === 0) {
          return this.handleRetries(request, next, e)
        }
        return throwError(() => e)
      })
    )
  }

  private handleAuthorizationError(request: HttpRequest<any>, next: HttpHandler, error: HttpErrorResponse): Observable<any> {
    if (!this.auth) {
      this.auth = this.injector.get(AuthService)
    }
    console.debug('AuthInterceptor:', request.url, error.status)
    if ([API_AUTH_REFRESH, API_AUTH_LOGIN, API_AUTH_LOGOUT].indexOf(request.url) === -1) {
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

  private handleRetries(request: HttpRequest<any>, next: HttpHandler, _error: HttpErrorResponse): Observable<any> {
    return next.handle(request).pipe(
      retryWhen((error) =>
        error.pipe(
          concatMap((error, count) => {
            if (count < this.retryCount && error.status == 0) {
              return of(error)
            }
            return throwError(() => error)
          }),
          delay(this.retryWaitMilliSeconds)
        )
      )
    )
  }
}
