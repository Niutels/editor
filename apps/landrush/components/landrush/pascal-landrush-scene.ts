import {
  DoorNode,
  RoofNode,
  RoofSegmentNode,
  SlabNode,
  WallNode,
  WindowNode,
} from '@pascal-app/core'
import type { SceneGraph } from '@pascal-app/editor'
import type { LandrushWorldNode } from '@landrush/pascal-plugin'
import { generateLandrushIsland } from './generator'

export const LANDRUSH_SITE_ID = 'site_landrush'
export const LANDRUSH_BUILDING_ID = 'building_landrush'
export const LANDRUSH_LEVEL_ID = 'level_landrush'
export const LANDRUSH_WORLD_ID = 'landrush-world_landrush'

type PascalLandrushScene = {
  graph: SceneGraph
  world: LandrushWorldNode
}

type Point2 = { x: number; z: number }
type Parcel = LandrushWorldNode['parcels'][number]

export function createPascalLandrushScene(): PascalLandrushScene {
  const island = generateLandrushIsland({
    seed: 'pascal-landrush',
    size: { width: 100, depth: 100 },
    parcelCount: 10,
    ownerParcelIndex: 4,
    perimeterPointCount: 64,
    treeSpacing: 6.8,
  })

  const ownerParcelId = island.ownerParcel.id
  const playerStart: [number, number, number] = [
    island.ownerParcel.centroid.x,
    0,
    island.ownerParcel.centroid.z,
  ]

  const world: LandrushWorldNode = {
    object: 'node',
    id: LANDRUSH_WORLD_ID,
    type: 'landrush-world',
    name: 'Pascal Landrush World',
    parentId: LANDRUSH_LEVEL_ID,
    visible: true,
    position: [0, 0, 0],
    seed: island.seed,
    size: island.size,
    perimeter: {
      id: island.perimeter.id,
      points: [...island.perimeter.points],
      bounds: island.perimeter.bounds,
      closed: island.perimeter.closed,
    },
    parcels: island.parcels.map((parcel) => ({
      id: parcel.id,
      index: parcel.index,
      kind: parcel.kind,
      label: parcel.label,
      center: parcel.center,
      centroid: parcel.centroid,
      radius: parcel.radius,
      owner: parcel.owner,
      vertices: [...parcel.vertices],
      outline: [...parcel.outline],
      edges: parcel.edges.map((edge) => ({
        id: edge.id,
        start: edge.start,
        end: edge.end,
        control: edge.control,
        samples: [...edge.samples],
      })),
      entryPoint: parcel.entryPoint,
      fillColor: parcel.fillColor,
    })),
    ownerParcelId,
    roads: {
      nodes: island.roads.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
        position: node.position,
        parcelId: node.parcelId,
      })),
      segments: island.roads.segments.map((segment) => ({
        id: segment.id,
        kind: segment.kind,
        fromNodeId: segment.fromNodeId,
        toNodeId: segment.toNodeId,
        points: [...segment.points],
        width: segment.width,
        connectsParcelIds: [...segment.connectsParcelIds],
      })),
      sidewalks: island.roads.sidewalks.map((sidewalk) => ({
        id: sidewalk.id,
        roadSegmentId: sidewalk.roadSegmentId,
        side: sidewalk.side,
        points: [...sidewalk.points],
        width: sidewalk.width,
        connectsParcelIds: [...sidewalk.connectsParcelIds],
      })),
      adjacency: Object.fromEntries(
        Object.entries(island.roads.adjacency).map(([id, adjacent]) => [id, [...adjacent]]),
      ),
      connected: island.roads.connected,
      connectedParcelIds: [...island.roads.connectedParcelIds],
    },
    trees: island.trees.map((tree) => ({
      id: tree.id,
      kind: tree.kind,
      band: tree.band,
      position: tree.position,
      rotation: tree.rotation,
      trunkHeight: tree.trunkHeight,
      canopyRadius: tree.canopyRadius,
    })),
    playerStart,
    playerPosition: playerStart,
    playerHeading: 0,
    playerMoving: false,
    playerSpeed: 0,
    remotePlayers: [],
    renderFlags: {},
    focusParcelId: null,
    landrushMode: 'intro',
    metadata: {
      seed: island.metadata.seed,
      requestedSize: island.metadata.requestedSize,
      actualBounds: island.metadata.actualBounds,
      ownerParcelId: island.metadata.ownerParcelId,
      checks: island.metadata.checks.map((check) => ({ ...check })),
      counts: { ...island.metadata.counts },
      roadGraph: {
        connected: island.metadata.roadGraph.connected,
        reachableNodeCount: island.metadata.roadGraph.reachableNodeCount,
        totalNodeCount: island.metadata.roadGraph.totalNodeCount,
        connectedParcelIds: [...island.metadata.roadGraph.connectedParcelIds],
      },
      summary: island.metadata.summary,
      source: 'pascal-landrush',
      verificationSummary: island.metadata.summary,
    },
  }
  const parcelBuildings = createParcelBuildingNodes(world.parcels)
  world.metadata.generatedBuildingNodeIds = Object.keys(parcelBuildings.nodes)

  const graph: SceneGraph = {
    rootNodeIds: [LANDRUSH_SITE_ID],
    nodes: {
      [LANDRUSH_SITE_ID]: {
        object: 'node',
        id: LANDRUSH_SITE_ID,
        type: 'site',
        name: 'Landrush Island',
        parentId: null,
        visible: true,
        metadata: { source: 'pascal-landrush' },
        polygon: {
          type: 'polygon',
          points: island.perimeter.points.slice(0, -1).map((point) => [point.x, point.z]),
        },
        children: [LANDRUSH_BUILDING_ID],
      },
      [LANDRUSH_BUILDING_ID]: {
        object: 'node',
        id: LANDRUSH_BUILDING_ID,
        type: 'building',
        name: 'Landrush Buildable Context',
        parentId: LANDRUSH_SITE_ID,
        visible: true,
        metadata: { source: 'pascal-landrush' },
        children: [LANDRUSH_LEVEL_ID],
        position: [0, 0, 0],
        rotation: [0, 0, 0],
      },
      [LANDRUSH_LEVEL_ID]: {
        object: 'node',
        id: LANDRUSH_LEVEL_ID,
        type: 'level',
        name: 'Island Level',
        parentId: LANDRUSH_BUILDING_ID,
        visible: true,
        camera: {
          position: [58, 48, 58],
          target: [0, 0, 0],
          mode: 'perspective',
        },
        metadata: { source: 'pascal-landrush' },
        children: [LANDRUSH_WORLD_ID],
        level: 0,
      },
      [LANDRUSH_WORLD_ID]: world,
      ...parcelBuildings.nodes,
    },
  }

  return { graph, world }
}

export function ownerPropertyFromWorld(world: LandrushWorldNode) {
  const owner = world.parcels.find((parcel) => parcel.id === world.ownerParcelId)
  return {
    kind: 'polygon' as const,
    points:
      owner?.outline.map((point) => ({
        x: point.x,
        z: point.z,
      })) ?? [],
  }
}

function createParcelBuildingNodes(parcels: LandrushWorldNode['parcels']) {
  const nodes: Record<string, unknown> = {}
  const levelChildren: string[] = []

  for (const parcel of parcels) {
    if (parcel.kind === 'owner') continue

    const building = createParcelBuildingNodeSet(parcel)
    for (const node of building.nodes) {
      nodes[node.id] = node
    }
    levelChildren.push(...building.levelChildren)
  }

  return { levelChildren, nodes }
}

function createParcelBuildingNodeSet(parcel: Parcel) {
  const width = Math.max(3.8, Math.min(7.2, parcel.radius * 0.66))
  const depth = Math.max(3.4, Math.min(6.4, parcel.radius * 0.56))
  const height = 2.45
  const center = {
    x: parcel.centroid.x + (parcel.entryPoint.x - parcel.centroid.x) * 0.08,
    z: parcel.centroid.z + (parcel.entryPoint.z - parcel.centroid.z) * 0.08,
  }
  const rotation = Math.atan2(
    parcel.entryPoint.x - parcel.centroid.x,
    parcel.entryPoint.z - parcel.centroid.z,
  )
  const corners = rectangleCorners(center, width, depth, rotation)
  const slab = SlabNode.parse({
    name: `${parcel.label} parcel slab`,
    parentId: LANDRUSH_LEVEL_ID,
    visible: false,
    polygon: corners.map((point) => [point.x, point.z] as [number, number]),
    elevation: 0.09,
    metadata: { landrush: true, parcelId: parcel.id, role: 'parcel-building-slab' },
  })

  const wallInputs = [
    [corners[0]!, corners[1]!],
    [corners[1]!, corners[2]!],
    [corners[2]!, corners[3]!],
    [corners[3]!, corners[0]!],
  ] as const
  const walls = wallInputs.map(([start, end], index) =>
    WallNode.parse({
      name: `${parcel.label} wall ${index + 1}`,
      parentId: LANDRUSH_LEVEL_ID,
      start: [start.x, start.z],
      end: [end.x, end.z],
      height,
      thickness: 0.18,
      visible: false,
      metadata: { landrush: true, parcelId: parcel.id, role: 'parcel-building-wall' },
    }),
  )

  const door = DoorNode.parse({
    name: `${parcel.label} front door`,
    parentId: walls[0]!.id,
    wallId: walls[0]!.id,
    position: [wallLength(walls[0]!) / 2, 1.05, 0],
    side: 'front',
    visible: false,
    width: 0.92,
    height: 2.05,
    metadata: { landrush: true, parcelId: parcel.id, role: 'parcel-building-door' },
  })
  const frontWindow = WindowNode.parse({
    name: `${parcel.label} front window`,
    parentId: walls[0]!.id,
    wallId: walls[0]!.id,
    position: [wallLength(walls[0]!) * 0.76, 1.42, 0],
    side: 'front',
    visible: false,
    width: 0.92,
    height: 0.72,
    metadata: { landrush: true, parcelId: parcel.id, role: 'parcel-building-window' },
  })
  const rearWindow = WindowNode.parse({
    name: `${parcel.label} rear window`,
    parentId: walls[2]!.id,
    wallId: walls[2]!.id,
    position: [wallLength(walls[2]!) * 0.5, 1.42, 0],
    side: 'front',
    visible: false,
    width: 1.16,
    height: 0.78,
    metadata: { landrush: true, parcelId: parcel.id, role: 'parcel-building-window' },
  })

  const wallWithOpenings = walls.map((wall) => {
    if (wall.id === walls[0]!.id) {
      return WallNode.parse({ ...wall, children: [door.id, frontWindow.id] })
    }
    if (wall.id === walls[2]!.id) {
      return WallNode.parse({ ...wall, children: [rearWindow.id] })
    }
    return wall
  })

  const roofSegment = RoofSegmentNode.parse({
    name: `${parcel.label} roof segment`,
    parentId: null,
    width: width + 0.62,
    depth: depth + 0.62,
    wallHeight: height,
    pitch: parcel.index % 3 === 0 ? 35 : 42,
    roofType: parcel.index % 4 === 0 ? 'hip' : 'gable',
    visible: false,
    metadata: { landrush: true, parcelId: parcel.id, role: 'parcel-building-roof-segment' },
  })
  const roof = RoofNode.parse({
    name: `${parcel.label} roof`,
    parentId: LANDRUSH_LEVEL_ID,
    position: [center.x, 0, center.z],
    rotation,
    children: [roofSegment.id],
    visible: false,
    metadata: { landrush: true, parcelId: parcel.id, role: 'parcel-building-roof' },
  })
  const roofSegmentWithParent = RoofSegmentNode.parse({ ...roofSegment, parentId: roof.id })
  const nodes = [
    slab,
    ...wallWithOpenings,
    door,
    frontWindow,
    rearWindow,
    roof,
    roofSegmentWithParent,
  ]

  return {
    levelChildren: [slab.id, ...wallWithOpenings.map((wall) => wall.id), roof.id],
    nodes,
  }
}

function rectangleCorners(center: Point2, width: number, depth: number, rotation: number) {
  return [
    rotateLocalPoint(center, -width / 2, -depth / 2, rotation),
    rotateLocalPoint(center, width / 2, -depth / 2, rotation),
    rotateLocalPoint(center, width / 2, depth / 2, rotation),
    rotateLocalPoint(center, -width / 2, depth / 2, rotation),
  ]
}

function rotateLocalPoint(
  center: Point2,
  localX: number,
  localZ: number,
  rotation: number,
): Point2 {
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  return {
    x: center.x + localX * cos + localZ * sin,
    z: center.z - localX * sin + localZ * cos,
  }
}

function wallLength(wall: ReturnType<typeof WallNode.parse>) {
  return Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])
}
