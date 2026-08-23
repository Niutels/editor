// Typed-ish evaluate wrappers around window.__PASCAL_BENCH__ plus the frame /
// event pumps and the beacon-based freeze detector.
//
// Design note: a beacon poll is a Runtime.evaluate on the page's main thread —
// if the page is frozen the evaluate itself blocks, so "poll took too long" IS
// the freeze signal (we timestamp before/after each poll driver-side).

export class BridgeClient {
  constructor(page) {
    this.page = page
    this.frameCursor = 0
    this.eventCursor = 0
  }

  async waitForBridge({ timeoutMs = 240_000, minFrames = 120, requireProfiler = false } = {}) {
    const t0 = Date.now()
    let last = null
    while (Date.now() - t0 < timeoutMs) {
      const status = await this.page
        .evaluate(() => {
          const bench = window.__PASCAL_BENCH__
          if (!bench) return null
          return { beacon: bench.beacon(), info: bench.info() }
        })
        .catch(() => null)
      if (
        status &&
        status.beacon.frameIdx > minFrames &&
        status.beacon.frameIdx !== last &&
        (!requireProfiler || status.info.profilerActive)
      ) {
        return status
      }
      last = status?.beacon?.frameIdx ?? null
      await sleep(1000)
    }
    throw new Error(
      'bench bridge did not come up (missing global, frames stalled, or profiler inactive)',
    )
  }

  async beacon() {
    const t0 = performance.now()
    const beacon = await this.page.evaluate(() => window.__PASCAL_BENCH__?.beacon() ?? null)
    return { beacon, evalMs: performance.now() - t0 }
  }

  async info() {
    return this.page.evaluate(() => window.__PASCAL_BENCH__?.info() ?? null)
  }

  /** Pull new frames since the last pump. Uses the packed (string) channel —
   * deep-object CDP serialization measurably stalls the page main thread. */
  async pumpFrames() {
    const requestedCursor = this.frameCursor
    const packed = await this.page.evaluate(
      (cursor) =>
        window.__PASCAL_BENCH__?.getFramesPacked(cursor) ?? JSON.stringify({ cursor, frames: [] }),
      this.frameCursor,
    )
    const result = JSON.parse(packed)
    const gap = result.frames.length > 0 ? result.frames[0].frameIdx - requestedCursor : 0
    this.frameCursor = result.cursor
    return { frames: result.frames, droppedByRing: Math.max(0, gap) }
  }

  primeFrameCursor(cursor) {
    if (!Number.isInteger(cursor) || cursor < 0) {
      throw new Error(`invalid frame cursor: ${String(cursor)}`)
    }
    this.frameCursor = cursor
  }

  async pumpEventBatch() {
    const requestedCursor = this.eventCursor
    const packed = await this.page.evaluate(
      (cursor) =>
        window.__PASCAL_BENCH__?.getEventsPacked(cursor) ?? JSON.stringify({ cursor, events: [] }),
      this.eventCursor,
    )
    const result = JSON.parse(packed)
    const firstSeq = result.events.find((event) => Number.isInteger(event?.seq))?.seq
    const droppedByRing = Number.isInteger(firstSeq)
      ? Math.max(0, firstSeq - requestedCursor)
      : Math.max(0, result.cursor - requestedCursor - result.events.length)
    this.eventCursor = result.cursor
    return {
      cursor: result.cursor,
      droppedByRing,
      events: result.events,
      requestedCursor,
    }
  }

  async pumpEvents() {
    return (await this.pumpEventBatch()).events
  }

  async discardEvents() {
    const batch = await this.pumpEventBatch()
    return {
      cursor: batch.cursor,
      discardedCount: batch.events.length,
      droppedByRing: batch.droppedByRing,
    }
  }

  /** Cursor-explicit event read that does NOT advance the shared pump cursor —
   * for a second consumer (e.g. the executor's self-checks). */
  async eventsAt(cursor) {
    return this.page.evaluate(
      (c) => window.__PASCAL_BENCH__?.getEventsSince(c) ?? { cursor: c, events: [] },
      cursor,
    )
  }

  async mark(label) {
    return this.page.evaluate((l) => {
      const bench = window.__PASCAL_BENCH__
      if (!bench) return null
      const targetFrameIdx = bench.beacon().frameIdx
      bench.mark(l)
      return targetFrameIdx
    }, label)
  }

  async digest() {
    return this.page.evaluate(() => window.__PASCAL_BENCH__?.digest() ?? null)
  }

  async renderRegistry() {
    return this.page.evaluate(() => window.__PASCAL_BENCH__?.renderRegistry() ?? null)
  }

  async getCheckpoint() {
    return this.page.evaluate(() => window.__PASCAL_BENCH__?.getCheckpoint() ?? null)
  }

  async restoreCheckpoint(checkpoint) {
    return this.page.evaluate(
      (cp) => window.__PASCAL_BENCH__?.restoreCheckpoint(cp) ?? null,
      checkpoint,
    )
  }

  async waitForSettle(opts = {}) {
    return this.page.evaluate((o) => window.__PASCAL_BENCH__?.waitForSettle(o) ?? null, opts)
  }

  async waitForFrame(frameIdx, { timeoutMs = 10_000 } = {}) {
    return this.page.evaluate(
      ({ target, timeout }) =>
        new Promise((resolve, reject) => {
          let settled = false
          const timeoutId = setTimeout(() => {
            if (settled) return
            settled = true
            reject(new Error(`bench frame ${target} did not commit within ${timeout}ms`))
          }, timeout)
          const check = () => {
            if (settled) return
            const current = window.__PASCAL_BENCH__?.beacon()?.frameIdx
            if (Number.isInteger(current) && current > target) {
              settled = true
              clearTimeout(timeoutId)
              resolve(current)
              return
            }
            requestAnimationFrame(check)
          }
          check()
        }),
      { target: frameIdx, timeout: timeoutMs },
    )
  }

  async project(world) {
    return this.page.evaluate((w) => window.__PASCAL_BENCH__?.project(w) ?? null, world)
  }

  async cameraPose() {
    return this.page.evaluate(() => window.__PASCAL_BENCH__?.camera.getPose() ?? null)
  }

  async setCameraPose(pose) {
    return this.page.evaluate((p) => window.__PASCAL_BENCH__?.camera.setPose(p) ?? false, pose)
  }

  async setMode(mode) {
    await this.page.evaluate((value) => window.__PASCAL_BENCH__?.setMode(value), mode)
  }

  async setTool(tool) {
    await this.page.evaluate((value) => window.__PASCAL_BENCH__?.setTool(value), tool)
  }

  async profilerFreezeDump() {
    return this.page.evaluate(() => {
      const profiler = window.__LANDRUSH_FRAME_PROFILE__
      if (!profiler) return null
      profiler.freeze()
      const report = profiler.compactReport({
        includeSlowFrames: true,
        slowFrameLimit: 12,
      })
      profiler.reset()
      return report
    })
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
