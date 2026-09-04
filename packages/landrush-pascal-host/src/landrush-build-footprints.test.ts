import { expect, test } from 'bun:test'
import type { AnyNode } from '@pascal-app/core'
import { createLandrushBuildFootprintResolver } from './landrush-build-footprints'

const resolver = createLandrushBuildFootprintResolver({
  buildingId: 'building_test',
  levelId: 'level_test',
  grassClearanceMeters: 1,
  grassFeatherMeters: 0.3,
})
const node = (value: object) => value as AnyNode

test('persistent footprint extraction preserves grass clearance and excludes hidden/transient or foreign nodes', () => {
  const wall = node({
    id: 'wall_test',
    type: 'wall',
    parentId: 'level_test',
    start: [0, 0],
    end: [4, 0],
    thickness: 0.2,
  })
  const nodes = { wall_test: wall }
  const blockers = resolver.createLandrushIslandBuiltGrassBlockers(nodes)
  expect(blockers).toHaveLength(1)
  expect(blockers[0]?.clearanceMeters).toBe(1)
  expect(blockers[0]?.featherMeters).toBe(0.3)
  expect(blockers[0]?.points).toEqual(
    resolver.createLandrushIslandBuildNodeFootprints(wall, 0, nodes)[0],
  )
  for (const extra of [
    { visible: false },
    { metadata: { isTransient: true } },
    { parentId: 'level_elsewhere' },
  ])
    expect(
      resolver.createLandrushIslandBuiltGrassBlockers({ wall_test: node({ ...wall, ...extra }) }),
    ).toHaveLength(0)
  expect(
    resolver.createLandrushIslandBuildNodeFootprints(
      node({ ...wall, visible: false }),
      0,
      nodes,
      true,
    ),
  ).toHaveLength(1)
})

test('roof children keep exact rotation/overhang footprints and arbitrary building levels remain valid', () => {
  const roof = node({
    id: 'roof_test',
    type: 'roof',
    parentId: 'level_second',
    children: ['roof-segment_test'],
    position: [10, 0, 20],
    rotation: 0,
  })
  const nodes = {
    roof_test: roof,
    'roof-segment_test': node({
      id: 'roof-segment_test',
      type: 'roof-segment',
      parentId: 'roof_test',
      position: [2, 0, 3],
      rotation: 0,
      width: 4,
      depth: 6,
      overhang: 0.5,
    }),
    level_second: node({ id: 'level_second', type: 'level', parentId: 'building_second' }),
    building_second: node({ id: 'building_second', type: 'building' }),
  }
  const footprint = resolver.createLandrushIslandBuildNodeFootprints(roof, 0, nodes)[0]!
  expect(resolver.isLandrushIslandBuildLevelId('level_second', nodes)).toBe(true)
  expect(
    Math.max(...footprint.map((point) => point.x)) - Math.min(...footprint.map((point) => point.x)),
  ).toBe(5)
  expect(
    Math.max(...footprint.map((point) => point.z)) - Math.min(...footprint.map((point) => point.z)),
  ).toBe(7)
  expect(footprint.reduce((sum, point) => sum + point.x, 0) / 4).toBe(12)
  expect(footprint.reduce((sum, point) => sum + point.z, 0) / 4).toBe(23)
})
