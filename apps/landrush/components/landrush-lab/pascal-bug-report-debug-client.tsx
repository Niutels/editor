'use client'

import { writeOfflineParcelWorldState } from '@landrush/runtime'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  type LandrushBugReport,
  parseLandrushBugReportJson,
  readLandrushBugReportReplay,
} from './landrush-bug-report'
import { LandrushIslandClient } from './landrush-island-client'
import { LandrushKeyboardFocusAnchor } from './landrush-keyboard-focus-anchor'
import { PascalBugReportDebugControls } from './pascal-bug-report-debug-controls'

export function PascalBugReportDebugClient() {
  const searchParams = useSearchParams()
  const reportUrl = searchParams.get('reportUrl')
  const replayRequested = reportUrl !== null || searchParams.get('bugReportReplay') === '1'
  const [replayReport, setReplayReport] = useState<LandrushBugReport | null | undefined>(
    replayRequested ? undefined : null,
  )
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!replayRequested) {
      setReplayReport(null)
      setLoadError(null)
      return
    }

    setReplayReport(undefined)
    const loadReport = async () => {
      if (!reportUrl) return readLandrushBugReportReplay()
      const response = await fetch(reportUrl, { cache: 'no-store' })
      if (!response.ok) {
        throw new Error(`The report URL returned ${response.status}.`)
      }
      const parsed = parseLandrushBugReportJson(await response.text())
      if (!parsed.ok) throw new Error(parsed.error)
      writeOfflineParcelWorldState(
        parsed.report.save.worldId,
        parsed.report.save.ownerships,
        parsed.report.save.builds,
        parsed.report.save.tvMediaStates,
      )
      return parsed.report
    }

    void loadReport()
      .then((report) => {
        if (cancelled) return
        setReplayReport(report)
        setLoadError(report ? null : 'No stored bug report is available for this replay URL.')
      })
      .catch((error) => {
        if (cancelled) return
        setReplayReport(null)
        setLoadError(
          error instanceof Error ? error.message : 'The stored bug report could not be read.',
        )
      })

    return () => {
      cancelled = true
    }
  }, [replayRequested, reportUrl])

  if (replayReport === undefined) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-white">
        <div className="rounded-xl border border-white/15 bg-white/8 px-4 py-3 text-sm">
          Loading captured Landrush state…
        </div>
      </main>
    )
  }

  return (
    <>
      <LandrushKeyboardFocusAnchor />
      <LandrushIslandClient bugReportReplay={replayReport} experience="pascal-multiplayer-island" />
      <PascalBugReportDebugControls initialReport={replayReport} />
      {loadError ? (
        <div
          className="fixed bottom-4 left-1/2 z-[130] max-w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg border border-red-300/25 bg-red-950/90 px-3 py-2 text-center text-red-50 text-sm shadow-2xl"
          role="alert"
        >
          {loadError}
        </div>
      ) : null}
    </>
  )
}
