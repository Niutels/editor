import type { LandrushIslandAiNavigationSnapshot } from '@landrush/pascal-host/zombie-game-navigation'
import type { LandrushIslandAmbientNavigationObstacle } from '@landrush/runtime/landrush-island-ambient-navigation'
import type { LandrushNavigationPoint2 as LandrushPoint2 } from '@landrush/runtime/navigation-geometry'
import type { ZombieEscapeCollisionCircleSource } from '@landrush/zombie-gameplay/zombie-escape-collision-world'

const LANDRUSH_ISLAND_AMBIENT_ROUND_CAP_SEGMENTS = 8

export function createLandrushIslandPalmNavigationObstacles(
  circles: readonly ZombieEscapeCollisionCircleSource[],
  agentRadius: number,
) {
  return circles.map<LandrushIslandAmbientNavigationObstacle>((circle) => {
    const radius = circle.radius + agentRadius
    return {
      id: circle.objectId ?? circle.id,
      points: [
        { x: circle.x - radius, z: circle.z - radius },
        { x: circle.x + radius, z: circle.z - radius },
        { x: circle.x + radius, z: circle.z + radius },
        { x: circle.x - radius, z: circle.z + radius },
      ],
    }
  })
}

export type LandrushIslandAmbientSemanticObstacleInput = Readonly<{
  agentRadius: number
  groundY: number
  maximumAgentHeight?: number
  snapshot: LandrushIslandAiNavigationSnapshot
}>

export function createLandrushIslandAmbientSemanticNavigationObstacles({
  agentRadius,
  groundY,
  maximumAgentHeight = 2.2,
  snapshot,
}: LandrushIslandAmbientSemanticObstacleInput) {
  const obstacles: LandrushIslandAmbientNavigationObstacle[] = []
  const minimumBlockingY = groundY + 0.08
  const maximumBlockingY = groundY + Math.max(0.08, maximumAgentHeight)

  for (const box of snapshot.navigationBoxes) {
    const boxMinimumY = box.minimumY ?? box.navigationLayerY ?? 0
    const boxMaximumY = box.maximumY ?? Number.POSITIVE_INFINITY
    if (
      !verticalRangesOverlap(
        boxMinimumY + snapshot.verticalOriginY,
        boxMaximumY + snapshot.verticalOriginY,
        minimumBlockingY,
        maximumBlockingY,
      )
    ) {
      continue
    }
    obstacles.push({
      id: `semantic:${box.id}`,
      points: createOrientedRectangle(
        box.centerX + snapshot.originX,
        box.centerZ + snapshot.originZ,
        Math.max(0.01, box.halfWidth) + agentRadius,
        Math.max(0.01, box.halfDepth) + agentRadius,
        box.rotation,
      ),
    })
  }

  for (const segment of snapshot.segments) {
    const segmentMinimumY = segment.minimumY ?? segment.navigationLayerY ?? 0
    const segmentMaximumY = segment.maximumY ?? Number.POSITIVE_INFINITY
    if (
      !verticalRangesOverlap(
        segmentMinimumY + snapshot.verticalOriginY,
        segmentMaximumY + snapshot.verticalOriginY,
        minimumBlockingY,
        maximumBlockingY,
      )
    ) {
      continue
    }
    const startX = segment.startX + snapshot.originX
    const startZ = segment.startZ + snapshot.originZ
    const endX = segment.endX + snapshot.originX
    const endZ = segment.endZ + snapshot.originZ
    const length = Math.hypot(endX - startX, endZ - startZ)
    if (length <= 0.000_001) continue
    const directionX = (endX - startX) / length
    const directionZ = (endZ - startZ) / length
    obstacles.push({
      id: `semantic:${segment.id}`,
      points: createInflatedSegmentPolygon({
        directionX,
        directionZ,
        endCap: segment.endCap === 'flat' ? 'flat' : 'round',
        endX,
        endZ,
        radius: Math.max(0.01, segment.halfThickness) + agentRadius,
        startCap: segment.startCap === 'flat' ? 'flat' : 'round',
        startX,
        startZ,
      }),
    })
  }

  return obstacles
}

function createInflatedSegmentPolygon({
  directionX,
  directionZ,
  endCap,
  endX,
  endZ,
  radius,
  startCap,
  startX,
  startZ,
}: Readonly<{
  directionX: number
  directionZ: number
  endCap: 'flat' | 'round'
  endX: number
  endZ: number
  radius: number
  startCap: 'flat' | 'round'
  startX: number
  startZ: number
}>) {
  const normalX = -directionZ
  const normalZ = directionX
  const points: LandrushPoint2[] = [
    { x: startX - normalX * radius, z: startZ - normalZ * radius },
    { x: endX - normalX * radius, z: endZ - normalZ * radius },
  ]

  if (endCap === 'round') {
    for (let index = 1; index <= LANDRUSH_ISLAND_AMBIENT_ROUND_CAP_SEGMENTS; index += 1) {
      const angle = -Math.PI / 2 + (Math.PI * index) / LANDRUSH_ISLAND_AMBIENT_ROUND_CAP_SEGMENTS
      points.push({
        x: endX + (directionX * Math.cos(angle) + normalX * Math.sin(angle)) * radius,
        z: endZ + (directionZ * Math.cos(angle) + normalZ * Math.sin(angle)) * radius,
      })
    }
  } else {
    points.push({ x: endX + normalX * radius, z: endZ + normalZ * radius })
  }

  points.push({ x: startX + normalX * radius, z: startZ + normalZ * radius })
  if (startCap === 'round') {
    for (let index = 1; index < LANDRUSH_ISLAND_AMBIENT_ROUND_CAP_SEGMENTS; index += 1) {
      const angle = Math.PI / 2 + (Math.PI * index) / LANDRUSH_ISLAND_AMBIENT_ROUND_CAP_SEGMENTS
      points.push({
        x: startX + (directionX * Math.cos(angle) + normalX * Math.sin(angle)) * radius,
        z: startZ + (directionZ * Math.cos(angle) + normalZ * Math.sin(angle)) * radius,
      })
    }
  }
  return points
}

function createOrientedRectangle(
  centerX: number,
  centerZ: number,
  halfWidth: number,
  halfDepth: number,
  rotation: number,
): readonly LandrushPoint2[] {
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  const transform = (localX: number, localZ: number) => ({
    x: centerX + cosine * localX + sine * localZ,
    z: centerZ - sine * localX + cosine * localZ,
  })
  return [
    transform(-halfWidth, -halfDepth),
    transform(halfWidth, -halfDepth),
    transform(halfWidth, halfDepth),
    transform(-halfWidth, halfDepth),
  ]
}

function verticalRangesOverlap(
  firstMinimum: number,
  firstMaximum: number,
  secondMinimum: number,
  secondMaximum: number,
) {
  return firstMaximum > secondMinimum && firstMinimum < secondMaximum
}
