import { distanceToClosedPolyline, pointInPolygon } from '@landrush/runtime'
import type { GrassFieldBlocker } from './grass-field-texture'
import type { LandrushIslandPalmPlacement } from './landrush-island-palm-layout'

export const LANDRUSH_ISLAND_PALM_CONSTRUCTION_CLEARANCE_METERS = 2.35

export function createLandrushIslandConstructionBlockedPalmInstanceIndices({
  blockers,
  layout,
}: {
  blockers: readonly GrassFieldBlocker[]
  layout: readonly LandrushIslandPalmPlacement[]
}): ReadonlySet<number> {
  const blocked = new Set<number>()
  if (blockers.length === 0 || layout.length === 0) return blocked

  for (const placement of layout) {
    if (blockers.some((blocker) => landrushIslandPalmOverlapsConstruction(placement, blocker))) {
      blocked.add(placement.instanceIndex)
    }
  }
  return blocked
}

export function resolveLandrushIslandAmbientPalmSlotVisible({
  blockedInstanceIndices,
  instanceIndex,
  phaseVisible,
}: {
  blockedInstanceIndices: ReadonlySet<number>
  instanceIndex: number
  phaseVisible: boolean
}) {
  return phaseVisible && !blockedInstanceIndices.has(instanceIndex)
}

function landrushIslandPalmOverlapsConstruction(
  placement: LandrushIslandPalmPlacement,
  blocker: GrassFieldBlocker,
) {
  if (blocker.points.length < 3) return false
  if (pointInPolygon(placement.position, blocker.points)) return true
  const clearanceMeters =
    Math.max(0, blocker.clearanceMeters ?? 0) + LANDRUSH_ISLAND_PALM_CONSTRUCTION_CLEARANCE_METERS
  return distanceToClosedPolyline(placement.position, blocker.points) <= clearanceMeters
}
