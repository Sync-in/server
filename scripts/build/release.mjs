#!/usr/bin/env node
/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { exec } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../..')
const pathRelative = (curPath) => path.relative(rootDir, curPath)

/* Packages JSON */
const rootPKGPath = path.join(rootDir, 'package.json')
const backendPKGPath = path.join(rootDir, 'backend', 'package.json')

/* Release */
const releaseDir = path.join(rootDir, 'release')
const releaseConf = {
  server: {
    name: 'sync-in-server',
    src: path.join(rootDir, 'dist'),
    dst: path.join(releaseDir, 'sync-in-server'),
    dstPkgJson: path.join(releaseDir, 'sync-in-server', 'package.json')
  },
  docker: {
    name: 'sync-in-docker',
    src: path.join(rootDir, 'docker'),
    dst: path.join(releaseDir, 'sync-in-docker')
  }
}

// Check server build
if (!fs.existsSync(releaseConf.server.src)) {
  console.error(`❌ ${pathRelative(releaseConf.server.src)} directory does not exist. Have you run the build ?`)
  process.exit(1)
}
for (const subDir of ['server', 'static']) {
  if (!fs.existsSync(path.join(releaseConf.server.src, subDir))) {
    console.error(`❌ ${pathRelative(releaseConf.server.src)}/${subDir} directory does not exist. Have you run the build ?`)
    process.exit(1)
  }
}

// Clean Up Release Directory
if (fs.existsSync(releaseDir)) {
  try {
    await fs.promises.rm(releaseDir, { recursive: true, force: true })
    console.log(`✅ dir cleaned: ${pathRelative(releaseDir)}`)
  } catch (e) {
    console.error(`❌ unable to clean dir: ${pathRelative(releaseDir)} - ${e}`)
    process.exit(1)
  }
}

// Create Release Directory
try {
  await fs.promises.mkdir(releaseDir, { recursive: true })
  console.log(`✅ dir created: ${pathRelative(releaseDir)}`)
} catch (e) {
  console.error(`❌ unable to create dir: ${pathRelative(releaseDir)} - ${e}`)
  process.exit(1)
}

const [rootPkgRaw, backendPkgRaw] = await Promise.all([fs.promises.readFile(rootPKGPath, 'utf8'), fs.promises.readFile(backendPKGPath, 'utf8')])
const rootPkg = JSON.parse(rootPkgRaw)
const backendPkg = JSON.parse(backendPkgRaw)

const releasePKG = {
  name: rootPkg.name,
  version: rootPkg.version,
  description: rootPkg.description,
  author: rootPkg.author,
  license: rootPkg.license,
  homepage: rootPkg.homepage,
  repository: rootPkg.repository,
  bugs: rootPkg.bugs,
  os: ['!win32'],
  keywords: rootPkg.keywords,
  bin: {
    'sync-in-server': 'server/main.js'
  },
  scripts: {
    init_env: 'cp environment/environment.dist.min.yaml environment.yaml'
  },
  dependencies: backendPkg.dependencies,
  optionalDependencies: backendPkg.optionalDependencies
}

/* Move dist -> release/sync-in-server */
try {
  await fs.promises.rename(releaseConf.server.src, releaseConf.server.dst)
  console.log(`✅ ${pathRelative(releaseConf.server.src)} moved to ${pathRelative(releaseConf.server.dst)}`)
} catch (e) {
  console.error(`❌ ${pathRelative(releaseConf.server.src)} not moved to ${pathRelative(releaseConf.server.dst)} - ${e}`)
  process.exit(1)
}

/* Extra files */
const extraFiles = ['CHANGELOG.md', 'README.md', 'LICENSE']
for (const f of extraFiles) {
  try {
    await fs.promises.copyFile(path.join(rootDir, f), path.join(releaseConf.server.dst, f))
    console.log(`✅ ${pathRelative(path.join(releaseConf.server.dst, f))} copied`)
  } catch (e) {
    console.error(`❌ ${pathRelative(path.join(releaseConf.server.dst, f))} not copied - ${e}`)
    process.exit(1)
  }
}

/* Environment files */
const environmentDir = 'environment'
const environmentFiles = ['environment.dist.min.yaml', 'environment.dist.yaml']
const environmentPath = path.join(releaseConf.server.dst, environmentDir)
try {
  await fs.promises.mkdir(environmentPath, { recursive: true })
  console.log(`✅ ${pathRelative(environmentPath)} created`)
} catch (e) {
  console.error(`❌ ${pathRelative(environmentPath)} not created - ${e}`)
  process.exit(1)
}
for (const f of environmentFiles) {
  try {
    await fs.promises.copyFile(path.join(rootDir, environmentDir, f), path.join(environmentPath, f))
    console.log(`✅ ${pathRelative(environmentPath)}/${f} copied`)
  } catch (e) {
    console.error(`❌ ${pathRelative(environmentPath)}/${f} not copied - ${e}`)
    process.exit(1)
  }
}

/* Write release/sync-in-server/package.json */
try {
  await fs.promises.writeFile(releaseConf.server.dstPkgJson, JSON.stringify(releasePKG, null, 2))
  console.log(`✅ ${pathRelative(releaseConf.server.dstPkgJson)} generated`)
} catch (e) {
  console.error(`❌ ${pathRelative(releaseConf.server.dstPkgJson)} not generated : ${e} !`)
  process.exit(1)
}

/* Docker files */
try {
  await fs.promises.cp(releaseConf.docker.src, releaseConf.docker.dst, { recursive: true })
  console.log(`✅ ${pathRelative(releaseConf.docker.src)} copied to ${pathRelative(releaseConf.docker.dst)}`)
} catch (e) {
  console.error(`❌ ${pathRelative(releaseConf.docker.src)} not copied to ${pathRelative(releaseConf.docker.dst)} : ${e}`)
  process.exit(1)
}


try {
  await Promise.all([
    exec(`cd ${releaseDir} && zip -r ${releaseConf.server.name}.zip ${releaseConf.server.name}`),
    exec(`cd ${releaseDir} && tar -czf ${releaseConf.server.name}.tar.gz ${releaseConf.server.name}`),
    exec(`cd ${releaseDir} && zip -r ${releaseConf.docker.name}.zip ${releaseConf.docker.name}`),
    exec(`cd ${releaseDir} && tar -czf ${releaseConf.docker.name}.tar.gz ${releaseConf.docker.name}`)
  ])
  console.log(`✅ releases archives created`)
} catch (e) {
  console.error(`❌ release archives was not created : ${e}`)
  process.exit(1)
}