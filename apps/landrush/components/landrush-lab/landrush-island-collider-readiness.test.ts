import { describe, expect, test } from 'bun:test'
import { type AnyNode, type AnyNodeId, LevelNode, WallNode } from '@pascal-app/core'
import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
} from 'three'
import {
  areLandrushWallColliderGeometriesReady,
  type LandrushIslandBuiltColliderReadiness,
  reconcileLandrushIslandBuiltColliderReadiness,
  resolveLandrushIslandBuiltCollidersReady,
  resolveLandrushIslandColliderLevelPlacements,
  withLandrushIslandColliderLevelPlacements,
} from './landrush-island-collider-readiness'

function checkWallReadiness({
  dirtyNodeIds = new Set<AnyNodeId>(),
  geometry,
  wall = WallNode.parse({ id: 'wall_test', start: [0, 0], end: [4, 0] }),
}: {
  dirtyNodeIds?: ReadonlySet<AnyNodeId>
  geometry?: BufferGeometry
  wall?: ReturnType<typeof WallNode.parse>
}) {
  const object = geometry ? new Mesh(geometry, new MeshBasicMaterial()) : undefined
  return areLandrushWallColliderGeometriesReady({
    dirtyNodeIds,
    nodes: { [wall.id]: wall } satisfies Record<string, AnyNode>,
    resolveObject: (nodeId): Object3D | undefined => (nodeId === wall.id ? object : undefined),
  })
}

describe('areLandrushWallColliderGeometriesReady', () => {
  test('rejects an unmounted wall', () => {
    expect(checkWallReadiness({})).toBe(false)
  })

  test('rejects Pascal wall placeholder geometry', () => {
    const placeholder = new BufferGeometry()
    placeholder.setAttribute('position', new Float32BufferAttribute(new Float32Array(9), 3))

    expect(checkWallReadiness({ geometry: placeholder })).toBe(false)
  })

  test('rejects real geometry while the wall system still marks it dirty', () => {
    expect(
      checkWallReadiness({
        dirtyNodeIds: new Set(['wall_test' as AnyNodeId]),
        geometry: new BoxGeometry(4, 2.8, 0.2),
      }),
    ).toBe(false)
  })

  test('accepts clean generated wall geometry', () => {
    expect(checkWallReadiness({ geometry: new BoxGeometry(4, 2.8, 0.2) })).toBe(true)
  })

  test('does not block forever on a zero-length wall record', () => {
    const wall = WallNode.parse({ id: 'wall_zero', start: [1, 1], end: [1, 1] })
    expect(checkWallReadiness({ wall })).toBe(true)
  })
})

describe('scoped level collider placements', () => {
  const resolvePlacements = ({
    levels,
    roots,
    stacks,
  }: {
    levels: readonly ReturnType<typeof LevelNode.parse>[]
    roots: ReadonlyMap<AnyNodeId, Object3D>
    stacks: readonly {
      floors: readonly {
        baseY: number
        levelIds: readonly ReturnType<typeof LevelNode.parse>['id'][]
      }[]
    }[]
  }) =>
    resolveLandrushIslandColliderLevelPlacements({
      nodes: Object.fromEntries(levels.map((level) => [level.id, level])) as Record<
        string,
        AnyNode
      >,
      resolveObject: (levelId) => roots.get(levelId),
      stacks,
    })

  test('builds at the scoped 3.0 base Y and restores the live 2.5 presentation', () => {
    const level = LevelNode.parse({ id: 'level_scoped_upper', level: 1 })
    const root = new Group()
    root.position.y = 2.5
    root.visible = false
    root.updateWorldMatrix(true, true)
    const placements = resolvePlacements({
      levels: [level],
      roots: new Map([[level.id, root]]),
      stacks: [{ floors: [{ baseY: 3, levelIds: [level.id] }] }],
    })

    expect(placements).not.toBeNull()
    const result = withLandrushIslandColliderLevelPlacements(placements ?? [], () => {
      expect(root.position.y).toBe(3)
      expect(root.matrixWorld.elements[13]).toBe(3)
      expect(root.visible).toBe(true)
      return 'built'
    })

    expect(result).toBe('built')
    expect(root.position.y).toBe(2.5)
    expect(root.matrixWorld.elements[13]).toBe(2.5)
    expect(root.visible).toBe(false)
  })

  test('resolves every ordinal level independently across multiple parcels', () => {
    const parcelAGround = LevelNode.parse({ id: 'level_parcel_a_ground', level: 0 })
    const parcelAUpper = LevelNode.parse({ id: 'level_parcel_a_upper', level: 1 })
    const parcelBGround = LevelNode.parse({ id: 'level_parcel_b_ground', level: 0 })
    const parcelBUpper = LevelNode.parse({ id: 'level_parcel_b_upper', level: 1 })
    const levels = [parcelAGround, parcelAUpper, parcelBGround, parcelBUpper]
    const roots = new Map(levels.map((level) => [level.id, new Group()] as const))
    const placements = resolvePlacements({
      levels,
      roots,
      stacks: [
        {
          floors: [
            { baseY: 0, levelIds: [parcelAGround.id] },
            { baseY: 3, levelIds: [parcelAUpper.id] },
          ],
        },
        {
          floors: [
            { baseY: 0, levelIds: [parcelBGround.id] },
            { baseY: 2.5, levelIds: [parcelBUpper.id] },
          ],
        },
      ],
    })

    expect(placements?.map(({ baseY, levelId }) => [levelId, baseY])).toEqual(
      [
        [parcelAGround.id, 0],
        [parcelAUpper.id, 3],
        [parcelBGround.id, 0],
        [parcelBUpper.id, 2.5],
      ].sort(([first], [second]) => String(first).localeCompare(String(second))),
    )
  })

  test('waits for a scoped level root that is not registered yet', () => {
    const level = LevelNode.parse({ id: 'level_missing_root', level: 1 })
    expect(
      resolvePlacements({
        levels: [level],
        roots: new Map(),
        stacks: [{ floors: [{ baseY: 3, levelIds: [level.id] }] }],
      }),
    ).toBeNull()
  })

  test('rejects conflicting base Y claims for one scoped level', () => {
    const level = LevelNode.parse({ id: 'level_conflicting_scope', level: 1 })
    expect(
      resolvePlacements({
        levels: [level],
        roots: new Map([[level.id, new Group()]]),
        stacks: [
          { floors: [{ baseY: 2.5, levelIds: [level.id] }] },
          { floors: [{ baseY: 3, levelIds: [level.id] }] },
        ],
      }),
    ).toBeNull()
  })

  test('restores exact level transforms and visibility when the builder throws', () => {
    const level = LevelNode.parse({ id: 'level_throw_restore', level: 1 })
    const root = new Group()
    root.position.y = 2.5
    root.visible = false
    root.updateWorldMatrix(true, true)
    const placements = resolvePlacements({
      levels: [level],
      roots: new Map([[level.id, root]]),
      stacks: [{ floors: [{ baseY: 3, levelIds: [level.id] }] }],
    })

    expect(() =>
      withLandrushIslandColliderLevelPlacements(placements ?? [], () => {
        root.position.y = 9
        root.visible = true
        throw new Error('builder failed')
      }),
    ).toThrow('builder failed')
    expect(root.position.y).toBe(2.5)
    expect(root.matrixWorld.elements[13]).toBe(2.5)
    expect(root.visible).toBe(false)
  })
})

describe('current built collider installation readiness', () => {
  const installed: LandrushIslandBuiltColliderReadiness = {
    authorityKey: 'authority:2',
    installedVersion: 'geometry:7',
    requestedVersion: 'geometry:7',
  }
  const isReady = (status: LandrushIslandBuiltColliderReadiness | null, admitted = true) =>
    resolveLandrushIslandBuiltCollidersReady({
      admitted,
      authorityKey: installed.authorityKey,
      status,
    })

  test('does not report readiness before a current collider build has committed', () => {
    expect(isReady(null)).toBe(false)
    expect(isReady({ ...installed, installedVersion: null })).toBe(false)
    expect(isReady({ ...installed, installedVersion: 'geometry:6' })).toBe(false)
    expect(isReady({ ...installed, requestedVersion: 'geometry:8' })).toBe(false)
    expect(isReady({ ...installed, authorityKey: 'authority:1' })).toBe(false)
    expect(isReady(installed, false)).toBe(false)
    expect(isReady(installed)).toBe(true)
  })

  test('accepts a completed empty world by its installed version, not by a non-null mesh', () => {
    const worlds = { collision: null, floatOnly: null, installedVersion: 'geometry:empty' }
    expect(
      isReady({
        authorityKey: installed.authorityKey,
        installedVersion: worlds.installedVersion,
        requestedVersion: 'geometry:empty',
      }),
    ).toBe(true)
  })

  test('rejects late old-authority completion and cleanup without withdrawing the new world', () => {
    for (const installedVersion of [null, 'geometry:7']) {
      expect(
        reconcileLandrushIslandBuiltColliderReadiness({
          authorityKey: installed.authorityKey,
          current: installed,
          reported: { ...installed, authorityKey: 'authority:1', installedVersion },
        }),
      ).toBe(installed)
    }
  })

  test('withdraws a matching world on rebuild or cleanup and suppresses duplicate reports', () => {
    const reconcile = (
      current: LandrushIslandBuiltColliderReadiness | null,
      reported: LandrushIslandBuiltColliderReadiness,
    ) =>
      reconcileLandrushIslandBuiltColliderReadiness({
        authorityKey: installed.authorityKey,
        current,
        reported,
      })
    expect(reconcile(installed, { ...installed })).toBe(installed)
    const pending = reconcile(installed, { ...installed, requestedVersion: 'geometry:8' })
    expect(isReady(pending)).toBe(false)
    const replacement = reconcile(pending, {
      ...installed,
      installedVersion: 'geometry:8',
      requestedVersion: 'geometry:8',
    })
    expect(isReady(replacement)).toBe(true)
    expect(isReady(reconcile(replacement, { ...replacement!, installedVersion: null }))).toBe(false)
  })
})
