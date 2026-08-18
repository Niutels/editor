// Run-directory layout and artifact writers.
//
// runs/<runId>/
//   run.json            environment + parameters + final verdicts
//   trace.jsonl         every dispatched input primitive / bridge op
//   frames.jsonl        unified per-frame ledger rows (from the bridge)
//   events.jsonl        bus/loaf/detector/console events
//   checkpoints/K.json  scene+camera+editor snapshots
//   screenshots/*.png   anomaly + end-of-run captures
//   profile.cpuprofile  full-run V8 sampling profile (open in DevTools)
//   report.json/md      budget evaluation (report.mjs)

import { execSync } from 'node:child_process'
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const BENCH_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const REPO_ROOT = path.join(BENCH_ROOT, '..', '..')
export const RUNS_ROOT = path.join(BENCH_ROOT, 'runs')

export function createRunDir(scenario, seed) {
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19)
  const runId = `${stamp}_${scenario}_s${seed}`
  const runDir = path.join(RUNS_ROOT, runId)
  mkdirSync(path.join(runDir, 'checkpoints'), { recursive: true })
  mkdirSync(path.join(runDir, 'screenshots'), { recursive: true })
  return { runId, runDir }
}

export function gitInfo() {
  const opts = { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  try {
    const sha = execSync('git rev-parse HEAD', opts).trim()
    const branch = execSync('git rev-parse --abbrev-ref HEAD', opts).trim()
    const dirty = execSync('git status --porcelain', opts).trim().length > 0
    return { sha, branch, dirty }
  } catch {
    return { sha: null, branch: null, dirty: null }
  }
}

export class JsonlWriter {
  constructor(filePath) {
    this.stream = createWriteStream(filePath, { flags: 'a' })
    this.count = 0
  }

  write(obj) {
    this.stream.write(`${JSON.stringify(obj)}\n`)
    this.count += 1
  }

  writeAll(objs) {
    for (const obj of objs) this.write(obj)
  }

  async close() {
    await new Promise((resolve) => this.stream.end(resolve))
  }
}

export function writeRunJson(runDir, data) {
  writeFileSync(path.join(runDir, 'run.json'), JSON.stringify(data, null, 2))
}

export function writeCheckpoint(runDir, key, checkpoint) {
  writeFileSync(
    path.join(runDir, 'checkpoints', `${key}.json`),
    JSON.stringify(checkpoint),
  )
}
