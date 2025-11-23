/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

export function isServerUpdateAvailable(current: string, latest: string) {
  const c = current.split('.').map(Number)
  const l = latest.split('.').map(Number)
  const max = Math.max(c.length, l.length)

  for (let i = 0; i < max; i++) {
    const cv = c[i] || 0
    const lv = l[i] || 0

    if (lv > cv) return true
    if (lv < cv) return false
  }
  return false
}
