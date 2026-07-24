'use client'

// Bench bridge: unified per-frame measurement + automation surface, exposed as
// `window.__PASCAL_BENCH__` when the page is loaded with `?bench=1` (or
// `?benchGpu=1` for the GPU-timer-only spike mode). Consumed by the harness in
// tooling/bench via CDP evaluate — nothing here runs for normal users.
//
// Mounted inside the viewer Canvas (viewerSceneChildren), next to
// FrameLoadProfilerProbe. The collector runs at useFrame priority +100_000 so it
// executes after the render subscriber (priority 0) each frame; the existing
// frame profiler brackets frames at -100_000.
//
// Two-ledger model:
//   CPU  — merged from the frame-load-profiler (top-level spans, active/wait
//          split, `unmeasuredActiveMs` residual). Needs `?frameProfile=1`.
//   GPU  — WebGPU timestamp queries per pass (gpu-frame-timer.ts), with
//          onSubmittedWorkDone as an advisory upper bound.

import { useScene } from '@pascal-app/core'
import { useEditor } from '@pascal-app/editor'
import { useViewer } from '@pascal-app/viewer'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type {
  LandrushFrameProfileApi,
  LandrushFrameProfileFrameSummary,
} from '../landrush-lab/frame-load-profiler'
import { type BenchEvent, type BenchEventTap, createBenchEventTap } from './bench-events'
import {
  type BenchCameraPose,
  type BenchCheckpoint,
  type BenchDigest,
  captureCheckpoint,
  computeSceneDigest,
  getCameraPose,
  projectWorldPoint,
  restoreCheckpointState,
  setCameraPose,
} from './bench-io'
import { createGpuFrameTimer, type GpuFrameTimer } from './gpu-frame-timer'

export type BenchFrameCpu = {
  intervalMs: number
  activeWallMs: number
  measuredTopLevelMs: number
  unmeasuredActiveMs: number
  waitMs: number
  schedulerProfile: string
  topLevel: { id: string; ms: number }[]
}

export type BenchFrame = {
  frameIdx: number
  wallT: number
  dtMs: number
  simT: number
  draws: number
  tris: number
  memMB: number | null
  marks: string[]
  cpu: BenchFrameCpu | null
  gpu: {
    renderMs: number | null
    computeMs: number | null
    resolvedAtFrame: number
    passes: { uid: string; ms: number }[]
    queryPressure: number
    workDoneDeltaMs: number | null
    supported: boolean
  } | null
}

type SettleWaiter = {
  resolve: (result: { settledAtFrame: number; timedOut: boolean }) => void
  stableFrames: number
  requiredStableFrames: number
  lastNodeCount: number
  timeoutAt: number
}

type BenchGlobal = {
  version: number
  spikeMode: boolean
  info(): Record<string, unknown>
  beacon(): Record<string, unknown>
  getFramesSince(cursor: number): { cursor: number; frames: BenchFrame[] }
  getEventsSince(cursor: number): { cursor: number; events: BenchEvent[] }
  mark(label: string): void
  digest(): BenchDigest
  getCheckpoint(): BenchCheckpoint
  restoreCheckpoint(cp: BenchCheckpoint): Promise<{ settledAtFrame: number; timedOut: boolean }>
  waitForSettle(opts?: { stableFrames?: number; timeoutMs?: number }): Promise<{
    settledAtFrame: number
    timedOut: boolean
  }>
  camera: {
    getPose(): BenchCameraPose | null
    setPose(pose: BenchCameraPose): boolean
  }
  project(world: [number, number, number]): { x: number; y: number; visible: boolean }
  setTool(tool: string | null): void
  setMode(mode: string): void
  profiler: LandrushFrameProfileApi | null
  gpuStatus(): Record<string, unknown>
}

// (window.__LANDRUSH_FRAME_PROFILE__ is declared by frame-load-profiler.tsx)
declare global {
  interface Window {
    __PASCAL_BENCH__?: BenchGlobal
  }
}

const RING_CAPACITY = 4096
const COLLECTOR_PRIORITY = 100_000

function readBenchParams() {
  if (typeof window === 'undefined') return { bench: false, spike: false }
  const params = new URLSearchParams(window.location.search)
  return {
    bench: params.get('bench') === '1',
    spike: params.get('benchGpu') === '1',
  }
}

const BENCH_PARAMS = readBenchParams()

export function isBenchEnabled() {
  return BENCH_PARAMS.bench || BENCH_PARAMS.spike
}

function BenchBridgeCollector() {
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls)
  const gpuTimerRef = useRef<GpuFrameTimer | null>(null)
  const eventTapRef = useRef<BenchEventTap | null>(null)
  const frameIdxRef = useRef(0)
  const lastWallTRef = useRef<number | null>(null)
  const ringRef = useRef<BenchFrame[]>([])
  const ringStartIdxRef = useRef(0)
  const pendingMarksRef = useRef<string[]>([])
  const settleWaitersRef = useRef<SettleWaiter[]>([])
  const profilerCursorRef = useRef(0)
  const cameraRef = useRef(camera)
  const controlsRef = useRef(controls)
  cameraRef.current = camera
  controlsRef.current = controls

  // GPU timer install: renderer.hasFeature throws before init, so retry until
  // the backend is ready (the viewer awaits init before handing gl to R3F, but
  // guard anyway).
  useEffect(() => {
    let cancelled = false
    let timer: GpuFrameTimer | null = null
    let retry: ReturnType<typeof setTimeout> | null = null

    const install = () => {
      if (cancelled) return
      try {
        timer = createGpuFrameTimer(gl)
        gpuTimerRef.current = timer
      } catch {
        retry = setTimeout(install, 1000)
      }
    }
    install()

    const device = (gl as unknown as { backend?: { device?: unknown } }).backend?.device
    const tap = createBenchEventTap(device)
    eventTapRef.current = tap

    return () => {
      cancelled = true
      if (retry) clearTimeout(retry)
      timer?.dispose()
      gpuTimerRef.current = null
      tap.dispose()
      eventTapRef.current = null
    }
  }, [gl])

  // Global API install (DOM side).
  useEffect(() => {
    const getProfiler = () =>
      typeof window === 'undefined' ? null : (window.__LANDRUSH_FRAME_PROFILE__ ?? null)

    const waitForSettle = (opts?: { stableFrames?: number; timeoutMs?: number }) =>
      new Promise<{ settledAtFrame: number; timedOut: boolean }>((resolve) => {
        settleWaitersRef.current.push({
          resolve,
          stableFrames: 0,
          requiredStableFrames: opts?.stableFrames ?? 10,
          lastNodeCount: -1,
          timeoutAt: performance.now() + (opts?.timeoutMs ?? 15_000),
        })
      })

    const api: BenchGlobal = {
      version: 1,
      spikeMode: BENCH_PARAMS.spike && !BENCH_PARAMS.bench,
      info: () => {
        const renderer = gl as unknown as {
          isWebGPURenderer?: boolean
          backend?: { device?: { adapterInfo?: Record<string, unknown> } }
        }
        const adapterInfo = renderer.backend?.device?.adapterInfo
        return {
          benchVersion: 1,
          backend: renderer.isWebGPURenderer ? 'webgpu' : 'webgl',
          adapter: adapterInfo
            ? {
                vendor: adapterInfo.vendor,
                architecture: adapterInfo.architecture,
                device: adapterInfo.device,
                description: adapterInfo.description,
              }
            : null,
          dpr: window.devicePixelRatio,
          viewport: { w: window.innerWidth, h: window.innerHeight },
          url: window.location.href,
          gpuSupported: gpuTimerRef.current?.supported ?? false,
          profilerActive: getProfiler()?.enabled ?? false,
        }
      },
      beacon: () => {
        const editor = useEditor.getState() as unknown as Record<string, unknown>
        const scene = useScene.getState() as unknown as {
          nodes: Record<string, unknown>
          dirtyNodes?: Set<string>
        }
        return {
          frameIdx: frameIdxRef.current,
          lastFrameWallT: lastWallTRef.current,
          now: performance.now(),
          cameraDragging: Boolean(
            (useViewer.getState() as unknown as Record<string, unknown>).cameraDragging,
          ),
          phase: editor.phase,
          mode: editor.mode,
          tool: editor.tool,
          fpv: Boolean(editor.isFirstPersonMode),
          nodeCount: Object.keys(scene.nodes).length,
          dirtyCount: scene.dirtyNodes?.size ?? 0,
          visibility: document.visibilityState,
        }
      },
      getFramesSince: (cursor: number) => {
        const ring = ringRef.current
        const start = ringStartIdxRef.current
        const total = start + ring.length
        const from = Math.max(cursor, start)
        const frames = from < total ? ring.slice(from - start) : []
        return { cursor: total, frames }
      },
      getEventsSince: (cursor: number) =>
        eventTapRef.current?.eventsSince(cursor) ?? { cursor: 0, events: [] },
      mark: (label: string) => {
        pendingMarksRef.current.push(label)
        eventTapRef.current?.push('mark', { label })
      },
      digest: () => computeSceneDigest(),
      getCheckpoint: () => captureCheckpoint(cameraRef.current, controlsRef.current),
      restoreCheckpoint: async (cp) => {
        restoreCheckpointState(cp, cameraRef.current, controlsRef.current)
        eventTapRef.current?.push('checkpoint-restore', { digest: cp.digest })
        return waitForSettle({ stableFrames: 10, timeoutMs: 20_000 })
      },
      waitForSettle,
      camera: {
        getPose: () =>
          cameraRef.current ? getCameraPose(cameraRef.current, controlsRef.current) : null,
        setPose: (pose) =>
          cameraRef.current ? setCameraPose(cameraRef.current, controlsRef.current, pose) : false,
      },
      project: (world) => projectWorldPoint(cameraRef.current, gl, world),
      setTool: (tool) => {
        ;(useEditor.getState() as unknown as { setTool: (tool: unknown) => void }).setTool(tool)
      },
      setMode: (mode) => {
        ;(useEditor.getState() as unknown as { setMode: (mode: unknown) => void }).setMode(mode)
      },
      profiler: getProfiler(),
      gpuStatus: () => {
        const timer = gpuTimerRef.current
        return {
          installed: timer !== null,
          supported: timer?.supported ?? false,
          latest: timer?.latest() ?? null,
          latestWorkDone: timer?.latestWorkDone() ?? null,
        }
      },
    }
    window.__PASCAL_BENCH__ = api
    return () => {
      if (window.__PASCAL_BENCH__ === api) delete window.__PASCAL_BENCH__
    }
  }, [gl])

  useFrame((state) => {
    const now = performance.now()
    const frameIdx = frameIdxRef.current++
    const dtMs = lastWallTRef.current === null ? 0 : now - lastWallTRef.current
    lastWallTRef.current = now

    const timer = gpuTimerRef.current
    timer?.sample(frameIdx)
    const gpuSample = timer?.latest() ?? null
    const workDone = timer?.latestWorkDone() ?? null

    const info = (gl as unknown as { info?: { render?: { calls?: number; triangles?: number } } })
      .info
    const memory = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory

    const frame: BenchFrame = {
      frameIdx,
      wallT: now,
      dtMs,
      simT: state.clock.elapsedTime,
      draws: info?.render?.calls ?? 0,
      tris: info?.render?.triangles ?? 0,
      memMB: memory?.usedJSHeapSize ? Math.round(memory.usedJSHeapSize / 1048576) : null,
      marks: pendingMarksRef.current.length > 0 ? pendingMarksRef.current.splice(0) : [],
      cpu: null,
      gpu: timer
        ? {
            renderMs: gpuSample?.renderMs ?? null,
            computeMs: gpuSample?.computeMs ?? null,
            resolvedAtFrame: gpuSample?.resolvedAtFrame ?? -1,
            passes: gpuSample?.passes ?? [],
            queryPressure: gpuSample?.queryPressure ?? 0,
            workDoneDeltaMs: workDone?.deltaMs ?? null,
            supported: timer.supported,
          }
        : null,
    }

    const ring = ringRef.current
    ring.push(frame)
    // Trim in chunks — a per-frame splice on a full ring would memmove 4096
    // entries every frame.
    if (ring.length > RING_CAPACITY + 512) {
      ring.splice(0, ring.length - RING_CAPACITY)
      ringStartIdxRef.current = frameIdx + 1 - ring.length
    }

    // Merge newly finalized profiler frames (typically exactly one: the
    // previous rAF's) into their matching bench frames by time containment.
    const profiler = typeof window === 'undefined' ? null : window.__LANDRUSH_FRAME_PROFILE__
    if (profiler?.enabled && typeof profiler.framesSince === 'function') {
      const { cursor, frames: profFrames } = profiler.framesSince(profilerCursorRef.current)
      profilerCursorRef.current = cursor
      for (const profFrame of profFrames) {
        attachCpuFrame(ring, profFrame)
      }
    }

    // Settle waiters: scene is "settled" when dirty nodes drained and node
    // count is stable for the required number of consecutive frames.
    const waiters = settleWaitersRef.current
    if (waiters.length > 0) {
      const scene = useScene.getState() as unknown as {
        nodes: Record<string, unknown>
        dirtyNodes?: Set<string>
      }
      const nodeCount = Object.keys(scene.nodes).length
      const dirty = scene.dirtyNodes?.size ?? 0
      for (let i = waiters.length - 1; i >= 0; i--) {
        const waiter = waiters[i]
        if (!waiter) continue
        if (dirty === 0 && waiter.lastNodeCount === nodeCount) {
          waiter.stableFrames += 1
        } else {
          waiter.stableFrames = 0
        }
        waiter.lastNodeCount = nodeCount
        if (waiter.stableFrames >= waiter.requiredStableFrames) {
          waiter.resolve({ settledAtFrame: frameIdx, timedOut: false })
          waiters.splice(i, 1)
        } else if (now > waiter.timeoutAt) {
          waiter.resolve({ settledAtFrame: frameIdx, timedOut: true })
          waiters.splice(i, 1)
        }
      }
    }
  }, COLLECTOR_PRIORITY)

  return null
}

function attachCpuFrame(ring: BenchFrame[], profFrame: LandrushFrameProfileFrameSummary): boolean {
  // The profiler frame [beginMs, beginMs+intervalMs) contains exactly one bench
  // collector timestamp (collector runs inside the same rAF, after the work).
  // Search the recent tail only — finalization lags by one frame.
  const end = profFrame.beginMs + profFrame.intervalMs
  for (let i = ring.length - 1; i >= Math.max(0, ring.length - 8); i--) {
    const frame = ring[i]
    if (!frame) continue
    if (frame.wallT >= profFrame.beginMs && frame.wallT < end) {
      frame.cpu = {
        intervalMs: profFrame.intervalMs,
        activeWallMs: profFrame.activeWallMs,
        measuredTopLevelMs: profFrame.measuredTopLevelMs,
        unmeasuredActiveMs: profFrame.unmeasuredActiveMs,
        waitMs: profFrame.waitMs,
        schedulerProfile: profFrame.schedulerProfile,
        topLevel: profFrame.topLevel.map((slice) => ({ id: slice.id, ms: slice.durationMs })),
      }
      return true
    }
    if (frame.wallT < profFrame.beginMs) return false
  }
  return false
}

/**
 * Mount point for the bench bridge. Self-gating: renders nothing unless the
 * page was loaded with `?bench=1` or `?benchGpu=1`.
 */
export function BenchBridgeProbe() {
  if (!isBenchEnabled()) return null
  return <BenchBridgeCollector />
}
