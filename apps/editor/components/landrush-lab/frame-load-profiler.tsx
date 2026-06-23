'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'

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

type PatchRestore = () => void
type MethodTarget = Record<string, unknown>

export type LandrushFrameProfileApi = {
  enabled: boolean
  report: () => LandrushFrameProfileReport
  reset: () => void
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
    thresholdMs: number
  }
  nodes: ProfileNodeReport[]
  overThreshold: ProfileNodeReport[]
  proofFrames: ProfileProofFrame[]
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
  frameIndex: number
  intervalMs: number
  measuredTopLevelMs: number
  sumCheckMs: number
  topLevel: { durationMs: number; id: string }[]
  unmeasuredActiveMs: number
  waitMs: number
}

const FRAME_PROFILE_MAX_FRAMES = 420
const FRAME_PROFILE_PROOF_FRAME_COUNT = 18
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

let singletonProfiler: LandrushFrameProfiler | null = null

export function FrameLoadProfilerProbe({ enabled }: { enabled: boolean }) {
  const renderer = useThree((state) => state.gl)

  useEffect(() => {
    if (!enabled) return
    const profiler = getOrCreateProfiler()
    profiler.reset()
    const restore = installRendererProfiling(renderer as unknown as MethodTarget, profiler)
    window.__LANDRUSH_FRAME_PROFILE__ = profiler.api
    return () => {
      restore()
      if (window.__LANDRUSH_FRAME_PROFILE__ === profiler.api) {
        delete window.__LANDRUSH_FRAME_PROFILE__
      }
    }
  }, [enabled, renderer])

  useFrame(() => {
    if (!enabled) return
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

class LandrushFrameProfiler {
  enabled = true
  private currentFrame: OpenFrameRecord | null = null
  private frames: FrameRecord[] = []
  private nextFrameIndex = 0
  private openStack: OpenSlice[] = []

  readonly api: LandrushFrameProfileApi = {
    enabled: true,
    report: () => this.report(),
    reset: () => this.reset(),
  }

  reset() {
    this.currentFrame = null
    this.frames = []
    this.nextFrameIndex = 0
    this.openStack = []
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

  report(): LandrushFrameProfileReport {
    const frames = this.frames.slice(-FRAME_PROFILE_MAX_FRAMES)
    const nodeReports = createNodeReports(frames)
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
        thresholdMs: FRAME_PROFILE_THRESHOLD_MS,
      },
      nodes: nodeReports,
      overThreshold: nodeReports.filter(
        (node) =>
          node.avgPerFrameMs > FRAME_PROFILE_THRESHOLD_MS ||
          node.p95PerFrameMs > FRAME_PROFILE_THRESHOLD_MS ||
          node.selfAvgPerFrameMs > FRAME_PROFILE_THRESHOLD_MS,
      ),
      proofFrames: frames.slice(-FRAME_PROFILE_PROOF_FRAME_COUNT).map((frame) => ({
        activeWallMs: roundMs(frame.activeWallMs),
        frameIndex: frame.index,
        intervalMs: roundMs(frame.intervalMs),
        measuredTopLevelMs: roundMs(frame.measuredTopLevelMs),
        sumCheckMs: roundMs(frame.measuredTopLevelMs + frame.unmeasuredActiveMs + frame.waitMs),
        topLevel: frame.slices
          .filter((slice) => slice.parentIndex === null)
          .map((slice) => ({ durationMs: roundMs(slice.durationMs), id: slice.id })),
        unmeasuredActiveMs: roundMs(frame.unmeasuredActiveMs),
        waitMs: roundMs(frame.waitMs),
      })),
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

    const activeWallMs = Math.max(0, frame.workEndMs - frame.beginMs)
    const intervalMs = Math.max(0, nextBeginMs - frame.beginMs)
    const measuredTopLevelMs = frame.slices
      .filter((slice) => slice.parentIndex === null)
      .reduce((total, slice) => total + slice.durationMs, 0)
    const unmeasuredActiveMs = Math.max(0, activeWallMs - measuredTopLevelMs)
    const waitMs = Math.max(0, intervalMs - activeWallMs)

    this.frames.push({
      beginMs: frame.beginMs,
      index: frame.index,
      slices: frame.slices,
      workEndMs: frame.workEndMs,
      activeWallMs,
      intervalMs,
      measuredTopLevelMs,
      unmeasuredActiveMs,
      waitMs,
    })
    if (this.frames.length > FRAME_PROFILE_MAX_FRAMES) {
      this.frames.splice(0, this.frames.length - FRAME_PROFILE_MAX_FRAMES)
    }
  }
}

function installRendererProfiling(renderer: MethodTarget, profiler: LandrushFrameProfiler) {
  const restoreCallbacks: PatchRestore[] = []

  patchPrototypeMethod(renderer, 'render', 'renderer.render.total', restoreCallbacks, profiler, () =>
    profiler.markWorkEnd(),
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
    if (Object.prototype.hasOwnProperty.call(target, methodName)) {
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

function createNodeReports(frames: readonly FrameRecord[]) {
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
    const childDurationBySlice = new Map<number, number>()
    const sliceByIndex = new Map(frame.slices.map((slice) => [slice.index, slice]))
    for (const slice of frame.slices) {
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

    for (const slice of frame.slices) {
      const aggregate = ensureAggregate(aggregates, slice.id, frames.length)
      const selfMs = Math.max(0, slice.durationMs - (childDurationBySlice.get(slice.index) ?? 0))
      aggregate.count += 1
      aggregate.totalMs += slice.durationMs
      aggregate.perFrame[frameIndex] = (aggregate.perFrame[frameIndex] ?? 0) + slice.durationMs
      aggregate.selfPerFrame[frameIndex] =
        (aggregate.selfPerFrame[frameIndex] ?? 0) + selfMs
    }

    addPseudoAggregate(aggregates, 'frame.active.unmeasured-r3f-or-react', frame.unmeasuredActiveMs, frameIndex, frames.length)
    addPseudoAggregate(aggregates, 'frame.wait.idle-vsync-browser-or-gpu', frame.waitMs, frameIndex, frames.length)
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
  aggregates: Map<string, { count: number; perFrame: number[]; selfPerFrame: number[]; totalMs: number }>,
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
  aggregates: Map<string, { count: number; perFrame: number[]; selfPerFrame: number[]; totalMs: number }>,
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
