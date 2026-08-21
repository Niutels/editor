import { describe, expect, test } from 'bun:test'
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three'
import {
  captureZombieEscapeSkinnedImpact,
  createZombieEscapeImpactVisualRegistry,
  createZombieEscapeSkinnedImpactAttachment,
  registerZombieEscapeImpactVisual,
  resolveZombieEscapeSkinnedImpact,
} from './zombie-escape-skinned-impact-attachment'

describe('Zombie Escape skinned impact attachment', () => {
  test('follows the captured surface triangle through transform and vertex deformation', () => {
    const registry = createZombieEscapeImpactVisualRegistry()
    const { mesh, root } = createTriangleVisual()
    const unregister = registerZombieEscapeImpactVisual(registry, 2, 7, root)
    const attachment = createZombieEscapeSkinnedImpactAttachment()
    expect(
      captureZombieEscapeSkinnedImpact(
        registry,
        2,
        7,
        11,
        new Vector3(0, 0, 1),
        new Vector3(0, 0, -1),
        new Vector3(0, 0, 1),
        attachment,
      ),
    ).toBe(true)

    root.position.x = 3
    const positions = mesh.geometry.getAttribute('position')
    positions.setY(2, 3)
    root.updateWorldMatrix(true, true)
    const point = new Vector3()
    const normal = new Vector3()
    expect(resolveZombieEscapeSkinnedImpact(registry, attachment, point, normal)).toBe(true)
    expect(point.x).toBeCloseTo(3, 6)
    expect(point.y).toBeCloseTo(1, 6)
    expect(point.z).toBeCloseTo(0, 6)
    expect(normal.z).toBeCloseTo(1, 6)
    unregister()
  })

  test('fences target generations and makes stale cleanup identity-safe', () => {
    const registry = createZombieEscapeImpactVisualRegistry()
    const first = createTriangleVisual()
    const second = createTriangleVisual()
    const cleanupFirst = registerZombieEscapeImpactVisual(registry, 1, 4, first.root)
    const cleanupSecond = registerZombieEscapeImpactVisual(registry, 1, 5, second.root)
    cleanupFirst()
    const attachment = createZombieEscapeSkinnedImpactAttachment()

    expect(
      captureZombieEscapeSkinnedImpact(
        registry,
        1,
        4,
        9,
        new Vector3(0, 0, 1),
        new Vector3(0, 0, -1),
        new Vector3(0, 0, 1),
        attachment,
      ),
    ).toBe(false)
    expect(
      captureZombieEscapeSkinnedImpact(
        registry,
        1,
        5,
        10,
        new Vector3(0, 0, 1),
        new Vector3(0, 0, -1),
        new Vector3(0, 0, 1),
        attachment,
      ),
    ).toBe(true)
    cleanupSecond()
    expect(
      resolveZombieEscapeSkinnedImpact(registry, attachment, new Vector3(), new Vector3()),
    ).toBe(false)
  })
})

function createTriangleVisual() {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 0, 1, 0], 3))
  geometry.setIndex([0, 1, 2])
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }))
  const root = new Group()
  root.add(mesh)
  root.updateWorldMatrix(true, true)
  return { mesh, root }
}
