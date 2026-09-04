import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { LANDRUSH_ISLAND_AMBIENT_NPCS } from '@landrush/zombie-gameplay/landrush-island-ambient-catalog'
import type { AnyNode } from '@pascal-app/core'
import {
  createLandrushIslandPalmCollisionCircles,
  createLandrushIslandPalmLayout,
  resolveLandrushIslandPalmLayoutCenter,
} from '../components/landrush-lab/landrush-island-palm-layout'
import {
  createLandrushIslandGrassRoadSegments,
  createLandrushIslandParcelOptions,
  createLandrushIslandParcelOwnershipWorldId,
  createLandrushIslandSceneGraph,
  LANDRUSH_ISLAND_BUILDING_ID,
  LANDRUSH_ISLAND_EXPERIENCE_CONFIGS,
  LANDRUSH_ISLAND_LEVEL_ID,
  LANDRUSH_ISLAND_SITE_ID,
} from '../components/landrush-lab/landrush-island-world'
import { createNaturalRoadPlan } from '../components/landrush-lab/natural-road-plan'
import {
  PASCAL_WORLD_ELEVATION_PARAMETERS,
  PASCAL_WORLD_WATER_MATERIAL_PARAMETERS,
} from '../components/landrush-lab/pascal-world-visual-defaults'
import {
  WATER_LAB_DEFAULT_FIELD_PARAMETERS,
  WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
} from '../components/landrush-lab/water-lab-parameters'

export function createZombieGameWorldManifest() {
  const { landrushLayoutNode: layout, sceneGraph } = createLandrushIslandSceneGraph({
    elevationParameters: PASCAL_WORLD_ELEVATION_PARAMETERS,
    fieldParameters: WATER_LAB_DEFAULT_FIELD_PARAMETERS,
    islandParameters: WATER_LAB_DEFAULT_ISLAND_PARAMETERS,
    layoutConfig: LANDRUSH_ISLAND_EXPERIENCE_CONFIGS['pascal-multiplayer-island'],
    materialParameters: PASCAL_WORLD_WATER_MATERIAL_PARAMETERS,
    omitWaterNode: true,
    showDepthReference: false,
    terrainFieldResolution: 384,
  })
  const sceneNodes = sceneGraph.nodes as Record<string, AnyNode>
  const site = sceneNodes[LANDRUSH_ISLAND_SITE_ID]
  if (site?.type !== 'site') throw new Error('Canonical island site is missing')
  const surfacePoints = site.polygon.points.map(([x, z]) => ({ x, z }))
  const roads = createLandrushIslandGrassRoadSegments(layout.roads.segments)
  const roadPlan = createNaturalRoadPlan({
    elevation: 0,
    perimeter: surfacePoints,
    quality: 'high',
    roads,
    seed: 'cala',
  })
  const palms = createLandrushIslandPalmLayout({
    center: resolveLandrushIslandPalmLayoutCenter(surfacePoints),
    roadClearance: roadPlan.footprints.clearance,
    shoreline: surfacePoints,
  })
  const palmCircles = createLandrushIslandPalmCollisionCircles({
    layout: palms,
    origin: { x: 0, z: 0 },
  })
  const baseNodes = Object.values(sceneNodes)
    .filter((node) => node.type === 'site' || node.type === 'building' || node.type === 'level')
    .map((node) => ({ ...node, children: (node.children ?? []).filter((id) => id !== layout.id) }))
  const data = {
    schemaVersion: 1,
    worldId: createLandrushIslandParcelOwnershipWorldId(
      createLandrushIslandParcelOptions(layout.seed),
    ),
    seed: layout.seed,
    contextSiteId: LANDRUSH_ISLAND_SITE_ID,
    contextBuildingId: LANDRUSH_ISLAND_BUILDING_ID,
    contextLevelId: LANDRUSH_ISLAND_LEVEL_ID,
    origin: { x: 0, y: layout.playerStart[1], z: 0 },
    parcelIds: layout.parcels.map((parcel) => parcel.id),
    baseNodes,
    surfacePoints,
    roads,
    palms,
    palmCircles,
    ambientClipDurations: LANDRUSH_ISLAND_AMBIENT_NPCS.map((npc) => ({
      idle: readAnimationDuration(npc.glb.idle),
      walk: readAnimationDuration(npc.glb.walk),
      run: readAnimationDuration(npc.glb.run),
    })),
  }
  return { ...data, signature: createHash('sha256').update(JSON.stringify(data)).digest('hex') }
}

export type ZombieGameWorldManifest = ReturnType<typeof createZombieGameWorldManifest>

function readAnimationDuration(assetPath: string) {
  const bytes = readFileSync(new URL(`../public${assetPath}`, import.meta.url))
  if (
    bytes.readUInt32LE(0) !== 0x46546c67 ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(16) !== 0x4e4f534a
  ) {
    throw new Error(`Unsupported NPC animation asset: ${assetPath}`)
  }
  const jsonLength = bytes.readUInt32LE(12)
  const gltf = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'))
  const animation = gltf.animations?.[0]
  let duration = 0
  for (const sampler of animation?.samplers ?? []) {
    const accessor = gltf.accessors?.[sampler.input]
    if (accessor?.componentType !== 5126 || accessor.type !== 'SCALAR')
      throw new Error(`Invalid NPC animation clock: ${assetPath}`)
    if (Number.isFinite(accessor.max?.[0])) {
      duration = Math.max(duration, accessor.max[0])
    } else {
      const view = gltf.bufferViews[accessor.bufferView]
      const offset = 28 + jsonLength + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
      for (let index = 0; index < accessor.count; index++)
        duration = Math.max(duration, bytes.readFloatLE(offset + index * (view.byteStride ?? 4)))
    }
  }
  if (!(Number.isFinite(duration) && duration > 0))
    throw new Error(`Missing NPC animation duration: ${assetPath}`)
  return duration
}
