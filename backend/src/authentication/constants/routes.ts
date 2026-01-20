/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export const AUTH_ROUTE = {
  BASE: '/api/auth',
  LOGIN: 'login',
  LOGOUT: 'logout',
  REFRESH: 'refresh',
  TOKEN: 'token',
  TOKEN_REFRESH: 'token/refresh',
  SETTINGS: 'settings',
  WS: 'socket.io',
  TWO_FA_BASE: '2fa',
  TWO_FA_ENABLE: 'enable',
  TWO_FA_DISABLE: 'disable',
  TWO_FA_LOGIN_VERIFY: 'login/verify',
  TWO_FA_ADMIN_RESET_USER: 'reset/user',
  OIDC_LOGIN: 'oidc/login',
  OIDC_CALLBACK: 'oidc/callback',
  OIDC_SETTINGS: 'oidc/settings'
}

export const API_AUTH_LOGIN = `${AUTH_ROUTE.BASE}/${AUTH_ROUTE.LOGIN}`
export const API_AUTH_LOGOUT = `${AUTH_ROUTE.BASE}/${AUTH_ROUTE.LOGOUT}`
export const API_AUTH_REFRESH = `${AUTH_ROUTE.BASE}/${AUTH_ROUTE.REFRESH}`
export const API_AUTH_TOKEN = `${AUTH_ROUTE.BASE}/${AUTH_ROUTE.TOKEN}`
export const API_AUTH_TOKEN_REFRESH = `${AUTH_ROUTE.BASE}/${AUTH_ROUTE.TOKEN_REFRESH}`
export const API_AUTH_SETTINGS = `${AUTH_ROUTE.BASE}/${AUTH_ROUTE.SETTINGS}`
export const API_AUTH_WS = `/${AUTH_ROUTE.WS}`
export const API_TWO_FA_ENABLE = `${AUTH_ROUTE.BASE}/${AUTH_ROUTE.TWO_FA_BASE}/${AUTH_ROUTE.TWO_FA_ENABLE}`
export const API_TWO_FA_DISABLE = `${AUTH_ROUTE.BASE}/${AUTH_ROUTE.TWO_FA_BASE}/${AUTH_ROUTE.TWO_FA_DISABLE}`
export const API_TWO_FA_LOGIN_VERIFY = `${AUTH_ROUTE.BASE}/${AUTH_ROUTE.TWO_FA_BASE}/${AUTH_ROUTE.TWO_FA_LOGIN_VERIFY}`
export const API_TWO_FA_ADMIN_RESET_USER = `${AUTH_ROUTE.BASE}/${AUTH_ROUTE.TWO_FA_BASE}/${AUTH_ROUTE.TWO_FA_ADMIN_RESET_USER}`
export const API_OIDC_LOGIN = `${AUTH_ROUTE.BASE}/${AUTH_ROUTE.OIDC_LOGIN}`
