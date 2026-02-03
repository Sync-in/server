import { NestFastifyApplication } from '@nestjs/platform-fastify'
import { TestingModule } from '@nestjs/testing'
import { Column, eq, inArray, isNull, SQL, sql } from 'drizzle-orm'
import { MySqlDatabase, MySqlTableWithColumns } from 'drizzle-orm/mysql-core'
import { MySqlQueryResult } from 'drizzle-orm/mysql2'
import { DB_TOKEN_PROVIDER } from './constants'
import * as schema from './schema'

async function dbGetConnection(app: NestFastifyApplication | TestingModule, mode: 'pool' | 'client' = 'pool') {
  const db: MySqlDatabase<any, any> = await app.resolve(DB_TOKEN_PROVIDER)
  let connection: any = db['session'].client
  if (mode === 'pool') {
    connection = connection.pool
  }
  return { db, connection }
}

export async function dbCloseConnection(app: NestFastifyApplication | TestingModule, mode: 'pool' | 'client' = 'pool') {
  const connection = (await dbGetConnection(app, mode)).connection
  await connection.end()
}

export async function dbCheckConnection(app: NestFastifyApplication | TestingModule, mode: 'pool' | 'client' = 'pool') {
  const db = (await dbGetConnection(app, mode)).db
  return Array.isArray(await db.execute(sql`select 1`))
}

export function dbCheckAffectedRows(queryResult: MySqlQueryResult, expected: number, throwError = true): boolean {
  const affectedRows = queryResult.at(0).affectedRows
  if (affectedRows !== expected) {
    if (throwError) {
      throw new Error(`The number of rows affected does not match : ${affectedRows}`)
    }
    return false
  }
  return true
}

export function dbGetInsertedId(queryResult: MySqlQueryResult): number {
  const insertedId = queryResult.at(0).insertId
  if (!insertedId) {
    throw new Error(`Record was not inserted : ${insertedId}`)
  }
  return insertedId
}

export function convertToSelect<T>(table: T, fields: Partial<keyof T>[]) {
  const select = {} as Record<keyof T, any>
  for (const f of fields) {
    select[f] = table[f]
  }
  return select
}

export function convertToWhere<T>(table: T, filters: Partial<Record<keyof T, any>>): SQL[] {
  // only handles AND operator
  return Object.entries(filters).map(([k, v]) => {
    if (v === null) return isNull(table[k])
    if (Array.isArray(v)) return inArray(table[k], v)
    return eq(table[k], v)
  })
}

export const dateTimeUTC = (dateField: Column): SQL<string> => sql`CONCAT(${sql`${dateField}`}, 'Z')`

export function concatDistinctObjectsInArray(mustBeNotNull: Column, object: Record<string, Column | object>): SQL<any> {
  /* Concat json objects in array (only one nesting level is supported) */
  const expr: SQL<any> = sql`IFNULL(CONCAT('[', GROUP_CONCAT(DISTINCT IF(${mustBeNotNull} IS NULL, NULL, JSON_OBJECT(`
  const keys = Object.keys(object)
  keys.forEach((k, index) => {
    if (object[k].constructor.name === 'Object') {
      expr.append(sql`${sql.raw(`'${k}'`)},JSON_OBJECT(`)
      const subKeys = Object.keys(object[k])
      subKeys.forEach((subK, subIndex) => {
        expr.append(sql`${sql.raw(`'${subK}'`)},${sql`${object[k][subK]}`}${subIndex === subKeys.length - 1 ? sql`)` : sql`,`}`)
      })
    } else {
      expr.append(sql`${sql.raw(`'${k}'`)},${sql`${object[k]}`}`)
    }
    if (index !== keys.length - 1) {
      expr.append(sql`,`)
    }
  })
  expr.append(sql`))), ']'), JSON_ARRAY())`)
  expr.mapWith(JSON.parse)
  return expr
}

export function getTablesWithFileIdColumn(): MySqlTableWithColumns<any>[] {
  return Object.entries(schema)
    .filter(([_table, columns]) => 'fileId' in columns)
    .map(([_table, columns]) => columns as MySqlTableWithColumns<any>)
}
