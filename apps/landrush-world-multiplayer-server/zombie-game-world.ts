import { readFileSync } from 'node:fs'
import { createLandrushBuildFootprintResolver } from '@landrush/pascal-host/landrush-build-footprints'
import {
  createLandrushBuildSyncSnapshotNodes,
  parseLandrushBuildSyncSnapshotNodes,
} from '@landrush/pascal-host/landrush-build-sync'
import {
  createLandrushIslandAmbientSemanticNavigationObstacles,
  createLandrushIslandPalmNavigationObstacles,
} from '@landrush/pascal-host/landrush-island-ambient-navigation-semantics'
import { canonicalizeLandrushParcelBuildGraph } from '@landrush/pascal-host/landrush-parcel-build-graph'
import {
  resolveZombieEscapeWeaponPickupPlacements,
  resolveZombieEscapeWeaponPlacementSeed,
} from '@landrush/pascal-host/zombie-escape-weapon-placement'
import {
  createLandrushZombieEscapeCollisionWorldCompilation,
  createLandrushZombieEscapeCollisionWorldsFromCompilePayload,
  createLandrushZombieEscapeStableClosedDoorPassability,
  resolveLandrushZombieEscapeRuntimePassableDoorIds,
} from '@landrush/pascal-host/zombie-game-navigation'
import { createLandrushIslandAmbientNavigationWorld } from '@landrush/runtime/landrush-island-ambient-navigation'
import { createLandrushIslandConstructionBlockedPalmInstanceIndices } from '@landrush/runtime/landrush-island-palm-construction-visibility'
import { LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT } from '@landrush/zombie-gameplay/landrush-island-ambient-catalog'
import { createLandrushZombieEscapeIntegratedArenaFromPlayRadius } from '@landrush/zombie-gameplay/landrush-zombie-escape-arena'
import {
  ZOMBIE_ESCAPE_SEED,
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from '@landrush/zombie-gameplay/zombie-escape-config'
import { type AnyNode, AnyNode as AnyNodeSchema } from '@pascal-app/core'
import type { ZombieGameWorldManifest } from '../landrush/scripts/zombie-game-world-source'

export type ZombieGameCanonicalBuild = {
  worldId: string
  parcelId: string
  nodes: readonly unknown[]
}

export type ZombieGameDoor = Readonly<{
  id: string
  x: number
  y: number
  z: number
  open: boolean
}>
let compiledManifest: ZombieGameWorldManifest | undefined

export function readZombieGameWorldManifest() {
  if (!compiledManifest) {
    const parsed = JSON.parse(
      readFileSync(new URL('./zombie-game-world.json', import.meta.url), 'utf8'),
    ) as ZombieGameWorldManifest
    if (
      parsed.schemaVersion !== 1 ||
      !Array.isArray(parsed.surfacePoints) ||
      parsed.surfacePoints.length < 3 ||
      !parsed.signature
    ) {
      throw new Error('Invalid compiled Zombie game world; rebuild the multiplayer server')
    }
    compiledManifest = parsed
  }
  return compiledManifest
}

export function createZombieGameWorld({
  worldId,
  builds,
  generation,
  sessionId = 'server',
  night = 0,
  doorStates = new Map<string, boolean>(),
  manifest = readZombieGameWorldManifest(),
}: {
  roomId: string
  worldId: string
  builds: readonly ZombieGameCanonicalBuild[]
  generation: number
  sessionId?: string
  night?: number
  doorStates?: ReadonlyMap<string, boolean>
  manifest?: ZombieGameWorldManifest
}) {
  if (worldId !== manifest.worldId)
    throw new Error('Zombie game world does not match this server build')
  const nodes: Record<string, AnyNode> = Object.create(null)
  for (const node of manifest.baseNodes) nodes[node.id] = AnyNodeSchema.parse(node)
  const parcelIds = new Set(manifest.parcelIds)
  const seenParcels = new Set<string>()
  for (const build of builds) {
    if (
      build.worldId !== worldId ||
      !parcelIds.has(build.parcelId) ||
      seenParcels.has(build.parcelId)
    ) {
      throw new Error('Invalid canonical parcel for Zombie game world')
    }
    seenParcels.add(build.parcelId)
    const parsed = parseLandrushBuildSyncSnapshotNodes(build.nodes, (value) => {
      const result = AnyNodeSchema.safeParse(value)
      return result.success ? result.data : null
    })
    if (parsed.kind === 'invalid') throw new Error(`Invalid canonical building: ${build.parcelId}`)
    const graph = canonicalizeLandrushParcelBuildGraph(Object.values(parsed.nodes), {
      contextBuildingId: manifest.contextBuildingId,
      contextLevelId: manifest.contextLevelId,
      contextSiteId: manifest.contextSiteId,
      parcelId: build.parcelId,
      worldId,
    })
    for (const node of createLandrushBuildSyncSnapshotNodes(graph.nodes, build)) {
      if (Object.hasOwn(nodes, node.id)) throw new Error(`Duplicate canonical node: ${node.id}`)
      nodes[node.id] = node
    }
  }
  const arena = createLandrushZombieEscapeIntegratedArenaFromPlayRadius(
    Math.max(14, ...manifest.surfacePoints.map((point) => Math.hypot(point.x, point.z) + 2)),
  )
  const footprints = createLandrushBuildFootprintResolver({
    buildingId: manifest.contextBuildingId,
    levelId: manifest.contextLevelId,
    grassClearanceMeters: 1,
    grassFeatherMeters: 0.3,
  })
  const blockedPalms = createLandrushIslandConstructionBlockedPalmInstanceIndices({
    blockers: footprints.createLandrushIslandBuiltGrassBlockers(nodes),
    layout: manifest.palms,
  })
  const palmCircles = manifest.palmCircles.filter(
    (_, index) => !blockedPalms.has(manifest.palms[index]!.instanceIndex),
  )
  const compilation = createLandrushZombieEscapeCollisionWorldCompilation({
    agentRadius: ZOMBIE_ESCAPE_SIMULATION.zombieNavigationRadius,
    circles: palmCircles,
    doorPassability: createLandrushZombieEscapeStableClosedDoorPassability(nodes),
    nodes,
    playRadius: arena.playRadius,
    spawn: manifest.origin,
    surfaceSupport: {
      id: 'landrush-zombie-escape-island-surface',
      boundary: true,
      elevation: 0,
      polygon: manifest.surfacePoints,
    },
    verticalOriginY: manifest.origin.y,
  })
  const { navigation, combat } = createLandrushZombieEscapeCollisionWorldsFromCompilePayload(
    compilation.payload,
  )
  const passableObstacleIds = resolveLandrushZombieEscapeRuntimePassableDoorIds(
    nodes,
    Object.fromEntries(doorStates),
  )
  const passable = new Set<string>(passableObstacleIds)
  const ambientWorld = createLandrushIslandAmbientNavigationWorld({
    surfacePoints: manifest.surfacePoints,
    roads: manifest.roads,
    obstacles: [
      ...createLandrushIslandPalmNavigationObstacles(
        manifest.palmCircles.filter((_, index) => {
          const instanceIndex = manifest.palms[index]!.instanceIndex
          return (
            instanceIndex < LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT &&
            !blockedPalms.has(instanceIndex)
          )
        }),
        ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      ),
      ...createLandrushIslandAmbientSemanticNavigationObstacles({
        agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
        groundY: 0,
        snapshot: {
          ...compilation.payload,
          segments: compilation.payload.segments.filter(
            (segment) => !passable.has(segment.objectId ?? segment.id),
          ),
          originX: manifest.origin.x,
          originZ: manifest.origin.z,
          verticalOriginY: manifest.origin.y,
          semanticKey: compilation.signature,
        },
      }),
    ],
  })
  const doors = new Map<string, ZombieGameDoor>()
  for (const segment of compilation.payload.segments) {
    const id = segment.objectId ?? segment.id
    if (nodes[id]?.type !== 'door' || doors.has(id)) continue
    doors.set(id, {
      id,
      x: (segment.startX + segment.endX) / 2 + manifest.origin.x,
      y: (segment.minimumY ?? 0) + manifest.origin.y,
      z: (segment.startZ + segment.endZ) / 2 + manifest.origin.z,
      open: passable.has(id),
    })
  }
  return {
    arena,
    seed: ZOMBIE_ESCAPE_SEED,
    navigation,
    combat,
    ambientWorld,
    doors,
    ambientClipDurations: manifest.ambientClipDurations,
    origin: manifest.origin,
    nodes,
    passableObstacleIds,
    worldSignature: `${manifest.signature}:${generation}:${compilation.payloadIntegrity}`,
    weaponPickups: resolveZombieEscapeWeaponPickupPlacements(
      nodes,
      resolveZombieEscapeWeaponPlacementSeed({ sessionId, night }),
    ),
  }
}
