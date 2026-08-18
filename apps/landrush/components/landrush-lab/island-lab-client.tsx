'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { generateLandrushIsland } from '@/components/landrush/generator'
import { islandMetricGates, measureIslandPerimeter } from '@/components/landrush-lab/island-metrics'
import { IslandScene } from '@/components/landrush-lab/island-scene'
import { getIslandViewPreset } from '@/components/landrush-lab/island-view-presets'

declare global {
  interface Window {
    __LANDRUSH_ISLAND_LAB__?: unknown
  }
}

export function IslandLabClient() {
  const searchParams = useSearchParams()
  const preset = getIslandViewPreset(searchParams.get('view'))
  const clean = searchParams.get('clean') === '1'
  const debug = searchParams.get('debugLandrush') === '1'
  const [frameP95, setFrameP95] = useState<number | null>(null)
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
  const metrics = useMemo(() => measureIslandPerimeter(island.perimeter), [island])
  const gates = useMemo(() => islandMetricGates(metrics), [metrics])

  useEffect(() => {
    const samples: number[] = []
    let previous = performance.now()
    let raf = 0
    const tick = (now: number) => {
      samples.push(now - previous)
      previous = now
      if (samples.length < 120) {
        raf = requestAnimationFrame(tick)
        return
      }
      const sorted = [...samples.slice(10)].sort((a, b) => a - b)
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
      setFrameP95(Math.round(p95 * 100) / 100)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    if (!debug) return
    window.__LANDRUSH_ISLAND_LAB__ = {
      frameP95,
      gates,
      metrics,
      preset: preset.id,
      summary: island.metadata.summary,
    }
    return () => {
      delete window.__LANDRUSH_ISLAND_LAB__
    }
  }, [debug, frameP95, gates, island.metadata.summary, metrics, preset.id])

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#087fa4]">
      <IslandScene island={island} preset={preset} />
      {!clean ? (
        <section className="pointer-events-none absolute left-5 top-5 max-w-[360px] rounded-md border border-white/25 bg-slate-950/72 p-4 text-white shadow-xl backdrop-blur">
          <div className="text-sm font-semibold tracking-wide">Landrush island lab</div>
          <div className="mt-1 text-xs text-white/72">{preset.label}</div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-white/58">area</dt>
            <dd>{metrics.area}</dd>
            <dt className="text-white/58">bounds</dt>
            <dd>
              {metrics.boundsWidth} x {metrics.boundsDepth}
            </dd>
            <dt className="text-white/58">max segment</dt>
            <dd>{metrics.maxSegment}</dd>
            <dt className="text-white/58">compactness</dt>
            <dd>{metrics.compactness}</dd>
            <dt className="text-white/58">frame p95</dt>
            <dd>{frameP95 ?? 'measuring'}ms</dd>
          </dl>
          <div className="mt-3 grid gap-1 text-xs">
            {gates.map((gate) => (
              <div className="flex items-center justify-between gap-3" key={gate.label}>
                <span className="text-white/70">{gate.label}</span>
                <span className={gate.pass ? 'text-emerald-300' : 'text-rose-300'}>
                  {String(gate.value)}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}
