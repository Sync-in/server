#!/usr/bin/env node
/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

/**
 * Script: unused_translations.js
 *
 * Purpose:
 *  - Read one or many translation JSON files
 *  - Read top-level keys only (no flattening)
 *  - Search each key across all .ts and .html files of the project
 *  - Matches must be for the full phrase (no partial substring)
 *  - Print the list of unused keys per translation file
 *
 * Usage:
 *  - node scripts/unused_translations.js
 *  - node scripts/unused_translations.js --i18n=<path>
 *    <path> can be:
 *      - a directory containing .json files (non-recursive)
 *      - a specific .json file
 *    Default: frontend/src/i18n
 *
 * Notes:
 *  - Word boundaries are adapted to i18n keys (allowed characters: [A-Za-z0-9_.-]).
 *  - Ignored directories: all directories that starts with '.' and node_modules, dist, build, out, coverage, tmp
 */

const fs = require('fs')
const path = require('path')

const argv = process.argv.slice(2)
const argMap = new Map(
  argv
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, ...rest] = a.replace(/^--/, '').split('=')
      return [k, rest.length ? rest.join('=') : true]
    })
)

const PROJECT_ROOT = process.cwd()
// Single option: --i18n=<dir or file>. Default to the standard i18n directory.
const I18N_PATH = path.resolve(PROJECT_ROOT, argMap.get('i18n') || 'frontend/src/i18n')

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  'release',
  'tmp',
  'scripts',
  'coverage',
  'logs',
  'migrations',
  'docker',
  'environment'
])

// Static list of keys to ignore when reporting unused translations.
// Add exact key strings as they appear in the translation JSONs.
const IGNORE_UNUSED_KEYS = ['Sync already exists', 'nb_elements', 'one_message', 'nb_messages']

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw)
  } catch (e) {
    console.error(`Error: cannot read/parse "${filePath}": ${e.message}`)
    process.exit(2)
  }
}

function walkFiles(startDir) {
  const result = []
  function walk(dir) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      // Permission issues / broken symlinks
      return
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.')) continue
        if (IGNORED_DIRS.has(entry.name)) continue
        walk(fullPath)
      } else if (entry.isFile()) {
        if (fullPath.endsWith('.ts') && !fullPath.endsWith('.d.ts')) {
          result.push(fullPath)
        } else if (fullPath.endsWith('.html')) {
          result.push(fullPath)
        }
      }
    }
  }
  walk(startDir)
  return result
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Remove comments from file contents before searching:
 * - For .ts: removes /* ... *\/ block comments and // line comments (only when starting at line start or after whitespace)
 * - For .html: removes <!-- ... --> comments
 */
function stripComments(filePath, text) {
  if (filePath.endsWith('.ts')) {
    // Remove block comments
    const withoutBlock = text.replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove line comments that start at line start or after whitespace
    const withoutLine = withoutBlock.replace(/(^|\s)\/\/.*$/gm, '$1')
    return withoutLine
  }
  if (filePath.endsWith('.html')) {
    // Remove HTML comments
    return text.replace(/<!--[\s\S]*?-->/g, '')
  }
  return text
}

/**
 * Build a regex that enforces "full phrase" matching for an i18n key:
 * - Allowed key characters: [A-Za-z0-9_.-]
 * - Require that before the key there is no allowed character (or BOS)
 * - Require that after the key there is no allowed character (or EOS)
 *
 * NOTE: we avoid lookbehind for compatibility by using a non-capturing prefix group.
 * Matching is case-sensitive.
 */
function buildKeyRegex(key) {
  const allowed = 'A-Za-z0-9_.-'
  const escapedKey = escapeRegExp(key)
  // (^|[^allowed])key(?![allowed]) with multiline flag only (case-sensitive)
  return new RegExp(`(^|[^${allowed}])${escapedKey}(?![${allowed}])`, 'm')
}

function findUsageMap(keys, files) {
  const used = new Set()
  const where = new Map() // key -> file path (first occurrence)

  // Performance: read each file once
  const contents = new Map()
  for (const file of files) {
    try {
      const raw = fs.readFileSync(file, 'utf8')
      const text = stripComments(file, raw)
      contents.set(file, text)
    } catch {
      // Ignore read errors
    }
  }

  const remaining = new Set(keys)

  for (const [file, text] of contents.entries()) {
    if (remaining.size === 0) break
    // Simple approach: test remaining keys one by one
    for (const key of Array.from(remaining)) {
      const re = buildKeyRegex(key)
      if (re.test(text)) {
        used.add(key)
        where.set(key, file)
        remaining.delete(key)
      }
    }
  }

  const unused = keys.filter((k) => !used.has(k) && !IGNORE_UNUSED_KEYS.includes(k))
  return { used: Array.from(used), unused, where }
}

function resolveTranslationTargets(entryPath) {
  if (!fs.existsSync(entryPath)) {
    console.error(`Error: path not found: ${entryPath}`)
    process.exit(1)
  }
  const stat = fs.statSync(entryPath)
  if (stat.isFile()) {
    if (!entryPath.toLowerCase().endsWith('.json')) {
      console.error(`Error: file is not a .json: ${entryPath}`)
      process.exit(1)
    }
    return [entryPath]
  }
  if (stat.isDirectory()) {
    const files = fs
      .readdirSync(entryPath, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.json'))
      .map((e) => path.join(entryPath, e.name))
      .sort()
    if (files.length === 0) {
      console.error(`Error: no .json files found in directory: ${entryPath}`)
      process.exit(1)
    }
    return files
  }
  console.error(`Error: unsupported path type: ${entryPath}`)
  process.exit(1)
}

function main() {
  const startTs = Date.now()

  const translationFiles = resolveTranslationTargets(I18N_PATH)
  const searchRoot = PROJECT_ROOT
  const files = walkFiles(searchRoot)

  console.log('Translations analysis')
  console.log(`- Project root: ${PROJECT_ROOT}`)
  console.log(`- Scanned directory: ${searchRoot}`)
  console.log(`- .ts/.html files scanned: ${files.length}`)
  console.log(`- Translation sources:`)
  for (const f of translationFiles) {
    console.log(`  - ${f}`)
  }

  let totalUnused = 0

  for (const tFile of translationFiles) {
    const dict = readJson(tFile)
    const keys = Object.keys(dict || {}).sort()

    const { used, unused /*, where */ } = findUsageMap(keys, files)

    console.log(`\n[${tFile}]`)
    console.log(`- Total keys: ${keys.length}`)
    console.log(`- Keys found: ${used.length}`)
    console.log(`- Keys ignored: ${IGNORE_UNUSED_KEYS.length}`)
    console.log(`- Unused keys: ${unused.length}`)

    if (unused.length) {
      console.log('Unused keys:')
      for (const k of unused) {
        console.log(`  - ${k}`)
      }
    } else {
      console.log('No unused keys detected.')
    }

    totalUnused += unused.length
  }

  const ms = Date.now() - startTs
  console.log(`\nDone in ${ms} ms`)

  // Exit 0 even if there are unused keys (audit script).
  // To fail CI when unused keys exist:
  // process.exit(totalUnused ? 1 : 0);
}

if (require.main === module) {
  main()
}
