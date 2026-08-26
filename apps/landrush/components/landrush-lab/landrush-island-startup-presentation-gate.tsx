'use client'

import { type ReactNode, useEffect, useState } from 'react'
import {
  bootstrapLandrushIslandLoadingShellClient,
  LANDRUSH_ISLAND_LOADING_SHELL_FILL_ATTRIBUTE,
  LANDRUSH_ISLAND_LOADING_SHELL_PERCENT_REEL_ATTRIBUTE,
  startLandrushIslandLoadingShellMotion,
} from './landrush-island-loading-shell-bootstrap'

const LANDRUSH_ISLAND_STARTUP_PRESENTATION_FRAME_COUNT = 2
const LANDRUSH_ISLAND_STARTUP_PRESENTATION_MAX_WAIT_MS = 1_000

export function LandrushIslandStartupPresentationGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const isPresentationReady = createLandrushIslandStartupPresentationReadyCheck()
    return scheduleLandrushIslandStartupAfterPresentationFrames({
      cancelFrame: window.cancelAnimationFrame.bind(window),
      isPresentationReady,
      onReady: () => setReady(true),
      requestFrame: window.requestAnimationFrame.bind(window),
      scheduleFallback: (callback) => {
        const timeoutId = window.setTimeout(
          callback,
          LANDRUSH_ISLAND_STARTUP_PRESENTATION_MAX_WAIT_MS,
        )
        return () => window.clearTimeout(timeoutId)
      },
    })
  }, [])

  return ready ? children : null
}

export function scheduleLandrushIslandStartupAfterPresentationFrames({
  cancelFrame,
  frameCount = LANDRUSH_ISLAND_STARTUP_PRESENTATION_FRAME_COUNT,
  isPresentationReady = () => true,
  onReady,
  requestFrame,
  scheduleFallback,
}: {
  cancelFrame: (frameId: number) => void
  frameCount?: number
  isPresentationReady?: () => boolean
  onReady: () => void
  requestFrame: (callback: FrameRequestCallback) => number
  scheduleFallback?: (callback: () => void) => () => void
}) {
  let settled = false
  let frameId: number | null = null
  let cancelFallback: (() => void) | null = null
  const finish = () => {
    if (settled) return
    settled = true
    if (frameId !== null) {
      cancelFrame(frameId)
      frameId = null
    }
    cancelFallback?.()
    cancelFallback = null
    onReady()
  }
  let presentedFrames = 0
  const onFrame = () => {
    if (settled) return
    presentedFrames += 1
    if (presentedFrames >= Math.max(1, frameCount) && isPresentationReady()) {
      frameId = null
      finish()
      return
    }
    frameId = requestFrame(onFrame)
  }
  frameId = requestFrame(onFrame)
  cancelFallback = scheduleFallback?.(finish) ?? null

  return () => {
    if (settled) return
    settled = true
    if (frameId !== null) cancelFrame(frameId)
    cancelFallback?.()
  }
}

export function createLandrushIslandStartupPresentationReadyCheck() {
  let observedAnimation: Animation | null = null
  let observedCurrentTimeMs: number | null = null

  return () => {
    const shell = document.querySelector<HTMLElement>('[data-landrush-island-loading-shell]')
    if (!shell) return false
    const run = bootstrapLandrushIslandLoadingShellClient(shell)
    const fill = shell.querySelector<HTMLElement>(
      `[${LANDRUSH_ISLAND_LOADING_SHELL_FILL_ATTRIBUTE}]`,
    )
    if (!fill) return false
    const percentReel = shell.querySelector<HTMLElement>(
      `[${LANDRUSH_ISLAND_LOADING_SHELL_PERCENT_REEL_ATTRIBUTE}]`,
    )
    const motion = startLandrushIslandLoadingShellMotion(fill, run, undefined, percentReel)
    if (!motion) {
      return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    }
    if (
      motion.animation.playState === 'idle' ||
      motion.animation.playState === 'finished' ||
      motion.percentAnimation?.playState === 'idle' ||
      motion.percentAnimation?.playState === 'finished'
    ) {
      return false
    }
    const currentTimeMs = Number(motion.animation.currentTime)
    if (!Number.isFinite(currentTimeMs)) return false
    if (observedAnimation !== motion.animation) {
      observedAnimation = motion.animation
      observedCurrentTimeMs = currentTimeMs
      return false
    }
    const advanced = observedCurrentTimeMs !== null && currentTimeMs > observedCurrentTimeMs
    observedCurrentTimeMs = currentTimeMs
    return advanced
  }
}
