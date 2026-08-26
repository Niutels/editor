'use client'

import { type ReactNode, useEffect, useState } from 'react'

const LANDRUSH_ISLAND_STARTUP_PRESENTATION_FRAME_COUNT = 2

export function LandrushIslandStartupPresentationGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(
    () =>
      scheduleLandrushIslandStartupAfterPresentationFrames({
        cancelFrame: window.cancelAnimationFrame.bind(window),
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
  onReady,
  requestFrame,
}: {
  cancelFrame: (frameId: number) => void
  frameCount?: number
  onReady: () => void
  requestFrame: (callback: FrameRequestCallback) => number
}) {
  let cancelled = false
  let frameId: number | null = null
  let presentedFrames = 0
  const onFrame = () => {
    if (cancelled) return
    presentedFrames += 1
    if (presentedFrames >= Math.max(1, frameCount)) {
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
