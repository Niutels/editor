'use client'

import type { ConnectionStatus } from '@landrush/protocol'
import { MULTIPLAYER_LATENCY_EVENT, type MultiplayerConnectionDetails } from '@landrush/runtime'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { SpatialVoiceControl, type SpatialVoiceController } from './world-multiplayer-spatial-audio'

export function MultiplayerStatusPanel({
  connection,
  localPlayerIncluded,
  remotePlayerCount,
  renderedFpsRef,
  status,
  voice,
}: {
  connection: MultiplayerConnectionDetails
  localPlayerIncluded: boolean
  remotePlayerCount: number
  renderedFpsRef?: RefObject<number | null>
  status: ConnectionStatus
  voice?: SpatialVoiceController
}) {
  const latencyLabelRef = useRef<HTMLSpanElement>(null)
  const displayedPlayerCount =
    connection.serverPlayerCount ?? remotePlayerCount + (localPlayerIncluded ? 1 : 0)
  const statusLabel = compactStatusLabel(status)
  const latencyLabel = connection.latencyMs === null ? '--ms' : `${connection.latencyMs}ms`
  const measuredFps = useMeasuredFps(renderedFpsRef)
  const fpsLabel = measuredFps === null ? '--fps' : `${measuredFps}fps`

  useEffect(() => {
    const element = latencyLabelRef.current
    if (!element) return
    element.textContent = latencyLabel

    const handleLatency = (event: Event) => {
      const latencyMs = (event as CustomEvent<number>).detail
      if (Number.isFinite(latencyMs)) element.textContent = `${latencyMs}ms`
    }
    window.addEventListener(MULTIPLAYER_LATENCY_EVENT, handleLatency)
    return () => window.removeEventListener(MULTIPLAYER_LATENCY_EVENT, handleLatency)
  }, [latencyLabel])

  return (
    <section className="pointer-events-auto absolute top-3 left-3 z-40 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded border border-white/18 bg-slate-950/62 px-2 py-1 font-medium text-[11px] text-white/88 shadow-lg backdrop-blur">
      <span
        aria-hidden
        className={`size-2 shrink-0 rounded-full ${compactStatusDotClass(status)}`}
      />
      <span className="capitalize">{statusLabel}</span>
      <span className="text-white/35">/</span>
      <span>{displayedPlayerCount}p</span>
      <span className="text-white/35">/</span>
      <span ref={latencyLabelRef}>{latencyLabel}</span>
      <span className="text-white/35">/</span>
      <span>{fpsLabel}</span>
      {voice ? (
        <>
          <span className="text-white/35">/</span>
          <SpatialVoiceControl voice={voice} />
        </>
      ) : null}
    </section>
  )
}

function useMeasuredFps(renderedFpsRef?: RefObject<number | null>) {
  const [fps, setFps] = useState<number | null>(null)

  useEffect(() => {
    if (renderedFpsRef) {
      const updateRenderedFps = () => {
        setFps(document.visibilityState === 'visible' ? renderedFpsRef.current : null)
      }
      updateRenderedFps()
      const interval = window.setInterval(updateRenderedFps, 250)
      document.addEventListener('visibilitychange', updateRenderedFps)
      return () => {
        window.clearInterval(interval)
        document.removeEventListener('visibilitychange', updateRenderedFps)
      }
    }

    let animationFrame = 0
    let frameCount = 0
    let windowStartedAt = performance.now()

    const tick = (now: number) => {
      frameCount += 1
      const elapsedMs = now - windowStartedAt
      if (elapsedMs >= 1000) {
        setFps(Math.round((frameCount * 1000) / elapsedMs))
        frameCount = 0
        windowStartedAt = now
      }
      animationFrame = window.requestAnimationFrame(tick)
    }

    const handleVisibilityChange = () => {
      frameCount = 0
      windowStartedAt = performance.now()
      if (document.visibilityState !== 'visible') setFps(null)
    }

    animationFrame = window.requestAnimationFrame(tick)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [renderedFpsRef])

  return fps
}

function compactStatusLabel(status: ConnectionStatus) {
  if (status === 'connected') return 'online'
  if (status === 'reconnecting') return 'retry'
  if (status === 'connecting') return 'join'
  return 'offline'
}

function compactStatusDotClass(status: ConnectionStatus) {
  if (status === 'connected') return 'bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.7)]'
  if (status === 'offline') return 'bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.65)]'
  return 'bg-sky-300 shadow-[0_0_10px_rgba(125,211,252,0.65)]'
}
