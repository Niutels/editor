// Live anomaly detectors that run during a scenario.
//
// Freeze detection is driver-side by design: the beacon poll is a
// Runtime.evaluate on the page main thread, so when the page freezes the
// evaluate itself stalls — we measure the stall from outside where the clock
// keeps running. On detection we capture a screenshot, a profiler freeze-dump,
// and an event row; the run continues (a freeze is a finding, not an abort).

import path from 'node:path'

export class BeaconWatchdog {
  constructor({ page, events, runDir, freezeThresholdMs = 250, pollMs = 100, onAnomaly }) {
    this.page = page
    this.events = events
    this.runDir = runDir
    this.freezeThresholdMs = freezeThresholdMs
    this.pollMs = pollMs
    this.onAnomaly = onAnomaly
    this.stopped = false
    this.freezes = []
    this.lastFrameIdx = -1
    this.lastAdvanceAt = Date.now()
    this.screenshotCount = 0
    this.lastBeacon = null
  }

  start() {
    this.loop().catch(() => {})
    return this
  }

  async loop() {
    while (!this.stopped) {
      const t0 = Date.now()
      let beacon = null
      try {
        beacon = await this.page.evaluate(() => window.__PASCAL_BENCH__?.beacon() ?? null)
      } catch {
        // page gone or navigating — surface as event, keep looping
      }
      const evalMs = Date.now() - t0
      const now = Date.now()

      if (beacon) {
        this.lastBeacon = beacon
        if (beacon.frameIdx !== this.lastFrameIdx) {
          this.lastFrameIdx = beacon.frameIdx
          this.lastAdvanceAt = now
        }
      }

      const stallMs = now - this.lastAdvanceAt
      const visible = this.lastBeacon?.visibility !== 'hidden'
      if (visible && (evalMs > this.freezeThresholdMs || stallMs > this.freezeThresholdMs)) {
        await this.recordFreeze({ evalMs, stallMs, frameIdx: this.lastFrameIdx })
        // Re-arm after capture so one long freeze produces one record per
        // sustained second rather than one per poll.
        this.lastAdvanceAt = Date.now()
      }

      const waitLeft = this.pollMs - (Date.now() - t0)
      if (waitLeft > 0) await new Promise((r) => setTimeout(r, waitLeft))
    }
  }

  async recordFreeze({ evalMs, stallMs, frameIdx }) {
    const freeze = {
      t: Date.now(),
      frameIdx,
      evalMs: Math.round(evalMs),
      stallMs: Math.round(stallMs),
    }
    this.freezes.push(freeze)
    this.events?.write({ t: performance.now(), type: 'detector:freeze', data: freeze })
    try {
      const file = path.join(
        this.runDir,
        'screenshots',
        `freeze-${this.freezes.length}-f${frameIdx}.png`,
      )
      await this.page.screenshot({ path: file, timeout: 5000 })
      freeze.screenshot = path.basename(file)
    } catch {
      /* screenshot may fail while frozen — the freeze row still stands */
    }
    try {
      const dump = await this.page.evaluate(() => {
        const profiler = window.__LANDRUSH_FRAME_PROFILE__
        if (!profiler?.enabled) return null
        const report = profiler.compactReport({ includeSlowFrames: true, slowFrameLimit: 8 })
        return { overThreshold: report.overThreshold.slice(0, 10), slowFrames: report.slowFrames }
      })
      if (dump) this.events?.write({ t: performance.now(), type: 'detector:freeze-dump', data: dump })
    } catch {
      /* page still stuck — dump lost, freeze recorded */
    }
    await this.onAnomaly?.(freeze)
  }

  stop() {
    this.stopped = true
  }
}

/** Wire console/pageerror/crash capture into the events stream. */
export function attachPageCapture(page, events) {
  const counters = { consoleErrors: 0, pageErrors: 0, crashed: false }
  page.on('console', (msg) => {
    const type = msg.type()
    if (type === 'error' || type === 'warning') {
      const text = msg.text().slice(0, 400)
      // Next dev noise that carries no signal for us
      if (text.includes('Download the React DevTools')) return
      if (type === 'error') counters.consoleErrors += 1
      events.write({ t: performance.now(), type: `console:${type}`, data: text })
    }
  })
  page.on('pageerror', (err) => {
    counters.pageErrors += 1
    events.write({
      t: performance.now(),
      type: 'pageerror',
      data: (err.stack ?? String(err)).slice(0, 1200),
    })
  })
  page.on('crash', () => {
    counters.crashed = true
    events.write({ t: performance.now(), type: 'crash', data: 'page crashed' })
  })
  return counters
}
