import {
  rectFootprint,
  rotateFootprintPoint,
  segmentFootprint,
} from '@landrush/runtime/navigation-geometry'
import type { AnyNode, AnyNodeId, LevelNode } from '@pascal-app/core'
import {
  createLandrushBuildSpawnFootprint,
  isLandrushBuildSyncStructuralObject,
} from './landrush-build-sync'

type LandrushPoint2 = Readonly<{ x: number; z: number }>
type GrassFieldBlocker = {
  clearanceMeters: number
  featherMeters: number
  points: readonly LandrushPoint2[]
}
type LandrushIslandRoofNode = Extract<AnyNode, { type: 'roof' }>
type LandrushIslandRoofSegmentNode = Extract<AnyNode, { type: 'roof-segment' }>

export function createLandrushBuildFootprintResolver({
  buildingId: LANDRUSH_ISLAND_BUILDING_ID,
  levelId: LANDRUSH_ISLAND_LEVEL_ID,
  grassClearanceMeters: LANDRUSH_ISLAND_BUILT_GRASS_PADDING_METERS,
  grassFeatherMeters: LANDRUSH_ISLAND_BUILT_GRASS_FEATHER_METERS,
}: {
  buildingId: string
  levelId: string
  grassClearanceMeters: number
  grassFeatherMeters: number
}) {
  function createLandrushIslandBuiltGrassBlockers(
    nodes: Record<string, AnyNode>,
  ): readonly GrassFieldBlocker[] {
    const blockers: GrassFieldBlocker[] = []
    for (const node of Object.values(nodes)) {
      for (const footprint of createLandrushIslandBuildNodeFootprints(node, 0, nodes)) {
        blockers.push({
          clearanceMeters: LANDRUSH_ISLAND_BUILT_GRASS_PADDING_METERS,
          featherMeters: LANDRUSH_ISLAND_BUILT_GRASS_FEATHER_METERS,
          points: footprint,
        })
      }
    }
    return blockers
  }

  function createLandrushIslandBuildNodeFootprints(
    node: AnyNode,
    padding: number,
    nodes: Record<string, AnyNode>,
    includeHidden = false,
  ): readonly (readonly LandrushPoint2[])[] {
    const isBuildNode = includeHidden
      ? isLandrushIslandStructuralBuildObjectNode(node, nodes)
      : isLandrushIslandBuildObjectNode(node, nodes)
    if (!isBuildNode) return []
    if (node.type === 'roof') {
      return createLandrushIslandRoofBuildFootprints(node, padding, nodes, includeHidden)
    }

    const footprint = createLandrushIslandBuildNodeFootprint(node, padding, nodes, includeHidden)
    return footprint ? [footprint] : []
  }

  function createLandrushIslandRoofBuildFootprints(
    roof: LandrushIslandRoofNode,
    padding: number,
    nodes: Record<string, AnyNode>,
    includeHidden = false,
  ): readonly (readonly LandrushPoint2[])[] {
    const childIds = new Set([
      ...(roof.children ?? []),
      ...Object.values(nodes)
        .filter((node) => node.parentId === roof.id)
        .map((node) => node.id as AnyNodeId),
    ])
    const footprints: Array<readonly LandrushPoint2[]> = [...childIds].flatMap((childId) => {
      const segment = nodes[childId] as LandrushIslandRoofSegmentNode | undefined
      if (segment?.type !== 'roof-segment' || (!includeHidden && segment.visible === false))
        return []
      const overhang = segment.overhang ?? 0
      return [
        rectFootprint({
          center: rotateFootprintPoint(
            { x: segment.position[0], z: segment.position[2] },
            { x: roof.position[0], z: roof.position[2] },
            roof.rotation ?? 0,
          ),
          depth: segment.depth + overhang * 2 + padding * 2,
          rotation: (roof.rotation ?? 0) + (segment.rotation ?? 0),
          width: segment.width + overhang * 2 + padding * 2,
        }),
      ]
    })

    if (footprints.length > 0) return footprints
    return [
      rectFootprint({
        center: { x: roof.position[0], z: roof.position[2] },
        depth: 0.4 + padding * 2,
        rotation: roof.rotation ?? 0,
        width: 0.4 + padding * 2,
      }),
    ]
  }

  function createLandrushIslandBuildNodeFootprint(
    node: AnyNode,
    padding: number,
    nodes?: Record<string, AnyNode>,
    includeHidden = false,
  ): readonly LandrushPoint2[] | null {
    const isBuildNode = includeHidden
      ? isLandrushIslandStructuralBuildObjectNode(node, nodes)
      : isLandrushIslandBuildObjectNode(node, nodes)
    if (!isBuildNode) return null

    if (node.type === 'wall' || node.type === 'fence') {
      return segmentFootprint(
        { x: node.start[0], z: node.start[1] },
        { x: node.end[0], z: node.end[1] },
        (node.thickness ?? 0.18) + padding * 2,
      )
    }

    if (node.type === 'slab' || node.type === 'ceiling') {
      return node.polygon.map(([x, z]) => ({ x, z }))
    }

    if (node.type === 'spawn') {
      return createLandrushBuildSpawnFootprint(node, padding)
    }

    if (node.type === 'item') {
      if (node.asset.attachTo) return null
      const [width, , depth] = node.asset.dimensions
      return rectFootprint({
        center: { x: node.position[0], z: node.position[2] },
        depth: depth * node.scale[2] + padding * 2,
        rotation: node.rotation[1] ?? 0,
        width: width * node.scale[0] + padding * 2,
      })
    }

    if (node.type === 'column') {
      const width = node.crossSection === 'round' ? node.radius * 2 : node.width
      const depth = node.crossSection === 'round' ? node.radius * 2 : node.depth
      return rectFootprint({
        center: { x: node.position[0], z: node.position[2] },
        depth: depth + padding * 2,
        rotation: node.rotation,
        width: width + padding * 2,
      })
    }

    if (node.type === 'elevator') {
      return rectFootprint({
        center: { x: node.position[0], z: node.position[2] },
        depth: (node.shaftDepth ?? node.depth) + padding * 2,
        rotation: node.rotation,
        width: (node.shaftWidth ?? node.width) + padding * 2,
      })
    }

    if (node.type === 'stair') {
      const run = Math.max(0.8, node.stepCount * 0.28 + node.topLandingDepth)
      return rectFootprint({
        center: { x: node.position[0], z: node.position[2] },
        depth: run + padding * 2,
        rotation: node.rotation,
        width: node.width + padding * 2,
      })
    }

    if (node.type === 'shelf') {
      return rectFootprint({
        center: { x: node.position[0], z: node.position[2] },
        depth: node.depth + padding * 2,
        rotation: node.rotation[1] ?? 0,
        width: node.width + padding * 2,
      })
    }

    return null
  }

  function isLandrushIslandBuildLevelNode(
    node: AnyNode | undefined,
    nodes: Record<string, AnyNode>,
  ): node is LevelNode {
    if (node?.type !== 'level' || !node.parentId) return false
    return (
      node.parentId === LANDRUSH_ISLAND_BUILDING_ID || nodes[node.parentId]?.type === 'building'
    )
  }

  function isLandrushIslandBuildLevelId(
    levelId: AnyNodeId | string | null | undefined,
    nodes?: Record<string, AnyNode>,
  ) {
    if (!levelId) return false
    if (levelId === LANDRUSH_ISLAND_LEVEL_ID) return true
    if (!nodes) return false
    return isLandrushIslandBuildLevelNode(nodes[levelId as AnyNodeId], nodes)
  }

  function isLandrushIslandBuildObjectNode(node: AnyNode, nodes?: Record<string, AnyNode>) {
    if (node.visible === false || !isLandrushIslandStructuralBuildObjectNode(node, nodes)) {
      return false
    }
    const metadata = node.metadata as { isTransient?: boolean } | undefined
    return metadata?.isTransient !== true
  }

  function isLandrushIslandStructuralBuildObjectNode(
    node: AnyNode,
    nodes?: Record<string, AnyNode>,
  ) {
    return isLandrushBuildSyncStructuralObject(node, (parentId) =>
      isLandrushIslandBuildLevelId(parentId, nodes),
    )
  }

  return {
    createLandrushIslandBuiltGrassBlockers,
    createLandrushIslandBuildNodeFootprints,
    createLandrushIslandBuildNodeFootprint,
    isLandrushIslandBuildLevelNode,
    isLandrushIslandBuildLevelId,
    isLandrushIslandBuildObjectNode,
    isLandrushIslandStructuralBuildObjectNode,
  }
}
