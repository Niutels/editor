'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'

type LandrushIslandFrameScheduler = {
  cancelFrame: (frameId: number) => void
  requestFrame: (callback: FrameRequestCallback) => number
}

export type LandrushIslandPaintReadinessGate = {
  dispose: () => void
  setPrerequisitesReady: (ready: boolean) => void
}

export function createLandrushIslandPaintReadinessGate({
  onReadyChange,
  scheduler,
}: {
  onReadyChange: (ready: boolean) => void
  scheduler: LandrushIslandFrameScheduler
}): LandrushIslandPaintReadinessGate {
  let firstFrameId: number | null = null
  let secondFrameId: number | null = null
  let prerequisitesReady = false
  let paintReady = false

  const cancelPendingFrames = () => {
    if (firstFrameId !== null) scheduler.cancelFrame(firstFrameId)
    if (secondFrameId !== null) scheduler.cancelFrame(secondFrameId)
    firstFrameId = null
    secondFrameId = null
  }

  return {
    dispose() {
      prerequisitesReady = false
      cancelPendingFrames()
    },
    setPrerequisitesReady(ready) {
      if (ready === prerequisitesReady) return
      prerequisitesReady = ready
      cancelPendingFrames()

      if (!ready) {
        if (paintReady) {
          paintReady = false
          onReadyChange(false)
        }
        return
      }

      firstFrameId = scheduler.requestFrame(() => {
        firstFrameId = null
        if (!prerequisitesReady) return

        secondFrameId = scheduler.requestFrame(() => {
          secondFrameId = null
          if (!prerequisitesReady) return
          paintReady = true
          onReadyChange(true)
        })
      })
    },
  }
}

export function useLandrushIslandPaintReadiness(prerequisitesReady: boolean) {
  const [paintReady, setPaintReady] = useState(false)
  const gateRef = useRef<LandrushIslandPaintReadinessGate | null>(null)

  useEffect(() => {
    const gate = createLandrushIslandPaintReadinessGate({
      onReadyChange: setPaintReady,
      scheduler: {
        cancelFrame: window.cancelAnimationFrame.bind(window),
        requestFrame: window.requestAnimationFrame.bind(window),
      },
    })
    gateRef.current = gate

    return () => {
      gateRef.current = null
      gate.dispose()
    }
  }, [])

  useEffect(() => {
    gateRef.current?.setPrerequisitesReady(prerequisitesReady)
  }, [prerequisitesReady])

  return prerequisitesReady && paintReady
}

export function LandrushIslandWorldFrameReporter({ onReady }: { onReady: () => void }) {
  const canvas = useThree((state) => state.gl.domElement)
  const invalidate = useThree((state) => state.invalidate)
  const reportedRef = useRef(false)
  const handleReadyRef = useRef(onReady)
  const runtimeRootRef = useRef<Element | null>(null)

  useEffect(() => {
    handleReadyRef.current = onReady
  }, [onReady])

  useEffect(() => {
    invalidate()
  }, [invalidate])

  useEffect(
    () => () => {
      runtimeRootRef.current?.removeAttribute('data-landrush-island-world-frame-ready')
      runtimeRootRef.current = null
    },
    [],
  )

  useFrame(() => {
    if (reportedRef.current) return
    reportedRef.current = true
    runtimeRootRef.current = canvas.closest('main')
    runtimeRootRef.current?.setAttribute('data-landrush-island-world-frame-ready', '')
    handleReadyRef.current()
  })

  return null
}
