#!/usr/bin/env node

/**
 * sync-in-server.js - Command-line interface for:
 *  - Starting the server (with optional daemon mode)
 *  - Stopping the server
 *  - Checking server status
 *  - Displaying the server version
 *  - Running database migrations
 *  - Updating the server version
 *  - Displaying help information
 */

const [nodeMajorVersion] = process.versions.node.split('.').map((num) => parseInt(num, 10))
const { spawn, spawnSync, exec } = require('child_process')
const { promisify } = require('util')
const path = require('path')
const fs = require('fs')

// Paths relative to this script
const PKILL_GRACEFUL_TIMEOUT = 10000 // 10s timeout
const ROOT_DIR = path.resolve(__dirname)
const CREATE_USER_SCRIPT = path.join(ROOT_DIR, 'server', 'infrastructure', 'database', 'scripts', 'create-user.js')
const SERVER_ENTRY = path.join(ROOT_DIR, 'server', 'main.js')
const ENV_DIST_FILE = path.join(ROOT_DIR, 'environment', 'environment.dist.yaml')
const ENV_DIST_MIN_FILE = path.join(ROOT_DIR, 'environment', 'environment.dist.min.yaml')
const USER_DIST_FILE = path.join(ROOT_DIR, '../../../environment.yaml')
const PID_FILE = path.join(ROOT_DIR, 'server.pid')
const LOG_FILE = path.join(ROOT_DIR, '../../../logs/server.log')
const DB_CONF_FILE = path.join(ROOT_DIR, 'server', 'infrastructure', 'database', 'configuration.js')
const CMD_DB_ARGS = ['drizzle-kit', 'migrate', `--config=${DB_CONF_FILE}`]

function printHelp() {
  console.log(`
Usage: npx sync-in-server <command> [options]

Available commands:
  init              Copy initial configuration into the server directory
  start [-d]        Start the server; use -d for daemon (detached) mode
  stop              Stop the server
  status            Show server status (daemon mode only)
  version           Show installed sync-in-server version
  migrate-db        Run database migrations
  create-user       Create a user or administrator in the database
  update            Update the server version
  help              Show this help message

Examples:
  npx sync-in-server init            # copy default environment.yaml
  npx sync-in-server start           # attached mode
  npx sync-in-server start -d        # daemon mode
  npx sync-in-server create-user     # create default administrator account : sync-in/sync-in
  npx sync-in-server create-user --role admin  --login "userLogin" --password "userPassword"
  npx sync-in-server version
  npx sync-in-server help
`)
}

function init() {
  if (!fs.existsSync(ENV_DIST_MIN_FILE)) {
    console.error(`❌ Default configuration not found at: ${ENV_DIST_MIN_FILE}`)
    process.exit(1)
  }
  if (fs.existsSync(USER_DIST_FILE)) {
    console.error(`❌ Configuration file already exists: ${USER_DIST_FILE}`)
    process.exit(1)
  }
  try {
    fs.copyFileSync(ENV_DIST_MIN_FILE, USER_DIST_FILE)
    console.log(`✅ Default configuration has been copied to: ${USER_DIST_FILE}`)
    console.log('⚠️ Remember to set your secrets before running the server.')
    console.log(`ℹ️ For the full list of options: \n    see ${ENV_DIST_FILE} \n    or visit https://sync-in.com/docs/setup-guide/server`)
    console.log(`ℹ️ For environment variable setup instructions, visit https://sync-in.com/docs/setup-guide/docker#during-execution`)
  } catch (e) {
    console.error(`❌ Unable to copy initial configuration: ${e}`)
    process.exit(1)
  }
}

function startServer(detached = false) {
  if (!fs.existsSync(SERVER_ENTRY)) {
    console.error(`❌ Sync-in Server entry point not found: ${SERVER_ENTRY}`)
    process.exit(1)
  }
  if (statusServer(true)) {
    console.log('⚠️ Use \x1b[1mnpx sync-in-server stop\x1b[0m to stop it')
    process.exit(0)
  }
  try {
    if (detached) {
      console.log('🚀 Starting Sync-in Server in daemon mode...')
      const env = {
        ...{
          SYNCIN_LOGGER_STDOUT: false,
          SYNCIN_LOGGER_COLORIZE: false,
          SYNCIN_LOGGER_FILEPATH: LOG_FILE
        },
        ...process.env
      }
      const child = spawn('node', [SERVER_ENTRY], { detached: true, stdio: 'ignore', env: env })
      child.unref()
      fs.writeFileSync(PID_FILE, String(child.pid))
      console.log(`✅ Sync-in Server started with PID ${child.pid}`)
      console.log(`📝 Logging to file → ${env.SYNCIN_LOGGER_FILEPATH}`)
      process.exit(0)
    } else {
      console.log('🚀 Starting Sync-in Server attached...')
      const child = spawn('node', [SERVER_ENTRY], { stdio: 'inherit' })
      // forward exit code
      child.on('exit', (code) => process.exit(code))
    }
  } catch (e) {
    console.error(`❌ Sync-in Server failed to start: ${e}`)
    process.exit(1)
  }
}

async function stopServer() {
  if (!fs.existsSync(PID_FILE)) {
    console.error('❌ PID file not found. Is the server running?')
    process.exit(1)
  }
  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'), 10)
  if (isNaN(pid)) {
    console.error(`❌ Invalid PID in file: ${PID_FILE}`)
    process.exit(1)
  }
  try {
    // Send SIGTERM
    process.kill(pid, 'SIGTERM')
    console.log(`🛑 Sent SIGTERM to process ${pid}, waiting for graceful shutdown...`)

    // Wait for process to exit (poll every 100ms)
    const success = await waitForProcessExit(pid)
    if (!success) {
      console.error(`⏱️ Process ${pid} did not exit after ${PKILL_GRACEFUL_TIMEOUT}ms`)
      process.exit(1)
    }
    fs.unlinkSync(PID_FILE)
    console.log(`✅ Sync-in Server process ${pid} stopped and PID file removed.`)
  } catch (e) {
    if (e.code === 'ESRCH') {
      console.warn(`⚠️ Process ${pid} not found. Removing stale PID file.`)
      fs.unlinkSync(PID_FILE)
      return
    }
    console.error(`❌ Failed to stop process ${pid}: ${e}`)
    process.exit(1)
  }
}

function statusServer(returnStatus = false) {
  if (!fs.existsSync(PID_FILE)) {
    if (returnStatus) return false
    console.log('ℹ️ Sync-in Server is not running (no PID file).')
    process.exit(1)
  }

  const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8'), 10)
  if (isNaN(pid)) {
    if (returnStatus) return false
    console.error(`❌ Invalid PID in ${PID_FILE}`)
    process.exit(1)
  }

  try {
    // signal 0 does not kill the process; it only checks if it exists
    process.kill(pid, 0)
    console.log(`✅ Sync-in Server is running (PID ${pid}).`)
    if (returnStatus) return true
    process.exit(0)
  } catch (err) {
    if (returnStatus) return false
    if (err.code === 'ESRCH') {
      console.log(`⚠️  No process found at PID ${pid}. Cleaning up stale PID file.`)
      fs.unlinkSync(PID_FILE)
      process.exit(1)
    } else if (err.code === 'EPERM') {
      console.log(`✅ Sync-in Server is running, but no permission to signal PID ${pid}.`)
      process.exit(0)
    } else {
      console.error(`❌ Error checking status of PID ${pid}:`, err.message)
      process.exit(1)
    }
  }
}

function showVersion() {
  const pkgJson = getPackageJson()
  console.log(`🔖 Sync-in Server version: ${pkgJson.version}`)
}

function migrateDatabase() {
  console.log('🗄️ Running database migrations...')
  const result = spawnSync('npx', CMD_DB_ARGS, { stdio: 'inherit' })
  if (result.status !== 0) {
    console.error('❌ Database migrations failed. Please verify database connectivity and credentials.')
    process.exit(result.status)
  }
  console.log('✅ Database migrations completed successfully.')
}

async function updateVersion() {
  const currentPackage = getPackageJson()
  let latestVersion
  console.log('📡 Checking Sync-in Server version...')
  try {
    const execAsync = promisify(exec)
    const { stdout, stderr } = await execAsync(`npm view ${currentPackage.name} version`)
    // npm sometimes writes warnings to stderr
    if (stderr) console.warn(`⚠️ Warnings: ${stderr}`)
    latestVersion = stdout.trim()
    if (currentPackage.version === latestVersion) {
      console.log('✅ Sync-in Server is up to date.')
      process.exit(0)
    }
  } catch (e) {
    console.error(`❌ Unable to check version: ${e.stderr || e.message}`)
    process.exit(1)
  }
  console.log(`🔄 Updating Sync-in Server ${currentPackage.version} to ${latestVersion} ...`)
  const result = spawnSync('npm', ['update', currentPackage.name], { stdio: 'inherit' })
  if (result.status !== 0) {
    console.error('❌ Failed to update Sync-in Server.')
    process.exit(result.status)
  }
  migrateDatabase()
  console.log('✅ Sync-in Server updated.')
}

async function createUser(args) {
  let userType = 'User'
  if (args.length === 0 || (args.includes('--role') && args.includes('admin'))) {
    userType = 'Administrator'
    console.log(`👤 Creating ${args.length === 0 ? 'default' : ''} ${userType} in database...`)
  } else {
    console.log(`👤 Creating ${userType} in database...`)
  }
  const scriptArgs = [CREATE_USER_SCRIPT, ...args]
  const result = spawnSync('node', scriptArgs, { stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`❌ ${userType} creation failed.`)
    process.exit(result.status)
  }
  console.log(`✅ ${userType} created successfully.`)
}

function getPackageJson() {
  try {
    const pkgPath = path.join(ROOT_DIR, 'package.json')
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  } catch (e) {
    console.error(`❌ Unable to parse ${path.join(ROOT_DIR, 'package.json')} : ${e}`)
    process.exit(1)
  }
}

function waitForProcessExit(pid) {
  const interval = 500
  let waited = 0

  return new Promise((resolve) => {
    const timer = setInterval(() => {
      try {
        process.kill(pid, 0) // does not kill, just checks existence
        waited += interval
        if (waited >= PKILL_GRACEFUL_TIMEOUT) {
          clearInterval(timer)
          resolve(false)
        }
      } catch (e) {
        if (e.code === 'ESRCH') {
          clearInterval(timer)
          resolve(true) // process is gone
        } else {
          clearInterval(timer)
          resolve(false) // some unexpected error
        }
      }
    }, interval)
  })
}

;(function main() {
  // Ensure Nodejs.version
  if (nodeMajorVersion < 22) {
    console.error(`❌ Sync-in Server requires Node.js >= 22.x. Detected version: ${process.versions.node}`)
    process.exit(1)
  }
  // Ensure CLI isn’t run on Windows
  if (process.platform === 'win32') {
    console.error('❌ Sync-in Server is not supported on Windows')
    process.exit(1)
  }
  const args = process.argv.slice(2)
  const command = args[0]

  switch (command) {
    case 'init':
      init()
      break
    case 'start':
      const detached = args.includes('-d') || args.includes('--daemon')
      startServer(detached)
      break
    case 'stop':
      stopServer().catch(console.error)
      break
    case 'status':
      statusServer()
      break
    case 'version':
      showVersion()
      break
    case 'migrate-db':
      migrateDatabase()
      break
    case 'create-user':
      createUser(args.slice(1)).catch(console.error)
      break
    case 'update':
      updateVersion().catch(console.error)
      break
    case 'help':
    case undefined:
      printHelp()
      break
    default:
      console.error(`Unknown command: ${command}`)
      printHelp()
      process.exit(1)
  }
})()
