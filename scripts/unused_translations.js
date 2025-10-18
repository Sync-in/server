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
 *  - Read frontend/i18n/fr.json
 *  - Extract and flatten all keys (dot notation, e.g., "section.sub.title")
 *  - Search each key across all .ts and .html files of the project
 *  - Matches must be for the full phrase (no partial substring) and case-insensitive
 *  - Print the list of unused keys
 *
 * Usage:
 *  - node scripts/unused_translations.js
 *  - Options:
 *      --print-used        Also print found keys with first occurrence
 *      --root=<path>       Project root path (default: process.cwd())
 *      --translations=<p>  Path to translation file (default: frontend/i18n/fr.json)
 *      --include=<path>    Start directory for scanning files (default: project root)
 *      --quiet             Reduced output (only print unused keys)
 *
 * Notes:
 *  - Word boundaries are adapted to i18n keys (allowed characters: [A-Za-z0-9_.-]).
 *  - Ignored directories: node_modules, .git, dist, build, out, coverage, tmp, .idea, .vscode
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

const PROJECT_ROOT = path.resolve(process.cwd(), argMap.get('root') || '')
const TRANSLATION_FILE = path.resolve(PROJECT_ROOT, argMap.get('translations') || 'frontend/src/i18n/fr.json')
// Directory to start scanning from (defaults to project root)
const SEARCH_ROOT = path.resolve(PROJECT_ROOT, argMap.get('include') || '')

const PRINT_USED = Boolean(argMap.get('print-used'))
const QUIET = Boolean(argMap.get('quiet'))

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', 'tmp', '.idea', '.vscode'])

// Static list of keys to ignore when reporting unused translations.
// Add exact key strings as they appear in fr.json.
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

function flattenKeys(obj, prefix = '') {
  const keys = []
  const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v)

  for (const [k, v] of Object.entries(obj || {})) {
    const current = prefix ? `${prefix}.${k}` : k
    if (isObject(v)) {
      keys.push(...flattenKeys(v, current))
    } else {
      // Add final leaf key (we don't filter by value type)
      keys.push(current)
    }
  }
  return keys
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

function main() {
  const startTs = Date.now()

  if (!fs.existsSync(TRANSLATION_FILE)) {
    console.error(`Error: translation file not found: ${TRANSLATION_FILE}`)
    process.exit(1)
  }

  const dict = readJson(TRANSLATION_FILE)
  const keys = flattenKeys(dict).sort()

  const searchRoot = fs.existsSync(SEARCH_ROOT) ? SEARCH_ROOT : PROJECT_ROOT
  const files = walkFiles(searchRoot)

  const { used, unused, where } = findUsageMap(keys, files)

  if (!QUIET) {
    console.log('Translations analysis (fr.json)')
    console.log(`- Project root: ${PROJECT_ROOT}`)
    console.log(`- Translations file: ${TRANSLATION_FILE}`)
    console.log(`- Scanned directory: ${searchRoot}`)
    console.log(`- .ts/.html files scanned: ${files.length}`)
    console.log(`- Total keys: ${keys.length}`)
    console.log(`- Keys found: ${used.length}`)
    console.log(`- Keys ignored: ${IGNORE_UNUSED_KEYS.length}`)
    console.log(`- Unused keys: ${unused.length}`)
    if (PRINT_USED) {
      console.log('\nUsed keys (first occurrence):')
      for (const k of used) {
        console.log(`  - ${k}  @ ${where.get(k)}`)
      }
    }
  }

  if (unused.length) {
    console.log('\nUnused keys:')
    for (const k of unused) {
      console.log(`  - ${k}`)
    }
  } else {
    console.log('\nNo unused keys detected.')
  }

  if (!QUIET) {
    const ms = Date.now() - startTs
    console.log(`\nDone in ${ms} ms`)
  }

  // Exit 0 even if there are unused keys (audit script).
  // To fail CI when unused keys exist:
  // process.exit(unused.length ? 1 : 0);
}

if (require.main === module) {
  main()
}
