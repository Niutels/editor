import { describe, expect, test } from 'bun:test'
import {
  Box3,
  BoxGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  Texture,
  Vector3,
} from 'three'
import StandardNodeLibrary from 'three/src/renderers/webgpu/nodes/StandardNodeLibrary.js'
import { LandrushIslandMaterialPresentationOwner } from './landrush-island-material-presentation'
import { createLandrushIslandPalmPresentation } from './landrush-island-palm-presentation'
import {
  createLandrushRobotRevealAperture,
  landrushRobotRevealApertureIntersectsBox,
  updateLandrushRobotRevealAperture,
} from './landrush-robot-reveal-ownership'
import { LANDRUSH_ROBOT_REVEAL_AMOUNT_USER_DATA_KEY } from './landrush-robot-reveal-support'
import {
  appendLandrushRevealOwnedMeshes,
  setLandrushRevealOwnedMeshesBounds,
} from './robot-reveal-mesh-ownership'

function createPalmAsset() {
  const texture = new Texture()
  const trunkMaterial = new MeshStandardMaterial({ map: texture, roughness: 0.8 })
  const leafMaterial = new MeshStandardMaterial({
    alphaMap: texture,
    alphaTest: 0.4,
    map: texture,
    side: DoubleSide,
  })
  const trunk = new Mesh(new BoxGeometry(0.4, 3, 0.4), trunkMaterial)
  trunk.name = 'trunk'
  trunk.position.y = 1.5
  trunk.castShadow = true
  trunk.receiveShadow = true
  const leaves = new Mesh(new BoxGeometry(3, 1, 3), [leafMaterial, trunkMaterial])
  leaves.name = 'leaves'
  leaves.position.y = 3
  const crown = new Group()
  crown.add(leaves)
  const source = new Group()
  source.userData.asset = 'palm'
  source.add(trunk, crown)
  return {
    leafMaterial,
    leaves,
    source,
    texture,
    trunk,
    trunkMaterial,
    dispose() {
      trunk.geometry.dispose()
      leaves.geometry.dispose()
      trunkMaterial.dispose()
      leafMaterial.dispose()
      texture.dispose()
    },
  }
}

function collectPalmRevealMeshes(model: Group, amount = 1) {
  return appendLandrushRevealOwnedMeshes(
    model,
    new Set(),
    new Set<Mesh>(),
    amount,
    (mesh, value) => {
      mesh.userData[LANDRUSH_ROBOT_REVEAL_AMOUNT_USER_DATA_KEY] = value
    },
  )
}

describe('Landrush island palm passthrough', () => {
  test('marks each loaded palm as an occluder without changing the shared asset', () => {
    const asset = createPalmAsset()
    const model = createLandrushIslandPalmPresentation(asset.source)
    const sibling = createLandrushIslandPalmPresentation(asset.source)
    const trunk = model.getObjectByName('trunk') as Mesh
    const leaves = model.getObjectByName('leaves') as Mesh

    expect(asset.source.clone(true).userData.landrushRobotOccluder).toBeUndefined()
    expect(model.userData).toEqual({ asset: 'palm', landrushRobotOccluder: true })
    expect(model.uuid).not.toBe(sibling.uuid)
    expect(model.userData).not.toBe(asset.source.userData)
    expect(asset.source.userData).toEqual({ asset: 'palm' })
    expect(trunk).not.toBe(asset.trunk)
    expect(trunk.geometry).toBe(asset.trunk.geometry)
    expect(trunk.material).toBe(asset.trunkMaterial)
    expect(leaves.material).toEqual(asset.leaves.material)
    expect(trunk.position.toArray()).toEqual(asset.trunk.position.toArray())
    expect(trunk.castShadow).toBe(false)
    expect(trunk.receiveShadow).toBe(false)
    expect(asset.trunk.castShadow).toBe(true)
    expect(asset.trunk.receiveShadow).toBe(true)
    expect(collectPalmRevealMeshes(model).size).toBe(2)
    asset.dispose()
  })

  test('tests the transformed canopy against the camera-to-player aperture', () => {
    const asset = createPalmAsset()
    const camera = new PerspectiveCamera(60, 1, 0.1, 100)
    camera.position.set(0, 2, 10)
    camera.lookAt(0, 2, 0)
    camera.updateMatrixWorld(true)
    const aperture = createLandrushRobotRevealAperture(16)
    updateLandrushRobotRevealAperture({
      aperture,
      camera,
      centerX: 360,
      centerY: 360,
      farDepth: 9.8,
      height: 720,
      ndcZ: new Vector3(0, 2, 0).project(camera).z,
      radiusPx: 90,
      width: 720,
    })
    const model = createLandrushIslandPalmPresentation(asset.source)
    const placement = new Group()
    placement.position.set(0, 0, 4)
    placement.rotation.y = 0.7
    placement.add(model)
    placement.updateWorldMatrix(true, true)
    const frontBounds = setLandrushRevealOwnedMeshesBounds(model, new Set(), new Box3())
    expect(landrushRobotRevealApertureIntersectsBox(aperture, frontBounds)).toBe(true)

    placement.position.z = -5
    placement.updateWorldMatrix(true, true)
    const behindBounds = setLandrushRevealOwnedMeshesBounds(model, new Set(), new Box3())
    expect(landrushRobotRevealApertureIntersectsBox(aperture, behindBounds)).toBe(false)

    placement.position.set(10, 0, 4)
    placement.updateWorldMatrix(true, true)
    const outsideBounds = setLandrushRevealOwnedMeshesBounds(model, new Set(), new Box3())
    expect(landrushRobotRevealApertureIntersectsBox(aperture, outsideBounds)).toBe(false)
    asset.dispose()
  })

  for (const kind of ['soft', 'clip'] as const) {
    test(`${kind} reveal preserves palm textures, affects only the selected palm, and restores on exit`, () => {
      const asset = createPalmAsset()
      const model = createLandrushIslandPalmPresentation(asset.source)
      const sibling = createLandrushIslandPalmPresentation(asset.source)
      const trunk = model.getObjectByName('trunk') as Mesh
      const leaves = model.getObjectByName('leaves') as Mesh
      const siblingTrunk = sibling.getObjectByName('trunk') as Mesh
      const siblingLeaves = sibling.getObjectByName('leaves') as Mesh
      const originalLeaves = leaves.material
      const owner = new LandrushIslandMaterialPresentationOwner()
      const clippingPlanes = [new Plane(new Vector3(0, 0, 1), -1)]
      const presentation = kind === 'soft' ? { kind } : { kind, clippingPlanes }
      const meshes = collectPalmRevealMeshes(model, 0.8)
      owner.syncRevealMeshes(meshes, presentation)
      const trunkReveal = trunk.material as MeshStandardMaterial
      const leafReveal = (leaves.material as MeshStandardMaterial[])[0]!

      expect(trunkReveal).not.toBe(asset.trunkMaterial)
      expect(leafReveal).not.toBe(asset.leafMaterial)
      expect(trunkReveal.map).toBe(asset.texture)
      expect(leafReveal.map).toBe(asset.texture)
      expect(leafReveal.alphaMap).toBe(asset.texture)
      expect(leafReveal.alphaTest).toBe(0.4)
      expect(leafReveal.side).toBe(DoubleSide)
      expect(siblingTrunk.material).toBe(asset.trunkMaterial)
      expect(siblingLeaves.material).toEqual(originalLeaves)
      expect(asset.trunkMaterial.transparent).toBe(false)
      expect(asset.trunkMaterial.clippingPlanes).toBeNull()
      expect(Object.hasOwn(asset.trunkMaterial, 'opacityNode')).toBe(false)
      expect(owner.ownedMaterialCount).toBe(2)

      if (kind === 'soft') {
        const nodeMaterial = new StandardNodeLibrary().fromMaterial(leafReveal)
        expect(nodeMaterial.opacityNode).toBeDefined()
        expect(nodeMaterial.alphaTestNode).toBeDefined()
        expect(nodeMaterial.map).toBe(asset.texture)
        expect(nodeMaterial.depthWrite).toBe(true)
      } else {
        expect(leafReveal.clippingPlanes).toBe(clippingPlanes)
        expect(leafReveal.clipIntersection).toBe(true)
      }

      owner.clearReveal()
      expect(trunk.material).toBe(asset.trunkMaterial)
      expect(leaves.material).toBe(originalLeaves)
      owner.syncRevealMeshes(meshes, presentation)
      expect(trunk.material).toBe(trunkReveal)
      expect((leaves.material as MeshStandardMaterial[])[0]).toBe(leafReveal)
      expect(owner.ownedMaterialCount).toBe(2)
      owner.dispose()
      expect(trunk.material).toBe(asset.trunkMaterial)
      expect(leaves.material).toBe(originalLeaves)
      asset.dispose()
    })
  }
})
