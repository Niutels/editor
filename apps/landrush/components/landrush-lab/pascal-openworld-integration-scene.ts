import {
  type AnyNode,
  BuildingNode,
  DoorNode,
  LevelNode,
  RoofNode,
  RoofSegmentNode,
  SiteNode,
  SlabNode,
  StairNode,
  StairSegmentNode,
  WallNode,
  WindowNode,
} from '@pascal-app/core'
import type { SceneGraph } from '@pascal-app/editor'
import { LandrushWorldNode } from '@landrush/pascal-plugin'
import { createPascalLandrushScene } from '@/components/landrush/pascal-landrush-scene'
import type {
  PascalOpenworldIntegrationCell,
  PascalOpenworldIntegrationManifest,
} from './pascal-openworld-integration-contract'

export type {
  PascalOpenworldIntegrationCell,
  PascalOpenworldIntegrationManifest,
} from './pascal-openworld-integration-contract'
export {
  isPascalOpenworldIntegrationCell,
  PASCAL_OPENWORLD_INTEGRATION_CELLS,
} from './pascal-openworld-integration-contract'

export type PascalOpenworldIntegrationScene = {
  graph: SceneGraph
  manifest: PascalOpenworldIntegrationManifest
}

const SITE_ID = 'site_openworld-integration-lab'
const BUILDING_ID = 'building_openworld-integration-lab'
const GROUND_LEVEL_ID = 'level_openworld-integration-ground'
const UPPER_LEVEL_ID = 'level_openworld-integration-upper'
const WORLD_ID = 'landrush-world_openworld-integration-lab'

const HOUSE_WIDTH = 10
const HOUSE_DEPTH = 9
const LEVEL_HEIGHT = 3

const GROUND_SLAB_ID = 'slab_openworld-integration-ground'
const UPPER_SLAB_ID = 'slab_openworld-integration-upper'
const STAIR_ID = 'stair_openworld-integration'
const STAIR_SEGMENT_ID = 'sseg_openworld-integration'
const ROOF_ID = 'roof_openworld-integration'
const ROOF_SEGMENT_ID = 'rseg_openworld-integration'

type Point2 = { x: number; z: number }

type HouseNodes = {
  nodes: SceneGraph['nodes']
  groundChildren: string[]
  upperChildren: string[]
}

export function createPascalOpenworldIntegrationScene(
  cell: PascalOpenworldIntegrationCell,
): PascalOpenworldIntegrationScene {
  const sourceWorld = createPascalLandrushScene().world
  const ownerParcel =
    sourceWorld.parcels.find((parcel) => parcel.id === sourceWorld.ownerParcelId) ??
    sourceWorld.parcels[0]
  const houseCenter: Point2 = ownerParcel
    ? { x: ownerParcel.centroid.x, z: ownerParcel.centroid.z }
    : { x: 0, z: 0 }
  const includesHouse = cell !== 'world'
  const includesWorld = cell !== 'pascal'
  const house = includesHouse ? createHouseNodes(houseCenter) : null
  const world = LandrushWorldNode.parse({
    ...sourceWorld,
    id: WORLD_ID,
    parentId: GROUND_LEVEL_ID,
    name: 'Open-world integration fixture',
    remotePlayers: [],
    metadata: {
      ...sourceWorld.metadata,
      generatedBuildingNodeIds: [],
      source: 'pascal-openworld-integration-lab',
      networkEnabled: false,
    },
  })

  const groundChildren = [...(includesWorld ? [world.id] : []), ...(house?.groundChildren ?? [])]
  const buildingChildren = [GROUND_LEVEL_ID, ...(includesHouse ? [UPPER_LEVEL_ID] : [])]
  const site = SiteNode.parse({
    id: SITE_ID,
    name: 'Pascal open-world integration sidecar',
    parentId: null,
    polygon: {
      type: 'polygon',
      points: sourceWorld.perimeter.points.slice(0, -1).map((point) => [point.x, point.z]),
    },
    children: [BUILDING_ID],
    metadata: { source: 'pascal-openworld-integration-lab' },
  })
  const building = BuildingNode.parse({
    id: BUILDING_ID,
    name: 'Integration host building',
    parentId: site.id,
    children: buildingChildren,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    metadata: { source: 'pascal-openworld-integration-lab' },
  })
  const groundLevel = LevelNode.parse({
    id: GROUND_LEVEL_ID,
    name: 'Ground floor',
    parentId: building.id,
    children: groundChildren,
    level: 0,
    camera: {
      mode: 'perspective',
      position: [houseCenter.x + 25, 19, houseCenter.z + 27],
      target: [houseCenter.x, 2.5, houseCenter.z],
    },
    metadata: { source: 'pascal-openworld-integration-lab' },
  })
  const upperLevel = includesHouse
    ? LevelNode.parse({
        id: UPPER_LEVEL_ID,
        name: 'Upper floor',
        parentId: building.id,
        children: house?.upperChildren ?? [],
        level: 1,
        metadata: { source: 'pascal-openworld-integration-lab' },
      })
    : null

  const nodes = {
    [site.id]: site,
    [building.id]: building,
    [groundLevel.id]: groundLevel,
    ...(upperLevel ? { [upperLevel.id]: upperLevel } : {}),
    ...(includesWorld ? { [world.id]: world } : {}),
    ...(house?.nodes ?? {}),
  } as SceneGraph['nodes']
  const constructionNodeCount = (Object.values(nodes) as AnyNode[]).filter((node) =>
    ['slab', 'wall', 'door', 'window', 'stair', 'stair-segment', 'roof', 'roof-segment'].includes(
      node.type,
    ),
  ).length

  return {
    graph: { rootNodeIds: [site.id], nodes },
    manifest: {
      buildCount: includesHouse ? 1 : 0,
      buildNodeCount: constructionNodeCount,
      cell,
      source: 'sidecar',
      networkEnabled: false,
      persistenceNamespace: 'pascal-openworld-integration-lab-v1',
      rendererContract: 'one-pascal-viewer',
      seed: sourceWorld.seed,
      worldNodeCount: includesWorld ? 1 : 0,
      constructionNodeCount,
      levelCount: includesHouse ? 2 : 1,
      ownershipCount: 0,
      floorAreaSquareMeters: includesHouse ? HOUSE_WIDTH * HOUSE_DEPTH : 0,
      houseCenter: [houseCenter.x, 2.5, houseCenter.z],
    },
  }
}

function createHouseNodes(center: Point2): HouseNodes {
  const minX = center.x - HOUSE_WIDTH / 2
  const maxX = center.x + HOUSE_WIDTH / 2
  const minZ = center.z - HOUSE_DEPTH / 2
  const maxZ = center.z + HOUSE_DEPTH / 2
  const footprint: [number, number][] = [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ]

  const groundDoorId = 'door_openworld-integration-ground-front'
  const groundFrontWindowId = 'window_openworld-integration-ground-front'
  const groundRearWindowId = 'window_openworld-integration-ground-rear'
  const upperFrontWindowLeftId = 'window_openworld-integration-upper-front-left'
  const upperFrontWindowRightId = 'window_openworld-integration-upper-front-right'
  const upperRearWindowId = 'window_openworld-integration-upper-rear'

  const groundWalls = createExteriorWalls({
    center,
    levelId: GROUND_LEVEL_ID,
    prefix: 'ground',
    frontChildren: [groundDoorId, groundFrontWindowId],
    rearChildren: [groundRearWindowId],
  })
  const upperWalls = createExteriorWalls({
    center,
    levelId: UPPER_LEVEL_ID,
    prefix: 'upper',
    frontChildren: [upperFrontWindowLeftId, upperFrontWindowRightId],
    rearChildren: [upperRearWindowId],
  })
  const [groundFrontWall, , groundRearWall] = groundWalls
  const [upperFrontWall, , upperRearWall] = upperWalls

  const groundDoor = DoorNode.parse({
    id: groundDoorId,
    name: 'Ground-floor entrance',
    parentId: groundFrontWall?.id,
    wallId: groundFrontWall?.id,
    position: [HOUSE_WIDTH * 0.33, 1.05, 0],
    side: 'front',
    width: 1.05,
    height: 2.1,
    metadata: { source: 'pascal-openworld-integration-lab' },
  })
  const groundFrontWindow = WindowNode.parse({
    id: groundFrontWindowId,
    name: 'Ground-floor front window',
    parentId: groundFrontWall?.id,
    wallId: groundFrontWall?.id,
    position: [HOUSE_WIDTH * 0.72, 1.45, 0],
    side: 'front',
    width: 1.7,
    height: 1.25,
    columnRatios: [0.5, 0.5],
    metadata: { source: 'pascal-openworld-integration-lab' },
  })
  const groundRearWindow = WindowNode.parse({
    id: groundRearWindowId,
    name: 'Ground-floor rear window',
    parentId: groundRearWall?.id,
    wallId: groundRearWall?.id,
    position: [HOUSE_WIDTH * 0.5, 1.45, 0],
    side: 'front',
    width: 2.2,
    height: 1.25,
    columnRatios: [0.5, 0.5],
    metadata: { source: 'pascal-openworld-integration-lab' },
  })
  const upperFrontWindowLeft = WindowNode.parse({
    id: upperFrontWindowLeftId,
    name: 'Upper-floor front-left window',
    parentId: upperFrontWall?.id,
    wallId: upperFrontWall?.id,
    position: [HOUSE_WIDTH * 0.28, 1.45, 0],
    side: 'front',
    width: 1.55,
    height: 1.25,
    metadata: { source: 'pascal-openworld-integration-lab' },
  })
  const upperFrontWindowRight = WindowNode.parse({
    id: upperFrontWindowRightId,
    name: 'Upper-floor front-right window',
    parentId: upperFrontWall?.id,
    wallId: upperFrontWall?.id,
    position: [HOUSE_WIDTH * 0.72, 1.45, 0],
    side: 'front',
    width: 1.55,
    height: 1.25,
    metadata: { source: 'pascal-openworld-integration-lab' },
  })
  const upperRearWindow = WindowNode.parse({
    id: upperRearWindowId,
    name: 'Upper-floor rear window',
    parentId: upperRearWall?.id,
    wallId: upperRearWall?.id,
    position: [HOUSE_WIDTH * 0.5, 1.45, 0],
    side: 'front',
    width: 2.2,
    height: 1.25,
    columnRatios: [0.5, 0.5],
    metadata: { source: 'pascal-openworld-integration-lab' },
  })

  const groundInteriorWall = WallNode.parse({
    id: 'wall_openworld-integration-ground-interior',
    name: 'Ground-floor room divider',
    parentId: GROUND_LEVEL_ID,
    start: [center.x + 1.5, minZ],
    end: [center.x + 1.5, center.z + 1.4],
    height: LEVEL_HEIGHT,
    thickness: 0.16,
    metadata: { source: 'pascal-openworld-integration-lab' },
  })
  const upperInteriorWall = WallNode.parse({
    id: 'wall_openworld-integration-upper-interior',
    name: 'Upper-floor room divider',
    parentId: UPPER_LEVEL_ID,
    start: [center.x - 1.2, minZ],
    end: [center.x - 1.2, center.z + 1.5],
    height: LEVEL_HEIGHT,
    thickness: 0.16,
    metadata: { source: 'pascal-openworld-integration-lab' },
  })
  const groundSlab = SlabNode.parse({
    id: GROUND_SLAB_ID,
    name: '90 m² ground floor',
    parentId: GROUND_LEVEL_ID,
    polygon: footprint,
    elevation: 0.14,
    metadata: {
      source: 'pascal-openworld-integration-lab',
      floorAreaSquareMeters: HOUSE_WIDTH * HOUSE_DEPTH,
    },
  })
  const upperSlab = SlabNode.parse({
    id: UPPER_SLAB_ID,
    name: '90 m² upper floor',
    parentId: UPPER_LEVEL_ID,
    polygon: footprint,
    elevation: 0.14,
    metadata: {
      source: 'pascal-openworld-integration-lab',
      floorAreaSquareMeters: HOUSE_WIDTH * HOUSE_DEPTH,
    },
  })
  const stairSegment = StairSegmentNode.parse({
    id: STAIR_SEGMENT_ID,
    name: 'Ground-to-upper stair flight',
    parentId: STAIR_ID,
    position: [0, 0, 0],
    width: 1.15,
    length: 4.2,
    height: LEVEL_HEIGHT,
    stepCount: 16,
    fillToFloor: false,
    metadata: { source: 'pascal-openworld-integration-lab' },
  })
  const stair = StairNode.parse({
    id: STAIR_ID,
    name: 'Ground-to-upper stair',
    parentId: GROUND_LEVEL_ID,
    position: [center.x - 2.4, 0.14, center.z + 1.6],
    rotation: Math.PI,
    fromLevelId: GROUND_LEVEL_ID,
    toLevelId: UPPER_LEVEL_ID,
    slabOpeningMode: 'destination',
    width: 1.15,
    totalRise: LEVEL_HEIGHT,
    stepCount: 16,
    railingMode: 'both',
    children: [stairSegment.id],
    metadata: { source: 'pascal-openworld-integration-lab' },
  })
  const roofSegment = RoofSegmentNode.parse({
    id: ROOF_SEGMENT_ID,
    name: 'House gable roof segment',
    parentId: ROOF_ID,
    width: HOUSE_WIDTH + 0.7,
    depth: HOUSE_DEPTH + 0.7,
    wallHeight: 0,
    pitch: 34,
    roofType: 'gable',
    overhang: 0.35,
    metadata: { source: 'pascal-openworld-integration-lab' },
  })
  const roof = RoofNode.parse({
    id: ROOF_ID,
    name: 'House roof',
    parentId: UPPER_LEVEL_ID,
    position: [center.x, LEVEL_HEIGHT, center.z],
    rotation: 0,
    children: [roofSegment.id],
    metadata: { source: 'pascal-openworld-integration-lab' },
  })

  const allNodes = [
    groundSlab,
    ...groundWalls,
    groundInteriorWall,
    groundDoor,
    groundFrontWindow,
    groundRearWindow,
    stair,
    stairSegment,
    upperSlab,
    ...upperWalls,
    upperInteriorWall,
    upperFrontWindowLeft,
    upperFrontWindowRight,
    upperRearWindow,
    roof,
    roofSegment,
  ]

  return {
    nodes: Object.fromEntries(allNodes.map((node) => [node.id, node])) as SceneGraph['nodes'],
    groundChildren: [
      groundSlab.id,
      ...groundWalls.map((wall) => wall.id),
      groundInteriorWall.id,
      stair.id,
    ],
    upperChildren: [
      upperSlab.id,
      ...upperWalls.map((wall) => wall.id),
      upperInteriorWall.id,
      roof.id,
    ],
  }
}

function createExteriorWalls({
  center,
  levelId,
  prefix,
  frontChildren,
  rearChildren,
}: {
  center: Point2
  levelId: string
  prefix: 'ground' | 'upper'
  frontChildren: string[]
  rearChildren: string[]
}) {
  const minX = center.x - HOUSE_WIDTH / 2
  const maxX = center.x + HOUSE_WIDTH / 2
  const minZ = center.z - HOUSE_DEPTH / 2
  const maxZ = center.z + HOUSE_DEPTH / 2
  const inputs = [
    { suffix: 'front', start: [minX, minZ], end: [maxX, minZ], children: frontChildren },
    { suffix: 'right', start: [maxX, minZ], end: [maxX, maxZ], children: [] },
    { suffix: 'rear', start: [maxX, maxZ], end: [minX, maxZ], children: rearChildren },
    { suffix: 'left', start: [minX, maxZ], end: [minX, minZ], children: [] },
  ] as const

  return inputs.map((input) =>
    WallNode.parse({
      id: `wall_openworld-integration-${prefix}-${input.suffix}`,
      name: `${prefix} ${input.suffix} wall`,
      parentId: levelId,
      start: input.start,
      end: input.end,
      height: LEVEL_HEIGHT,
      thickness: 0.2,
      children: input.children,
      metadata: { source: 'pascal-openworld-integration-lab' },
    }),
  )
}
