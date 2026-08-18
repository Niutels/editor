// Dev-server lifecycle for the bench harness.
//
// Reuse-first: if something already answers on the port we use it and never
// touch it on teardown. Only processes we spawned ourselves get killed (by pid
// tree, taskkill /T). The repo's `bun kill` script is lsof-based and unusable
// on Windows — never call it.

import { spawn } from 'node:child_process'
import { createWriteStream, mkdirSync } from 'node:fs'
import path from 'node:path'

const PORT = Number(process.env.PASCAL_BENCH_PORT ?? 3002)
export const BASE_URL = process.env.PASCAL_BENCH_URL ?? `http://localhost:${PORT}`

export async function probeServer(timeoutMs = 30_000) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(`${BASE_URL}/api/health`, {
      signal: controller.signal,
      redirect: 'manual',
    })
    clearTimeout(timer)
    return res.status > 0
  } catch {
    return false
  }
}

export async function readServerMode(timeoutMs = 30_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${BASE_URL}/api/health`, {
      signal: controller.signal,
      redirect: 'manual',
    })
    if (!res.ok) return null
    const health = await res.json()
    return typeof health?.mode === 'string' ? health.mode : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Ensure a dev server is running. Returns { reused, stop } — stop() is a no-op
 * for reused servers.
 */
export async function ensureServer({ repoRoot, runDir, spawnIfMissing = true }) {
  if (await probeServer()) {
    return { reused: true, stop: async () => {} }
  }
  if (!spawnIfMissing) {
    throw new Error(`no server on ${BASE_URL} and --no-spawn given`)
  }

  mkdirSync(runDir, { recursive: true })
  const log = createWriteStream(path.join(runDir, 'server.log'))
  const child = spawn('bun', ['run', '--cwd', 'apps/editor', 'dev'], {
    cwd: repoRoot,
    shell: true,
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PASCAL_BENCH_SPAWNED: '1' },
  })
  child.stdout.pipe(log)
  child.stderr.pipe(log)

  const t0 = Date.now()
  while (Date.now() - t0 < 120_000) {
    if (await probeServer()) {
      return {
        reused: false,
        stop: async () => {
          if (child.pid) {
            await new Promise((resolve) => {
              const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
                shell: true,
                stdio: 'ignore',
              })
              killer.on('exit', resolve)
              killer.on('error', resolve)
            })
          }
        },
      }
    }
    if (child.exitCode !== null) {
      throw new Error(`dev server exited early (code ${child.exitCode}) — see server.log`)
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error('dev server did not become ready within 120s — see server.log')
}
