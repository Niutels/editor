import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { BridgeClient, sleep } from './bridge-client.mjs'
import { launchBenchBrowser } from './chrome.mjs'
import { waitForWorldLayout } from './scenario/scenario-utils.mjs'

const port = Number(process.env.PASCAL_BENCH_PORT ?? 3002)
const baseUrl = `http://localhost:${port}`
const outputDir = path.resolve(
  process.argv[2] ?? path.join('tooling', 'bench', 'visual-parity', new Date().toISOString().replaceAll(':', '-')),
)
const checkpointsMs = [0, 100, 250, 500, 1_000, 2_000]
const routes = [
  {
    name: 'normal',
    url: `${baseUrl}/landrush-lab/pascal-multiplayer-island-benchmark?offline=1&bench=1&landrushProbe=1&landrushProbeDom=1&benchmarkReport=outside`,
  },
  {
    name: 'isolated',
    url: `${baseUrl.replace('localhost', '127.0.0.1')}/landrush-lab/pascal-openworld-integration-full-scene.html?offline=1&bench=1&landrushProbe=1&landrushProbeDom=1&benchmarkReport=outside`,
  },
].filter((route) => !process.env.LANDRUSH_VISUAL_ROUTE || route.name === process.env.LANDRUSH_VISUAL_ROUTE)

mkdirSync(outputDir, { recursive: true })
const results = []

for (const route of routes) {
  const routeDir = path.join(outputDir, route.name)
  mkdirSync(routeDir, { recursive: true })
  const profileDir = mkdtempSync(path.join(tmpdir(), `landrush-visual-${route.name}-`))
  const browser = await launchBenchBrowser({ headless: true, profileDir })
  const errors = []
  browser.page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  browser.page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })

  try {
    await browser.cdp.send('Network.enable')
    await browser.cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    for (const origin of [baseUrl, baseUrl.replace('localhost', '127.0.0.1')]) {
      await browser.cdp.send('Storage.clearDataForOrigin', {
        origin,
        storageTypes: 'local_storage,indexeddb,cache_storage,service_workers',
      })
    }

    const startedAt = performance.now()
    await browser.page.goto(route.url, { waitUntil: 'commit', timeout: 180_000 })
    const captures = []
    for (const checkpointMs of checkpointsMs) {
      const waitMs = checkpointMs - (performance.now() - startedAt)
      if (waitMs > 0) await sleep(waitMs)
      const file = path.join(routeDir, `startup-${String(checkpointMs).padStart(4, '0')}ms.png`)
      await captureFirstCompositedFrame(browser.page, file)
      const elapsedMs = Math.round(performance.now() - startedAt)
      captures.push({ checkpointMs, elapsedMs, file })
    }

    const bridgePage =
      route.name === 'isolated' ? await waitForLandrushFrame(browser.page) : browser.page
    const bridge = new BridgeClient(bridgePage)
    const up = await bridge.waitForBridge({ requireProfiler: false })
    const floorVisibility = await waitForWorldLayout(bridgePage)
    await sleep(1_000)
    const readyFile = path.join(routeDir, 'ready.png')
    await browser.page.screenshot({ path: readyFile })
    results.push({
      name: route.name,
      url: route.url,
      captures,
      readyFile,
      readyElapsedMs: Math.round(performance.now() - startedAt),
      nodeCount: up.beacon.nodeCount,
      floorVisibility,
      errors,
    })
  } finally {
    await browser.close()
  }
}

writeFileSync(path.join(outputDir, 'result.json'), `${JSON.stringify(results, null, 2)}\n`)
console.log(JSON.stringify({ outputDir, results }, null, 2))

async function waitForLandrushFrame(page, timeoutMs = 180_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const frame = page
      .frames()
      .find((candidate) => candidate !== page.mainFrame() && candidate.url().includes('/landrush-lab/'))
    if (frame) return frame
    await sleep(100)
  }
  throw new Error('isolated Landrush frame did not load')
}

async function captureFirstCompositedFrame(page, file) {
  let lastError = null
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await page.screenshot({ path: file })
      return
    } catch (error) {
      lastError = error
      await sleep(50)
    }
  }
  throw lastError
}
