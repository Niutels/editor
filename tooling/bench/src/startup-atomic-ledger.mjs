import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

import { chromeArgs, resolveChromeExecutable } from './chrome.mjs'

const TARGET_URL =
  process.env.LANDRUSH_STARTUP_ATOMIC_URL ??
  'https://landrush.niutgames.com/landrush-lab/pascal-multiplayer-island/?game=zombie-escape'
const MAX_STARTUP_MS = 180_000
const SAMPLE_INTERVAL_MS = 100
const VIEWPORT = { height: 1000, width: 1600 }

const runStamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const outputDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'runs',
  `startup-atomic-${runStamp}`,
)
mkdirSync(outputDirectory, { recursive: true })

const executablePath = resolveChromeExecutable()
const browser = await chromium.launch({
  args: [...chromeArgs({ headless: false, ...VIEWPORT }), '--window-position=-32000,-32000'],
  executablePath,
  headless: false,
  ignoreDefaultArgs: ['--enable-automation'],
})
const context = await browser.newContext({
  deviceScaleFactor: 1,
  viewport: VIEWPORT,
})
const page = await context.newPage()
const completedRuns = []

try {
  completedRuns.push(await captureStartupRun(page, context, 'cold-observer-light'))
  await page.addInitScript(installAtomicStartupInstrumentation)
  completedRuns.push(await captureStartupRun(page, context, 'warm-callsite-instrumented'))
} finally {
  await context.close().catch(() => undefined)
  await browser.close().catch(() => undefined)
}

const outputPath = path.join(outputDirectory, 'raw.json')
writeFileSync(
  outputPath,
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      executablePath,
      runs: completedRuns,
      targetUrl: TARGET_URL,
    },
    null,
    2,
  ),
)
console.log(outputPath)

async function captureStartupRun(page, context, label) {
  const cdp = await context.newCDPSession(page)
  const requests = new Map()
  const consoleMessages = []
  let documentTimestamp = null

  const onConsole = (message) => {
    const type = message.type()
    if (type !== 'warning' && type !== 'error') return
    consoleMessages.push({ text: message.text(), type })
  }
  page.on('console', onConsole)

  await cdp.send('Network.enable')
  cdp.on('Network.requestWillBeSent', (event) => {
    if (event.type === 'Document' && documentTimestamp === null) {
      documentTimestamp = event.timestamp
    }
    requests.set(event.requestId, {
      endMs: null,
      encodedDataLength: 0,
      errorText: null,
      fromDiskCache: false,
      fromServiceWorker: false,
      method: event.request.method,
      mimeType: null,
      requestId: event.requestId,
      responseMs: null,
      startMs: documentTimestamp === null ? null : (event.timestamp - documentTimestamp) * 1_000,
      status: null,
      type: event.type,
      url: event.request.url,
    })
  })
  cdp.on('Network.responseReceived', (event) => {
    const request = requests.get(event.requestId)
    if (!request) return
    request.fromDiskCache = event.response.fromDiskCache ?? false
    request.fromServiceWorker = event.response.fromServiceWorker ?? false
    request.mimeType = event.response.mimeType
    request.responseMs =
      documentTimestamp === null ? null : (event.timestamp - documentTimestamp) * 1_000
    request.status = event.response.status
  })
  cdp.on('Network.loadingFinished', (event) => {
    const request = requests.get(event.requestId)
    if (!request) return
    request.encodedDataLength = event.encodedDataLength
    request.endMs = documentTimestamp === null ? null : (event.timestamp - documentTimestamp) * 1_000
  })
  cdp.on('Network.loadingFailed', (event) => {
    const request = requests.get(event.requestId)
    if (!request) return
    request.endMs = documentTimestamp === null ? null : (event.timestamp - documentTimestamp) * 1_000
    request.errorText = event.errorText
  })

  const startedAtEpochMs = Date.now()
  await page.goto(`${TARGET_URL}&startupAtomicRun=${encodeURIComponent(label)}-${runStamp}`, {
    timeout: 60_000,
    waitUntil: 'domcontentloaded',
  })
  const samples = []
  const deadline = startedAtEpochMs + MAX_STARTUP_MS
  while (Date.now() < deadline) {
    const sample = await page.evaluate(readStartupSnapshot)
    samples.push(sample)
    if (sample.handedOff === 'true') break
    await new Promise((resolve) => setTimeout(resolve, SAMPLE_INTERVAL_MS))
  }
  await new Promise((resolve) => setTimeout(resolve, 1_200))
  const pageData = await page.evaluate(() => ({
    instrumentation:
      /** @type {Window & { __LANDRUSH_ATOMIC_STARTUP__?: unknown }} */ (window)
        .__LANDRUSH_ATOMIC_STARTUP__ ?? null,
    navigation: performance.getEntriesByType('navigation').map((entry) => entry.toJSON()),
    now: performance.now(),
    resources: performance.getEntriesByType('resource').map((entry) => entry.toJSON()),
  }))

  page.off('console', onConsole)
  await cdp.detach()
  return {
    consoleMessages,
    durationMs: samples.at(-1)?.t ?? null,
    label,
    network: Array.from(requests.values()),
    pageData,
    samples,
    startedAtEpochMs,
  }
}

function readStartupSnapshot() {
  const main = document.querySelector('main[data-landrush-interface-focus-sink]')
  const shell = document.querySelector('[data-landrush-island-loading-shell]')
  const status = document.querySelector('[data-landrush-island-loading-shell-status]')
  return {
    ambient: main?.getAttribute('data-landrush-loading-ambient-ready') ?? null,
    builtColliders:
      main?.getAttribute('data-landrush-loading-built-colliders-ready') ?? null,
    cliffs: main?.getAttribute('data-landrush-loading-procedural-cliffs-ready') ?? null,
    ground: main?.getAttribute('data-landrush-loading-stylized-ground-ready') ?? null,
    handedOff: main?.getAttribute('data-landrush-loading-handed-off') ?? null,
    initialParcel: main?.getAttribute('data-landrush-loading-initial-parcel-ready') ?? null,
    naturalRoad: main?.getAttribute('data-landrush-loading-natural-road-ready') ?? null,
    paint: main?.getAttribute('data-landrush-loading-paint-ready') ?? null,
    percent: shell?.getAttribute('aria-valuenow') ?? null,
    status: status?.textContent?.trim() ?? null,
    t: performance.now(),
    viewer: main?.getAttribute('data-landrush-loading-viewer-scene-ready') ?? null,
    visibility: document.visibilityState,
    worldFrame: main?.getAttribute('data-landrush-loading-world-frame-ready') ?? null,
    zombieAssets: main?.getAttribute('data-landrush-loading-zombie-assets-ready') ?? null,
    zombieNavigation:
      main?.getAttribute('data-landrush-loading-zombie-navigation-ready') ?? null,
    zombieNavigationError:
      main?.getAttribute('data-landrush-loading-zombie-navigation-error') ?? null,
    zombieNavigationStatus:
      main?.getAttribute('data-landrush-loading-zombie-navigation-status') ?? null,
  }
}

function installAtomicStartupInstrumentation() {
  const state = {
    activeRenderRepresentative: null,
    gpu: [],
    idleCallbacks: [],
    longAnimationFrames: [],
    longTasks: [],
    rafCallbacks: [],
    renderReadiness: [],
    startedAt: performance.now(),
    timers: [],
  }
  Object.defineProperty(window, '__LANDRUSH_ATOMIC_STARTUP__', {
    configurable: true,
    value: state,
  })

  const compactStack = () =>
    (new Error().stack ?? '')
      .split('\n')
      .slice(2, 6)
      .map((line) => line.trim())
      .join(' | ')

  const originalRequestAnimationFrame = window.requestAnimationFrame
  window.requestAnimationFrame = function requestAnimationFrame(callback) {
    const record = {
      callbackDurationMs: null,
      firedMs: null,
      scheduledMs: performance.now() - state.startedAt,
      stack: compactStack(),
      waitMs: null,
    }
    state.rafCallbacks.push(record)
    return originalRequestAnimationFrame.call(window, function instrumentedFrame(timestamp) {
      const callbackStartedAt = performance.now()
      record.firedMs = callbackStartedAt - state.startedAt
      record.waitMs = callbackStartedAt - state.startedAt - record.scheduledMs
      try {
        return callback.call(this, timestamp)
      } finally {
        record.callbackDurationMs = performance.now() - callbackStartedAt
      }
    })
  }

  if (typeof window.requestIdleCallback === 'function') {
    const originalRequestIdleCallback = window.requestIdleCallback
    window.requestIdleCallback = function requestIdleCallback(callback, options) {
      const record = {
        callbackDurationMs: null,
        firedMs: null,
        scheduledMs: performance.now() - state.startedAt,
        stack: compactStack(),
        waitMs: null,
      }
      state.idleCallbacks.push(record)
      return originalRequestIdleCallback.call(
        window,
        function instrumentedIdleCallback(deadline) {
          const callbackStartedAt = performance.now()
          record.firedMs = callbackStartedAt - state.startedAt
          record.waitMs = callbackStartedAt - state.startedAt - record.scheduledMs
          try {
            return callback.call(this, deadline)
          } finally {
            record.callbackDurationMs = performance.now() - callbackStartedAt
          }
        },
        options,
      )
    }
  }

  const originalSetTimeout = window.setTimeout
  window.setTimeout = function setTimeout(callback, delay = 0, ...args) {
    if (typeof callback !== 'function' || Number(delay) < 200) {
      return originalSetTimeout.call(window, callback, delay, ...args)
    }
    const record = {
      delayMs: Number(delay),
      firedMs: null,
      scheduledMs: performance.now() - state.startedAt,
      stack: compactStack(),
      waitMs: null,
    }
    state.timers.push(record)
    return originalSetTimeout.call(
      window,
      function instrumentedTimeout(...callbackArgs) {
        record.firedMs = performance.now() - state.startedAt
        record.waitMs = record.firedMs - record.scheduledMs
        return callback.apply(this, callbackArgs)
      },
      delay,
      ...args,
    )
  }

  const observe = (type, target) => {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          target.push(entry.toJSON())
        }
      })
      observer.observe({ buffered: true, type })
    } catch {}
  }
  observe('longtask', state.longTasks)
  observe('long-animation-frame', state.longAnimationFrames)

  const shaderModuleFingerprints = new WeakMap()
  const opaqueObjectIds = new WeakMap()
  let nextOpaqueObjectId = 1
  const hashText = (text) => {
    let hash = 14695981039346656037n
    for (let index = 0; index < text.length; index += 1) {
      hash ^= BigInt(text.charCodeAt(index))
      hash = BigInt.asUintN(64, hash * 1099511628211n)
    }
    return `${String(text.length)}:${hash.toString(16).padStart(16, '0')}`
  }
  const normalizeGpuDescriptorValue = (value) => {
    if (value === null || typeof value !== 'object') return value
    const shaderFingerprint = shaderModuleFingerprints.get(value)
    if (shaderFingerprint) return { shaderModule: shaderFingerprint }
    if (Array.isArray(value)) return value.map(normalizeGpuDescriptorValue)
    if (ArrayBuffer.isView(value)) return Array.from(value)
    const prototype = Object.getPrototypeOf(value)
    const keys = Object.keys(value)
    if (keys.length > 0 || prototype === Object.prototype || prototype === null) {
      return Object.fromEntries(
        keys
          .sort()
          .map((key) => [key, normalizeGpuDescriptorValue(value[key])]),
      )
    }
    let opaqueId = opaqueObjectIds.get(value)
    if (!opaqueId) {
      opaqueId = nextOpaqueObjectId
      nextOpaqueObjectId += 1
      opaqueObjectIds.set(value, opaqueId)
    }
    return { opaqueId, type: value.constructor?.name ?? 'Object' }
  }
  const fingerprintGpuDescriptor = (descriptor) =>
    hashText(JSON.stringify(normalizeGpuDescriptorValue(descriptor)))

  const patchGpuMethod = (constructorName, methodName, asyncResult) => {
    const constructor = window[constructorName]
    const prototype = constructor?.prototype
    const original = prototype?.[methodName]
    if (typeof original !== 'function') return
    prototype[methodName] = function instrumentedGpuMethod(...args) {
      const startedAt = performance.now()
      const record = {
        durationMs: null,
        method: `${constructorName}.${methodName}`,
        representativeKey: state.activeRenderRepresentative,
        settledMs: null,
        stack: compactStack(),
        startMs: startedAt - state.startedAt,
      }
      if (methodName === 'createRenderPipeline' || methodName === 'createRenderPipelineAsync') {
        record.pipelineFingerprint = fingerprintGpuDescriptor(args[0])
      }
      state.gpu.push(record)
      try {
        const result = original.apply(this, args)
        record.durationMs = performance.now() - startedAt
        if (methodName === 'createShaderModule' && result) {
          const code = String(args[0]?.code ?? '')
          const shaderFingerprint = hashText(code)
          shaderModuleFingerprints.set(result, shaderFingerprint)
          record.shaderFingerprint = shaderFingerprint
        }
        if (asyncResult && result && typeof result.then === 'function') {
          void result.finally(() => {
            record.settledMs = performance.now() - state.startedAt
          })
        }
        return result
      } catch (error) {
        record.durationMs = performance.now() - startedAt
        throw error
      }
    }
  }
  patchGpuMethod('GPUDevice', 'createShaderModule', false)
  patchGpuMethod('GPUDevice', 'createRenderPipeline', false)
  patchGpuMethod('GPUDevice', 'createRenderPipelineAsync', true)
  patchGpuMethod('GPUDevice', 'createComputePipeline', false)
  patchGpuMethod('GPUDevice', 'createComputePipelineAsync', true)
  patchGpuMethod('WebGLRenderingContext', 'compileShader', false)
  patchGpuMethod('WebGLRenderingContext', 'linkProgram', false)
  patchGpuMethod('WebGL2RenderingContext', 'compileShader', false)
  patchGpuMethod('WebGL2RenderingContext', 'linkProgram', false)
}
