import { describe, expect, test } from 'bun:test'
import {
  createZombieEscapeCollisionWorld,
  inspectZombieEscapeNavigationSupportCapsuleQuery,
  inspectZombieEscapeNavigationSupportDiskQuery,
  type ZombieEscapeNavigationSupportSource,
} from '@landrush/zombie-gameplay/zombie-escape-collision-world'

const GEOMETRY_EPSILON = 0.000_000_1

describe('zombie escape navigation support acceleration', () => {
  test('matches the unindexed oracle around holes and boundaries', () => {
    const world = createWorld([
      {
        boundary: true,
        elevation: 0,
        holes: [square(-2, -2, 2, 2)],
        id: 'courtyard',
        polygon: square(-10, -10, 10, 10),
      },
    ])
    const layerIndex = layerIndexAt(world, 0)
    const diskQueries = [
      [-10, 0, 0],
      [-9.75, 0, 0.25],
      [-9.74, 0, 0.25],
      [2, 0, 0],
      [2.2, 0, 0.2],
      [2.21, 0, 0.2],
      [5, 5, 0.4],
      [0, 0, 0],
      [10 + 0.000_000_5, 0, 0],
      [10 + 0.000_002, 0, 0],
    ] as const
    for (const [x, z, radius] of diskQueries) {
      expect(
        inspectZombieEscapeNavigationSupportDiskQuery(world, layerIndex, x, z, radius).contains,
      ).toBe(layerContainsDiskOracle(world, layerIndex, x, z, radius))
    }

    const capsuleQueries = [
      [4, 6, 8, 6, 0.3],
      [-4, 0, 4, 0, 0.3],
      [-8, 9.7, 8, 9.7, 0.3],
      [-8, 9.69, 8, 9.69, 0.3],
      [2.3, -6, 2.3, 6, 0.2],
    ] as const
    for (const [startX, startZ, endX, endZ, radius] of capsuleQueries) {
      expect(
        inspectZombieEscapeNavigationSupportCapsuleQuery(
          world,
          layerIndex,
          startX,
          startZ,
          endX,
          endZ,
          radius,
        ).contains,
      ).toBe(layerContainsCapsuleOracle(world, layerIndex, startX, startZ, endX, endZ, radius))
    }
  })

  test('matches the unindexed oracle across deterministic boundary-near segments', () => {
    const world = createWorld([
      {
        boundary: true,
        elevation: 0,
        holes: [square(-3, -1, 1, 3)],
        id: 'fuzz-support',
        polygon: square(-60, -30, 60, 30),
      },
    ])
    const layerIndex = layerIndexAt(world, 0)
    let state = 0x6d2b_79f5
    const next = () => {
      state = Math.imul(state ^ (state >>> 15), 1 | state)
      state ^= state + Math.imul(state ^ (state >>> 7), 61 | state)
      return ((state ^ (state >>> 14)) >>> 0) / 4_294_967_296
    }
    for (let index = 0; index < 2_000; index += 1) {
      const startX = next() * 124 - 62
      const startZ = next() * 64 - 32
      const endX = next() * 124 - 62
      const endZ = next() * 64 - 32
      const radius = next() * 0.8
      expect(
        inspectZombieEscapeNavigationSupportDiskQuery(world, layerIndex, startX, startZ, radius)
          .contains,
      ).toBe(layerContainsDiskOracle(world, layerIndex, startX, startZ, radius))
      expect(
        inspectZombieEscapeNavigationSupportCapsuleQuery(
          world,
          layerIndex,
          startX,
          startZ,
          endX,
          endZ,
          radius,
        ).contains,
      ).toBe(layerContainsCapsuleOracle(world, layerIndex, startX, startZ, endX, endZ, radius))
    }
  })

  test('groups by elevation and prunes spatially unrelated supports', () => {
    const supports: ZombieEscapeNavigationSupportSource[] = []
    for (let index = 0; index < 128; index += 1) {
      const centerX = index * 20
      supports.push({
        elevation: 0,
        id: `ground:${String(index)}`,
        polygon: square(centerX - 4, -4, centerX + 4, 4),
      })
      supports.push({
        elevation: 3,
        id: `upper:${String(index)}`,
        polygon: square(centerX - 4, 16, centerX + 4, 24),
      })
    }
    const world = createWorld(supports)
    const ground = inspectZombieEscapeNavigationSupportDiskQuery(
      world,
      layerIndexAt(world, 0),
      2,
      0,
      0.25,
    )
    const upper = inspectZombieEscapeNavigationSupportDiskQuery(
      world,
      layerIndexAt(world, 3),
      2,
      20,
      0.25,
    )
    expect(ground.contains).toBe(true)
    expect(upper.contains).toBe(true)
    expect(ground.layerSupportCount).toBe(128)
    expect(upper.layerSupportCount).toBe(128)
    expect(ground.supportAabbVisits).toBeLessThan(16)
    expect(upper.supportAabbVisits).toBeLessThan(16)
  })

  test('visits a bounded fraction of a long high-vertex support', () => {
    const world = createWorld([
      { elevation: 0, id: 'long-support', polygon: ellipse(500, 5, 4096) },
    ])
    const layerIndex = layerIndexAt(world, 0)
    const disk = inspectZombieEscapeNavigationSupportDiskQuery(world, layerIndex, 0, 0, 0.3)
    const capsule = inspectZombieEscapeNavigationSupportCapsuleQuery(
      world,
      layerIndex,
      -100,
      0,
      100,
      0,
      0.3,
    )
    expect(disk.contains).toBe(true)
    expect(capsule.contains).toBe(true)
    expect(disk.totalEdgeCount).toBeGreaterThanOrEqual(4096)
    expect(disk.edgeVisits).toBeLessThan(disk.totalEdgeCount / 16)
    expect(capsule.edgeVisits).toBeLessThan(capsule.totalEdgeCount / 8)
    expect(disk.nodeVisits).toBeLessThan(disk.totalEdgeCount / 4)
    expect(capsule.nodeVisits).toBeLessThan(capsule.totalEdgeCount / 2)
  })
})

function createWorld(navigationSupports: readonly ZombieEscapeNavigationSupportSource[]) {
  return createZombieEscapeCollisionWorld({
    agentRadius: 0.3,
    boundaryPolicy: 'none',
    cellSize: 1,
    navigationSupports,
    playRadius: 1,
  })
}

function layerIndexAt(
  world: ReturnType<typeof createZombieEscapeCollisionWorld>,
  elevation: number,
) {
  const index = world.navigationLayers.findIndex(
    (layer) => Math.abs(layer.elevation - elevation) <= 0.12,
  )
  if (index < 0) throw new Error(`Missing navigation layer at ${String(elevation)}.`)
  return index
}

function layerContainsDiskOracle(
  world: ReturnType<typeof createZombieEscapeCollisionWorld>,
  layerIndex: number,
  x: number,
  z: number,
  radius: number,
) {
  const elevation = world.navigationLayers[layerIndex]!.elevation
  return world.navigationSupports.some(
    (support) =>
      Math.abs(support.elevation - elevation) <= 0.12 &&
      supportContainsDiskOracle(support, x, z, radius),
  )
}

function layerContainsCapsuleOracle(
  world: ReturnType<typeof createZombieEscapeCollisionWorld>,
  layerIndex: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  radius: number,
) {
  const elevation = world.navigationLayers[layerIndex]!.elevation
  return world.navigationSupports.some(
    (support) =>
      Math.abs(support.elevation - elevation) <= 0.12 &&
      supportContainsCapsuleOracle(support, startX, startZ, endX, endZ, radius),
  )
}

function supportContainsDiskOracle(
  support: ZombieEscapeNavigationSupportSource,
  x: number,
  z: number,
  radius: number,
) {
  if (
    !pointInsideRingOracle(x, z, support.polygon) ||
    (support.holes ?? []).some((hole) => pointInsideRingOracle(x, z, hole))
  ) {
    return false
  }
  const minimumDistanceSquared = Math.max(0, radius) ** 2
  for (const ring of [support.polygon, ...(support.holes ?? [])]) {
    for (let index = 0; index < ring.length; index += 1) {
      const point = ring[index]!
      const previous = ring[(index + ring.length - 1) % ring.length]!
      if (
        pointSegmentDistanceSquared(x, z, previous.x, previous.z, point.x, point.z) +
          GEOMETRY_EPSILON <
        minimumDistanceSquared
      ) {
        return false
      }
    }
  }
  return true
}

function supportContainsCapsuleOracle(
  support: ZombieEscapeNavigationSupportSource,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  radius: number,
) {
  if (
    !supportContainsDiskOracle(support, startX, startZ, radius) ||
    !supportContainsDiskOracle(support, endX, endZ, radius)
  ) {
    return false
  }
  const minimumDistanceSquared = Math.max(0, radius) ** 2
  const minimumX = Math.min(startX, endX) - radius
  const minimumZ = Math.min(startZ, endZ) - radius
  const maximumX = Math.max(startX, endX) + radius
  const maximumZ = Math.max(startZ, endZ) + radius
  for (const ring of [support.polygon, ...(support.holes ?? [])]) {
    for (let index = 0; index < ring.length; index += 1) {
      const point = ring[index]!
      const previous = ring[(index + ring.length - 1) % ring.length]!
      if (
        Math.max(previous.x, point.x) < minimumX ||
        Math.min(previous.x, point.x) > maximumX ||
        Math.max(previous.z, point.z) < minimumZ ||
        Math.min(previous.z, point.z) > maximumZ
      ) {
        continue
      }
      if (
        segmentDistanceSquared(
          startX,
          startZ,
          endX,
          endZ,
          previous.x,
          previous.z,
          point.x,
          point.z,
        ) +
          GEOMETRY_EPSILON <
        minimumDistanceSquared
      ) {
        return false
      }
    }
  }
  return true
}

function pointInsideRingOracle(
  x: number,
  z: number,
  ring: readonly Readonly<{ x: number; z: number }>[],
) {
  if (ring.length < 3) return false
  let inside = false
  for (
    let index = 0, previousIndex = ring.length - 1;
    index < ring.length;
    previousIndex = index++
  ) {
    const point = ring[index]!
    const previous = ring[previousIndex]!
    if (pointSegmentDistanceSquared(x, z, previous.x, previous.z, point.x, point.z) <= 1e-12) {
      return true
    }
    if (
      point.z > z !== previous.z > z &&
      x < ((previous.x - point.x) * (z - point.z)) / (previous.z - point.z) + point.x
    ) {
      inside = !inside
    }
  }
  return inside
}

function pointSegmentDistanceSquared(
  x: number,
  z: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
) {
  const segmentX = endX - startX
  const segmentZ = endZ - startZ
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ
  const amount =
    lengthSquared <= GEOMETRY_EPSILON
      ? 0
      : Math.max(
          0,
          Math.min(1, ((x - startX) * segmentX + (z - startZ) * segmentZ) / lengthSquared),
        )
  const offsetX = x - (startX + segmentX * amount)
  const offsetZ = z - (startZ + segmentZ * amount)
  return offsetX * offsetX + offsetZ * offsetZ
}

function segmentDistanceSquared(
  firstStartX: number,
  firstStartZ: number,
  firstEndX: number,
  firstEndZ: number,
  secondStartX: number,
  secondStartZ: number,
  secondEndX: number,
  secondEndZ: number,
) {
  if (
    segmentsIntersect(
      firstStartX,
      firstStartZ,
      firstEndX,
      firstEndZ,
      secondStartX,
      secondStartZ,
      secondEndX,
      secondEndZ,
    )
  ) {
    return 0
  }
  return Math.min(
    pointSegmentDistanceSquared(
      firstStartX,
      firstStartZ,
      secondStartX,
      secondStartZ,
      secondEndX,
      secondEndZ,
    ),
    pointSegmentDistanceSquared(
      firstEndX,
      firstEndZ,
      secondStartX,
      secondStartZ,
      secondEndX,
      secondEndZ,
    ),
    pointSegmentDistanceSquared(
      secondStartX,
      secondStartZ,
      firstStartX,
      firstStartZ,
      firstEndX,
      firstEndZ,
    ),
    pointSegmentDistanceSquared(
      secondEndX,
      secondEndZ,
      firstStartX,
      firstStartZ,
      firstEndX,
      firstEndZ,
    ),
  )
}

function segmentsIntersect(
  firstStartX: number,
  firstStartZ: number,
  firstEndX: number,
  firstEndZ: number,
  secondStartX: number,
  secondStartZ: number,
  secondEndX: number,
  secondEndZ: number,
) {
  const orientation = (
    startX: number,
    startZ: number,
    endX: number,
    endZ: number,
    pointX: number,
    pointZ: number,
  ) => (endX - startX) * (pointZ - startZ) - (endZ - startZ) * (pointX - startX)
  const firstSecondStart = orientation(
    firstStartX,
    firstStartZ,
    firstEndX,
    firstEndZ,
    secondStartX,
    secondStartZ,
  )
  const firstSecondEnd = orientation(
    firstStartX,
    firstStartZ,
    firstEndX,
    firstEndZ,
    secondEndX,
    secondEndZ,
  )
  const secondFirstStart = orientation(
    secondStartX,
    secondStartZ,
    secondEndX,
    secondEndZ,
    firstStartX,
    firstStartZ,
  )
  const secondFirstEnd = orientation(
    secondStartX,
    secondStartZ,
    secondEndX,
    secondEndZ,
    firstEndX,
    firstEndZ,
  )
  return (
    firstSecondStart * firstSecondEnd <= GEOMETRY_EPSILON &&
    secondFirstStart * secondFirstEnd <= GEOMETRY_EPSILON &&
    Math.max(Math.min(firstStartX, firstEndX), Math.min(secondStartX, secondEndX)) <=
      Math.min(Math.max(firstStartX, firstEndX), Math.max(secondStartX, secondEndX)) +
        GEOMETRY_EPSILON &&
    Math.max(Math.min(firstStartZ, firstEndZ), Math.min(secondStartZ, secondEndZ)) <=
      Math.min(Math.max(firstStartZ, firstEndZ), Math.max(secondStartZ, secondEndZ)) +
        GEOMETRY_EPSILON
  )
}

function square(minimumX: number, minimumZ: number, maximumX: number, maximumZ: number) {
  return [
    { x: minimumX, z: minimumZ },
    { x: maximumX, z: minimumZ },
    { x: maximumX, z: maximumZ },
    { x: minimumX, z: maximumZ },
  ]
}

function ellipse(radiusX: number, radiusZ: number, pointCount: number) {
  return Array.from({ length: pointCount }, (_, index) => {
    const angle = (index / pointCount) * Math.PI * 2
    return { x: Math.cos(angle) * radiusX, z: Math.sin(angle) * radiusZ }
  })
}
