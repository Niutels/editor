import { describe, expect, test } from 'bun:test'
import {
  Bone,
  BufferGeometry,
  Group,
  MeshBasicMaterial,
  Skeleton,
  SkinnedMesh,
  Texture,
} from 'three'
import { createLandrushIslandAmbientCloneSkeletonResource } from './landrush-island-ambient-clone-lifecycle'

describe('Landrush island ambient clone lifecycle', () => {
  test('dedupes cloned skeleton disposal without touching loader-shared render resources', () => {
    const geometry = new BufferGeometry()
    const texture = new Texture()
    const material = new MeshBasicMaterial({ map: texture })
    const skeleton = new Skeleton([new Bone()])
    const first = new SkinnedMesh(geometry, material)
    const second = new SkinnedMesh(geometry, material)
    first.bind(skeleton)
    second.bind(skeleton)
    const root = new Group()
    root.add(first, second)
    let skeletonDisposals = 0
    let geometryDisposals = 0
    let materialDisposals = 0
    let textureDisposals = 0
    skeleton.dispose = () => {
      skeletonDisposals += 1
    }
    geometry.dispose = () => {
      geometryDisposals += 1
    }
    material.dispose = () => {
      materialDisposals += 1
    }
    texture.dispose = () => {
      textureDisposals += 1
    }

    const resource = createLandrushIslandAmbientCloneSkeletonResource(root)
    resource.dispose()
    resource.dispose()

    expect(skeletonDisposals).toBe(1)
    expect(geometryDisposals).toBe(0)
    expect(materialDisposals).toBe(0)
    expect(textureDisposals).toBe(0)
  })
})
