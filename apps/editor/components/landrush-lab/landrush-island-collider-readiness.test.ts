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
import { areLandrushWallColliderGeometriesReady } from './landrush-island-collider-readiness'

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
