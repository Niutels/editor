'use client'

import { type AnyNodeId, sceneRegistry } from '@pascal-app/core'
import { useFrame } from '@react-three/fiber'
import { type MutableRefObject, useEffect, useLayoutEffect, useRef } from 'react'
import type { Object3D } from 'three'
import {
  LandrushZombieEscapeStructureHitPresentation,
  type LandrushZombieEscapeStructureHitSample,
} from './landrush-zombie-escape-structure-hit-presentation'
import type { ZombieEscapeSimulation } from './zombie-escape-simulation'

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
  const runtimeRef = useRef<LandrushZombieEscapeStructurePresentationRuntime | null>(null)
  runtimeRef.current ??= new LandrushZombieEscapeStructurePresentationRuntime()

  useEffect(
    () => () => {
      runtimeRef.current?.dispose()
    },
    [],
  )

  return active ? (
    <LandrushZombieEscapeStructurePresentationActive
      runtime={runtimeRef.current}
      simulationRef={simulationRef}
    />
  ) : null
}

function LandrushZombieEscapeStructurePresentationActive({
  runtime,
  simulationRef,
}: {
  runtime: LandrushZombieEscapeStructurePresentationRuntime
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}) {
  useLayoutEffect(() => () => runtime.deactivate(), [runtime])

  useFrame(
    () => runtime.syncVisibility(simulationRef.current),
    LANDRUSH_ZOMBIE_ESCAPE_STRUCTURE_PRESENTATION_FRAME_ORDER.visibility,
  )

  // Apply after floor fade/passthrough, then restore immediately after the viewer-owned render so
  // gameplay never observes the temporary material or transform lease.
  useFrame(
    () => runtime.syncHits(simulationRef.current),
    LANDRUSH_ZOMBIE_ESCAPE_STRUCTURE_PRESENTATION_FRAME_ORDER.hitApply,
  )

  useFrame(
    () => runtime.restoreHits(),
    LANDRUSH_ZOMBIE_ESCAPE_STRUCTURE_PRESENTATION_FRAME_ORDER.hitRestore,
  )

  return null
}

type StructureHitPresentation = Pick<
  LandrushZombieEscapeStructureHitPresentation,
  'dispose' | 'restore' | 'sync'
>

type StructurePresentationSimulation = Pick<
  ZombieEscapeSimulation,
  'destroyedObstacleIds' | 'obstacleHitFeedback' | 'status'
>

export class LandrushZombieEscapeStructurePresentationRuntime {
  private readonly destroyedRoots = new Set<Object3D>()
  private readonly hiddenRoots = new Map<Object3D, boolean>()
  private readonly hitRoots = new Map<Object3D, LandrushZombieEscapeStructureHitSample>()

  constructor(
    private readonly hitPresentation: StructureHitPresentation = new LandrushZombieEscapeStructureHitPresentation(),
  ) {}

  syncVisibility(simulation: StructurePresentationSimulation) {
    const destroyedObjectIds = simulation.destroyedObstacleIds
    this.destroyedRoots.clear()
    for (const objectId of destroyedObjectIds) {
      const root = sceneRegistry.nodes.get(objectId as AnyNodeId)
      if (root) this.destroyedRoots.add(root)
    }
    syncLandrushZombieEscapeStructureRoots(this.destroyedRoots, this.hiddenRoots)
  }

  syncHits(simulation: StructurePresentationSimulation) {
    this.hitRoots.clear()
    if (simulation.status !== 'playing') {
      this.hitPresentation.dispose()
      return
    }

    for (const [objectId, amount] of simulation.obstacleHitFeedback) {
      if (amount <= 0 || simulation.destroyedObstacleIds.has(objectId)) continue
      const root = sceneRegistry.nodes.get(objectId as AnyNodeId)
      if (root) this.hitRoots.set(root, { amount, objectId })
    }
    this.hitPresentation.sync(this.hitRoots)
  }

  restoreHits() {
    this.hitPresentation.restore()
  }

  deactivate() {
    restoreLandrushZombieEscapeStructureRoots(this.hiddenRoots)
    this.destroyedRoots.clear()
    this.hitRoots.clear()
    this.hitPresentation.dispose()
  }

  dispose() {
    this.deactivate()
  }
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
