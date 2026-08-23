// @ts-expect-error — bun:test is provided by the Bun runtime; viewer does not
// depend on @types/bun so the import type is unresolved at compile time.
import { describe, expect, test } from 'bun:test'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Texture } from 'three'
import { MaterialTextureAssignmentRegistry } from './material-texture-settlement'

describe('material texture assignment settlement', () => {
  test('counts only pending assignments on reachable materials', () => {
    const registry = new MaterialTextureAssignmentRegistry()
    const material = new MeshBasicMaterial()
    const unrelated = new MeshBasicMaterial()
    const root = new Group()
    root.add(new Mesh(new BoxGeometry(), material))
    registry.begin(material, 'map', 'floor')
    registry.begin(unrelated, 'map', 'unrelated')

    expect(registry.summarizeObjects([root])).toEqual({
      failedAssignments: 0,
      pendingAssignments: 1,
      settled: false,
    })
  })

  test('deduplicates shared and array materials', () => {
    const registry = new MaterialTextureAssignmentRegistry()
    const material = new MeshBasicMaterial()
    const root = new Group()
    root.add(new Mesh(new BoxGeometry(), [material, material]))
    root.add(new Mesh(new BoxGeometry(), material))
    registry.begin(material, 'map', 'shared')

    expect(registry.summarizeObjects([root]).pendingAssignments).toBe(1)
  })

  test('treats failure as terminal and rejects stale completion', () => {
    const registry = new MaterialTextureAssignmentRegistry()
    const material = new MeshBasicMaterial()
    registry.begin(material, 'map', 'old')
    registry.begin(material, 'map', 'new')

    expect(registry.settle(material, 'map', 'old', 'ready')).toBe(false)
    expect(registry.summarizeMaterials([material]).settled).toBe(false)
    expect(registry.settle(material, 'map', 'new', 'failed')).toBe(true)
    expect(registry.summarizeMaterials([material])).toEqual({
      failedAssignments: 1,
      pendingAssignments: 0,
      settled: true,
    })
  })

  test('clearing a desired slot removes its pending assignment', () => {
    const registry = new MaterialTextureAssignmentRegistry()
    const material = new MeshBasicMaterial()
    registry.begin(material, 'map', 'removed')
    registry.clear(material, 'map')

    expect(registry.summarizeMaterials([material]).settled).toBe(true)
  })

  test('changes revision only when observable assignment state changes', () => {
    const registry = new MaterialTextureAssignmentRegistry()
    const material = new MeshBasicMaterial()
    registry.begin(material, 'map', 'floor')
    const pendingRevision = registry.revision
    registry.begin(material, 'map', 'floor')
    expect(registry.revision).toBe(pendingRevision)
    registry.settle(material, 'map', 'floor', 'ready')
    expect(registry.revision).toBe(pendingRevision + 1)
  })

  test('keeps a cold attached clone pending and mirrors only the current texture', () => {
    const registry = new MaterialTextureAssignmentRegistry()
    const source = new MeshBasicMaterial()
    registry.begin(source, 'map', 'old-floor')
    const clone = source.clone()
    registry.trackClone(source, clone)
    const root = new Group()
    root.add(new Mesh(new BoxGeometry(), clone))

    expect(registry.summarizeObjects([root]).pendingAssignments).toBe(1)

    registry.begin(source, 'map', 'current-floor')
    source.map = new Texture()
    expect(registry.settle(source, 'map', 'old-floor', 'ready')).toBe(false)
    expect(clone.map).toBeNull()

    const currentTexture = new Texture()
    source.map = currentTexture
    expect(registry.settle(source, 'map', 'current-floor', 'ready')).toBe(true)
    expect(clone.map).toBe(currentTexture)
    expect(registry.summarizeObjects([root])).toEqual({
      failedAssignments: 0,
      pendingAssignments: 0,
      settled: true,
    })
  })

  test('mirrors terminal failure and lets an explicit clone assignment detach', () => {
    const registry = new MaterialTextureAssignmentRegistry()
    const source = new MeshBasicMaterial()
    let retries = 0
    registry.begin(source, 'map', 'floor', () => {
      retries += 1
    })
    const clone = source.clone()
    registry.trackClone(source, clone)
    const root = new Group()
    root.add(new Mesh(new BoxGeometry(), clone))

    registry.settle(source, 'map', 'floor', 'failed')
    expect(registry.summarizeMaterials([clone])).toEqual({
      failedAssignments: 1,
      pendingAssignments: 0,
      settled: true,
    })
    expect(registry.retryFailedObjects([root])).toBe(1)
    expect(retries).toBe(1)

    registry.untrackClone(clone)
    registry.begin(clone, 'map', 'independent')
    const cloneTexture = new Texture()
    clone.map = cloneTexture
    registry.settle(clone, 'map', 'independent', 'ready')
    source.map = new Texture()
    registry.begin(source, 'map', 'source-retry')
    registry.settle(source, 'map', 'source-retry', 'ready')

    expect(clone.map).toBe(cloneTexture)
  })

  test('disposal unregisters a clone from future assignment and retry mirroring', () => {
    const registry = new MaterialTextureAssignmentRegistry()
    const source = new MeshBasicMaterial()
    registry.begin(source, 'map', 'floor', () => undefined)
    const clone = source.clone()
    registry.trackClone(source, clone)
    expect(registry.isTrackedClone(clone)).toBe(true)

    clone.dispose()
    expect(registry.isTrackedClone(clone)).toBe(false)
    expect(registry.summarizeMaterials([clone]).pendingAssignments).toBe(0)

    source.map = new Texture()
    registry.begin(source, 'map', 'replacement', () => undefined)
    registry.settle(source, 'map', 'replacement', 'ready')
    expect(clone.map).toBeNull()
  })
})
