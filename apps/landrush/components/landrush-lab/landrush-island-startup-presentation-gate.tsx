'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { bootstrapLandrushIslandLoadingShellClient } from './landrush-island-loading-shell-bootstrap'

const LANDRUSH_ISLAND_STARTUP_PRESENTATION_FRAME_COUNT = 2

export function LandrushIslandStartupPresentationGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(
    () =>
      scheduleLandrushIslandStartupAfterPresentationFrames({
        cancelFrame: window.cancelAnimationFrame.bind(window),
        isPresentationReady: bootstrapLandrushIslandStartupShell,
        onReady: () => setReady(true),
        requestFrame: window.requestAnimationFrame.bind(window),
      }),
    [],
  )

  return ready ? children : null
}

export function scheduleLandrushIslandStartupAfterPresentationFrames({
  cancelFrame,
  frameCount = LANDRUSH_ISLAND_STARTUP_PRESENTATION_FRAME_COUNT,
  isPresentationReady = () => true,
  onReady,
  requestFrame,
}: {
  cancelFrame: (frameId: number) => void
  frameCount?: number
  isPresentationReady?: () => boolean
  onReady: () => void
  requestFrame: (callback: FrameRequestCallback) => number
}) {
  let cancelled = false
  let frameId: number | null = null
  let presentedFrames = 0
  const onFrame = () => {
    if (cancelled) return
    presentedFrames += 1
    if (presentedFrames >= Math.max(1, frameCount) && isPresentationReady()) {
      frameId = null
      onReady()
      return
    }
    frameId = requestFrame(onFrame)
  }
  frameId = requestFrame(onFrame)

  return () => {
    cancelled = true
    if (frameId !== null) cancelFrame(frameId)
  }
}

function bootstrapLandrushIslandStartupShell() {
  const shell = document.querySelector<HTMLElement>('[data-landrush-island-loading-shell]')
  if (!shell) return false
  bootstrapLandrushIslandLoadingShellClient(shell)
  return true
}
