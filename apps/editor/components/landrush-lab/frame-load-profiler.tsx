'use client'

import { emitter, useScene } from '@pascal-app/core'
import { renderScheduler } from '@pascal-app/viewer'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    __LANDRUSH_FRAME_PROFILE__?: LandrushFrameProfileApi
  }
}

type FrameSlice = {
  durationMs: number
  id: string
  index: number
  parentIndex: number | null
  startMs: number
}

type FrameRecord = {
  activeWallMs: number
  beginMs: number
  index: number
  intervalMs: number
  measuredTopLevelMs: number
  schedulerProfile: string
  slices: FrameSlice[]
  unmeasuredActiveMs: number
  waitMs: number
  workEndMs: number
}

type OpenFrameRecord = Omit<
  FrameRecord,
  'activeWallMs' | 'intervalMs' | 'measuredTopLevelMs' | 'unmeasuredActiveMs' | 'waitMs'
> & {
  nextSliceIndex: number
}

type OpenSlice = {
  id: string
  index: number
  parentIndex: number | null
  startMs: number
}

type ProfiledCallback = (this: unknown, ...args: unknown[]) => unknown
type PatchRestore = () => void
type MethodTarget = Record<string, unknown>
type R3fFrameSubscriber = {
  priority?: number
  ref?: {
    current?: unknown
  }
}

export type LandrushFrameProfileApi = {
  compactReport: (options?: ReportOptions) => LandrushFrameProfileReport
  compactSlowFrames: (options?: SlowFrameReportOptions) => LandrushFrameProfileSlowFramesReport
  enabled: boolean
  framesSince: (cursor: number) => LandrushFrameProfileFramesSince
  freeze: () => void
  report: (options?: ReportOptions) => LandrushFrameProfileReport
  reset: () => void
}

export type LandrushFrameProfileFrameSummary = {
  activeWallMs: number
  beginMs: number
  index: number
  intervalMs: number
  measuredTopLevelMs: number
  schedulerProfile: string
  topLevel: { durationMs: number; id: string }[]
  unmeasuredActiveMs: number
  waitMs: number
}

export type LandrushFrameProfileFramesSince = {
  cursor: number
  frames: LandrushFrameProfileFrameSummary[]
}

export type LandrushFrameProfileReport = {
  frames: {
    activeWallMs: ProfileStats
    intervalMs: ProfileStats
    measuredTopLevelMs: ProfileStats
    sumErrorMs: ProfileStats
    unmeasuredActiveMs: ProfileStats
    waitMs: ProfileStats
  }
  metadata: {
    frameCount: number
    generatedAt: string
    slowFrameThresholdMs: number
    slowFrameCount: number
    thresholdMs: number
  }
  nodes: ProfileNodeReport[]
  overThreshold: ProfileNodeReport[]
  proofFrames: ProfileProofFrame[]
  slowFrames: ProfileSlowFrame[]
}

export type LandrushFrameProfileSlowFramesReport = {
  slowFrameCount: number
  slowFrames: ProfileSlowFrame[]
}

type ProfileStats = {
  avgMs: number
  maxMs: number
  p50Ms: number
  p95Ms: number
  totalMs: number
}

type ProfileNodeReport = {
  avgPerFrameMs: number
  children: string[]
  count: number
  id: string
  maxPerFrameMs: number
  p95PerFrameMs: number
  selfAvgPerFrameMs: number
  totalMs: number
}

type ProfileProofFrame = {
  activeWallMs: number
  endMs: number
  frameIndex: number
  intervalMs: number
  measuredTopLevelMs: number
  schedulerProfile: string
  startMs: number
  sumCheckMs: number
  topLevel: { durationMs: number; id: string }[]
  unmeasuredActiveMs: number
  waitMs: number
}

type ProfileSlowFrame = ProfileProofFrame & {
  slices: FrameSlice[]
}

type FrameSliceReader = (frame: FrameRecord) => readonly FrameSlice[]
type ReportOptions = {
  includeSlowFrames?: boolean
  slowFrameLimit?: number
  slowFrameOffset?: number
  topLevelOnly?: boolean
}

type SlowFrameReportOptions = {
  limit?: number
  offset?: number
  topLevelOnly?: boolean
}

const FRAME_PROFILE_MAX_FRAMES = 1800
const FRAME_PROFILE_PROOF_FRAME_COUNT = 18
const FRAME_PROFILE_SLOW_FRAME_THRESHOLD_MS = 30
const FRAME_PROFILE_THRESHOLD_MS = 3
const FRAME_PROFILE_RENDERER_METHODS = [
  ['_renderScene', 'renderer.three.render-scene'],
  ['_projectObject', 'renderer.three.project-object'],
  ['_renderObjectDirect', 'renderer.three.render-object-direct'],
  ['_renderObjects', 'renderer.three.render-objects'],
  ['_renderObject', 'renderer.three.render-object'],
  ['_draw', 'renderer.three.draw'],
  ['beginRender', 'renderer.three.begin-render'],
  ['finishRender', 'renderer.three.finish-render'],
  ['getForRender', 'renderer.three.get-for-render'],
  ['needsRenderUpdate', 'renderer.three.needs-render-update'],
] satisfies readonly (readonly [string, string])[]

const FRAME_PROFILE_GPU_METHODS = [
  ['GPUCanvasContext', 'getCurrentTexture', 'gpu.canvas.get-current-texture'],
  ['GPUDevice', 'createCommandEncoder', 'gpu.device.create-command-encoder'],
  ['GPUCommandEncoder', 'beginRenderPass', 'gpu.command-encoder.begin-render-pass'],
  ['GPUCommandEncoder', 'finish', 'gpu.command-encoder.finish'],
  ['GPURenderPassEncoder', 'setBindGroup', 'gpu.render-pass.set-bind-group'],
  ['GPURenderPassEncoder', 'setVertexBuffer', 'gpu.render-pass.set-vertex-buffer'],
  ['GPURenderPassEncoder', 'setIndexBuffer', 'gpu.render-pass.set-index-buffer'],
  ['GPURenderPassEncoder', 'setPipeline', 'gpu.render-pass.set-pipeline'],
  ['GPURenderPassEncoder', 'draw', 'gpu.render-pass.draw'],
  ['GPURenderPassEncoder', 'drawIndexed', 'gpu.render-pass.draw-indexed'],
  ['GPURenderPassEncoder', 'end', 'gpu.render-pass.end'],
  ['GPUQueue', 'submit', 'gpu.queue.submit'],
] satisfies readonly (readonly [string, string, string])[]

const FRAME_PROFILE_SCENE_METHODS = [
  'applyNodeChanges',
  'createNode',
  'createNodes',
  'deleteNode',
  'deleteNodes',
  'setScene',
  'unloadScene',
  'updateNode',
  'updateNodes',
] as const

let singletonProfiler: LandrushFrameProfiler | null = null
let earlyRuntimeRestore: PatchRestore | null = null

export function FrameLoadProfilerProbe({ enabled }: { enabled: boolean }) {
  const renderer = useThree((state) => state.gl)
  const getThreeState = useThree((state) => state.get)
  const wrapR3fSubscribersRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!enabled) return
    const profiler = getOrCreateProfiler()
    profiler.reset()
    const r3fSubscriberProfiling = installR3fSubscriberProfiling(getThreeState, profiler)
    wrapR3fSubscribersRef.current = r3fSubscriberProfiling.wrap
    const restore = restoreAll([
      installEarlyRuntimeProfiling(profiler),
      r3fSubscriberProfiling.restore,
      installRendererProfiling(renderer as unknown as MethodTarget, profiler),
      installSceneStoreMethodProfiling(profiler),
    ])
    window.__LANDRUSH_FRAME_PROFILE__ = profiler.api
    return () => {
      wrapR3fSubscribersRef.current = null
      restore()
      if (window.__LANDRUSH_FRAME_PROFILE__ === profiler.api) {
        delete window.__LANDRUSH_FRAME_PROFILE__
      }
    }
  }, [enabled, getThreeState, renderer])

  useFrame(() => {
    if (!enabled) return
    wrapR3fSubscribersRef.current?.()
    singletonProfiler?.beginFrame(performance.now())
  }, -100_000)

  return null
}

export function measureLandrushFrameSlice<T>(id: string, callback: () => T): T {
  const profiler = singletonProfiler
  if (!profiler?.enabled) return callback()
  return profiler.measure(id, callback)
}

function getOrCreateProfiler() {
  singletonProfiler ??= new LandrushFrameProfiler()
  return singletonProfiler
}

function shouldInstallEarlyRuntimeProfiling() {
  return (
    typeof window !== 'undefined' &&
    (window.location.search.includes('frameProfile=1') ||
      window.location.search.includes('profileFrame=1'))
  )
}

function installEarlyRuntimeProfiling(profiler: LandrushFrameProfiler) {
  if (!shouldInstallEarlyRuntimeProfiling()) return () => {}
  if (earlyRuntimeRestore) return earlyRuntimeRestore

  const restoreCallbacks: PatchRestore[] = []
  installEmitterProfiling(profiler, restoreCallbacks)
  installSceneSubscriptionProfiling(profiler, restoreCallbacks)
  const restore = restoreAll(restoreCallbacks)
  earlyRuntimeRestore = () => {
    restore()
    earlyRuntimeRestore = null
  }
  return earlyRuntimeRestore
}

function installEmitterProfiling(
  profiler: LandrushFrameProfiler,
  restoreCallbacks: PatchRestore[],
) {
  const target = emitter as unknown as MethodTarget
  const originalEmit = target.emit
  const originalOn = target.on
  const originalOff = target.off
  if (
    typeof originalEmit !== 'function' ||
    typeof originalOn !== 'function' ||
    typeof originalOff !== 'function'
  ) {
    return
  }

  const wrappedHandlers = new Map<unknown, WeakMap<ProfiledCallback, ProfiledCallback>>()
  const getWrappedHandler = (type: unknown, handler: ProfiledCallback) => {
    let handlersForType = wrappedHandlers.get(type)
    if (!handlersForType) {
      handlersForType = new WeakMap()
      wrappedHandlers.set(type, handlersForType)
    }

    const existing = handlersForType.get(handler)
    if (existing) return existing

    const label = `event.listener.${normalizeProfileLabel(String(type))}.${normalizeProfileLabel(
      handler.name || labelFromStack('anonymous'),
    )}`
    const wrapped = function profiledEventHandler(this: unknown, ...args: unknown[]) {
      return profiler.measure(label, () => handler.apply(this, args))
    }
    handlersForType.set(handler, wrapped)
    return wrapped
  }

  target.emit = function profiledEmit(this: unknown, type: unknown, ...args: unknown[]) {
    return profiler.measure(`event.emit.${normalizeProfileLabel(String(type))}`, () =>
      originalEmit.apply(this, [type, ...args]),
    )
  }

  target.on = function profiledOn(this: unknown, type: unknown, handler: unknown) {
    if (typeof handler !== 'function') {
      return originalOn.apply(this, [type, handler])
    }
    return originalOn.apply(this, [type, getWrappedHandler(type, handler as ProfiledCallback)])
  }

  target.off = function profiledOff(this: unknown, type: unknown, handler?: unknown) {
    if (typeof handler !== 'function') {
      return originalOff.apply(this, [type, handler])
    }
    const wrapped = wrappedHandlers.get(type)?.get(handler as ProfiledCallback)
    return originalOff.apply(this, [type, wrapped ?? handler])
  }

  restoreCallbacks.push(() => {
    target.emit = originalEmit
    target.on = originalOn
    target.off = originalOff
  })
}

function installSceneSubscriptionProfiling(
  profiler: LandrushFrameProfiler,
  restoreCallbacks: PatchRestore[],
) {
  const store = useScene as unknown as MethodTarget
  const originalSubscribe = store.subscribe
  if (typeof originalSubscribe !== 'function') return

  store.subscribe = function profiledSubscribe(this: unknown, ...args: unknown[]) {
    const listenerIndex = typeof args[0] === 'function' ? 0 : typeof args[1] === 'function' ? 1 : -1
    if (listenerIndex >= 0) {
      const listener = args[listenerIndex] as ProfiledCallback
      const label = `scene.subscribe.${labelFromStack('listener')}`
      args[listenerIndex] = function profiledSceneSubscriber(
        this: unknown,
        ...listenerArgs: unknown[]
      ) {
        return profiler.measure(label, () => listener.apply(this, listenerArgs))
      }
    }
    return originalSubscribe.apply(this, args)
  }

  restoreCallbacks.push(() => {
    store.subscribe = originalSubscribe
  })
}

function installSceneStoreMethodProfiling(profiler: LandrushFrameProfiler) {
  const restoreCallbacks: PatchRestore[] = []
  const state = useScene.getState() as unknown as MethodTarget
  for (const methodName of FRAME_PROFILE_SCENE_METHODS) {
    patchOwnMethod(state, methodName, `scene.action.${methodName}`, restoreCallbacks, profiler)
  }
  return restoreAll(restoreCallbacks)
}

function installR3fSubscriberProfiling(
  getRootState: () => unknown,
  profiler: LandrushFrameProfiler,
) {
  const restoreCallbacks: PatchRestore[] = []
  const wrappedCallbacks = new WeakSet<ProfiledCallback>()

  const wrap = () => {
    const subscribers = getR3fFrameSubscribers(getRootState())
    subscribers.forEach((subscriber, index) => {
      if (subscriber.priority === -100_000) return

      const frameRef = subscriber.ref
      if (!frameRef) return
      const current = frameRef?.current
      if (typeof current !== 'function') return
      const original = current as ProfiledCallback
      if (wrappedCallbacks.has(original)) return

      const priority = subscriber.priority ?? 0
      const label = `r3f.useFrame.${index}.p${normalizeProfileLabel(String(priority))}.${normalizeProfileLabel(
        original.name || 'anonymous',
      )}`
      const wrapped = function profiledUseFrame(this: unknown, ...args: unknown[]) {
        return profiler.measure(label, () => original.apply(this, args))
      }
      wrappedCallbacks.add(wrapped)
      frameRef.current = wrapped
      restoreCallbacks.push(() => {
        if (frameRef.current === wrapped) frameRef.current = original
      })
    })
  }

  wrap()
  return {
    restore: restoreAll(restoreCallbacks),
    wrap,
  }
}

function getR3fFrameSubscribers(rootState: unknown): R3fFrameSubscriber[] {
  const internal = (rootState as { internal?: { subscribers?: unknown } } | null)?.internal
  const subscribers = internal?.subscribers
  if (Array.isArray(subscribers)) return subscribers as R3fFrameSubscriber[]
  if (subscribers instanceof Set) return [...subscribers] as R3fFrameSubscriber[]

  const current = (subscribers as { current?: unknown } | null)?.current
  if (Array.isArray(current)) return current as R3fFrameSubscriber[]
  if (current instanceof Set) return [...current] as R3fFrameSubscriber[]
  return []
}

function restoreAll(restoreCallbacks: readonly PatchRestore[]): PatchRestore {
  return () => {
    for (const restore of [...restoreCallbacks].reverse()) restore()
  }
}

function labelFromStack(fallback: string) {
  const stack = new Error().stack
  const frame = stack
    ?.split('\n')
    .map((line) => line.trim())
    .find(
      (line) =>
        line &&
        line !== 'Error' &&
        !line.includes('frame-load-profiler') &&
        !line.includes('labelFromStack') &&
        !line.includes('profiledSubscribe') &&
        !line.includes('profiledOn'),
    )
  return normalizeProfileLabel(frame ?? fallback)
}

function normalizeProfileLabel(value: string) {
  return value
    .replace(/^at\s+/, '')
    .replace(/^https?:\/\/[^/]+\/_next\/static\/chunks\//, '')
    .replace(/[^A-Za-z0-9_.:/\\-]+/g, '-')
    .slice(0, 120)
}

class LandrushFrameProfiler {
  enabled = true
  private currentFrame: OpenFrameRecord | null = null
  private frames: FrameRecord[] = []
  private nextFrameIndex = 0
  private openStack: OpenSlice[] = []
  private startedAtMs = performance.now()

  readonly api: LandrushFrameProfileApi = {
    compactReport: (options) => this.report({ ...options, topLevelOnly: true }),
    compactSlowFrames: (options) =>
      this.slowFrames({
        ...options,
        topLevelOnly: options?.topLevelOnly ?? true,
      }),
    enabled: true,
    framesSince: (cursor) => this.framesSince(cursor),
    freeze: () => this.freeze(),
    report: (options) => this.report(options),
    reset: () => this.reset(),
  }

  // Incremental cursor read of finalized frames, used by the bench bridge to
  // merge CPU spans into its unified per-frame ledger without recomputing the
  // aggregate reports. The returned cursor is `last finalized index + 1` — NOT
  // `nextFrameIndex`, which counts the still-open frame and would put every
  // finalized frame permanently behind the cursor.
  framesSince(cursor: number): LandrushFrameProfileFramesSince {
    // Frames are index-ordered; scan back from the tail so steady-state reads
    // (cursor at end, 0-1 new frames) don't walk the whole 1800-frame ring.
    let start = this.frames.length
    while (start > 0 && this.frames[start - 1]!.index >= cursor) start -= 1
    const frames = this.frames.slice(start).map((frame) => ({
      activeWallMs: frame.activeWallMs,
      beginMs: frame.beginMs,
      index: frame.index,
      intervalMs: frame.intervalMs,
      measuredTopLevelMs: frame.measuredTopLevelMs,
      schedulerProfile: frame.schedulerProfile,
      topLevel: frame.slices
        .filter((slice) => slice.parentIndex === null)
        .map((slice) => ({ durationMs: slice.durationMs, id: slice.id })),
      unmeasuredActiveMs: frame.unmeasuredActiveMs,
      waitMs: frame.waitMs,
    }))
    const lastFinalized = this.frames.at(-1)
    return { cursor: lastFinalized ? lastFinalized.index + 1 : cursor, frames }
  }

  reset() {
    this.enabled = true
    this.api.enabled = true
    this.currentFrame = null
    this.frames = []
    this.nextFrameIndex = 0
    this.openStack = []
    this.startedAtMs = performance.now()
  }

  freeze(now = performance.now()) {
    if (!this.enabled) return
    if (this.currentFrame) {
      this.finalizeCurrentFrame(now)
      this.currentFrame = null
    }
    this.openStack = []
    this.enabled = false
    this.api.enabled = false
  }

  beginFrame(now: number) {
    if (!this.enabled) return
    if (this.currentFrame) {
      this.finalizeCurrentFrame(now)
    }

    this.currentFrame = {
      beginMs: now,
      index: this.nextFrameIndex,
      nextSliceIndex: 0,
      schedulerProfile: renderScheduler.getSnapshot().profile,
      slices: [],
      workEndMs: now,
    }
    this.nextFrameIndex += 1
  }

  measure<T>(id: string, callback: () => T): T {
    if (!this.enabled) return callback()

    const frame = this.ensureFrame()
    const parent = this.openStack.at(-1)
    const openSlice: OpenSlice = {
      id,
      index: frame.nextSliceIndex,
      parentIndex: parent?.index ?? null,
      startMs: performance.now(),
    }
    frame.nextSliceIndex += 1
    this.openStack.push(openSlice)

    try {
      return callback()
    } finally {
      const endMs = performance.now()
      this.openStack.pop()
      frame.slices.push({
        ...openSlice,
        durationMs: Math.max(0, endMs - openSlice.startMs),
      })
      frame.workEndMs = Math.max(frame.workEndMs, endMs)
    }
  }

  markWorkEnd(now = performance.now()) {
    const frame = this.currentFrame
    if (!frame) return
    frame.workEndMs = Math.max(frame.workEndMs, now)
  }

  report(options: ReportOptions = {}): LandrushFrameProfileReport {
    const reportFrames = this.currentFrame
      ? [...this.frames, this.createFrameRecord(this.currentFrame, performance.now())]
      : this.frames
    const frames = reportFrames.slice(-FRAME_PROFILE_MAX_FRAMES)
    const topLevelSlicesByFrame = new Map<number, readonly FrameSlice[]>()
    const getTopLevelSlices = (frame: FrameRecord) => {
      const cached = topLevelSlicesByFrame.get(frame.index)
      if (cached) return cached
      const topLevelSlices = frame.slices.filter((slice) => slice.parentIndex === null)
      topLevelSlicesByFrame.set(frame.index, topLevelSlices)
      return topLevelSlices
    }
    const nodeReports = createNodeReports(
      frames,
      options.topLevelOnly ? getTopLevelSlices : undefined,
    )
    const toProofFrame = (frame: FrameRecord): ProfileProofFrame => ({
      activeWallMs: roundMs(frame.activeWallMs),
      endMs: roundMs(frame.beginMs + frame.intervalMs - this.startedAtMs),
      frameIndex: frame.index,
      intervalMs: roundMs(frame.intervalMs),
      measuredTopLevelMs: roundMs(frame.measuredTopLevelMs),
      schedulerProfile: frame.schedulerProfile,
      startMs: roundMs(frame.beginMs - this.startedAtMs),
      sumCheckMs: roundMs(frame.measuredTopLevelMs + frame.unmeasuredActiveMs + frame.waitMs),
      topLevel: getTopLevelSlices(frame).map((slice) => ({
        durationMs: roundMs(slice.durationMs),
        id: slice.id,
      })),
      unmeasuredActiveMs: roundMs(frame.unmeasuredActiveMs),
      waitMs: roundMs(frame.waitMs),
    })
    const slowFrameRecords = getSlowFrames(frames)
    const slowFrameStart = Math.max(0, options.slowFrameOffset ?? 0)
    const slowFrameEnd =
      options.slowFrameLimit === undefined
        ? undefined
        : slowFrameStart + Math.max(0, options.slowFrameLimit)
    return {
      frames: {
        activeWallMs: stats(frames.map((frame) => frame.activeWallMs)),
        intervalMs: stats(frames.map((frame) => frame.intervalMs)),
        measuredTopLevelMs: stats(frames.map((frame) => frame.measuredTopLevelMs)),
        sumErrorMs: stats(
          frames.map(
            (frame) =>
              frame.intervalMs - (frame.activeWallMs + frame.waitMs) ||
              frame.intervalMs -
                (frame.measuredTopLevelMs + frame.unmeasuredActiveMs + frame.waitMs),
          ),
        ),
        unmeasuredActiveMs: stats(frames.map((frame) => frame.unmeasuredActiveMs)),
        waitMs: stats(frames.map((frame) => frame.waitMs)),
      },
      metadata: {
        frameCount: frames.length,
        generatedAt: new Date().toISOString(),
        slowFrameThresholdMs: FRAME_PROFILE_SLOW_FRAME_THRESHOLD_MS,
        slowFrameCount: slowFrameRecords.length,
        thresholdMs: FRAME_PROFILE_THRESHOLD_MS,
      },
      nodes: nodeReports,
      overThreshold: nodeReports.filter(
        (node) =>
          node.avgPerFrameMs > FRAME_PROFILE_THRESHOLD_MS ||
          node.p95PerFrameMs > FRAME_PROFILE_THRESHOLD_MS ||
          node.selfAvgPerFrameMs > FRAME_PROFILE_THRESHOLD_MS,
      ),
      proofFrames: frames.slice(-FRAME_PROFILE_PROOF_FRAME_COUNT).map(toProofFrame),
      slowFrames:
        options.includeSlowFrames === false
          ? []
          : slowFrameRecords.slice(slowFrameStart, slowFrameEnd).map((frame) => {
              const proofFrame = toProofFrame(frame)
              return {
                ...proofFrame,
                slices: getTopLevelSlices(frame).map((slice) => ({
                  ...slice,
                  durationMs: roundMs(slice.durationMs),
                  startMs: roundMs(slice.startMs - frame.beginMs),
                })),
              }
            }),
    }
  }

  slowFrames(options: SlowFrameReportOptions = {}): LandrushFrameProfileSlowFramesReport {
    const report = this.report({
      slowFrameLimit: options.limit,
      slowFrameOffset: options.offset,
      topLevelOnly: options.topLevelOnly,
    })
    return {
      slowFrameCount: report.metadata.slowFrameCount,
      slowFrames: report.slowFrames,
    }
  }

  private ensureFrame() {
    if (!this.currentFrame) {
      this.beginFrame(performance.now())
    }
    return this.currentFrame!
  }

  private finalizeCurrentFrame(nextBeginMs: number) {
    const frame = this.currentFrame
    if (!frame) return

    this.frames.push(this.createFrameRecord(frame, nextBeginMs))
    if (this.frames.length > FRAME_PROFILE_MAX_FRAMES) {
      this.frames.splice(0, this.frames.length - FRAME_PROFILE_MAX_FRAMES)
    }
  }

  private createFrameRecord(frame: OpenFrameRecord, nextBeginMs: number): FrameRecord {
    const intervalMs = Math.max(0, nextBeginMs - frame.beginMs)
    const topLevelSlices = frame.slices.filter((slice) => slice.parentIndex === null)
    const activeWallMs = calculateIntervalUnionMs(topLevelSlices)
    const measuredTopLevelMs = topLevelSlices.reduce((total, slice) => total + slice.durationMs, 0)
    const unmeasuredActiveMs = Math.max(0, activeWallMs - measuredTopLevelMs)
    const waitMs = Math.max(0, intervalMs - activeWallMs)

    return {
      beginMs: frame.beginMs,
      index: frame.index,
      slices: frame.slices,
      workEndMs: frame.workEndMs,
      activeWallMs,
      intervalMs,
      measuredTopLevelMs,
      schedulerProfile: frame.schedulerProfile,
      unmeasuredActiveMs,
      waitMs,
    }
  }
}

function calculateIntervalUnionMs(slices: readonly FrameSlice[]) {
  const intervals = slices
    .filter((slice) => slice.durationMs > 0)
    .map((slice) => [slice.startMs, slice.startMs + slice.durationMs] as const)
    .sort((a, b) => a[0] - b[0])
  let totalMs = 0
  let currentStartMs: number | null = null
  let currentEndMs = 0

  for (const [startMs, endMs] of intervals) {
    if (currentStartMs === null) {
      currentStartMs = startMs
      currentEndMs = endMs
      continue
    }

    if (startMs <= currentEndMs) {
      currentEndMs = Math.max(currentEndMs, endMs)
      continue
    }

    totalMs += currentEndMs - currentStartMs
    currentStartMs = startMs
    currentEndMs = endMs
  }

  if (currentStartMs !== null) totalMs += currentEndMs - currentStartMs
  return Math.max(0, totalMs)
}

function installRendererProfiling(renderer: MethodTarget, profiler: LandrushFrameProfiler) {
  const restoreCallbacks: PatchRestore[] = []

  patchPrototypeMethod(
    renderer,
    'render',
    'renderer.render.total',
    restoreCallbacks,
    profiler,
    () => profiler.markWorkEnd(),
  )

  for (const [methodName, label] of FRAME_PROFILE_RENDERER_METHODS) {
    patchPrototypeMethod(renderer, methodName, label, restoreCallbacks, profiler)
  }

  for (const [constructorName, methodName, label] of FRAME_PROFILE_GPU_METHODS) {
    const constructorValue = (globalThis as Record<string, unknown>)[constructorName]
    const prototype =
      typeof constructorValue === 'function'
        ? ((constructorValue as { prototype?: MethodTarget }).prototype ?? null)
        : null
    if (prototype) patchOwnMethod(prototype, methodName, label, restoreCallbacks, profiler)
  }

  return () => {
    for (const restore of restoreCallbacks.reverse()) restore()
  }
}

function patchPrototypeMethod(
  instance: MethodTarget,
  methodName: string,
  label: string,
  restoreCallbacks: PatchRestore[],
  profiler: LandrushFrameProfiler,
  afterCall?: () => void,
) {
  let target: MethodTarget | null = instance
  while (target) {
    if (Object.hasOwn(target, methodName)) {
      patchOwnMethod(target, methodName, label, restoreCallbacks, profiler, afterCall)
      return
    }
    target = Object.getPrototypeOf(target) as MethodTarget | null
  }
}

function patchOwnMethod(
  target: MethodTarget,
  methodName: string,
  label: string,
  restoreCallbacks: PatchRestore[],
  profiler: LandrushFrameProfiler,
  afterCall?: () => void,
) {
  const original = target[methodName]
  if (typeof original !== 'function') return
  const originalFunction = original as (...args: unknown[]) => unknown

  try {
    target[methodName] = function profiledMethod(this: unknown, ...args: unknown[]) {
      try {
        return profiler.measure(label, () => originalFunction.apply(this, args))
      } finally {
        afterCall?.()
      }
    }
    restoreCallbacks.push(() => {
      target[methodName] = original
    })
  } catch {
    // Some browser-native WebGPU prototypes are not writable in every runtime.
  }
}

function createNodeReports(
  frames: readonly FrameRecord[],
  readSlices: FrameSliceReader = (frame) => frame.slices,
) {
  const childIdsByParent = new Map<string, Set<string>>()
  const aggregates = new Map<
    string,
    {
      count: number
      perFrame: number[]
      selfPerFrame: number[]
      totalMs: number
    }
  >()

  frames.forEach((frame, frameIndex) => {
    const slices = readSlices(frame)
    const childDurationBySlice = new Map<number, number>()
    const sliceByIndex = new Map(slices.map((slice) => [slice.index, slice]))
    for (const slice of slices) {
      if (slice.parentIndex === null) continue
      childDurationBySlice.set(
        slice.parentIndex,
        (childDurationBySlice.get(slice.parentIndex) ?? 0) + slice.durationMs,
      )
      const parent = sliceByIndex.get(slice.parentIndex)
      if (parent) {
        const childIds = childIdsByParent.get(parent.id) ?? new Set<string>()
        childIds.add(slice.id)
        childIdsByParent.set(parent.id, childIds)
      }
    }

    for (const slice of slices) {
      const aggregate = ensureAggregate(aggregates, slice.id, frames.length)
      const selfMs = Math.max(0, slice.durationMs - (childDurationBySlice.get(slice.index) ?? 0))
      aggregate.count += 1
      aggregate.totalMs += slice.durationMs
      aggregate.perFrame[frameIndex] = (aggregate.perFrame[frameIndex] ?? 0) + slice.durationMs
      aggregate.selfPerFrame[frameIndex] = (aggregate.selfPerFrame[frameIndex] ?? 0) + selfMs
    }

    addPseudoAggregate(
      aggregates,
      'frame.active.unmeasured-r3f-or-react',
      frame.unmeasuredActiveMs,
      frameIndex,
      frames.length,
    )
    addPseudoAggregate(
      aggregates,
      'frame.wait.idle-vsync-browser-or-gpu',
      frame.waitMs,
      frameIndex,
      frames.length,
    )
  })

  return [...aggregates.entries()]
    .map(([id, aggregate]) => {
      const perFrameStats = stats(aggregate.perFrame)
      const selfStats = stats(aggregate.selfPerFrame)
      return {
        avgPerFrameMs: perFrameStats.avgMs,
        children: [...(childIdsByParent.get(id) ?? new Set<string>())].sort(),
        count: aggregate.count,
        id,
        maxPerFrameMs: perFrameStats.maxMs,
        p95PerFrameMs: perFrameStats.p95Ms,
        selfAvgPerFrameMs: selfStats.avgMs,
        totalMs: roundMs(aggregate.totalMs),
      }
    })
    .sort((first, second) => second.avgPerFrameMs - first.avgPerFrameMs)
}

function ensureAggregate(
  aggregates: Map<
    string,
    { count: number; perFrame: number[]; selfPerFrame: number[]; totalMs: number }
  >,
  id: string,
  frameCount: number,
) {
  const existing = aggregates.get(id)
  if (existing) return existing
  const aggregate = {
    count: 0,
    perFrame: Array.from({ length: frameCount }, () => 0),
    selfPerFrame: Array.from({ length: frameCount }, () => 0),
    totalMs: 0,
  }
  aggregates.set(id, aggregate)
  return aggregate
}

function addPseudoAggregate(
  aggregates: Map<
    string,
    { count: number; perFrame: number[]; selfPerFrame: number[]; totalMs: number }
  >,
  id: string,
  valueMs: number,
  frameIndex: number,
  frameCount: number,
) {
  const aggregate = ensureAggregate(aggregates, id, frameCount)
  aggregate.count += valueMs > 0 ? 1 : 0
  aggregate.totalMs += valueMs
  aggregate.perFrame[frameIndex] = valueMs
  aggregate.selfPerFrame[frameIndex] = valueMs
}

function getSlowFrames(frames: readonly FrameRecord[]) {
  return frames.filter(
    (frame) =>
      frame.intervalMs > FRAME_PROFILE_SLOW_FRAME_THRESHOLD_MS ||
      frame.activeWallMs > FRAME_PROFILE_SLOW_FRAME_THRESHOLD_MS,
  )
}

function stats(values: readonly number[]): ProfileStats {
  if (values.length === 0) {
    return { avgMs: 0, maxMs: 0, p50Ms: 0, p95Ms: 0, totalMs: 0 }
  }
  const sorted = [...values].sort((first, second) => first - second)
  const total = values.reduce((sum, value) => sum + value, 0)
  return {
    avgMs: roundMs(total / values.length),
    maxMs: roundMs(sorted.at(-1) ?? 0),
    p50Ms: roundMs(percentile(sorted, 0.5)),
    p95Ms: roundMs(percentile(sorted, 0.95)),
    totalMs: roundMs(total),
  }
}

function percentile(sortedValues: readonly number[], percentileValue: number) {
  if (sortedValues.length === 0) return 0
  return sortedValues[
    Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * percentileValue))
  ]!
}

function roundMs(value: number) {
  return Math.round(value * 1000) / 1000
}
