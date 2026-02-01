/*
 * Copyright (C) 2012-2026 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export const OAuthDesktopPortParam = 'desktop_port' as const
export const OAuthDesktopCallBackURI = '/oidc/callback' as const
export const OAuthDesktopLoopbackPorts = new Set<number>([49152, 49153, 49154])
