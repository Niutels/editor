// Phase-1 acceptance check: bridge up, both ledgers populated, digest/project/
// checkpoint APIs answering. Usage: node tooling/bench/src/check-bridge.mjs [--headless]

import { BridgeClient, sleep } from './bridge-client.mjs'
import { launchBenchBrowser } from './chrome.mjs'

const BASE = process.env.PASCAL_BENCH_URL ?? 'http://localhost:3002'
const URL_ = `${BASE}/landrush-lab/pascal-multiplayer-island?offline=1&bench=1&frameProfile=1`
const headless = process.argv.includes('--headless')

const browser = await launchBenchBrowser({ headless })
try {
  const errors = []
  browser.page.on('pageerror', (err) => errors.push(String(err).slice(0, 300)))
  await browser.page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 120_000 })

  const bridge = new BridgeClient(browser.page)
  const up = await bridge.waitForBridge({ requireProfiler: true })
  console.error(`[check] bridge up at frame ${up.beacon.frameIdx}; profiler=${up.info.profilerActive}`)

  await bridge.mark('check-start')
  await sleep(12_000)
  await bridge.mark('check-end')
  await sleep(300) // let the next collector tick consume the pending mark

  const { frames } = await bridge.pumpFrames()
  const events = await bridge.pumpEvents()
  const digest = await bridge.digest()
  const beacon = (await bridge.beacon()).beacon
  const pose = await bridge.cameraPose()
  const projected = await bridge.project([0, 0, 0])

  const recent = frames.slice(-400)
  const withCpu = recent.filter((f) => f.cpu !== null)
  const withGpu = recent.filter((f) => f.gpu?.renderMs !== null)
  const residuals = withCpu.map((f) => f.cpu.unmeasuredActiveMs).sort((a, b) => a - b)
  const spanIds = new Set()
  for (const f of withCpu) for (const s of f.cpu.topLevel) spanIds.add(s.id)
  const marks = recent.flatMap((f) => f.marks)

  const summary = {
    framesPulled: frames.length,
    cpuLedgerCoverage: recent.length ? withCpu.length / recent.length : 0,
    gpuLedgerCoverage: recent.length ? withGpu.length / recent.length : 0,
    residualP99Ms: residuals.length ? residuals[Math.floor(residuals.length * 0.99)] : null,
    distinctTopLevelSpans: spanIds.size,
    sampleSpans: [...spanIds].slice(0, 12),
    eventsSeen: events.length,
    eventTypes: [...new Set(events.map((e) => e.type))].slice(0, 10),
    marksInFrames: marks,
    digest,
    beacon,
    cameraPose: pose ? { position: pose.position.map((v) => Math.round(v * 10) / 10) } : null,
    projectOrigin: projected,
    pageErrors: errors.slice(0, 5),
  }
  console.log(JSON.stringify(summary, null, 2))

  const pass =
    summary.cpuLedgerCoverage > 0.9 &&
    summary.gpuLedgerCoverage > 0.9 &&
    summary.distinctTopLevelSpans > 3 &&
    summary.marksInFrames.length >= 2 &&
    digest !== null &&
    errors.length === 0
  console.error(pass ? '[check] PASS' : '[check] FAIL')
  process.exitCode = pass ? 0 : 1
} finally {
  await browser.close()
}
