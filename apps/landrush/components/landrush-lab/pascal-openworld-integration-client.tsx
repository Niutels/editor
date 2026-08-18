'use client'

import { lazy, Suspense, useCallback, useState } from 'react'
import {
  PASCAL_OPENWORLD_INTEGRATION_CELLS,
  PASCAL_OPENWORLD_INTEGRATION_SUMMARIES,
  type PascalOpenworldIntegrationCamera,
  type PascalOpenworldIntegrationCell,
  type PascalOpenworldIntegrationSummary,
} from './pascal-openworld-integration-contract'

const PascalOpenworldIntegrationRuntime = lazy(() =>
  import('./pascal-openworld-integration-runtime').then((module) => ({
    default: module.PascalOpenworldIntegrationRuntime,
  })),
)

type PascalOpenworldIntegrationClientProps = {
  initialCamera: PascalOpenworldIntegrationCamera
  initialCell: PascalOpenworldIntegrationCell
  initialPostFx: boolean
  initialRunning: boolean
}

export function PascalOpenworldIntegrationClient({
  initialCamera,
  initialCell,
  initialPostFx,
  initialRunning,
}: PascalOpenworldIntegrationClientProps) {
  const [cell, setCell] = useState<PascalOpenworldIntegrationCell>(initialCell)
  const [cameraBookmark, setCameraBookmark] =
    useState<PascalOpenworldIntegrationCamera>(initialCamera)
  const [postFx, setPostFx] = useState(initialPostFx)
  const [running, setRunning] = useState(initialRunning)
  const summary = PASCAL_OPENWORLD_INTEGRATION_SUMMARIES[cell]

  const updateUrl = useCallback(
    (
      nextCell: PascalOpenworldIntegrationCell,
      nextCamera: PascalOpenworldIntegrationCamera,
      nextPostFx: boolean,
      nextRunning: boolean,
    ) => {
      const url = new URL(window.location.href)
      url.searchParams.set('cell', nextCell)
      url.searchParams.set('camera', nextCamera)
      if (nextPostFx) url.searchParams.set('post', '1')
      else url.searchParams.delete('post')
      if (nextRunning) url.searchParams.set('run', '1')
      else url.searchParams.delete('run')
      if (nextRunning) {
        url.searchParams.set('offline', '1')
        url.searchParams.set('integrationSidecar', '1')
        url.searchParams.set('landrushProbe', '1')
        url.searchParams.set('landrushProbeDom', '1')
        url.searchParams.delete('clean')
      }
      if (nextPostFx) url.searchParams.set('benchPostFx', '1')
      else url.searchParams.delete('benchPostFx')
      window.history.replaceState(null, '', url)
    },
    [],
  )

  const changeCell = useCallback(
    (nextCell: PascalOpenworldIntegrationCell) => {
      if (running && nextCell !== cell) {
        const url = new URL(window.location.href)
        url.searchParams.set('cell', nextCell)
        window.location.assign(url)
        return
      }
      setCell(nextCell)
      updateUrl(nextCell, cameraBookmark, postFx, running)
    },
    [cameraBookmark, cell, postFx, running, updateUrl],
  )

  const changeCamera = useCallback(
    (nextCamera: PascalOpenworldIntegrationCamera) => {
      setCameraBookmark(nextCamera)
      updateUrl(cell, nextCamera, postFx, running)
    },
    [cell, postFx, running, updateUrl],
  )

  const changePostFx = useCallback(
    (enabled: boolean) => {
      if (running && cell === 'combined' && enabled !== postFx) {
        const url = new URL(window.location.href)
        if (enabled) {
          url.searchParams.set('post', '1')
          url.searchParams.set('benchPostFx', '1')
        } else {
          url.searchParams.delete('post')
          url.searchParams.delete('benchPostFx')
        }
        window.location.assign(url)
        return
      }
      setPostFx(enabled)
      updateUrl(cell, cameraBookmark, enabled, running)
    },
    [cameraBookmark, cell, postFx, running, updateUrl],
  )

  const changeRunning = useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        const launcher = new URL(
          '/landrush-lab/pascal-openworld-integration-sidecar.html',
          window.location.origin,
        )
        launcher.searchParams.set('cell', cell)
        launcher.searchParams.set('camera', cameraBookmark)
        if (postFx) launcher.searchParams.set('post', '1')
        window.location.assign(launcher)
        return
      }
      setRunning(enabled)
      updateUrl(cell, cameraBookmark, postFx, enabled)
    },
    [cameraBookmark, cell, postFx, updateUrl],
  )

  return (
    <main
      className="h-screen w-screen overflow-hidden bg-[#b9cedc]"
      data-canvas-contract="at-most-one"
      data-cell={cell}
      data-landrush-integration-lab
      data-origin-isolated
      data-renderer-state={running ? 'running' : 'parked'}
    >
      {running ? (
        <Suspense fallback={<RuntimeLoading />}>
          <PascalOpenworldIntegrationRuntime
            cameraBookmark={cameraBookmark}
            cell={cell}
            postFx={postFx}
          />
        </Suspense>
      ) : (
        <RendererParked />
      )}
      <IntegrationPanel
        cameraBookmark={cameraBookmark}
        cell={cell}
        onCameraBookmarkChange={changeCamera}
        onCellChange={changeCell}
        onPostFxChange={changePostFx}
        onRunningChange={changeRunning}
        postFx={postFx}
        running={running}
        summary={summary}
      />
    </main>
  )
}

function RendererParked() {
  return (
    <section
      aria-label="Renderer parked"
      className="flex h-full w-full items-center justify-center bg-[#b9cedc] text-center text-[#244033]"
    >
      <div className="max-w-sm rounded-xl border border-[#244033]/15 bg-white/35 px-6 py-5 shadow-sm">
        <div className="text-sm font-semibold uppercase tracking-[0.14em]">Renderer parked</div>
        <p className="mt-2 text-xs leading-5 text-[#355a49]">
          Zero GPU work and zero multiplayer traffic until this sidecar is started.
        </p>
      </div>
    </section>
  )
}

function RuntimeLoading() {
  return (
    <section
      aria-label="Renderer loading"
      className="flex h-full w-full items-center justify-center bg-[#b9cedc] text-center text-[#244033]"
    >
      <div className="rounded-xl border border-[#244033]/15 bg-white/35 px-6 py-5 text-xs shadow-sm">
        Loading the isolated Pascal renderer…
      </div>
    </section>
  )
}

function IntegrationPanel({
  cameraBookmark,
  cell,
  onCameraBookmarkChange,
  onCellChange,
  onPostFxChange,
  onRunningChange,
  postFx,
  running,
  summary,
}: {
  cameraBookmark: PascalOpenworldIntegrationCamera
  cell: PascalOpenworldIntegrationCell
  onCameraBookmarkChange: (bookmark: PascalOpenworldIntegrationCamera) => void
  onCellChange: (cell: PascalOpenworldIntegrationCell) => void
  onPostFxChange: (enabled: boolean) => void
  onRunningChange: (enabled: boolean) => void
  postFx: boolean
  running: boolean
  summary: PascalOpenworldIntegrationSummary
}) {
  return (
    <section className="pointer-events-auto absolute left-4 top-4 z-[140] w-[330px] max-w-[calc(100vw-2rem)] rounded-xl border border-white/20 bg-[#132019]/90 px-4 py-3.5 text-xs text-stone-100 shadow-2xl shadow-black/30 backdrop-blur-md">
      <div className="font-semibold uppercase tracking-[0.17em] text-[#d8e8c9]">
        Pascal × Open World Sidecar
      </div>
      <p className="mt-1 text-[10px] leading-4 text-stone-300/75">
        {cell === 'combined'
          ? 'The full cell reuses the exact Landrush page composition with a read-only local snapshot.'
          : 'The parked shell does not load Pascal, Three.js, or multiplayer. Starting mounts one Viewer.'}
      </p>

      <button
        className={`mt-3 w-full rounded-md border px-3 py-2 text-[11px] font-semibold transition ${
          running
            ? 'border-amber-200/50 bg-amber-200/10 text-amber-50 hover:bg-amber-200/20'
            : 'border-emerald-200/50 bg-emerald-200/15 text-emerald-50 hover:bg-emerald-200/25'
        }`}
        onClick={() => onRunningChange(!running)}
        type="button"
      >
        {running ? 'Park renderer' : 'Start isolated renderer'}
      </button>

      <div className="mt-3 grid grid-cols-3 gap-1.5" aria-label="Integration cell" role="group">
        {PASCAL_OPENWORLD_INTEGRATION_CELLS.map((option) => (
          <button
            className={`rounded-md border px-2 py-1.5 text-[11px] capitalize transition ${
              option === cell
                ? 'border-[#cbe19f]/70 bg-[#cbe19f]/20 text-white'
                : 'border-white/10 bg-black/20 text-stone-300 hover:bg-white/10'
            }`}
            key={option}
            onClick={() => onCellChange(option)}
            type="button"
          >
            {option === 'combined' ? 'Full scene' : option}
          </button>
        ))}
      </div>

      {cell === 'combined' ? (
        <div className="mt-3 rounded-md border border-sky-200/20 bg-sky-200/8 px-2.5 py-2 text-[10px] leading-4 text-sky-50/80">
          Starts in the real page&apos;s map view so the complete island and every parcel build are
          visible. Its normal map controls remain active.
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-1.5" aria-label="Camera bookmark" role="group">
          {(['near', 'design', 'far'] as const).map((bookmark) => (
            <button
              className={`rounded-md border px-2 py-1.5 text-[11px] capitalize transition ${
                bookmark === cameraBookmark
                  ? 'border-sky-200/60 bg-sky-200/15 text-white'
                  : 'border-white/10 bg-black/20 text-stone-300 hover:bg-white/10'
              }`}
              key={bookmark}
              onClick={() => onCameraBookmarkChange(bookmark)}
              type="button"
            >
              {bookmark}
            </button>
          ))}
        </div>
      )}

      <label className="mt-3 flex items-center justify-between rounded-md border border-white/10 bg-black/15 px-2.5 py-2 text-[11px]">
        <span>Image pipeline</span>
        <select
          className="rounded border border-white/10 bg-[#17251e] px-2 py-1 text-[11px] outline-none"
          onChange={(event) => onPostFxChange(event.currentTarget.value === 'final')}
          value={postFx ? 'final' : 'no-post'}
        >
          <option value="no-post">No-post baseline</option>
          <option value="final">Final</option>
        </select>
      </label>

      <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-white/10 pt-2.5 text-[10px] text-stone-300/80">
        <dt>Origin</dt>
        <dd className="text-emerald-200">127.0.0.1 isolated</dd>
        <dt>Renderer</dt>
        <dd>
          {running
            ? cell === 'combined'
              ? 'full Landrush runtime'
              : '1 Pascal Viewer · WebGL'
            : 'parked · 0 GPU'}
        </dd>
        <dt>Multiplayer socket</dt>
        <dd>disabled</dd>
        <dt>Scene contract</dt>
        <dd>
          {cell === 'combined'
            ? 'same full page composition'
            : `${summary.levelCount} levels · ${summary.worldNodeCount} world`}
        </dd>
        {cell === 'combined' ? (
          <>
            <dt>Persisted parcel builds</dt>
            <dd>loaded by full-scene route</dd>
            <dt>Parcel owners</dt>
            <dd>loaded by full-scene route</dd>
          </>
        ) : (
          <>
            <dt>House footprint</dt>
            <dd>{summary.floorAreaSquareMeters || '—'} m²</dd>
          </>
        )}
      </dl>
    </section>
  )
}
