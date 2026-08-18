'use client'

import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { measureRobotLab, type RobotRuntimeMetrics, robotMetricGates } from './robot-metrics'
import { RobotScene } from './robot-scene'
import { getRobotViewPreset } from './robot-view-presets'

declare global {
  interface Window {
    __LANDRUSH_ROBOT_LAB__?: unknown
  }
}

export function RobotLabClient() {
  const searchParams = useSearchParams()
  const preset = getRobotViewPreset(searchParams.get('view'))
  const clean = searchParams.get('clean') === '1'
  const debug = searchParams.get('debugLandrush') === '1'
  const [joined, setJoined] = useState(searchParams.get('joined') === '1')
  const [runtimeMetrics, setRuntimeMetrics] = useState<RobotRuntimeMetrics | null>(null)
  const [frameP95, setFrameP95] = useState<number | null>(null)
  const [assetResourceCount, setAssetResourceCount] = useState(0)
  const metrics = useMemo(
    () => measureRobotLab(preset, runtimeMetrics, assetResourceCount),
    [assetResourceCount, preset, runtimeMetrics],
  )
  const gates = useMemo(() => robotMetricGates(metrics), [metrics])
  const handleRuntimeMetrics = useCallback((nextMetrics: RobotRuntimeMetrics) => {
    setRuntimeMetrics(nextMetrics)
  }, [])

  useEffect(() => {
    if (searchParams.get('joined') === '1') setJoined(true)
  }, [searchParams])

  useEffect(() => {
    const samples: number[] = []
    let warmupFrames = 60
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
      if (samples.length < 180) {
        raf = requestAnimationFrame(tick)
        return
      }
      const sorted = [...samples].sort((a, b) => a - b)
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
      setFrameP95(Math.round(p95 * 100) / 100)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const measureAssetResources = () => {
      const resources = performance.getEntriesByType('resource')
      setAssetResourceCount(
        resources.filter((entry) => entry.name.includes('/navigation/proto_pascal_robot.glb'))
          .length,
      )
    }
    measureAssetResources()
    const interval = window.setInterval(measureAssetResources, 120)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!debug) return
    window.__LANDRUSH_ROBOT_LAB__ = {
      frameP95,
      gates,
      joined,
      metrics,
      preset: preset.id,
      runtime: runtimeMetrics,
      summary:
        'Robot lab: deferred GLB load, clip mapping, animation weights, camera-relative controls.',
    }
    return () => {
      delete window.__LANDRUSH_ROBOT_LAB__
    }
  }, [debug, frameP95, gates, joined, metrics, preset.id, runtimeMetrics])

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#7db8c1]">
      {clean ? <style>{'nextjs-portal{display:none!important}'}</style> : null}
      <RobotScene joined={joined} onRuntimeMetrics={handleRuntimeMetrics} preset={preset} />
      {!clean ? (
        <section className="pointer-events-none absolute left-5 top-5 max-w-[410px] rounded-md border border-white/25 bg-slate-950/72 p-4 text-white shadow-xl backdrop-blur">
          <div className="text-sm font-semibold tracking-wide">Landrush robot lab</div>
          <div className="mt-1 text-xs text-white/72">{preset.label}</div>
          {!joined ? (
            <button
              className="pointer-events-auto mt-3 rounded-md bg-white px-3 py-2 font-medium text-slate-950 text-sm"
              onClick={() => setJoined(true)}
              type="button"
            >
              Join
            </button>
          ) : null}
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-white/58">motion</dt>
            <dd>{preset.motion}</dd>
            <dt className="text-white/58">idle</dt>
            <dd>{runtimeMetrics?.idleClip ?? 'pending'}</dd>
            <dt className="text-white/58">walk</dt>
            <dd>{runtimeMetrics?.walkClip ?? 'pending'}</dd>
            <dt className="text-white/58">run</dt>
            <dd>{runtimeMetrics?.runClip ?? 'pending'}</dd>
            <dt className="text-white/58">frame p95</dt>
            <dd>{frameP95 ?? 'measuring'}ms</dd>
          </dl>
          <div className="mt-3 grid gap-1 text-xs">
            {gates.slice(0, 8).map((gate) => (
              <div className="flex items-center justify-between gap-3" key={gate.label}>
                <span className="text-white/70">{gate.label}</span>
                <span className={gate.pass ? 'text-emerald-300' : 'text-rose-300'}>
                  {gate.value}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}
