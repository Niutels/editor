// Phase-0 spike: validate WebGPU timestamp queries on the live island page.
//
// Matrix cells (all on /landrush-lab/pascal-multiplayer-island?offline=1):
//   island-idle      direct render path, static camera
//   island-orbit     direct render path under camera load (?benchmark=1 auto-orbit)
//   island-postfx    full RenderPipeline re-enabled (?benchPostFx=1) — the path
//                    the stale gpu-perf.ts comment claims can't be timestamped
//   island-postfx-off  control: ?benchPostFx=1&disable=postFx (direct path again)
//
// Usage: node tooling/bench/src/spike-gpu.mjs [--seconds 25] [--headless] [--cell name]

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBenchBrowser } from './chrome.mjs'

const BASE = process.env.PASCAL_BENCH_URL ?? 'http://localhost:3002'
const PAGE = '/landrush-lab/pascal-multiplayer-island'

const CELLS = {
  'island-idle': `${PAGE}?offline=1&benchGpu=1`,
  'island-orbit': `${PAGE}?offline=1&benchGpu=1&benchmark=1`,
  'island-postfx': `${PAGE}?offline=1&benchGpu=1&benchmark=1&benchPostFx=1`,
  'island-postfx-off': `${PAGE}?offline=1&benchGpu=1&benchmark=1&benchPostFx=1&disable=postFx`,
}

function parseArgs(argv) {
  const out = { seconds: 25, headless: false, cell: null }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--seconds') out.seconds = Number(argv[++i])
    else if (argv[i] === '--headless') out.headless = true
    else if (argv[i] === '--cell') out.cell = argv[++i]
  }
  return out
}

const percentile = (sorted, p) =>
  sorted.length === 0 ? null : sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)
  return {
    n: sorted.length,
    avg: sorted.length ? sum / sorted.length : null,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted.length ? sorted[sorted.length - 1] : null,
  }
}

async function waitForBench(page, timeoutMs = 180_000) {
  const t0 = Date.now()
  let lastFrameIdx = -1
  while (Date.now() - t0 < timeoutMs) {
    const status = await page
      .evaluate(() => {
        const bench = window.__PASCAL_BENCH__
        if (!bench) return null
        return { beacon: bench.beacon(), gpu: bench.gpuStatus() }
      })
      .catch(() => null)
    if (status?.gpu?.installed && status.beacon.frameIdx > 120 && status.beacon.frameIdx !== lastFrameIdx) {
      return status
    }
    lastFrameIdx = status?.beacon?.frameIdx ?? -1
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('bench bridge did not come up (no __PASCAL_BENCH__ or frames not advancing)')
}

async function runCell(name, url, { seconds, headless }) {
  process.stderr.write(`[spike] cell ${name} → ${url}\n`)
  const browser = await launchBenchBrowser({ headless })
  try {
    const consoleErrors = []
    browser.page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300))
    })
    browser.page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${String(err).slice(0, 300)}`))

    await browser.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 })
    const ready = await waitForBench(browser.page)
    process.stderr.write(
      `[spike] bridge up: frameIdx=${ready.beacon.frameIdx} gpuSupported=${ready.gpu.supported}\n`,
    )

    const measureStartCursor = await browser.page.evaluate(
      () => window.__PASCAL_BENCH__.getFramesSince(Number.MAX_SAFE_INTEGER).cursor,
    )
    await new Promise((r) => setTimeout(r, seconds * 1000))

    const pull = await browser.page.evaluate((cursor) => {
      const bench = window.__PASCAL_BENCH__
      return { frames: bench.getFramesSince(cursor).frames, gpu: bench.gpuStatus(), info: bench.info() }
    }, measureStartCursor - 4096)

    const frames = pull.frames
    const dts = frames.map((f) => f.dtMs).filter((v) => v > 0)
    const gpuFrames = frames.filter((f) => f.gpu?.supported)
    const distinctResolves = new Map()
    for (const f of gpuFrames) {
      if (f.gpu.resolvedAtFrame >= 0 && f.gpu.renderMs !== null) {
        distinctResolves.set(f.gpu.resolvedAtFrame, f.gpu)
      }
    }
    const resolved = [...distinctResolves.values()]
    const renderMs = resolved.map((g) => g.renderMs).filter((v) => v !== null)
    const computeMs = resolved.map((g) => g.computeMs).filter((v) => v !== null)
    const staleness = gpuFrames
      .filter((f) => f.gpu.resolvedAtFrame >= 0)
      .map((f) => f.frameIdx - f.gpu.resolvedAtFrame)
    const workDone = [...new Set(gpuFrames.map((f) => f.gpu.workDoneDeltaMs).filter((v) => v !== null))]

    const result = {
      cell: name,
      url,
      frames: frames.length,
      gpuSupported: pull.gpu.supported,
      dtMs: stats(dts),
      gpu: {
        distinctResolves: resolved.length,
        resolveRate: frames.length ? resolved.length / frames.length : 0,
        renderMs: stats(renderMs),
        computeMs: stats(computeMs),
        stalenessFrames: stats(staleness),
        queryPressureMax: Math.max(0, ...gpuFrames.map((f) => f.gpu.queryPressure)),
        passCount: stats(resolved.map((g) => g.passCount)),
        workDoneDeltaMs: stats(workDone),
        latestSample: pull.gpu.latest,
      },
      consoleErrors: consoleErrors.slice(0, 10),
    }
    return result
  } finally {
    await browser.close()
  }
}

const args = parseArgs(process.argv)
const cells = args.cell ? { [args.cell]: CELLS[args.cell] } : CELLS
if (args.cell && !CELLS[args.cell]) {
  console.error(`unknown cell ${args.cell}; known: ${Object.keys(CELLS).join(', ')}`)
  process.exit(2)
}

const results = []
for (const [name, urlPath] of Object.entries(cells)) {
  try {
    results.push(await runCell(name, `${BASE}${urlPath}`, args))
  } catch (err) {
    results.push({ cell: name, error: String(err).slice(0, 500) })
  }
}

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'runs')
mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, `spike-gpu-${Date.now()}.json`)
writeFileSync(outFile, JSON.stringify(results, null, 2))
process.stderr.write(`[spike] wrote ${outFile}\n`)
console.log(JSON.stringify(results, null, 2))
