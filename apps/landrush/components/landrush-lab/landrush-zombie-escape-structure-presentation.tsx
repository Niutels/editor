'use client'

import type { ZombieEscapeSimulation } from '@landrush/zombie-gameplay/zombie-escape-simulation'
import { type AnyNodeId, sceneRegistry } from '@pascal-app/core'
import { useFrame } from '@react-three/fiber'
import { type MutableRefObject, useEffect, useRef } from 'react'
import type { Object3D } from 'three'
import {
  LandrushZombieEscapeStructureHitPresentation,
  type LandrushZombieEscapeStructureHitSample,
} from './landrush-zombie-escape-structure-hit-presentation'

export const LANDRUSH_ZOMBIE_ESCAPE_STRUCTURE_PRESENTATION_FRAME_ORDER = {
  hitApply: 0.98,
  hitRestore: 1.01,
  visibility: 0.88,
} as const

export function LandrushZombieEscapeStructurePresentation({
  active,
  simulationRef,
}: {
  active: boolean
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}) {
  const hiddenRootsRef = useRef(new Map<Object3D, boolean>())
  const destroyedRootsRef = useRef(new Set<Object3D>())
  const hitRootsRef = useRef(new Map<Object3D, LandrushZombieEscapeStructureHitSample>())
  const hitPresentationRef = useRef<LandrushZombieEscapeStructureHitPresentation | null>(null)
  hitPresentationRef.current ??= new LandrushZombieEscapeStructureHitPresentation()

  useEffect(
    () => () => {
      restoreLandrushZombieEscapeStructureRoots(hiddenRootsRef.current)
      hitPresentationRef.current?.dispose()
    },
    [],
  )

  useFrame(() => {
    if (!active) {
      restoreLandrushZombieEscapeStructureRoots(hiddenRootsRef.current)
      return
    }

    const destroyedObjectIds = simulationRef.current.destroyedObstacleIds
    const destroyedRoots = destroyedRootsRef.current
    destroyedRoots.clear()
    for (const objectId of destroyedObjectIds) {
      const root = sceneRegistry.nodes.get(objectId as AnyNodeId)
      if (root) destroyedRoots.add(root)
    }
    syncLandrushZombieEscapeStructureRoots(destroyedRoots, hiddenRootsRef.current)
  }, LANDRUSH_ZOMBIE_ESCAPE_STRUCTURE_PRESENTATION_FRAME_ORDER.visibility)

  // Apply after floor fade/passthrough, then restore immediately after the viewer-owned render so
  // gameplay never observes the temporary material or transform lease.
  useFrame(() => {
    const hitPresentation = hitPresentationRef.current
    if (!hitPresentation) return
    const hitRoots = hitRootsRef.current
    hitRoots.clear()
    const simulation = simulationRef.current
    if (!active || simulation.status !== 'playing') {
      hitPresentation.dispose()
      return
    }

    for (const [objectId, amount] of simulation.obstacleHitFeedback) {
      if (amount <= 0 || simulation.destroyedObstacleIds.has(objectId)) continue
      const root = sceneRegistry.nodes.get(objectId as AnyNodeId)
      if (root) hitRoots.set(root, { amount, objectId })
    }
    hitPresentation.sync(hitRoots)
  }, LANDRUSH_ZOMBIE_ESCAPE_STRUCTURE_PRESENTATION_FRAME_ORDER.hitApply)

  useFrame(
    () => hitPresentationRef.current?.restore(),
    LANDRUSH_ZOMBIE_ESCAPE_STRUCTURE_PRESENTATION_FRAME_ORDER.hitRestore,
  )

  return null
}

export function syncLandrushZombieEscapeStructureRoots(
  destroyedRoots: ReadonlySet<Object3D>,
  hiddenRoots: Map<Object3D, boolean>,
) {
  for (const [root, wasVisible] of hiddenRoots) {
    if (destroyedRoots.has(root)) continue
    root.visible = wasVisible
    hiddenRoots.delete(root)
  }
  for (const root of destroyedRoots) {
    if (!hiddenRoots.has(root)) hiddenRoots.set(root, root.visible)
    root.visible = false
  }
}

export function restoreLandrushZombieEscapeStructureRoots(hiddenRoots: Map<Object3D, boolean>) {
  for (const [root, wasVisible] of hiddenRoots) root.visible = wasVisible
  hiddenRoots.clear()
}
