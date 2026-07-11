'use client'

import { Box, Hammer, Move3d, Paintbrush } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { generateLandrushIsland } from '@/components/landrush/generator'
import { useLandrushModeController } from '@/components/landrush/interaction/use-landrush-mode-controller'
import type {
  LandrushCameraConfig,
  LandrushPoint2,
  LandrushPropertyGeometry,
  LandrushVector3,
} from '@/components/landrush/types'
import {
  BUILD_MODE_CAMERA_TRANSITION_MS,
  BUILD_MODE_SURROUNDING_TARGET_OPACITY,
  type BuildModeProofMetrics,
  buildModeMetricGates,
  EMPTY_BUILD_MODE_PROOF,
  measureBuildModeLab,
} from './build-mode-metrics'
import { getBuildModeViewPreset } from './build-mode-view-presets'

declare global {
  interface Window {
    __LANDRUSH_BUILD_MODE_LAB__?: unknown
  }
}

export function BuildModeLabClient() {
  const searchParams = useSearchParams()
  const preset = getBuildModeViewPreset(searchParams.get('view'))
  const clean = searchParams.get('clean') === '1'
  const debug = searchParams.get('debugLandrush') === '1'
  const [frameP95, setFrameP95] = useState<number | null>(null)
  const [deniedCount, setDeniedCount] = useState(0)
  const [modeChangeCount, setModeChangeCount] = useState(0)
  const [proof, setProof] = useState<BuildModeProofMetrics>(EMPTY_BUILD_MODE_PROOF)
  const island = useMemo(
    () =>
      generateLandrushIsland({
        seed: 'mvp-loop-1-295',
        size: { width: 116, depth: 116 },
        perimeterPointCount: 72,
        treeSpacing: 7.1,
      }),
    [],
  )
  const owner = island.ownerParcel
  const insidePosition = useMemo<LandrushVector3>(
    () => ({ x: owner.centroid.x, y: 0, z: owner.centroid.z }),
    [owner],
  )
  const ownerProperty = useMemo<LandrushPropertyGeometry>(
    () => ({ kind: 'polygon', points: owner.outline }),
    [owner],
  )
  const cameraConfig = useMemo<LandrushCameraConfig>(
    () => ({
      build: () => ({
        fov: 34,
        position: { x: owner.centroid.x, y: 28, z: owner.centroid.z + 0.1 },
        target: { x: owner.centroid.x, y: 0, z: owner.centroid.z },
      }),
      transitionMs: BUILD_MODE_CAMERA_TRANSITION_MS,
      walk: ({ character }) => ({
        fov: 56,
        position: { x: character.position.x + 7, y: 5.2, z: character.position.z + 8 },
        target: { x: character.position.x, y: 1.1, z: character.position.z },
      }),
    }),
    [owner],
  )
  const outsidePosition = useMemo<LandrushVector3>(() => ({ x: -47, y: 0, z: 48 }), [])
  const startOutside = searchParams.get('start') === 'outside'
  const snapshot = useLandrushModeController({
    buildActivationDistance: 2,
    camera: cameraConfig,
    initialMode: 'walk',
    onBuildToggleDenied: () => setDeniedCount((value) => value + 1),
    onModeChange: () => setModeChangeCount((value) => value + 1),
    ownerProperty,
    spawnPosition: startOutside ? outsidePosition : insidePosition,
    walkSpeed: 5,
  })
  const runtime = useMemo(
    () => ({
      buildMenuOpacity: snapshot.buildMenuOpacity,
      cameraTransitionProgress: round(snapshot.cameraTransitionProgress),
      canBuild: snapshot.canBuild,
      deniedCount,
      mode: snapshot.mode,
      modeChangeCount,
      surroundingIslandOpacity: snapshot.surroundingIslandOpacity,
    }),
    [
      deniedCount,
      modeChangeCount,
      snapshot.buildMenuOpacity,
      snapshot.cameraTransitionProgress,
      snapshot.canBuild,
      snapshot.mode,
      snapshot.surroundingIslandOpacity,
    ],
  )
  const metrics = useMemo(() => measureBuildModeLab(runtime, proof), [proof, runtime])
  const gates = useMemo(() => buildModeMetricGates(metrics), [metrics])

  useEffect(() => {
    const samples: number[] = []
    let warmupFrames = 30
    let previous = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const delta = now - previous
      previous = now
      if (warmupFrames > 0) {
        warmupFrames -= 1
        raf = requestAnimationFrame(tick)
        return
      }
      samples.push(delta)
      if (samples.length < 150) {
        raf = requestAnimationFrame(tick)
        return
      }
      const sorted = [...samples].sort((a, b) => a - b)
      setFrameP95(Math.round((sorted[Math.floor(sorted.length * 0.95)] ?? 0) * 100) / 100)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    if (!debug) return
    window.__LANDRUSH_BUILD_MODE_LAB__ = {
      actions: {
        exitBuild: snapshot.exitBuildMode,
        moveInside: () => {
          snapshot.exitBuildMode()
          snapshot.setCharacterPosition(insidePosition)
        },
        moveOutside: () => {
          snapshot.exitBuildMode()
          snapshot.setCharacterPosition(outsidePosition)
        },
        resetProof: () => setProof(EMPTY_BUILD_MODE_PROOF),
        setProof,
      },
      frameP95,
      gates,
      metrics,
      preset: preset.id,
      runtime,
      summary: 'Build mode lab: B gating, transition timing, fade targets, and menu timing.',
    }
    return () => {
      delete window.__LANDRUSH_BUILD_MODE_LAB__
    }
  }, [
    debug,
    frameP95,
    gates,
    insidePosition,
    metrics,
    outsidePosition,
    preset.id,
    runtime,
    snapshot,
  ])

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#17849a] text-white">
      {clean ? <style>{'nextjs-portal{display:none!important}'}</style> : null}
      <div className="absolute inset-0 bg-[#17849a]" />
      <svg
        aria-label="Landrush build mode lab"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        viewBox={preset.viewBox.join(' ')}
      >
        <path
          d={pathFromPoints(island.perimeter.points)}
          fill="#6d9d4a"
          stroke="#d7c17d"
          strokeWidth="2"
        />
        {island.roads.segments.map((road) => (
          <polyline
            fill="none"
            key={road.id}
            points={pointsAttribute(road.points)}
            stroke="#5d6870"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={road.width}
          />
        ))}
        {island.parcels.map((parcel) => {
          const isOwner = parcel.id === owner.id
          return (
            <path
              d={pathFromPoints(parcel.outline)}
              data-owner={String(isOwner)}
              fill={isOwner ? '#7bc86c' : parcel.fillColor}
              key={parcel.id}
              stroke={isOwner ? '#f7f3b6' : '#274d4f'}
              strokeWidth={isOwner ? 1.2 : 0.45}
              style={{
                opacity: isOwner
                  ? 1
                  : snapshot.isBuildMode
                    ? snapshot.surroundingIslandOpacity
                    : 0.72,
                transition: 'opacity 500ms ease',
              }}
            />
          )
        })}
        <circle
          cx={insidePosition.x}
          cy={insidePosition.z}
          fill="none"
          r="9"
          stroke="#f8e57a"
          strokeDasharray="1.8 2.4"
          strokeWidth="0.7"
        />
        {snapshot.isBuildMode ? (
          <g
            data-build-ghost
            style={{ opacity: snapshot.buildMenuOpacity, transition: 'opacity 300ms ease' }}
          >
            <rect
              fill="#f9f2c7"
              height="8"
              rx="0.9"
              stroke="#283a35"
              strokeWidth="0.45"
              width="11"
              x={owner.centroid.x - 5.5}
              y={owner.centroid.z - 4}
            />
            <line
              stroke="#283a35"
              strokeWidth="0.28"
              x1={owner.centroid.x}
              x2={owner.centroid.x}
              y1={owner.centroid.z - 4}
              y2={owner.centroid.z + 4}
            />
          </g>
        ) : null}
        <circle
          cx={snapshot.character.position.x}
          cy={snapshot.character.position.z}
          fill={snapshot.canBuild ? '#eefbf3' : '#f97373'}
          r="2.1"
          stroke="#10262c"
          strokeWidth="0.55"
        />
      </svg>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: snapshot.isBuildMode ? 1 : 0,
          background:
            'radial-gradient(circle at 50% 50%, transparent 0 27%, rgb(8 20 26 / 0.54) 74%)',
        }}
      />
      <BuildMenu opacity={snapshot.buildMenuOpacity} />
      {!clean ? (
        <DebugPanel frameP95={frameP95} metrics={metrics} presetLabel={preset.label} />
      ) : null}
    </main>
  )
}

function BuildMenu({ opacity }: { opacity: number }) {
  const tools = [
    { icon: <Box className="h-4 w-4" />, label: 'Place' },
    { icon: <Move3d className="h-4 w-4" />, label: 'Move' },
    { icon: <Paintbrush className="h-4 w-4" />, label: 'Paint' },
  ]
  return (
    <div
      className="absolute bottom-7 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-md border border-white/15 bg-zinc-950/88 p-2 shadow-xl transition-opacity duration-300"
      data-build-menu
      style={{ opacity, pointerEvents: opacity > 0.9 ? 'auto' : 'none' }}
    >
      <Hammer className="mx-2 h-4 w-4 text-emerald-300" />
      {tools.map((tool) => (
        <button
          className="flex h-10 min-w-20 items-center justify-center gap-2 rounded bg-white/10 px-3 text-sm"
          key={tool.label}
          type="button"
        >
          {tool.icon}
          {tool.label}
        </button>
      ))}
    </div>
  )
}

function DebugPanel({
  frameP95,
  metrics,
  presetLabel,
}: {
  frameP95: number | null
  metrics: ReturnType<typeof measureBuildModeLab>
  presetLabel: string
}) {
  return (
    <section className="pointer-events-none absolute left-5 top-5 z-40 max-w-[390px] rounded-md border border-white/25 bg-slate-950/72 p-4 text-white shadow-xl backdrop-blur">
      <div className="text-sm font-semibold tracking-wide">Landrush build mode lab</div>
      <div className="mt-1 text-xs text-white/72">{presetLabel}</div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <dt className="text-white/58">mode</dt>
        <dd>{metrics.mode}</dd>
        <dt className="text-white/58">can build</dt>
        <dd>{String(metrics.canBuild)}</dd>
        <dt className="text-white/58">menu opacity</dt>
        <dd>{metrics.buildMenuOpacity}</dd>
        <dt className="text-white/58">surroundings</dt>
        <dd>{metrics.surroundingIslandOpacity}</dd>
        <dt className="text-white/58">target fade</dt>
        <dd>{BUILD_MODE_SURROUNDING_TARGET_OPACITY}</dd>
        <dt className="text-white/58">frame p95</dt>
        <dd>{frameP95 ?? 'measuring'}ms</dd>
      </dl>
    </section>
  )
}

function pathFromPoints(points: readonly LandrushPoint2[]) {
  const first = points[0]
  if (!first) return ''
  return `M ${first.x} ${first.z} ${points
    .slice(1)
    .map((point) => `L ${point.x} ${point.z}`)
    .join(' ')} Z`
}

function pointsAttribute(points: readonly LandrushPoint2[]) {
  return points.map((point) => `${point.x},${point.z}`).join(' ')
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}
