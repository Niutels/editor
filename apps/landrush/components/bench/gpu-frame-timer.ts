// True GPU frame timing via WebGPU timestamp queries on the main renderer.
//
// three r184's WebGPUBackend requests every adapter-supported feature at device
// creation, so `timestamp-query` is on the device whenever the hardware exposes
// it — flipping `backend.trackTimestamp` at runtime is enough to start recording
// (same pattern as NaturalRoadGpuTimestampProbe, which proved it in the labs).
// Every pass descriptor then gets begin/end timestampWrites keyed by a
// `<contextId>:f<frame>` uid, and `resolveTimestampsAsync(type)` maps them back
// to per-pass durations plus a per-frame total.
//
// The stale claim in packages/viewer/src/lib/gpu-perf.ts (timestamps "can't" be
// used under RenderPipeline) predates this three version: RenderPipeline.render()
// goes through Renderer.render, so its passes are timestamped like any other.

export type GpuPassSample = {
  /** three's internal uid, `<renderContextId>:f<frameNumber>` */
  uid: string
  ms: number
}

export type GpuTimestampBatchStatus = 'measured' | 'no-queries' | 'incomplete'

export type GpuFrameSample = {
  /** Bench frame index at which this sample resolved (assigned by caller). */
  resolvedAtFrame: number
  /** three's internal frame numbers covered by this resolve batch. */
  threeFrames: number[]
  renderFrames: number[]
  computeFrames: number[]
  renderStatus: GpuTimestampBatchStatus
  computeStatus: GpuTimestampBatchStatus
  /** Three returns the total for only the final frame in each resolve batch. */
  renderMs: number | null
  computeMs: number | null
  passes: GpuPassSample[]
  passCount: number
  /** Query-pool pressure at sample time (pairs allocated since last resolve). */
  queryPressure: number
}

export type GpuWorkDoneSample = {
  resolvedAtFrame: number
  /** CPU submit → GPU idle wall delta; upper bound incl. queue wait. */
  deltaMs: number
}

type TimestampPool = {
  trackTimestamp: boolean
  currentQueryIndex: number
  queryOffsets: Map<string, number>
  timestamps: Map<string, number>
  frames: number[]
}

type TimestampBackend = {
  trackTimestamp: boolean
  timestampQueryPool: Partial<Record<'render' | 'compute', TimestampPool>>
  device?: GPUDevice
}

type TimestampRenderer = {
  backend?: TimestampBackend
  hasFeature?: (name: string) => boolean
  resolveTimestampsAsync?: (type: 'render' | 'compute') => Promise<number | undefined>
}

export type GpuFrameTimer = {
  supported: boolean
  /** Kick a resolve for the given bench frame; no-op while one is in flight. */
  sample(frameIdx: number): void
  /** Latest resolved GPU sample (may lag `sample()` by 1-3 frames). */
  latest(): GpuFrameSample | null
  latestWorkDone(): GpuWorkDoneSample | null
  dispose(): void
}

const WORK_DONE_EVERY_N_FRAMES = 30
const TIMESTAMP_FRAME_SUFFIX = /:f(\d+)$/u

type TimestampResolveBatch = {
  frames: number[]
  lastFrameMs: number | null
  passes: GpuPassSample[]
  status: GpuTimestampBatchStatus
}

function timestampFrame(uid: string) {
  const match = TIMESTAMP_FRAME_SUFFIX.exec(uid)
  return match ? Number(match[1]) : null
}

export function createGpuFrameTimer(rendererLike: unknown): GpuFrameTimer {
  const renderer = rendererLike as TimestampRenderer
  const backend = renderer.backend

  let supported = false
  try {
    supported = Boolean(
      backend &&
        typeof renderer.hasFeature === 'function' &&
        typeof renderer.resolveTimestampsAsync === 'function' &&
        renderer.hasFeature('timestamp-query'),
    )
  } catch {
    supported = false
  }

  if (!(supported && backend)) {
    return {
      supported: false,
      sample: () => {},
      latest: () => null,
      latestWorkDone: () => null,
      dispose: () => {},
    }
  }

  const previousTrackTimestamp = backend.trackTimestamp
  backend.trackTimestamp = true

  let disposed = false
  let resolvePending = false
  let workDonePending = false
  let latestSample: GpuFrameSample | null = null
  let latestWorkDoneSample: GpuWorkDoneSample | null = null
  let framesSinceWorkDone = 0

  const readPool = (type: 'render' | 'compute') => backend.timestampQueryPool?.[type]

  const sample = (frameIdx: number) => {
    if (disposed) return

    // workDone cross-check: cheap upper bound on GPU busy time, sampled sparsely.
    framesSinceWorkDone += 1
    const device = backend.device
    if (device && !workDonePending && framesSinceWorkDone >= WORK_DONE_EVERY_N_FRAMES) {
      framesSinceWorkDone = 0
      workDonePending = true
      const t0 = performance.now()
      device.queue
        .onSubmittedWorkDone()
        .then(() => {
          if (!disposed) {
            latestWorkDoneSample = { resolvedAtFrame: frameIdx, deltaMs: performance.now() - t0 }
          }
        })
        .catch(() => {})
        .finally(() => {
          workDonePending = false
        })
    }

    if (resolvePending) return
    const renderPool = readPool('render')
    const computePool = readPool('compute')
    if (!renderPool && !computePool) return

    resolvePending = true
    const queryPressure =
      (renderPool?.currentQueryIndex ?? 0) + (computePool?.currentQueryIndex ?? 0)

    const resolveOne = async (type: 'render' | 'compute'): Promise<TimestampResolveBatch> => {
      const pool = readPool(type)
      if (!pool || pool.currentQueryIndex === 0) {
        return { frames: [], lastFrameMs: null, passes: [], status: 'no-queries' }
      }

      // Three resets queryOffsets synchronously when resolution starts. Capture
      // the exact UID set first so later frames recorded while the GPU readback
      // is pending cannot be mistaken for this batch.
      const batchUids = [...pool.queryOffsets.keys()]
      if (batchUids.length === 0) {
        return { frames: [], lastFrameMs: null, passes: [], status: 'incomplete' }
      }

      let resolvedMs: number | undefined
      try {
        resolvedMs = await renderer.resolveTimestampsAsync?.(type)
      } catch {
        return { frames: [], lastFrameMs: null, passes: [], status: 'incomplete' }
      }

      const passes: GpuPassSample[] = []
      const frames = new Set<number>()
      for (const uid of batchUids) {
        const ms = pool.timestamps.get(uid)
        const frame = timestampFrame(uid)
        if (Number.isFinite(ms) && frame !== null) {
          passes.push({ uid, ms: ms as number })
          frames.add(frame)
        }
        pool.timestamps.delete(uid)
      }

      return {
        frames: [...frames].sort((left, right) => left - right),
        lastFrameMs:
          typeof resolvedMs === 'number' && Number.isFinite(resolvedMs) ? resolvedMs : null,
        passes,
        status: passes.length === batchUids.length ? 'measured' : 'incomplete',
      }
    }

    Promise.all([resolveOne('render'), resolveOne('compute')])
      .then(([renderBatch, computeBatch]) => {
        if (disposed) return
        const threeFrames = [...new Set([...renderBatch.frames, ...computeBatch.frames])].sort(
          (left, right) => left - right,
        )
        const passes = [...renderBatch.passes, ...computeBatch.passes]
        latestSample = {
          resolvedAtFrame: frameIdx,
          threeFrames,
          renderFrames: renderBatch.frames,
          computeFrames: computeBatch.frames,
          renderStatus: renderBatch.status,
          computeStatus: computeBatch.status,
          renderMs: renderBatch.lastFrameMs,
          computeMs: computeBatch.lastFrameMs,
          passes,
          passCount: passes.length,
          queryPressure,
        }
      })
      .finally(() => {
        resolvePending = false
      })
  }

  return {
    supported: true,
    sample,
    latest: () => latestSample,
    latestWorkDone: () => latestWorkDoneSample,
    dispose: () => {
      disposed = true
      backend.trackTimestamp = previousTrackTimestamp
    },
  }
}
