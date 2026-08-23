'use client'

import { type AnyNodeId, sceneRegistry } from '@pascal-app/core'
import { useFrame } from '@react-three/fiber'
import { type MutableRefObject, useEffect, useRef } from 'react'
import type { Object3D } from 'three'
import type { ZombieEscapeSimulation } from './zombie-escape-simulation'

export function LandrushZombieEscapeStructurePresentation({
  active,
  simulationRef,
}: {
  active: boolean
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}) {
  const hiddenRootsRef = useRef(new Map<Object3D, boolean>())
  const destroyedRootsRef = useRef(new Set<Object3D>())

  useEffect(() => () => restoreLandrushZombieEscapeStructureRoots(hiddenRootsRef.current), [])

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
  }, 0.88)

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
