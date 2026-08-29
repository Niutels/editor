import { describe, expect, test } from 'bun:test'
import { type AnyNode, type AnyNodeId, WallNode } from '@pascal-app/core'
import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
} from 'three'
import {
  areLandrushWallColliderGeometriesReady,
  type LandrushIslandBuiltColliderReadiness,
  reconcileLandrushIslandBuiltColliderReadiness,
  resolveLandrushIslandBuiltCollidersReady,
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
