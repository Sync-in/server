/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import { OnModuleDestroy, OnModuleInit } from '@nestjs/common'

export abstract class Cache implements OnModuleInit, OnModuleDestroy {
  abstract defaultTTL: number
  abstract infiniteExpiration: number

  abstract onModuleInit(): void

  abstract onModuleDestroy(): void

  abstract has(key: string): Promise<boolean>

  /*
    pattern must use '*' as wildcard
   */
  abstract keys(pattern: string): Promise<string[]>

  abstract get(key: string): Promise<any>

  abstract mget(keys: string[]): Promise<any[]>

  /* ttl (seconds):
      - 0: infinite expiration
      - undefined: default ttl
  */
  abstract set(key: string, data: unknown, ttl?: number): Promise<boolean>

  abstract del(key: string): Promise<boolean>

  abstract mdel(keys: string[]): Promise<boolean>

  abstract genSlugKey(...args: any[]): string
}
