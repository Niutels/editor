import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import {
  buildLandrushRuntimeWorkers,
  createLandrushRuntimeWorkerWatchArguments,
  landrushRuntimeWorkerWatchDirectory,
} from './build-landrush-runtime-workers.mjs'

const execFileAsync = promisify(execFile)
const bun = process.platform === 'win32' ? 'bun.exe' : 'bun'
const children = new Set()
const maxNextRssBytes = readPositiveNumber('PASCAL_DEV_MAX_RSS_GB', 10) * 1024 ** 3
const memoryPollMs = readPositiveNumber('PASCAL_DEV_MEMORY_POLL_MS', 15_000)
const samplesBeforeRestart = Math.max(
  1,
  Math.round(readPositiveNumber('PASCAL_DEV_MEMORY_SAMPLES', 2)),
)

let next = null
let nextRestartRequested = false
let nextOverLimitSamples = 0
let shuttingDown = false

await buildLandrushRuntimeWorkers()
start(
  'landrush-worker-watch',
  bun,
  createLandrushRuntimeWorkerWatchArguments(),
  () => {
    failCoordinator('landrush-worker-watch exited unexpectedly')
  },
  { cwd: landrushRuntimeWorkerWatchDirectory, fatal: true },
)
if (!process.argv.includes('--next-only')) {
  start('landrush-ws', bun, ['scripts/landrush-world-multiplayer-ws.mjs'], () => {
    if (!shuttingDown) console.log('landrush-ws exited')
  })
}
startNext()

const memoryMonitor = setInterval(() => void inspectNextMemory(), memoryPollMs)
memoryMonitor.unref()

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    shuttingDown = true
    clearInterval(memoryMonitor)
    stopChildren()
  })
}

function startNext() {
  nextOverLimitSamples = 0
  next = start('next', bun, ['x', 'next', 'dev', '--turbo', '--port', '3002'], (code, signal) => {
    next = null
    if (shuttingDown) return

    if (nextRestartRequested) {
      nextRestartRequested = false
      console.log('next restarting after memory cleanup')
      setTimeout(startNext, 1_000)
      return
    }

    process.exitCode = code ?? (signal ? 1 : 0)
    console.log('next exited')
    stopChildren()
  })
}

function start(label, command, args, onExit, { cwd, fatal = false } = {}) {
  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== 'win32',
    env: process.env,
    shell: false,
    stdio: 'inherit',
  })
  children.add(child)

  child.on('exit', (code, signal) => {
    children.delete(child)
    onExit(code, signal)
  })
  child.on('error', (error) => {
    console.error(`${label} failed to start: ${error.message}`)
    if (fatal) failCoordinator(`${label} cannot continue`, 1)
  })

  return child
}

function failCoordinator(message, exitCode = 1) {
  if (shuttingDown) return
  shuttingDown = true
  process.exitCode = exitCode > 0 ? exitCode : 1
  console.error(message)
  stopChildren()
}

async function inspectNextMemory() {
  const processId = next?.pid
  if (!processId || nextRestartRequested || shuttingDown) return

  try {
    // Next delegates work to child processes, so its complete process tree is the useful limit.
    const rssBytes = await processTreeRssBytes(processId)
    if (rssBytes <= maxNextRssBytes) {
      nextOverLimitSamples = 0
      return
    }

    nextOverLimitSamples += 1
    console.warn(
      `next process tree is ${formatGigabytes(rssBytes)} GB ` +
        `(${nextOverLimitSamples}/${samplesBeforeRestart} samples above ${formatGigabytes(maxNextRssBytes)} GB)`,
    )
    if (nextOverLimitSamples < samplesBeforeRestart) return

    nextRestartRequested = true
    console.warn('restarting next to release development memory')
    stopProcessTree(next)
  } catch (error) {
    console.warn(`could not inspect next memory: ${error instanceof Error ? error.message : error}`)
  }
}

async function processTreeRssBytes(rootProcessId) {
  const processes =
    process.platform === 'win32' ? await windowsProcessTable() : await posixProcessTable()
  const descendants = new Set([rootProcessId])
  let changed = true
  while (changed) {
    changed = false
    for (const processInfo of processes) {
      if (descendants.has(processInfo.parentProcessId) && !descendants.has(processInfo.processId)) {
        descendants.add(processInfo.processId)
        changed = true
      }
    }
  }

  return processes.reduce(
    (total, processInfo) =>
      descendants.has(processInfo.processId) ? total + processInfo.rssBytes : total,
    0,
  )
}

async function windowsProcessTable() {
  const script =
    'Get-CimInstance Win32_Process | ' +
    'Select-Object ProcessId,ParentProcessId,WorkingSetSize | ConvertTo-Json -Compress'
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  })
  const parsed = JSON.parse(stdout)
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return rows.map((row) => ({
    parentProcessId: Number(row.ParentProcessId),
    processId: Number(row.ProcessId),
    rssBytes: Number(row.WorkingSetSize) || 0,
  }))
}

async function posixProcessTable() {
  const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,ppid=,rss='])
  return stdout
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number))
    .filter(([processId, parentProcessId, rssKilobytes]) =>
      [processId, parentProcessId, rssKilobytes].every(Number.isFinite),
    )
    .map(([processId, parentProcessId, rssKilobytes]) => ({
      parentProcessId,
      processId,
      rssBytes: rssKilobytes * 1024,
    }))
}

function stopChildren() {
  for (const child of children) stopProcessTree(child)
}

function stopProcessTree(child) {
  if (!child.pid || child.killed) return
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    })
    killer.unref()
    return
  }

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

function readPositiveNumber(name, fallback) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function formatGigabytes(bytes) {
  return (bytes / 1024 ** 3).toFixed(1)
}
