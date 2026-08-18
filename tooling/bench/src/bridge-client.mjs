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
    throw new Error('bench bridge did not come up (missing global, frames stalled, or profiler inactive)')
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
    const packed = await this.page.evaluate(
      (cursor) =>
        window.__PASCAL_BENCH__?.getFramesPacked(cursor) ??
        JSON.stringify({ cursor, frames: [] }),
      this.frameCursor,
    )
    const result = JSON.parse(packed)
    const gap = this.frameCursor > 0 && result.frames.length > 0
      ? result.frames[0].frameIdx - this.frameCursor
      : 0
    this.frameCursor = result.cursor
    return { frames: result.frames, droppedByRing: Math.max(0, gap) }
  }

  async pumpEvents() {
    const packed = await this.page.evaluate(
      (cursor) =>
        window.__PASCAL_BENCH__?.getEventsPacked(cursor) ??
        JSON.stringify({ cursor, events: [] }),
      this.eventCursor,
    )
    const result = JSON.parse(packed)
    this.eventCursor = result.cursor
    return result.events
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
    await this.page.evaluate((l) => window.__PASCAL_BENCH__?.mark(l), label)
  }

  async digest() {
    return this.page.evaluate(() => window.__PASCAL_BENCH__?.digest() ?? null)
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
    return this.page.evaluate(
      (o) => window.__PASCAL_BENCH__?.waitForSettle(o) ?? null,
      opts,
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
      const report = profiler.compactReport({ includeSlowFrames: true, slowFrameLimit: 12 })
      profiler.reset()
      return report
    })
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
