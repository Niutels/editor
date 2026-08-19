import {
  createPascalWaterLandSurface as createLandrushIslandLandSurface,
  createPascalWaterSmoothedPerimeter as createLandrushIslandSmoothedPerimeter,
  type PascalWaterLandSurface as LandrushIslandLandSurface,
  type PascalWaterNode as LandrushIslandNode,
  type LandrushLayoutNode,
  LandrushLayoutNode as LandrushLayoutNodeSchema,
  type LandrushWaterSurfaceParameters,
  type LandrushWorldNode,
} from '@landrush/pascal-plugin'
import { openPointRing } from '@landrush/runtime'
import type { SceneGraph } from '@pascal-app/editor'
import type { LandrushPoint2, LandrushRoadSegment, LandrushVec3 } from '@/components/landrush/types'
import { NATURAL_ROAD_STYLE } from './natural-road-network-layer'
import {
  allocateParcels,
  type ParcelAllocationOptions,
  type ParcelAllocationParcel,
  type ParcelAllocationResult,
  polygonCentroid,
} from './parcel-allocation'
import {
  DEFAULT_PARCEL_STREET_WIDTH_METERS,
  generateParcelEdgeStreets,
  PARCEL_STREET_CURB_EXTRA_WIDTH_METERS,
  PARCEL_STREET_SHOULDER_EXTRA_WIDTH_METERS,
  type ParcelStreetNetwork,
  type ParcelStreetSegment,
} from './parcel-streets'
import type { WaterFieldParameters } from './water-field-texture'
import {
  generateWaterLabIsland,
  type IslandElevationParameters,
  type WaterLabIslandParameters,
} from './water-lab-parameters'
import { WATER_PLANE_SIZE } from './water-material'

const LANDRUSH_ISLAND_SITE_ID = 'site_landrush-island-debug'
export const LANDRUSH_ISLAND_BUILDING_ID = 'building_landrush-island-debug'
export const LANDRUSH_ISLAND_LEVEL_ID = 'level_landrush-island-debug'
export const LANDRUSH_ISLAND_NODE_ID = 'pascal-water_debug-water'
export const PASCAL_MULTIPLAYER_ISLAND_LAYOUT_NODE_ID =
  'landrush-layout_pascal-multiplayer-island-layout'
const LANDRUSH_ISLAND_CAMERA_POSITION = [88, 86, 94] as const
export const LANDRUSH_ISLAND_CAMERA_TARGET = [0, 0, 0] as const
const LANDRUSH_ISLAND_CAMERA_ZOOM = 7.8
const LANDRUSH_ISLAND_PARCEL_PARAMETERS = {
  maxEdges: 15,
  parcelCount: 12,
  shoreSetbackMeters: 0,
  simplifyToleranceMeters: 0.18,
  splitJitter: 0.12,
  squareness: 0.82,
} as const
const LANDRUSH_ISLAND_PARCEL_OVERLAY_COLOR = '#e0a35a'
const LANDRUSH_ISLAND_DIRT_ROAD_WIDTH_METERS =
  (DEFAULT_PARCEL_STREET_WIDTH_METERS +
    PARCEL_STREET_SHOULDER_EXTRA_WIDTH_METERS +
    PARCEL_STREET_CURB_EXTRA_WIDTH_METERS) /
  2.35
const LANDRUSH_ISLAND_PARCEL_ROAD_RESERVE_METERS = Math.max(
  NATURAL_ROAD_STYLE.carriageway.widthMeters / 2 +
    NATURAL_ROAD_STYLE.sidewalk.widthMeters +
    NATURAL_ROAD_STYLE.sidewalk.grassClearanceMeters,
  NATURAL_ROAD_STYLE.sidewalk.perimeterThicknessMeters +
    NATURAL_ROAD_STYLE.sidewalk.grassClearanceMeters,
)
const LANDRUSH_ISLAND_VISUAL_PLAYER_GROUND_Y = 0.04

export type LandrushIslandClientExperience = 'pascal-multiplayer-island'
export type LandrushIslandFieldDebugMode = 'cached-worker'
type LandrushIslandLayout = LandrushLayoutNode
type LandrushIslandLayoutNodeKind = LandrushIslandLayout['type']
type LandrushIsland = ReturnType<typeof generateWaterLabIsland>
type LandrushIslandPerimeter = LandrushIslandNode['perimeter']

type LandrushIslandExperienceConfig = {
  debugSource: LandrushIslandClientExperience
  layoutNodeId: string
  layoutNodeKind: LandrushIslandLayoutNodeKind
  layoutNodeMetadataSource: string
  layoutNodeName: string
  projectId: string
}

export const LANDRUSH_ISLAND_EXPERIENCE_CONFIGS = {
  'pascal-multiplayer-island': {
    debugSource: 'pascal-multiplayer-island',
    layoutNodeId: PASCAL_MULTIPLAYER_ISLAND_LAYOUT_NODE_ID,
    layoutNodeKind: 'landrush-layout',
    layoutNodeMetadataSource: 'pascal-multiplayer-island-layout',
    layoutNodeName: 'Pascal Multiplayer Island Layout',
    projectId: 'pascal-multiplayer-island',
  },
} satisfies Record<LandrushIslandClientExperience, LandrushIslandExperienceConfig>

export function createLandrushIslandViewerLandSurface(
  surface: LandrushIslandLandSurface,
): LandrushIslandLandSurface {
  const elevationOffset = surface.grassSurfaceElevation
  return {
    ...surface,
    grassSurfaceElevation: 0,
    plateauElevation: surface.plateauElevation - elevationOffset,
  }
}

export function createLandrushIslandGrassRoadSegments(
  segments: LandrushWorldNode['roads']['segments'],
): readonly LandrushRoadSegment[] {
  return segments.map((segment) => ({
    connectsParcelIds: segment.connectsParcelIds,
    fromNodeId: segment.fromNodeId,
    id: `landrush-island-grass-${segment.id}`,
    kind: segment.kind === 'driveway' ? 'driveway' : 'spine',
    points: segment.points,
    r3fPoints: segment.points.map((point) => [point.x, 0, point.z] satisfies LandrushVec3),
    toNodeId: segment.toNodeId,
    width: segment.width,
  }))
}

export function createLandrushIslandPerimeter(island: LandrushIsland): LandrushIslandPerimeter {
  return {
    bounds: island.perimeter.bounds,
    closed: island.perimeter.closed,
    points: [...island.perimeter.points],
  }
}

export function createLandrushIslandNodeRenderSignature(node: LandrushIslandNode) {
  return JSON.stringify({
    elevationParameters: node.elevationParameters,
    fieldParameters: node.fieldParameters,
    maskLandWater: node.maskLandWater,
    materialParameters: node.materialParameters,
    perimeter: node.perimeter,
    planeSize: node.planeSize,
    position: node.position,
    showDepthReference: node.showDepthReference,
    terrainFieldResolution: node.terrainFieldResolution,
  })
}

export function createLandrushIslandNode({
  elevationParameters,
  fieldParameters,
  materialParameters,
  perimeter,
  profilePlainWaterMaterial,
  showDepthReference,
  terrainFieldResolution,
  waterFieldDebugMode,
  waterLabSeed,
}: {
  elevationParameters: IslandElevationParameters
  fieldParameters: WaterFieldParameters
  materialParameters: LandrushWaterSurfaceParameters
  perimeter: LandrushIslandPerimeter
  profilePlainWaterMaterial?: boolean
  showDepthReference: boolean
  terrainFieldResolution: number
  waterFieldDebugMode?: LandrushIslandFieldDebugMode
  waterLabSeed: string
}) {
  const landSurface = createLandrushIslandLandSurface({
    elevationParameters,
    shorelinePoints: perimeter.points,
    waterPlaneSize: WATER_PLANE_SIZE,
  })
  const waterNode: LandrushIslandNode = {
    object: 'node',
    id: LANDRUSH_ISLAND_NODE_ID as never,
    type: 'pascal-water',
    name: 'Landrush Island Water',
    parentId: LANDRUSH_ISLAND_LEVEL_ID,
    visible: true,
    position: [0, -landSurface.grassSurfaceElevation, 0],
    planeSize: WATER_PLANE_SIZE,
    perimeter,
    fieldParameters,
    elevationParameters,
    materialParameters: {
      ...materialParameters,
      depthExponent: fieldParameters.depthExponent,
      depthNoiseFrequency: fieldParameters.depthNoiseFrequency,
      depthNoiseStrength: fieldParameters.depthNoiseStrength,
      depthReach: fieldParameters.depthReach,
      edgeFadeDistance: fieldParameters.edgeFadeDistance,
    } satisfies Partial<LandrushWaterSurfaceParameters>,
    showDepthReference,
    terrainFieldResolution,
    maskLandWater: false,
    metadata: {
      grassSurfaceElevation: landSurface.grassSurfaceElevation,
      ...(profilePlainWaterMaterial ? { profilePlainWaterMaterial: true } : {}),
      source: 'landrush-island-debug',
      ...(waterFieldDebugMode ? { waterFieldDebugMode } : {}),
      waterLabSeed,
    },
  }

  return { waterNode }
}

export function createLandrushIslandLayoutNode({
  allocation,
  island,
  landSurface,
  layoutConfig,
}: {
  allocation: ParcelAllocationResult
  island: LandrushIsland
  landSurface: LandrushIslandLandSurface
  layoutConfig: LandrushIslandExperienceConfig
}): LandrushIslandLayout {
  const streetNetwork = generateParcelEdgeStreets(allocation, {
    loopiness: 0,
    roadWidthMeters: LANDRUSH_ISLAND_DIRT_ROAD_WIDTH_METERS,
    seed: `${island.seed}:world-streets:${LANDRUSH_ISLAND_PARCEL_PARAMETERS.parcelCount}`,
  })
  const perimeterPoints = openPointRing(landSurface.grassSurfacePoints)
  const bounds = boundsForPoints(perimeterPoints)
  const center = polygonCentroid(perimeterPoints)
  const roadNodes = createLandrushIslandRoadNodes(streetNetwork)
  const roadSegments = streetNetwork.segments.map((segment) =>
    createLandrushIslandRoadSegment(segment),
  )
  const layoutNode = {
    object: 'node',
    id: layoutConfig.layoutNodeId as never,
    type: layoutConfig.layoutNodeKind,
    name: layoutConfig.layoutNodeName,
    parentId: LANDRUSH_ISLAND_LEVEL_ID,
    visible: true,
    position: [0, 0, 0],
    seed: island.seed,
    size: { width: WATER_PLANE_SIZE, depth: WATER_PLANE_SIZE },
    perimeter: {
      bounds,
      closed: true,
      id: 'world-multiplayer-grass-surface',
      points: closedPointRing(perimeterPoints),
    },
    parcels: allocation.parcels.map(createLandrushIslandParcel),
    ownerParcelId: '',
    roads: {
      adjacency: createLandrushIslandRoadAdjacency(roadSegments),
      connected: streetNetwork.roadConnected,
      connectedParcelIds: [...streetNetwork.connectedParcelIds],
      nodes: roadNodes,
      segments: roadSegments,
      sidewalks: [],
    },
    trees: [],
    playerStart: [center.x, LANDRUSH_ISLAND_VISUAL_PLAYER_GROUND_Y, center.z],
    metadata: {
      actualBounds: bounds,
      checks: [
        {
          check: 'world-multiplayer parcel allocation',
          pass: allocation.parcels.length === LANDRUSH_ISLAND_PARCEL_PARAMETERS.parcelCount,
          value: allocation.parcels.length,
        },
        {
          check: 'world-multiplayer dirt edge paths',
          pass: streetNetwork.segments.length > 0,
          value: streetNetwork.segments.length,
        },
      ],
      counts: {
        parcels: allocation.parcels.length,
        perimeterPoints: perimeterPoints.length,
        roadNodes: roadNodes.length,
        roadSegments: roadSegments.length,
        sidewalks: 0,
        trees: 0,
      },
      ownerParcelId: '',
      requestedSize: island.size,
      roadGraph: {
        connected: streetNetwork.roadConnected,
        connectedParcelIds: [...streetNetwork.connectedParcelIds],
        reachableNodeCount: roadNodes.length,
        totalNodeCount: roadNodes.length,
      },
      seed: island.seed,
      source: layoutConfig.layoutNodeMetadataSource,
      summary: `World multiplayer layout: ${allocation.parcels.length} parcels, ${streetNetwork.segments.length} dirt edge paths.`,
      verificationSummary:
        'Generated from the same smoothed water island, parcel allocator, and dirt-copy edge street path used by world-multiplayer.',
    },
  }

  return LandrushLayoutNodeSchema.parse(layoutNode)
}

export function createLandrushIslandSceneGraph(options: {
  elevationParameters: IslandElevationParameters
  fieldParameters: WaterFieldParameters
  islandParameters: WaterLabIslandParameters
  layoutConfig: LandrushIslandExperienceConfig
  materialParameters: LandrushWaterSurfaceParameters
  omitWaterNode?: boolean
  profilePlainWaterMaterial?: boolean
  showDepthReference: boolean
  terrainFieldResolution: number
  waterFieldDebugMode?: LandrushIslandFieldDebugMode
}): {
  landrushLayoutNode: LandrushIslandLayout
  sceneGraph: SceneGraph
  waterNode: LandrushIslandNode
} {
  const island = generateWaterLabIsland(options.islandParameters)
  const landSurface = createLandrushIslandLandSurface({
    elevationParameters: options.elevationParameters,
    shorelinePoints: createLandrushIslandSmoothedPerimeter(island.perimeter.points),
    waterPlaneSize: WATER_PLANE_SIZE,
  })
  const { waterNode } = createLandrushIslandNode({
    elevationParameters: options.elevationParameters,
    fieldParameters: options.fieldParameters,
    materialParameters: options.materialParameters,
    perimeter: createLandrushIslandPerimeter(island),
    profilePlainWaterMaterial: options.profilePlainWaterMaterial,
    showDepthReference: options.showDepthReference,
    terrainFieldResolution: options.terrainFieldResolution,
    waterFieldDebugMode: options.waterFieldDebugMode,
    waterLabSeed: island.seed,
  })
  const landrushLayoutNode = createLandrushIslandLayoutNode({
    allocation: allocateParcels(
      landSurface.grassSurfacePoints,
      createLandrushIslandParcelOptions(island.seed),
    ),
    island,
    landSurface,
    layoutConfig: options.layoutConfig,
  })
  const levelChildren = options.omitWaterNode
    ? [landrushLayoutNode.id]
    : [waterNode.id, landrushLayoutNode.id]
  const sitePolygonPoints = openPointRing(landSurface.grassSurfacePoints).map(
    (point) => [point.x, point.z] as [number, number],
  )
  const level = {
    object: 'node',
    id: LANDRUSH_ISLAND_LEVEL_ID,
    type: 'level',
    name: 'Landrush Island Level',
    parentId: LANDRUSH_ISLAND_BUILDING_ID,
    visible: true,
    camera: {
      mode: 'orthographic',
      position: [...LANDRUSH_ISLAND_CAMERA_POSITION],
      target: [...LANDRUSH_ISLAND_CAMERA_TARGET],
      zoom: LANDRUSH_ISLAND_CAMERA_ZOOM,
    },
    children: levelChildren,
    level: 0,
    metadata: { source: 'landrush-island-debug' },
  }

  return {
    landrushLayoutNode,
    waterNode,
    sceneGraph: {
      rootNodeIds: [LANDRUSH_ISLAND_SITE_ID],
      nodes: {
        [LANDRUSH_ISLAND_SITE_ID]: {
          object: 'node',
          id: LANDRUSH_ISLAND_SITE_ID,
          type: 'site',
          name: 'Landrush Island Site',
          parentId: null,
          visible: true,
          metadata: { source: 'landrush-island-debug' },
          polygon: {
            points: sitePolygonPoints,
            type: 'polygon',
          },
          children: [LANDRUSH_ISLAND_BUILDING_ID],
        },
        [LANDRUSH_ISLAND_BUILDING_ID]: {
          object: 'node',
          id: LANDRUSH_ISLAND_BUILDING_ID,
          type: 'building',
          name: 'Landrush Island Context',
          parentId: LANDRUSH_ISLAND_SITE_ID,
          visible: true,
          metadata: { source: 'landrush-island-debug' },
          children: [LANDRUSH_ISLAND_LEVEL_ID],
          position: [0, 0, 0],
          rotation: [0, 0, 0],
        },
        [LANDRUSH_ISLAND_LEVEL_ID]: level,
        [landrushLayoutNode.id]: landrushLayoutNode,
        ...(options.omitWaterNode ? {} : { [waterNode.id]: waterNode }),
      },
    },
  }
}

export function createLandrushIslandParcelOptions(seed: string): ParcelAllocationOptions {
  return {
    count: LANDRUSH_ISLAND_PARCEL_PARAMETERS.parcelCount,
    maxEdges: LANDRUSH_ISLAND_PARCEL_PARAMETERS.maxEdges,
    roadReserveMeters: LANDRUSH_ISLAND_PARCEL_ROAD_RESERVE_METERS,
    seed: `${seed}:world-parcels:${LANDRUSH_ISLAND_PARCEL_PARAMETERS.parcelCount}`,
    shoreSetbackMeters: LANDRUSH_ISLAND_PARCEL_PARAMETERS.shoreSetbackMeters,
    simplifyToleranceMeters: LANDRUSH_ISLAND_PARCEL_PARAMETERS.simplifyToleranceMeters,
    splitJitter: LANDRUSH_ISLAND_PARCEL_PARAMETERS.splitJitter,
    squareness: LANDRUSH_ISLAND_PARCEL_PARAMETERS.squareness,
  }
}

export function createLandrushIslandParcelOwnershipWorldId(options: ParcelAllocationOptions) {
  // Road reserve changes usable acreage without changing the cadastral partition or its owners.
  return [
    'landrush-world',
    'landrush-island',
    options.seed,
    options.count,
    options.maxEdges,
    options.shoreSetbackMeters,
    options.simplifyToleranceMeters,
    options.splitJitter,
    options.squareness,
  ]
    .join(':')
    .replace(/[^a-zA-Z0-9._:-]/g, '-')
    .slice(0, 240)
}

function createLandrushIslandParcel(
  parcel: ParcelAllocationParcel,
): LandrushWorldNode['parcels'][number] {
  return {
    center: parcel.centroid,
    centroid: parcel.centroid,
    edges: parcel.points.map((start, index) => {
      const end = parcel.points[(index + 1) % parcel.points.length] ?? start
      const control = midpoint2(start, end)
      return {
        control,
        end,
        id: `${parcel.id}-edge-${index + 1}`,
        samples: [start, control, end],
        start,
      }
    }),
    entryPoint: parcel.centroid,
    fillColor: LANDRUSH_ISLAND_PARCEL_OVERLAY_COLOR,
    id: parcel.id,
    index: parcel.index,
    kind: 'neighbor',
    label: `Parcel ${parcel.index + 1}`,
    outline: [...parcel.points],
    owner: {
      accentColor: LANDRUSH_ISLAND_PARCEL_OVERLAY_COLOR,
      id: 'unclaimed',
      label: 'Unclaimed',
    },
    radius: Math.sqrt(Math.max(0.001, parcel.area) / Math.PI),
    vertices: [...parcel.points],
  }
}

function createLandrushIslandRoadNodes(network: ParcelStreetNetwork) {
  const nodes = new Map<string, LandrushWorldNode['roads']['nodes'][number]>()

  for (const segment of network.segments) {
    const start = segment.points[0]
    const end = segment.points.at(-1)
    if (start) {
      nodes.set(roadNodeId(start), {
        id: roadNodeId(start),
        kind: 'spine',
        position: start,
      })
    }
    if (end) {
      nodes.set(roadNodeId(end), {
        id: roadNodeId(end),
        kind: 'spine',
        position: end,
      })
    }
  }

  return [...nodes.values()]
}

function createLandrushIslandRoadSegment(
  segment: ParcelStreetSegment,
): LandrushWorldNode['roads']['segments'][number] {
  const start = segment.points[0] ?? { x: 0, z: 0 }
  const end = segment.points.at(-1) ?? start
  return {
    connectsParcelIds: [...segment.parcelIds],
    fromNodeId: roadNodeId(start),
    id: `world-multiplayer-${segment.id}`,
    kind: 'spine',
    points: [...segment.points],
    toNodeId: roadNodeId(end),
    width: segment.width,
  }
}

function createLandrushIslandRoadAdjacency(
  segments: readonly LandrushWorldNode['roads']['segments'][number][],
) {
  const adjacency: Record<string, string[]> = {}

  for (const segment of segments) {
    adjacency[segment.fromNodeId] ??= []
    adjacency[segment.toNodeId] ??= []
    adjacency[segment.fromNodeId]!.push(segment.toNodeId)
    adjacency[segment.toNodeId]!.push(segment.fromNodeId)
  }

  return adjacency
}

function roadNodeId(point: LandrushPoint2) {
  return `layout-road-${Math.round(point.x * 100)}-${Math.round(point.z * 100)}`
}

export function boundsForPoints(
  points: readonly LandrushPoint2[],
): LandrushWorldNode['perimeter']['bounds'] {
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const point of points) {
    minX = Math.min(minX, point.x)
    minZ = Math.min(minZ, point.z)
    maxX = Math.max(maxX, point.x)
    maxZ = Math.max(maxZ, point.z)
  }

  if (!Number.isFinite(minX)) {
    return { depth: 0, maxX: 0, maxZ: 0, minX: 0, minZ: 0, width: 0 }
  }

  return {
    depth: maxZ - minZ,
    maxX,
    maxZ,
    minX,
    minZ,
    width: maxX - minX,
  }
}

function closedPointRing(points: readonly LandrushPoint2[]) {
  const ring = openPointRing(points)
  const first = ring[0]
  const last = ring.at(-1)
  if (!first) return ring
  if (last && areSamePoint(first, last)) return ring
  return [...ring, first]
}

function areSamePoint(first: LandrushPoint2, second: LandrushPoint2) {
  return Math.abs(first.x - second.x) <= 0.001 && Math.abs(first.z - second.z) <= 0.001
}

function midpoint2(first: LandrushPoint2, second: LandrushPoint2): LandrushPoint2 {
  return {
    x: (first.x + second.x) / 2,
    z: (first.z + second.z) / 2,
  }
}
