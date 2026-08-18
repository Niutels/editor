'use client'

import { Download, FileUp, Play, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  clearLandrushBugReportReplay,
  createLandrushBugReportFileName,
  createLandrushBugReportReplayUrl,
  type LandrushBugReport,
  parseLandrushBugReportJson,
  storeLandrushBugReportReplay,
} from './landrush-bug-report'
import { writeOfflineParcelWorldState } from './world-multiplayer-lab-client'

const PROOF_VIEW_LABELS = [
  'Top plan',
  'North oblique',
  'East oblique',
  'South oblique',
  'West oblique',
]

export function PascalBugReportDebugControls({
  initialReport = null,
}: {
  initialReport?: LandrushBugReport | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [report, setReport] = useState<LandrushBugReport | null>(initialReport)
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoProofs, setAutoProofs] = useState<Array<{ dataUrl: string; label: string }>>([])

  useEffect(() => setReport(initialReport), [initialReport])

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    const parsed = parseLandrushBugReportJson(await file.text())
    if (!parsed.ok) {
      setError(parsed.error)
      setReport(null)
      return
    }
    setError(null)
    setFileName(file.name)
    setReport(parsed.report)
  }

  const replay = async () => {
    if (!report) return
    try {
      writeOfflineParcelWorldState(
        report.save.worldId,
        report.save.ownerships,
        report.save.builds,
        report.save.tvMediaStates,
      )
      await storeLandrushBugReportReplay(report)
      window.location.assign(createLandrushBugReportReplayUrl(window.location.href, report))
    } catch (replayError) {
      setError(
        replayError instanceof Error ? replayError.message : 'The bug report could not be loaded.',
      )
    }
  }

  const clear = () => {
    void clearLandrushBugReportReplay().catch(() => undefined)
    setError(null)
    setFileName(null)
    setReport(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const downloadScreenshot = () => {
    if (!report) return
    const link = document.createElement('a')
    link.download = createLandrushBugReportFileName(report.capturedAt).replace(/\.json$/, '.png')
    link.href = report.screenshot.dataUrl
    link.click()
  }

  const captureProofView = () => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas')
    if (!canvas) return
    setAutoProofs((current) => [
      ...current,
      {
        dataUrl: canvas.toDataURL('image/png'),
        label: PROOF_VIEW_LABELS[current.length] ?? `View ${current.length + 1}`,
      },
    ])
  }

  return (
    <aside
      className="pointer-events-auto fixed top-3 left-3 z-[120] w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-white/15 bg-slate-950/88 p-3 text-white shadow-2xl backdrop-blur-xl"
      data-landrush-bug-report-debug
      data-landrush-ui
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-sm">Bug report replay</div>
          <div className="mt-0.5 text-white/62 text-xs">Load the JSON produced by R.</div>
        </div>
        {report ? (
          <button
            aria-label="Clear loaded bug report"
            className="rounded-md p-1 text-white/60 hover:bg-white/10 hover:text-white"
            onClick={clear}
            type="button"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <input
        accept="application/json,.json"
        className="hidden"
        data-landrush-bug-report-file-input
        onChange={(event) => void handleFile(event.target.files?.[0])}
        ref={inputRef}
        type="file"
      />

      <button
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/8 px-3 py-2 font-medium text-sm hover:bg-white/14"
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        <FileUp className="size-4" />
        Select report JSON
      </button>

      {error ? (
        <div
          className="mt-2 rounded-md bg-red-500/15 px-2.5 py-2 text-red-100 text-xs"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {report ? (
        <div className="mt-3 space-y-2" data-landrush-bug-report-loaded>
          <img
            alt="Captured Landrush bug"
            className="aspect-video w-full rounded-lg border border-white/12 object-cover"
            src={report.screenshot.dataUrl}
          />
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
            <dt className="text-white/52">Input</dt>
            <dd className="truncate">{fileName ?? 'Stored replay'}</dd>
            <dt className="text-white/52">View</dt>
            <dd>{report.mode.fpv ? 'FPV' : report.mode.view}</dd>
            <dt className="text-white/52">Player</dt>
            <dd>{report.player.position.map((value) => value.toFixed(2)).join(', ')}</dd>
            <dt className="text-white/52">Floor</dt>
            <dd>{report.floor.levelNumber ?? 'outside'}</dd>
            <dt className="text-white/52">Save</dt>
            <dd className="truncate" title={report.save.id}>
              {report.save.roomId} · {report.save.builds.length} parcels
            </dd>
          </dl>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              className="flex items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-3 py-2 font-semibold text-slate-950 text-xs hover:bg-sky-400"
              data-landrush-bug-report-replay
              onClick={() => void replay()}
              type="button"
            >
              <Play className="size-3.5" />
              Replay offline
            </button>
            <button
              className="flex items-center justify-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 font-medium text-xs hover:bg-white/10"
              onClick={downloadScreenshot}
              type="button"
            >
              <Download className="size-3.5" />
              Screenshot
            </button>
          </div>
          <p className="text-[11px] text-white/48">
            Replay uses the captured save offline, so the live multiplayer world is not changed.
          </p>
          <button
            className="w-full rounded-lg border border-white/15 px-3 py-2 font-medium text-xs hover:bg-white/10"
            onClick={captureProofView}
            type="button"
          >
            Capture proof view
          </button>
          {autoProofs.length > 0 ? (
            <div className="space-y-2 pt-1" data-landrush-auto-proofs>
              <div className="text-[11px] text-white/62">Proof views {autoProofs.length}/5</div>
              <div className="grid grid-cols-2 gap-2">
                {autoProofs.map((proof) => (
                  <figure className="space-y-1" key={proof.label}>
                    <a
                      data-landrush-auto-proof-download={proof.label}
                      download={`${proof.label.toLowerCase().replaceAll(' ', '-')}.png`}
                      href={proof.dataUrl}
                    >
                      <img
                        alt={proof.label}
                        className="aspect-video w-full rounded border border-white/12 object-cover"
                        data-landrush-auto-proof={proof.label}
                        src={proof.dataUrl}
                      />
                    </a>
                    <figcaption className="truncate text-[10px] text-white/52">
                      {proof.label}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  )
}
