'use client'

import { useEffect, useState } from 'react'
import type { LandrushBugReport } from './landrush-bug-report'
import { LandrushIslandClient } from './landrush-island-client'
import { LandrushKeyboardFocusAnchor } from './landrush-keyboard-focus-anchor'
import type { PascalOpenworldIntegrationSnapshot } from './pascal-openworld-integration-contract'
import { writeOfflineParcelWorldState } from './world-multiplayer-lab-client'

export function PascalOpenworldFullSceneRuntime({
  bugReportReplay = null,
  snapshot,
}: {
  bugReportReplay?: LandrushBugReport | null
  snapshot: PascalOpenworldIntegrationSnapshot | null
}) {
  const [snapshotReady, setSnapshotReady] = useState(false)

  useEffect(() => {
    if (!snapshot) return
    writeOfflineParcelWorldState(
      snapshot.worldId,
      snapshot.ownerships,
      snapshot.builds,
      snapshot.tvMediaStates,
    )
    setSnapshotReady(true)
  }, [snapshot])

  useEffect(() => {
    if (!snapshotReady || window.parent === window) return
    let paintedFrame = 0
    const mountedFrame = window.requestAnimationFrame(() => {
      paintedFrame = window.requestAnimationFrame(() => {
        window.parent.postMessage({ type: 'landrush:runtime-painted' }, '*')
      })
    })
    return () => {
      window.cancelAnimationFrame(mountedFrame)
      window.cancelAnimationFrame(paintedFrame)
    }
  }, [snapshotReady])

  if (!snapshotReady) return null

  return (
    <>
      <LandrushKeyboardFocusAnchor />
      <LandrushIslandClient
        bugReportReplay={bugReportReplay}
        experience="pascal-multiplayer-island"
      />
    </>
  )
}
