import { isZombieEscapeFirstHouseReady } from '@landrush/protocol'
import { type AnyNode, detectSpacesForLevel } from '@pascal-app/core'
import {
  type LandrushBuildingFloorInteriorRegion,
  resolveLandrushBuildingFloorStacks,
} from './landrush-building-floor-visibility'

export const LANDRUSH_ZOMBIE_ESCAPE_FIRST_HOUSE_BUILD_KINDS = ['wall', 'door'] as const

export type LandrushZombieEscapeFirstHouseReadyRegion = Readonly<{
  levelId: string
  region: LandrushBuildingFloorInteriorRegion
  scopeId: string
  y: number
}>

type LandrushZombieEscapeClockMode = 'offline-local' | 'online-canonical' | 'online-waiting'

export function resolveLandrushZombieEscapeFirstHouseBuildSatisfied({
  clockMode,
  offlineFirstHouseBuilt,
  phaseEndsAt,
}: {
  clockMode: LandrushZombieEscapeClockMode
  offlineFirstHouseBuilt: boolean
  phaseEndsAt: number | null
}) {
  if (clockMode === 'online-canonical') return phaseEndsAt !== null
  if (clockMode === 'offline-local') return offlineFirstHouseBuilt
  return false
}

export function shouldRequestLandrushZombieEscapeClockInitialization({
  clockMode,
  nightStartReady,
  phase,
  phaseEndsAt,
}: {
  clockMode: LandrushZombieEscapeClockMode
  nightStartReady: boolean
  phase: 'build' | 'night' | null
  phaseEndsAt: number | null
}) {
  return (
    clockMode === 'online-canonical' && nightStartReady && phase === 'build' && phaseEndsAt === null
  )
}

export function resolveLandrushZombieEscapeFirstHouseReadyScopeIds(
  nodes: Record<string, AnyNode>,
): readonly string[] {
  return resolveLandrushZombieEscapeFirstHouseReadiness(nodes).scopeIds
}

export function resolveLandrushZombieEscapeFirstHouseReadyRegions(
  nodes: Record<string, AnyNode>,
): readonly LandrushZombieEscapeFirstHouseReadyRegion[] {
  return resolveLandrushZombieEscapeFirstHouseReadiness(nodes).regions
}

function resolveLandrushZombieEscapeFirstHouseReadiness(nodes: Record<string, AnyNode>) {
  const values = Object.values(nodes)
  const readyScopeIds: string[] = []
  const readyRegions: LandrushZombieEscapeFirstHouseReadyRegion[] = []

  for (const stack of resolveLandrushBuildingFloorStacks(nodes)) {
    const groundFloor = stack.floors.find((floor) => floor.level === 0) ?? stack.floors[0]
    if (!groundFloor) continue

    let ready = false
    for (const levelId of groundFloor.levelIds) {
      const level = nodes[levelId]
      if (level?.type !== 'level') continue
      const walls = values.filter(
        (node): node is Extract<AnyNode, { type: 'wall' }> =>
          node.type === 'wall' &&
          node.parentId === levelId &&
          node.visible !== false &&
          isNodeInFirstHouseScope(node, level, stack.scopeId),
      )
      if (walls.length < 3) continue
      const wallIds = new Set<string>(walls.map((wall) => wall.id))
      const doors = values.filter(
        (node): node is Extract<AnyNode, { type: 'door' }> =>
          node.type === 'door' &&
          node.openingKind !== 'opening' &&
          node.visible !== false &&
          ((typeof node.wallId === 'string' && wallIds.has(node.wallId)) ||
            (typeof node.parentId === 'string' && wallIds.has(node.parentId))),
      )
      if (!isZombieEscapeFirstHouseReady([level, ...walls, ...doors])) continue

      ready = true
      const hostedDoorWallIds = new Set<string>()
      for (const door of doors) {
        for (const wallId of [door.wallId, door.parentId]) {
          if (typeof wallId === 'string' && wallIds.has(wallId)) hostedDoorWallIds.add(wallId)
        }
      }
      for (const space of detectSpacesForLevel(levelId, walls).spaces) {
        if (!space.wallIds.some((wallId) => hostedDoorWallIds.has(wallId))) continue
        readyRegions.push({
          levelId,
          region: { holes: [], polygon: space.polygon, source: 'closed-walls' },
          scopeId: stack.scopeId,
          y: groundFloor.baseY,
        })
      }
    }
    if (ready) readyScopeIds.push(stack.scopeId)
  }

  return { regions: readyRegions, scopeIds: readyScopeIds }
}

export function isLandrushZombieEscapeFirstHouseReady(nodes: Record<string, AnyNode>) {
  return resolveLandrushZombieEscapeFirstHouseReadyScopeIds(nodes).length > 0
}

function isNodeInFirstHouseScope(node: AnyNode, level: AnyNode, scopeId: string) {
  const scopeParcelId = scopeId.startsWith('parcel:') ? scopeId.slice('parcel:'.length) : null
  const nodeParcelId = resolveFirstHouseNodeParcelId(node)
  if (!scopeParcelId) return nodeParcelId === null

  const levelParcelId = resolveFirstHouseNodeParcelId(level)
  return levelParcelId === scopeParcelId
    ? nodeParcelId === null || nodeParcelId === scopeParcelId
    : nodeParcelId === scopeParcelId
}

function resolveFirstHouseNodeParcelId(node: AnyNode) {
  const metadata =
    node.metadata && typeof node.metadata === 'object' && !Array.isArray(node.metadata)
      ? (node.metadata as Record<string, unknown>)
      : null
  const parcelId = metadata?.landrushParcelId
  return typeof parcelId === 'string' && parcelId.length > 0 ? parcelId : null
}
