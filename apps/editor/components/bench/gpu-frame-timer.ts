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

export type GpuFrameSample = {
  /** Bench frame index at which this sample resolved (assigned by caller). */
  resolvedAtFrame: number
  /** three's internal frame numbers covered by this resolve batch. */
  threeFrames: number[]
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

    const resolveOne = (type: 'render' | 'compute') =>
      readPool(type)
        ? (renderer.resolveTimestampsAsync?.(type) ?? Promise.resolve(undefined)).catch(
            () => undefined,
          )
        : Promise.resolve(undefined)

    Promise.all([resolveOne('render'), resolveOne('compute')])
      .then(([renderMs, computeMs]) => {
        if (disposed) return
        const pool = readPool('render')
        const passes: GpuPassSample[] = []
        if (pool) {
          // `timestamps` accumulates across resolves — keep only the passes
          // belonging to this resolve batch (uids end in `:f<frame>`), then
          // clear so the map stays bounded and never reports stale passes.
          const batchFrames = new Set(pool.frames ?? [])
          for (const [uid, ms] of pool.timestamps) {
            const match = uid.match(/:f(\d+)$/)
            if (match && batchFrames.has(Number(match[1]))) passes.push({ uid, ms })
          }
          pool.timestamps.clear()
        }
        latestSample = {
          resolvedAtFrame: frameIdx,
          threeFrames: pool?.frames ? [...pool.frames] : [],
          renderMs: typeof renderMs === 'number' && Number.isFinite(renderMs) ? renderMs : null,
          computeMs: typeof computeMs === 'number' && Number.isFinite(computeMs) ? computeMs : null,
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
