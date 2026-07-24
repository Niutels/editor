// Quick page-state dump for harness debugging.
// Usage: node tooling/bench/src/debug-page.mjs "<url-path-with-query>" [--seconds N]

import { launchBenchBrowser } from './chrome.mjs'
import { sleep } from './bridge-client.mjs'

const BASE = process.env.PASCAL_BENCH_URL ?? 'http://localhost:3002'
const urlPath = process.argv[2] ?? '/landrush-lab/pascal-multiplayer-island?offline=1&bench=1&frameProfile=1'
const secondsArg = process.argv.indexOf('--seconds')
const seconds = secondsArg > -1 ? Number(process.argv[secondsArg + 1]) : 20

const browser = await launchBenchBrowser({ headless: true })
try {
  const consoleLines = []
  const errors = []
  browser.page.on('console', (msg) => consoleLines.push(`[${msg.type()}] ${msg.text().slice(0, 240)}`))
  browser.page.on('pageerror', (err) => errors.push(String(err).slice(0, 500)))
  await browser.page.goto(`${BASE}${urlPath}`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await sleep(seconds * 1000)
  const state = await browser.page.evaluate(() => ({
    hasBench: Boolean(window.__PASCAL_BENCH__),
    benchBeacon: window.__PASCAL_BENCH__?.beacon() ?? null,
    benchInfo: window.__PASCAL_BENCH__?.info() ?? null,
    hasProfiler: Boolean(window.__LANDRUSH_FRAME_PROFILE__),
    profilerEnabled: window.__LANDRUSH_FRAME_PROFILE__?.enabled ?? null,
    profilerHasFramesSince: typeof window.__LANDRUSH_FRAME_PROFILE__?.framesSince === 'function',
    canvases: [...document.querySelectorAll('canvas')].map((c) => `${c.width}x${c.height}`),
    title: document.title,
    bodyMarker: document.body?.innerText?.slice(0, 200),
  }))
  console.log(JSON.stringify({ state, errors: errors.slice(0, 8), console: consoleLines.slice(-30) }, null, 2))
} finally {
  await browser.close()
}
