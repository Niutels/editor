// Event tap for the bench bridge: interaction bus traffic, long-animation-frame
// / longtask entries, visibility changes, and WebGPU device loss — all pushed
// into one cursor-readable ring so the harness can correlate them with frames.

import { emitter } from '@pascal-app/core'

export type BenchEvent = {
  seq: number
  t: number
  type: string
  data?: unknown
}

const RING_CAPACITY = 8192

// Bus prefixes worth recording. `pointermove`-shaped spam (`grid:move`,
// `wall:move`, hover enter/leave) is excluded — it would dominate the ring
// without adding correlation value; clicks/commits/tool changes are the signal.
const BUS_EVENT_PATTERN =
  /^(grid:(click|dblclick|pointerdown|pointerup|contextmenu)|[a-z-]+:(click|dblclick)|tool:|camera-controls:)/

export type BenchEventTap = {
  push: (type: string, data?: unknown) => void
  eventsSince: (cursor: number) => { cursor: number; events: BenchEvent[] }
  dispose: () => void
}

function summarizeBusEvent(event: unknown): unknown {
  if (!event || typeof event !== 'object') return undefined
  const rec = event as Record<string, unknown>
  const out: Record<string, unknown> = {}
  const pos = rec.position as { x?: number; y?: number; z?: number } | undefined
  if (pos && typeof pos.x === 'number') {
    out.position = [
      Math.round((pos.x ?? 0) * 100) / 100,
      Math.round((pos.y ?? 0) * 100) / 100,
      Math.round((pos.z ?? 0) * 100) / 100,
    ]
  }
  const native = rec.nativeEvent as
    | { clientX?: number; clientY?: number; button?: number }
    | undefined
  if (native && typeof native.clientX === 'number') {
    out.client = [native.clientX, native.clientY]
    out.button = native.button
  }
  return Object.keys(out).length > 0 ? out : undefined
}

export function createBenchEventTap(deviceLike: unknown): BenchEventTap {
  const ring: BenchEvent[] = []
  let ringStart = 0
  let nextSeq = 0
  const disposers: (() => void)[] = []

  const push = (type: string, data?: unknown) => {
    ring.push({ seq: nextSeq++, t: performance.now(), type, data })
    if (ring.length > RING_CAPACITY) {
      ring.splice(0, ring.length - RING_CAPACITY)
      ringStart = nextSeq - ring.length
    }
  }

  // mitt wildcard: (type, event)
  const busHandler = (type: unknown, event: unknown) => {
    const name = String(type)
    if (!BUS_EVENT_PATTERN.test(name)) return
    push(`bus:${name}`, summarizeBusEvent(event))
  }
  ;(emitter as { on: (type: '*', handler: (type: unknown, event: unknown) => void) => void }).on(
    '*',
    busHandler,
  )
  disposers.push(() =>
    (emitter as { off: (type: '*', handler: (type: unknown, event: unknown) => void) => void }).off(
      '*',
      busHandler,
    ),
  )

  // Long animation frames (Chrome): script attribution for CPU-residual triage.
  try {
    const loafObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const loaf = entry as PerformanceEntry & {
          blockingDuration?: number
          scripts?: { duration: number; invoker?: string; sourceURL?: string }[]
        }
        const topScript = loaf.scripts
          ?.slice()
          .sort((a, b) => b.duration - a.duration)
          .slice(0, 3)
          .map((s) => ({
            duration: Math.round(s.duration * 10) / 10,
            invoker: s.invoker?.slice(0, 120),
            src: s.sourceURL?.slice(-80),
          }))
        push('loaf', {
          startTime: entry.startTime,
          duration: entry.duration,
          blocking: loaf.blockingDuration,
          scripts: topScript,
        })
      }
    })
    loafObserver.observe({
      type: 'long-animation-frame',
      buffered: false,
    } as PerformanceObserverInit)
    disposers.push(() => loafObserver.disconnect())
  } catch {
    // Fallback: longtask (no attribution, but still marks stalls).
    try {
      const longtaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          push('longtask', { startTime: entry.startTime, duration: entry.duration })
        }
      })
      longtaskObserver.observe({ type: 'longtask', buffered: false })
      disposers.push(() => longtaskObserver.disconnect())
    } catch {
      /* neither supported */
    }
  }

  const onVisibility = () => push('visibility', { state: document.visibilityState })
  document.addEventListener('visibilitychange', onVisibility)
  disposers.push(() => document.removeEventListener('visibilitychange', onVisibility))

  const device = deviceLike as { lost?: Promise<{ reason?: string; message?: string }> } | undefined
  device?.lost
    ?.then((info) => push('device-lost', { reason: info?.reason, message: info?.message }))
    .catch(() => {})

  return {
    push,
    eventsSince: (cursor: number) => {
      const from = Math.max(cursor, ringStart)
      const events = from < nextSeq ? ring.slice(from - ringStart) : []
      return { cursor: nextSeq, events }
    },
    dispose: () => {
      for (const dispose of disposers) dispose()
    },
  }
}
