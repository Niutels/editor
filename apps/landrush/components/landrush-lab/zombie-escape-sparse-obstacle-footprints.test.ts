import { describe, expect, test } from 'bun:test'
import polygonClipping, { type MultiPolygon, type Ring } from 'polygon-clipping'
import {
  createZombieEscapeSparseObstacleFootprintUnions,
  type ZombieEscapeSparseObstacleFootprintBox,
  type ZombieEscapeSparseObstacleFootprintCircle,
  type ZombieEscapeSparseObstacleFootprintComponent,
  type ZombieEscapeSparseObstacleFootprintSegment,
} from './zombie-escape-sparse-obstacle-footprints'

const STATIC_VERTICAL_RANGE = {
  breakable: false,
  maximumY: Number.POSITIVE_INFINITY,
  minimumY: Number.NEGATIVE_INFINITY,
} as const

function createUnions({
  agentRadius = 0.25,
  arcToleranceMeters = 0.001,
  boxes = [],
  circles = [],
  layerElevations = [0],
  segments = [],
}: {
  agentRadius?: number
  arcToleranceMeters?: number
  boxes?: readonly ZombieEscapeSparseObstacleFootprintBox[]
  circles?: readonly ZombieEscapeSparseObstacleFootprintCircle[]
  layerElevations?: readonly number[]
  segments?: readonly ZombieEscapeSparseObstacleFootprintSegment[]
} = {}) {
  return createZombieEscapeSparseObstacleFootprintUnions({
    agentRadius,
    arcToleranceMeters,
    boxes,
    circles,
    layerElevations,
    segments,
  })
}

function componentBounds(component: ZombieEscapeSparseObstacleFootprintComponent) {
  return component.outer.reduce(
    (bounds, point) => ({
      maximumX: Math.max(bounds.maximumX, point.x),
      maximumZ: Math.max(bounds.maximumZ, point.z),
      minimumX: Math.min(bounds.minimumX, point.x),
      minimumZ: Math.min(bounds.minimumZ, point.z),
    }),
    {
      maximumX: Number.NEGATIVE_INFINITY,
      maximumZ: Number.NEGATIVE_INFINITY,
      minimumX: Number.POSITIVE_INFINITY,
      minimumZ: Number.POSITIVE_INFINITY,
    },
  )
}

function polygonSupport(
  component: ZombieEscapeSparseObstacleFootprintComponent,
  normalX: number,
  normalZ: number,
) {
  return component.outer.reduce(
    (maximum, point) => Math.max(maximum, point.x * normalX + point.z * normalZ),
    Number.NEGATIVE_INFINITY,
  )
}

function ringArea(ring: readonly Readonly<{ x: number; z: number }>[]) {
  return (
    ring.reduce((area, point, index) => {
      const next = ring[(index + 1) % ring.length]!
      return area + point.x * next.z - next.x * point.z
    }, 0) * 0.5
  )
}

function pointIsInsideComponent(
  component: ZombieEscapeSparseObstacleFootprintComponent,
  x: number,
  z: number,
) {
  const insideRing = (ring: readonly Readonly<{ x: number; z: number }>[]) => {
    let inside = false
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      const first = ring[index]!
      const second = ring[previous]!
      if (
        first.z > z !== second.z > z &&
        x < ((second.x - first.x) * (z - first.z)) / (second.z - first.z) + first.x
      ) {
        inside = !inside
      }
    }
    return inside
  }
  return insideRing(component.outer) && !component.holes.some(insideRing)
}

function monolithicCanonicalComponents(
  components: readonly ZombieEscapeSparseObstacleFootprintComponent[],
) {
  if (components.length === 0) return []
  const polygons = components.map(({ holes, outer }) => [
    closeReferenceRing(outer),
    ...holes.map(closeReferenceRing),
  ])
  const union: MultiPolygon = polygonClipping.union(polygons[0]!, ...polygons.slice(1))
  return union
    .flatMap((polygon) => {
      const outer = canonicalizeReferenceRing(polygon[0], true)
      if (outer.length < 3) return []
      const holes = polygon
        .slice(1)
        .map((ring) => canonicalizeReferenceRing(ring, false))
        .filter((ring) => ring.length >= 3)
        .sort(compareReferenceRings)
      return [{ holes, outer }]
    })
    .sort((first, second) => compareReferenceRings(first.outer, second.outer))
}

function closeReferenceRing(ring: readonly Readonly<{ x: number; z: number }>[]): Ring {
  return [...ring.map(({ x, z }) => [x, z] as [number, number]), [ring[0]!.x, ring[0]!.z]]
}

function canonicalizeReferenceRing(ring: Ring | undefined, counterClockwise: boolean) {
  if (!ring) return []
  const deduped: Array<{ x: number; z: number }> = []
  for (const [rawX, rawZ] of ring) {
    const point = {
      x: Object.is(rawX, -0) ? 0 : rawX,
      z: Object.is(rawZ, -0) ? 0 : rawZ,
    }
    const previous = deduped[deduped.length - 1]
    if (
      previous &&
      Math.abs(previous.x - point.x) <= 1e-7 &&
      Math.abs(previous.z - point.z) <= 1e-7
    ) {
      continue
    }
    deduped.push(point)
  }
  if (
    deduped.length > 2 &&
    Math.abs(deduped[0]!.x - deduped[deduped.length - 1]!.x) <= 1e-7 &&
    Math.abs(deduped[0]!.z - deduped[deduped.length - 1]!.z) <= 1e-7
  ) {
    deduped.pop()
  }
  if (deduped.length < 3) return []
  if (ringArea(deduped) > 0 !== counterClockwise) deduped.reverse()
  let firstIndex = 0
  for (let index = 1; index < deduped.length; index += 1) {
    if (compareReferenceRingRotations(deduped, index, firstIndex) < 0) firstIndex = index
  }
  return [...deduped.slice(firstIndex), ...deduped.slice(0, firstIndex)]
}

function compareReferenceRings(
  first: readonly Readonly<{ x: number; z: number }>[],
  second: readonly Readonly<{ x: number; z: number }>[],
) {
  const count = Math.min(first.length, second.length)
  for (let index = 0; index < count; index += 1) {
    const comparison = first[index]!.x - second[index]!.x || first[index]!.z - second[index]!.z
    if (comparison !== 0) return comparison
  }
  return first.length - second.length
}

function compareReferenceRingRotations(
  ring: readonly Readonly<{ x: number; z: number }>[],
  firstStart: number,
  secondStart: number,
) {
  for (let offset = 0; offset < ring.length; offset += 1) {
    const first = ring[(firstStart + offset) % ring.length]!
    const second = ring[(secondStart + offset) % ring.length]!
    const comparison = first.x - second.x || first.z - second.z
    if (comparison !== 0) return comparison
  }
  return 0
}

describe('Zombie Escape sparse obstacle footprint unions', () => {
  test('circumscribes a rotated box with bounded, reported rounded-corner overage', () => {
    const angle = Math.PI / 5
    const box: ZombieEscapeSparseObstacleFootprintBox = {
      ...STATIC_VERTICAL_RANGE,
      centerX: 1.5,
      centerZ: -0.75,
      worldAxisX: Math.cos(angle),
      halfDepth: 0.6,
      halfWidth: 1.2,
      worldAxisZ: Math.sin(angle),
    }
    const [layer] = createUnions({ arcToleranceMeters: 0.002, boxes: [box] })
    expect(layer).toBeDefined()
    expect(layer!.components).toHaveLength(1)
    expect(layer!.maximumArcOverageMeters).toBeGreaterThan(0)
    expect(layer!.maximumArcOverageMeters).toBeLessThanOrEqual(0.002 + 1e-12)

    const component = layer!.components[0]!
    for (let index = 0; index < 64; index += 1) {
      const direction = (index / 64) * Math.PI * 2
      const normalX = Math.cos(direction)
      const normalZ = Math.sin(direction)
      const exactSupport =
        normalX * box.centerX +
        normalZ * box.centerZ +
        box.halfWidth * Math.abs(normalX * box.worldAxisX + normalZ * box.worldAxisZ) +
        box.halfDepth * Math.abs(normalX * -box.worldAxisZ + normalZ * box.worldAxisX) +
        0.25
      const approximatedSupport = polygonSupport(component, normalX, normalZ)
      expect(approximatedSupport).toBeGreaterThanOrEqual(exactSupport - 1e-9)
      expect(approximatedSupport).toBeLessThanOrEqual(exactSupport + 0.002 + 1e-9)
    }
  })

  test('reports the bounded circumscription error of a circle', () => {
    const [layer] = createUnions({
      arcToleranceMeters: 0.001,
      circles: [
        {
          ...STATIC_VERTICAL_RANGE,
          radius: 0.5,
          x: 0,
          z: 0,
        },
      ],
    })
    const component = layer!.components[0]!
    const radii = component.outer.map(({ x, z }) => Math.hypot(x, z))
    expect(Math.min(...radii)).toBeGreaterThanOrEqual(0.75)
    expect(Math.max(...radii) - 0.75).toBeCloseTo(layer!.maximumArcOverageMeters, 10)
    expect(layer!.maximumArcOverageMeters).toBeLessThanOrEqual(0.001 + 1e-12)
  })

  test('matches flat, round, mixed, and zero-length segment cap authority', () => {
    const createSegment = (
      startCap: 'flat' | 'round',
      endCap: 'flat' | 'round',
      startX = 0,
      endX = 2,
    ): ZombieEscapeSparseObstacleFootprintSegment => ({
      ...STATIC_VERTICAL_RANGE,
      endCap,
      endX,
      endZ: 0,
      halfThickness: 0.1,
      startCap,
      startX,
      startZ: 0,
    })
    const flat = createUnions({ segments: [createSegment('flat', 'flat')] })[0]!
    const round = createUnions({ segments: [createSegment('round', 'round')] })[0]!
    const mixed = createUnions({ segments: [createSegment('flat', 'round')] })[0]!
    const flatBounds = componentBounds(flat.components[0]!)
    const roundBounds = componentBounds(round.components[0]!)
    const mixedBounds = componentBounds(mixed.components[0]!)

    expect(flat.components[0]!.outer).toHaveLength(4)
    expect(flatBounds.maximumX).toBeCloseTo(2, 10)
    expect(flatBounds.maximumZ).toBeCloseTo(0.35, 10)
    expect(flatBounds.minimumX).toBeCloseTo(0, 10)
    expect(flatBounds.minimumZ).toBeCloseTo(-0.35, 10)
    expect(roundBounds.minimumX).toBeCloseTo(-0.35, 10)
    expect(roundBounds.maximumX).toBeCloseTo(2.35, 10)
    expect(mixedBounds.minimumX).toBeCloseTo(0, 10)
    expect(mixedBounds.maximumX).toBeCloseTo(2.35, 10)

    expect(
      createUnions({ segments: [createSegment('flat', 'flat', 1, 1)] })[0]!.components,
    ).toHaveLength(0)
    const zeroRound = createUnions({
      segments: [createSegment('flat', 'round', 1, 1)],
    })[0]!
    expect(zeroRound.components).toHaveLength(1)
    const zeroRoundBounds = componentBounds(zeroRound.components[0]!)
    expect(zeroRoundBounds.minimumX).toBeCloseTo(0.65, 10)
    expect(zeroRoundBounds.maximumX).toBeCloseTo(1.35, 10)
  })

  test('does not convexify a short mixed-cap segment beyond its rectangle and round-end disk', () => {
    const [layer] = createUnions({
      arcToleranceMeters: 0.000_1,
      segments: [
        {
          ...STATIC_VERTICAL_RANGE,
          endCap: 'round',
          endX: 0.1,
          endZ: 0,
          halfThickness: 0.1,
          startCap: 'flat',
          startX: 0,
          startZ: 0,
        },
      ],
    })
    expect(layer!.components).toHaveLength(1)
    expect(pointIsInsideComponent(layer!.components[0]!, -0.04, 0.324)).toBe(false)
    expect(pointIsInsideComponent(layer!.components[0]!, 0.05, 0.3)).toBe(true)
  })

  test('canonicalizes every ordering of the live three-wall junction on the exact boolean lattice', () => {
    const verticalRange = { breakable: false, maximumY: 2.46, minimumY: -0.04 } as const
    const segments = [
      {
        ...verticalRange,
        endCap: 'round',
        endX: -0.21097829994112116,
        endZ: -8.142966433908677,
        halfThickness: 0.09,
        startCap: 'round',
        startX: 0.0033074143445932513,
        startZ: -6.142966433908677,
      },
      {
        ...verticalRange,
        endCap: 'flat',
        endX: -0.3748851745570483,
        endZ: -9.672763930323999,
        halfThickness: 0.09,
        startCap: 'round',
        startX: -0.21097829994112116,
        startZ: -8.142966433908677,
      },
      {
        ...verticalRange,
        endCap: 'round',
        endX: -3.4966925856554067,
        endZ: -8.142966433908677,
        halfThickness: 0.09,
        startCap: 'round',
        startX: -0.21097829994112116,
        startZ: -8.142966433908677,
      },
    ] satisfies readonly ZombieEscapeSparseObstacleFootprintSegment[]
    const permutations = [
      [segments[0]!, segments[1]!, segments[2]!],
      [segments[0]!, segments[2]!, segments[1]!],
      [segments[1]!, segments[0]!, segments[2]!],
      [segments[1]!, segments[2]!, segments[0]!],
      [segments[2]!, segments[0]!, segments[1]!],
      [segments[2]!, segments[1]!, segments[0]!],
    ]
    const results = permutations.map((orderedSegments) =>
      createUnions({
        agentRadius: 0.37,
        arcToleranceMeters: 0.008,
        layerElevations: [0],
        segments: orderedSegments,
      }),
    )
    const expected = results[0]!
    expect(expected).toHaveLength(1)
    expect(expected[0]!.components).toHaveLength(1)
    expect(expected[0]!.components[0]!.holes).toHaveLength(0)
    for (const result of results) expect(result).toEqual(expected)

    const coordinateQuantum = 2 ** -40
    for (const ring of [expected[0]!.components[0]!.outer, ...expected[0]!.components[0]!.holes]) {
      for (let index = 0; index < ring.length; index += 1) {
        const point = ring[index]!
        const next = ring[(index + 1) % ring.length]!
        expect(Number.isFinite(point.x)).toBe(true)
        expect(Number.isFinite(point.z)).toBe(true)
        expect(Number.isSafeInteger(point.x / coordinateQuantum)).toBe(true)
        expect(Number.isSafeInteger(point.z / coordinateQuantum)).toBe(true)
        expect(Math.hypot(next.x - point.x, next.z - point.z)).toBeGreaterThan(0)
      }
    }
  })

  test('rejects obstacle coordinates outside the exact polygon-boolean range', () => {
    expect(() =>
      createUnions({
        circles: [
          {
            ...STATIC_VERTICAL_RANGE,
            radius: 0.5,
            x: 8193,
            z: 0,
          },
        ],
      }),
    ).toThrow('Sparse obstacle coordinate exceeds the exact polygon-union range')
  })

  test('keeps union-created outline intersections for overlapping static footprints', () => {
    const segment = (
      startX: number,
      startZ: number,
      endX: number,
      endZ: number,
    ): ZombieEscapeSparseObstacleFootprintSegment => ({
      ...STATIC_VERTICAL_RANGE,
      endCap: 'flat',
      endX,
      endZ,
      halfThickness: 0.1,
      startCap: 'flat',
      startX,
      startZ,
    })
    const [layer] = createUnions({
      segments: [segment(-2, 0, 2, 0), segment(0, -2, 0, 2)],
    })
    expect(layer!.components).toHaveLength(1)
    expect(layer!.components[0]!.outer).toHaveLength(12)
    expect(
      layer!.components[0]!.outer.some(
        ({ x, z }) => Math.abs(x + 0.35) <= 1e-10 && Math.abs(z + 0.35) <= 1e-10,
      ),
    ).toBe(true)
  })

  test('unions overlapping rotated boxes and an exactly tangent circle-box pair', () => {
    const rotatedBox = (
      centerX: number,
      angle: number,
    ): ZombieEscapeSparseObstacleFootprintBox => ({
      ...STATIC_VERTICAL_RANGE,
      centerX,
      centerZ: 0,
      worldAxisX: Math.cos(angle),
      halfDepth: 0.4,
      halfWidth: 0.9,
      worldAxisZ: Math.sin(angle),
    })
    const overlapping = createUnions({
      boxes: [rotatedBox(-0.35, Math.PI / 4), rotatedBox(0.35, -Math.PI / 4)],
    })[0]!
    expect(overlapping.components).toHaveLength(1)
    expect(ringArea(overlapping.components[0]!.outer)).toBeGreaterThan(0)

    const tangent = createUnions({
      boxes: [
        {
          ...STATIC_VERTICAL_RANGE,
          centerX: 0,
          centerZ: 0,
          worldAxisX: 1,
          halfDepth: 0.5,
          halfWidth: 0.5,
          worldAxisZ: 0,
        },
      ],
      circles: [{ ...STATIC_VERTICAL_RANGE, radius: 0.5, x: 1.5, z: 0 }],
    })[0]!
    expect(tangent.components).toHaveLength(1)
    const tangentBounds = componentBounds(tangent.components[0]!)
    expect(tangentBounds.maximumX).toBeCloseTo(2.25, 10)
    expect(tangentBounds.minimumX).toBeCloseTo(-0.75, 10)
  })

  test('canonicalizes the outer and hole rings formed by an enclosing obstacle union', () => {
    const segment = (
      startX: number,
      startZ: number,
      endX: number,
      endZ: number,
    ): ZombieEscapeSparseObstacleFootprintSegment => ({
      ...STATIC_VERTICAL_RANGE,
      endCap: 'flat',
      endX,
      endZ,
      halfThickness: 0.1,
      startCap: 'flat',
      startX,
      startZ,
    })
    const segments = [
      segment(-2, -2, 2, -2),
      segment(2, -2, 2, 2),
      segment(2, 2, -2, 2),
      segment(-2, 2, -2, -2),
    ]
    const [layer] = createUnions({ segments })
    const component = layer!.components[0]!
    expect(layer!.components).toHaveLength(1)
    expect(component.holes).toHaveLength(1)
    expect(ringArea(component.outer)).toBeGreaterThan(0)
    expect(ringArea(component.holes[0]!)).toBeLessThan(0)
    expect(component.outer[0]!.x).toBeCloseTo(-2.35, 10)
    expect(component.outer[0]!.z).toBeCloseTo(-2, 10)
    expect(component.holes[0]![0]!.x).toBeCloseTo(-1.65, 10)
    expect(component.holes[0]![0]!.z).toBeCloseTo(-1.65, 10)
    expect(createUnions({ segments: [...segments].reverse() })).toEqual([layer])
  })

  test('excludes breakables and applies the collision authority vertical overlap per layer', () => {
    const box = (
      centerX: number,
      minimumY: number,
      maximumY: number,
      breakable = false,
    ): ZombieEscapeSparseObstacleFootprintBox => ({
      breakable,
      centerX,
      centerZ: 0,
      worldAxisX: 1,
      halfDepth: 0.5,
      halfWidth: 0.5,
      maximumY,
      minimumY,
      worldAxisZ: 0,
    })
    const unions = createUnions({
      boxes: [box(-2, 0, 1), box(2, 2.5, 5), box(0, 0, 5, true)],
      layerElevations: [0, 3, 6],
    })
    expect(unions.map(({ components }) => components.length)).toEqual([1, 1, 0])
    expect(componentBounds(unions[0]!.components[0]!).maximumX).toBeLessThan(0)
    expect(componentBounds(unions[1]!.components[0]!).minimumX).toBeGreaterThan(0)
  })

  test('does not spend the four-centimeter presentation clearance in a tight valid corridor', () => {
    const circle = (x: number): ZombieEscapeSparseObstacleFootprintCircle => ({
      ...STATIC_VERTICAL_RANGE,
      radius: 0.5,
      x,
      z: 0,
    })
    const [layer] = createUnions({
      arcToleranceMeters: 0.001,
      circles: [circle(-0.76), circle(0.76)],
    })
    expect(layer!.maximumArcOverageMeters).toBeLessThanOrEqual(0.001 + 1e-12)
    expect(layer!.components).toHaveLength(2)
    const [left, right] = layer!.components.map(componentBounds)
    expect(right!.minimumX - left!.maximumX).toBeGreaterThan(0.015)
  })

  test('keeps non-overlapping obstacle islands as separate union components', () => {
    const [layer] = createUnions({
      boxes: [
        {
          ...STATIC_VERTICAL_RANGE,
          centerX: -5,
          centerZ: 0,
          worldAxisX: 1,
          halfDepth: 0.5,
          halfWidth: 0.5,
          worldAxisZ: 0,
        },
      ],
      circles: [{ ...STATIC_VERTICAL_RANGE, radius: 0.5, x: 5, z: 0 }],
    })
    expect(layer!.components).toHaveLength(2)
  })

  test('matches a monolithic union for tangent chains, holes, overlaps, islands, and shuffled floors', () => {
    const segment = (
      startX: number,
      startZ: number,
      endX: number,
      endZ: number,
    ): ZombieEscapeSparseObstacleFootprintSegment => ({
      ...STATIC_VERTICAL_RANGE,
      endCap: 'flat',
      endX,
      endZ,
      halfThickness: 0.1,
      startCap: 'flat',
      startX,
      startZ,
    })
    const fixtures = [
      {
        circles: [-2.25, -0.75, 0.75, 2.25].map((x) => ({
          ...STATIC_VERTICAL_RANGE,
          radius: 0.5,
          x,
          z: 0,
        })),
      },
      {
        boxes: [
          {
            ...STATIC_VERTICAL_RANGE,
            centerX: 0,
            centerZ: 0,
            halfDepth: 0.3,
            halfWidth: 0.3,
            worldAxisX: 1,
            worldAxisZ: 0,
          },
        ],
        segments: [
          segment(-2, -2, 2, -2),
          segment(2, -2, 2, 2),
          segment(2, 2, -2, 2),
          segment(-2, 2, -2, -2),
        ],
      },
      {
        boxes: [-0.6, 0, 0.6].map((centerX, index) => {
          const angle = (index - 1) * (Math.PI / 5)
          return {
            ...STATIC_VERTICAL_RANGE,
            centerX,
            centerZ: index * 0.15,
            halfDepth: 0.55,
            halfWidth: 1,
            worldAxisX: Math.cos(angle),
            worldAxisZ: Math.sin(angle),
          }
        }),
      },
      {
        boxes: [-8, -4, 4, 8].map((centerX) => ({
          ...STATIC_VERTICAL_RANGE,
          centerX,
          centerZ: centerX % 3,
          halfDepth: 0.4,
          halfWidth: 0.7,
          worldAxisX: 1,
          worldAxisZ: 0,
        })),
      },
    ] satisfies ReadonlyArray<{
      boxes?: readonly ZombieEscapeSparseObstacleFootprintBox[]
      circles?: readonly ZombieEscapeSparseObstacleFootprintCircle[]
      segments?: readonly ZombieEscapeSparseObstacleFootprintSegment[]
    }>

    for (const fixture of fixtures) {
      const unions = createUnions(fixture)
      for (const layer of unions) {
        expect(monolithicCanonicalComponents(layer.components)).toEqual(layer.components)
      }
    }

    for (let seed = 1; seed <= 6; seed += 1) {
      let state = seed
      const random = () => {
        state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
        return state / 4_294_967_296
      }
      const verticalRange = (index: number) =>
        index % 3 === 0
          ? { breakable: false, maximumY: 2, minimumY: -1 }
          : index % 3 === 1
            ? { breakable: false, maximumY: 5, minimumY: 2.5 }
            : STATIC_VERTICAL_RANGE
      const boxes = Array.from({ length: 10 }, (_, index) => {
        const angle = random() * Math.PI
        return {
          ...verticalRange(index),
          centerX: -8 + random() * 16,
          centerZ: -8 + random() * 16,
          halfDepth: 0.2 + random() * 0.8,
          halfWidth: 0.2 + random() * 0.8,
          worldAxisX: Math.cos(angle),
          worldAxisZ: Math.sin(angle),
        }
      })
      const circles = Array.from({ length: 8 }, (_, index) => ({
        ...verticalRange(index + 1),
        radius: 0.2 + random() * 0.6,
        x: -8 + random() * 16,
        z: -8 + random() * 16,
      }))
      const segments = Array.from({ length: 8 }, (_, index) => {
        const startX = -8 + random() * 16
        const startZ = -8 + random() * 16
        const angle = random() * Math.PI * 2
        const length = 0.3 + random() * 2
        return {
          ...verticalRange(index + 2),
          endCap: index % 2 === 0 ? ('flat' as const) : ('round' as const),
          endX: startX + Math.cos(angle) * length,
          endZ: startZ + Math.sin(angle) * length,
          halfThickness: 0.04 + random() * 0.16,
          startCap: index % 3 === 0 ? ('round' as const) : ('flat' as const),
          startX,
          startZ,
        }
      })
      const shuffled = <Value>(values: readonly Value[]) =>
        [...values]
          .map((value) => ({ order: random(), value }))
          .sort((first, second) => first.order - second.order)
          .map(({ value }) => value)
      const unions = createUnions({
        boxes: shuffled(boxes),
        circles: shuffled(circles),
        layerElevations: [0, 3, 6],
        segments: shuffled(segments),
      })
      for (const layer of unions) {
        expect(monolithicCanonicalComponents(layer.components)).toEqual(layer.components)
      }
      expect(
        createUnions({
          boxes: [...boxes].reverse(),
          circles: [...circles].reverse(),
          layerElevations: [0, 3, 6],
          segments: [...segments].reverse(),
        }),
      ).toEqual(unions)
    }
  })

  test('canonicalizes union output independently of collider input order', () => {
    const boxes: ZombieEscapeSparseObstacleFootprintBox[] = [
      {
        ...STATIC_VERTICAL_RANGE,
        centerX: -0.5,
        centerZ: 0,
        worldAxisX: 1,
        halfDepth: 0.8,
        halfWidth: 1,
        worldAxisZ: 0,
      },
      {
        ...STATIC_VERTICAL_RANGE,
        centerX: 0.5,
        centerZ: 0,
        worldAxisX: Math.cos(Math.PI / 6),
        halfDepth: 0.5,
        halfWidth: 1,
        worldAxisZ: Math.sin(Math.PI / 6),
      },
    ]
    const circles: ZombieEscapeSparseObstacleFootprintCircle[] = [
      { ...STATIC_VERTICAL_RANGE, radius: 0.4, x: 3, z: 0 },
      { ...STATIC_VERTICAL_RANGE, radius: 0.3, x: -3, z: 0 },
    ]
    const segments: ZombieEscapeSparseObstacleFootprintSegment[] = [
      {
        ...STATIC_VERTICAL_RANGE,
        endCap: 'round',
        endX: 0,
        endZ: 3,
        halfThickness: 0.1,
        startCap: 'flat',
        startX: 0,
        startZ: 1.5,
      },
    ]
    const first = createUnions({ boxes, circles, segments })
    const reversed = createUnions({
      boxes: [...boxes].reverse(),
      circles: [...circles].reverse(),
      segments: [...segments].reverse(),
    })
    expect(reversed).toEqual(first)
  })
})
