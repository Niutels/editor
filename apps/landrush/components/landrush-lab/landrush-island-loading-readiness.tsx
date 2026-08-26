'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'

type LandrushIslandFrameScheduler = {
  cancelFrame: (frameId: number) => void
  requestFrame: (callback: FrameRequestCallback) => number
}

type LandrushIslandTimeoutScheduler = {
  clearTimeout: (timeoutId: number) => void
  setTimeout: (callback: () => void, delayMs: number) => number
}

export type LandrushIslandPaintReadinessGate = {
  dispose: () => void
  setPrerequisitesReady: (ready: boolean) => void
}

export type LandrushIslandLoadingHandoffGate = {
  dispose: () => void
  requestHandoff: (generation: string) => boolean
  setReadiness: (generation: string, ready: boolean) => void
}

export type LandrushIslandLoadingHandoffReset = {
  generation: string
  generationChanged: boolean
}

export type LandrushGeneratedAssetReadinessStatus = {
  generation: string
  ready: boolean
}

export type LandrushGeneratedAssetMountGeneration = {
  enabled: boolean
  generation: number
}

export function advanceLandrushGeneratedAssetMountGeneration(
  current: LandrushGeneratedAssetMountGeneration,
  enabled: boolean,
) {
  if (current.enabled === enabled) return current
  return { enabled, generation: current.generation + 1 }
}

export function reconcileLandrushGeneratedAssetReadinessStatus({
  current,
  currentGeneration,
  ready,
  reportedGeneration,
}: {
  current: LandrushGeneratedAssetReadinessStatus | null
  currentGeneration: string
  ready: boolean
  reportedGeneration: string
}) {
  if (reportedGeneration !== currentGeneration) return current
  if (current?.generation === reportedGeneration && current.ready === ready) return current
  return { generation: reportedGeneration, ready }
}

export function resolveLandrushGeneratedAssetsReady({
  enabled,
  generation,
  status,
}: {
  enabled: boolean
  generation: string
  status: LandrushGeneratedAssetReadinessStatus | null
}) {
  return !enabled || (status?.generation === generation && status.ready)
}

export function resolveLandrushAuthorityResyncActive({
  authorityKey,
  handedOff,
  presentedAuthorityKey,
  ready,
}: {
  authorityKey: string
  handedOff: boolean
  presentedAuthorityKey: string | null
  ready: boolean
}) {
  return handedOff && !ready && presentedAuthorityKey !== authorityKey
}

export function shouldPersistLandrushIslandOfflineState({
  clean,
  offline,
}: {
  clean: boolean
  offline: boolean
}) {
  return offline && !clean
}

export type LandrushInitialParcelMaterializationUpdate = {
  parcelId: string
  sequence: number
  worldId: string
}

export function createLandrushInitialParcelAuthorityKey(authorityEpoch: number, worldId: string) {
  return `${authorityEpoch}:${worldId}`
}

export function wasLandrushInitialParcelAuthorityMaterialized({
  authorityEpoch,
  readyAuthorityKey,
  worldId,
}: {
  authorityEpoch: number
  readyAuthorityKey: string | null
  worldId: string
}) {
  return readyAuthorityKey === createLandrushInitialParcelAuthorityKey(authorityEpoch, worldId)
}

export function resolveLandrushInitialParcelMaterializationReadiness({
  appliedSequenceForUpdate,
  authorityEpoch,
  snapshotWorldId,
  updates,
  worldId,
}: {
  appliedSequenceForUpdate: (update: LandrushInitialParcelMaterializationUpdate) => number
  authorityEpoch: number
  snapshotWorldId: string | null
  updates: readonly LandrushInitialParcelMaterializationUpdate[]
  worldId: string
}) {
  const authorityKey = createLandrushInitialParcelAuthorityKey(authorityEpoch, worldId)
  if (snapshotWorldId !== worldId) return { authorityKey, ready: false }

  const ready = updates
    .filter((update) => update.worldId === worldId)
    .every((update) => appliedSequenceForUpdate(update) >= update.sequence)
  return { authorityKey, ready }
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

export function createLandrushIslandLoadingHandoffGate({
  fadeMs,
  onHandoff,
  onReset,
  scheduler,
}: {
  fadeMs: number
  onHandoff: (generation: string) => void
  onReset: (reset: LandrushIslandLoadingHandoffReset) => void
  scheduler: LandrushIslandTimeoutScheduler
}): LandrushIslandLoadingHandoffGate {
  let currentGeneration: string | null = null
  let handedOff = false
  let handoffTimeoutId: number | null = null
  let ready = false

  const cancelHandoff = () => {
    if (handoffTimeoutId !== null) scheduler.clearTimeout(handoffTimeoutId)
    handoffTimeoutId = null
  }

  return {
    dispose() {
      cancelHandoff()
      handedOff = true
      ready = false
    },
    requestHandoff(generation) {
      if (handedOff || !ready || generation !== currentGeneration || handoffTimeoutId !== null) {
        return false
      }

      handoffTimeoutId = scheduler.setTimeout(() => {
        handoffTimeoutId = null
        if (handedOff || !ready || generation !== currentGeneration) return
        handedOff = true
        onHandoff(generation)
      }, fadeMs)
      return true
    },
    setReadiness(generation, nextReady) {
      if (handedOff) return

      const generationChanged = currentGeneration !== null && generation !== currentGeneration
      const readinessWithdrawn = ready && !nextReady
      currentGeneration = generation
      ready = nextReady

      if (!generationChanged && !readinessWithdrawn) return
      cancelHandoff()
      onReset({ generation, generationChanged })
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
