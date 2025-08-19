/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { HttpClient, HttpErrorResponse, HttpRequest } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { Router } from '@angular/router'
import { CLIENT_TOKEN_EXPIRED_ERROR } from '@sync-in-server/backend/src/applications/sync/constants/auth'
import { API_SYNC_AUTH_COOKIE } from '@sync-in-server/backend/src/applications/sync/constants/routes'
import type { SyncClientAuthDto } from '@sync-in-server/backend/src/applications/sync/dtos/sync-client-auth.dto'
import type { ClientAuthCookieDto } from '@sync-in-server/backend/src/applications/sync/interfaces/sync-client-auth.interface'
import { API_ADMIN_IMPERSONATE_LOGOUT, API_USERS_ME } from '@sync-in-server/backend/src/applications/users/constants/routes'
import { CSRF_KEY } from '@sync-in-server/backend/src/authentication/constants/auth'
import { API_AUTH_LOGIN, API_AUTH_LOGOUT, API_AUTH_REFRESH } from '@sync-in-server/backend/src/authentication/constants/routes'
import type { LoginResponseDto } from '@sync-in-server/backend/src/authentication/dto/login-response.dto'
import type { TokenResponseDto } from '@sync-in-server/backend/src/authentication/dto/token-response.dto'
import { currentTimeStamp } from '@sync-in-server/backend/src/common/shared'
import { catchError, finalize, map, Observable, of, throwError } from 'rxjs'
import { switchMap, tap } from 'rxjs/operators'
import { USER_PATH } from '../applications/users/user.constants'
import { UserService } from '../applications/users/user.service'
import { getCookie } from '../common/utils/functions'
import { EVENT } from '../electron/constants/events'
import { Electron } from '../electron/electron.service'
import { LayoutService } from '../layout/layout.service'
import { StoreService } from '../store/store.service'
import { AUTH_PATHS } from './auth.constants'

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient)
  private readonly router = inject(Router)
  private readonly store = inject(StoreService)
  private readonly userService = inject(UserService)
  private readonly layout = inject(LayoutService)
  private readonly electron = inject(Electron)
  private _refreshExpiration = parseInt(localStorage.getItem('refresh_expiration') || '0', 10) || 0
  private _accessExpiration = parseInt(localStorage.getItem('access_expiration') || '0', 10) || 0
  public returnUrl: string

  get refreshExpiration(): number {
    return this._refreshExpiration
  }

  set refreshExpiration(value: number) {
    // allow 60 seconds for concurrent requests
    this._refreshExpiration = value !== 0 ? value + 60 : value
    localStorage.setItem('refresh_expiration', value.toString())
  }

  get accessExpiration(): number {
    return this._accessExpiration
  }

  set accessExpiration(value: number) {
    // allow 60 seconds for concurrent requests
    this._accessExpiration = value !== 0 ? value + 60 : value
    localStorage.setItem('access_expiration', value.toString())
  }

  login(login: string, password: string): Observable<{ success: boolean; message: any }> {
    return this.http.post<LoginResponseDto>(API_AUTH_LOGIN, { login, password }).pipe(
      map((r: LoginResponseDto) => {
        this.accessExpiration = r.token.access_expiration
        this.refreshExpiration = r.token.refresh_expiration
        this.userService.initUser(r.user)
        return { success: true, message: null }
      }),
      catchError((e) => {
        console.warn(e)
        return of({ success: false, message: e.error.message || e.message })
      })
    )
  }

  loginElectron(): Observable<boolean> {
    return this.electron.authenticate().pipe(
      switchMap((auth: SyncClientAuthDto) => {
        return this.http.post<ClientAuthCookieDto>(API_SYNC_AUTH_COOKIE, auth).pipe(
          map((r: ClientAuthCookieDto) => {
            this.accessExpiration = r.token.access_expiration
            this.refreshExpiration = r.token.refresh_expiration
            this.userService.initUser(r.user)
            if (r?.client_token_update) {
              // update client token
              this.electron.send(EVENT.SERVER.AUTHENTICATION_TOKEN_UPDATE, r.client_token_update)
            }
            return true
          }),
          catchError((e: HttpErrorResponse) => {
            console.warn(e)
            if (e.error.message === CLIENT_TOKEN_EXPIRED_ERROR) {
              this.electron.send(EVENT.SERVER.AUTHENTICATION_TOKEN_EXPIRED)
            } else {
              this.electron.send(EVENT.SERVER.AUTHENTICATION_FAILED)
            }
            return of(false)
          })
        )
      })
    )
  }

  logout(redirect = true, expired = false) {
    if ((redirect || expired) && this.store.userImpersonate()) {
      this.logoutImpersonateUser()
      return
    }
    this.userService.disconnectWebSocket()
    this.clearCookies()
      .pipe(
        finalize(() => {
          this.accessExpiration = 0
          this.refreshExpiration = 0
          this.layout.clean()
          this.store.clean()
          if (redirect) {
            this.router.navigate([AUTH_PATHS.BASE, AUTH_PATHS.LOGIN]).catch((e: Error) => console.error(e))
          }
          if (expired) {
            this.layout.sendNotification('warning', 'Session has expired', 'Please sign in')
          }
        })
      )
      .subscribe()
  }

  logoutImpersonateUser() {
    this.http.post<LoginResponseDto>(API_ADMIN_IMPERSONATE_LOGOUT, null).subscribe({
      next: (r: LoginResponseDto) => {
        this.userService.disconnectWebSocket()
        this.initUserFromResponse(r)
        this.router.navigate([USER_PATH.BASE, USER_PATH.ACCOUNT]).catch((e: Error) => console.error(e))
      },
      error: (e: HttpErrorResponse) => {
        console.error(e)
        this.layout.sendNotification('error', 'Impersonate identity', 'logout', e)
      }
    })
  }

  initUserFromResponse(r: LoginResponseDto, impersonate = false) {
    if (r !== null) {
      this.accessExpiration = r.token.access_expiration
      this.refreshExpiration = r.token.refresh_expiration
      this.userService.initUser(r.user, impersonate)
    }
  }

  isLogged() {
    return !this.refreshTokenHasExpired()
  }

  refreshToken(): Observable<boolean> {
    return this.http.post<TokenResponseDto>(API_AUTH_REFRESH, null).pipe(
      map((r) => {
        this.accessExpiration = r.access_expiration
        this.refreshExpiration = r.refresh_expiration
        console.debug('refresh token done')
        return true
      }),
      catchError((e: HttpErrorResponse) => {
        console.debug('token has expired')
        if (this.electron.enabled) {
          console.debug('login with app')
          return this.loginElectron()
        }
        this.logout(true, true)
        return throwError(() => e)
      })
    )
  }

  checkUserAuthAndLoad(returnUrl: string) {
    if (this.refreshTokenHasExpired()) {
      if (this.electron.enabled) {
        return this.loginElectron()
      }
      this.returnUrl = returnUrl.length > 1 ? returnUrl : null
      this.logout()
      return of(false)
    } else if (!this.store.user.getValue()) {
      return this.http.get<LoginResponseDto>(API_USERS_ME).pipe(
        tap((r: LoginResponseDto) => this.userService.initUser(r.user)),
        map(() => true),
        catchError((e: HttpErrorResponse) => {
          if (e.status === 401) {
            this.logout()
          } else {
            console.warn(e)
          }
          return of(false)
        })
      )
    }
    return of(true)
  }

  checkCSRF(request: HttpRequest<any>): HttpRequest<any> {
    // fix xsrf in header when request is replayed after the refresh token phase
    if (request.headers.has(CSRF_KEY)) {
      return request.clone({ headers: request.headers.set(CSRF_KEY, getCookie(CSRF_KEY)) })
    }
    return request
  }

  private refreshTokenHasExpired(): boolean {
    return this.refreshExpiration === 0 || currentTimeStamp() >= this.refreshExpiration
  }

  private clearCookies() {
    return this.http.post(API_AUTH_LOGOUT, null)
  }
}
