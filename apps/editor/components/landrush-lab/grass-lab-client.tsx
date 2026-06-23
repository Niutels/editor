'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { generateLandrushIsland } from '@/components/landrush/generator'
import { GRASS_BLADE_TUNING_SLIDERS as GRASS_TUNING_SLIDERS } from './grass-lab-parameters'
import { DEFAULT_GRASS_BLADE_TUNING, type GrassBladeTuning } from './grass-material'
import { GRASS_REFERENCE, grassMetricGates, measureGrassLab } from './grass-metrics'
import { GrassScene } from './grass-scene'
import { getGrassViewPreset } from './grass-view-presets'

declare global {
  interface Window {
    __LANDRUSH_GRASS_LAB__?: unknown
  }
}

const SOURCE_INVESTIGATION_NOTES = [
  'This page renders the Landrush island field with Bruno-style single-triangle grass blades.',
  'Landrush grass-field alpha drives blade visibility, while field color drives blade color.',
  'Road clearance is disabled for this page so grass patches do not carve path-like bands through the island.',
  'A procedural patch mask modulates the field alpha so grass spreads in tunable organic clumps.',
] as const

const IMPLEMENTATION_COMPARISON = [
  {
    label: 'island',
    pascal: 'Landrush generated perimeter with road mask disabled',
    reference: 'Bruno terrainData mask',
  },
  {
    label: 'blades',
    pascal: '3 x 3 Bruno-density single-triangle billboard patches',
    reference: 'view-sized 280 x 280 single-triangle billboard grid',
  },
  {
    label: 'color',
    pascal: 'blade base color samples the island ground texture underneath',
    reference: 'Terrain.colorNode feeds Bruno blade lighting',
  },
] as const

export function GrassLabClient() {
  const searchParams = useSearchParams()
  const preset = getGrassViewPreset(searchParams.get('view'))
  const clean = searchParams.get('clean') === '1'
  const debug = searchParams.get('debugLandrush') === '1'
  const [frameP95, setFrameP95] = useState<number | null>(null)
  const [tuning, setTuning] = useState<GrassBladeTuning>(DEFAULT_GRASS_BLADE_TUNING)
  const resolvedTuning = useMemo(() => ({ ...DEFAULT_GRASS_BLADE_TUNING, ...tuning }), [tuning])
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
  const metrics = useMemo(() => measureGrassLab(island), [island])
  const gates = useMemo(() => grassMetricGates(metrics), [metrics])

  useEffect(() => {
    const samples: number[] = []
    let previous = performance.now()
    let raf = 0
    let warmup = 0
    const tick = (now: number) => {
      samples.push(now - previous)
      previous = now
      if (samples.length < 90) {
        raf = requestAnimationFrame(tick)
        return
      }
      const sorted = [...samples.slice(8)].sort((a, b) => a - b)
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
      setFrameP95(Math.round(p95 * 100) / 100)
    }
    warmup = window.setTimeout(() => {
      previous = performance.now()
      raf = requestAnimationFrame(tick)
    }, 1800)
    return () => {
      window.clearTimeout(warmup)
      cancelAnimationFrame(raf)
    }
  }, [])

  useEffect(() => {
    if (!debug) return
    window.__LANDRUSH_GRASS_LAB__ = {
      comparison: IMPLEMENTATION_COMPARISON,
      frameP95,
      gates,
      metrics,
      preset: preset.id,
      reference: GRASS_REFERENCE,
      sourceNotes: SOURCE_INVESTIGATION_NOTES,
      summary:
        'Landrush island grass lab: island mask/color with Bruno-style dense triangle blades.',
      tuning: resolvedTuning,
    }
    return () => {
      delete window.__LANDRUSH_GRASS_LAB__
    }
  }, [debug, frameP95, gates, metrics, preset.id, resolvedTuning])

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#77bed0]">
      <GrassScene island={island} preset={preset} tuning={resolvedTuning} />
      {!clean ? (
        <>
          <section className="pointer-events-none absolute left-5 top-5 max-w-[390px] rounded-md border border-white/25 bg-slate-950/72 p-4 text-white shadow-xl backdrop-blur">
            <div className="text-sm font-semibold tracking-wide">Landrush grass lab</div>
            <div className="mt-1 text-xs text-white/72">{preset.label}</div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <dt className="text-white/58">colors</dt>
              <dd>{metrics.paletteCount}</dd>
              <dt className="text-white/58">density</dt>
              <dd>{metrics.densityCoverage}</dd>
              <dt className="text-white/58">blades</dt>
              <dd>{metrics.bladeCount}</dd>
              <dt className="text-white/58">triangles</dt>
              <dd>{metrics.bladeTriangleCount}</dd>
              <dt className="text-white/58">field</dt>
              <dd>{metrics.terrainFieldResolution}px</dd>
              <dt className="text-white/58">region</dt>
              <dd>{metrics.grassPatchCount}</dd>
              <dt className="text-white/58">frame p95</dt>
              <dd>{frameP95 ?? 'measuring'}ms</dd>
            </dl>
            <div className="mt-3 grid gap-1 text-xs">
              {gates.map((gate) => (
                <div className="flex items-center justify-between gap-3" key={gate.label}>
                  <span className="text-white/70">{gate.label}</span>
                  <span className={gate.pass ? 'text-emerald-300' : 'text-rose-300'}>
                    {gate.value}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <GrassTuningPanel tuning={resolvedTuning} onChange={setTuning} />
        </>
      ) : null}
    </main>
  )
}

function GrassTuningPanel({
  onChange,
  tuning,
}: {
  onChange: (tuning: GrassBladeTuning) => void
  tuning: GrassBladeTuning
}) {
  return (
    <section className="absolute right-5 top-5 w-[min(330px,calc(100vw-2.5rem))] rounded-md border border-white/25 bg-slate-950/76 p-4 text-white shadow-xl backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold tracking-wide">Blade tune</div>
        <button
          className="rounded border border-white/20 px-2 py-1 text-xs text-white/72 transition hover:border-white/38 hover:text-white"
          onClick={() => onChange(DEFAULT_GRASS_BLADE_TUNING)}
          type="button"
        >
          reset
        </button>
      </div>
      <div className="mt-3 grid gap-3">
        {GRASS_TUNING_SLIDERS.map((slider) => {
          const value = tuning[slider.key]
          return (
            <label className="grid gap-1 text-xs" key={slider.key}>
              <span className="flex items-center justify-between gap-3">
                <span className="text-white/70">{slider.label}</span>
                <span className="tabular-nums text-white/90">{formatTuningValue(value)}</span>
              </span>
              <input
                className="h-5 w-full accent-lime-300"
                max={slider.max}
                min={slider.min}
                onChange={(event) =>
                  onChange({ ...tuning, [slider.key]: Number(event.currentTarget.value) })
                }
                step={slider.step}
                type="range"
                value={value}
              />
            </label>
          )
        })}
      </div>
    </section>
  )
}

function formatTuningValue(value: number) {
  if (!Number.isFinite(value)) return '--'
  return value < 0.2 ? value.toFixed(3) : value.toFixed(2)
}
