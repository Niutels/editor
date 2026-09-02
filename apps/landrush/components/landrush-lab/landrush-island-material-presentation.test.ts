import { afterEach, describe, expect, test } from 'bun:test'
import type { MaterialSchema } from '@pascal-app/core'
import { clearMaterialCache, createMaterial } from '@pascal-app/viewer'
import {
  AdditiveBlending,
  Bone,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  NoBlending,
  NormalBlending,
  Plane,
  PlaneGeometry,
  Skeleton,
  SkinnedMesh,
  Texture,
  TextureLoader,
  Uint16BufferAttribute,
} from 'three'
import { color, float } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { LandrushIslandMaterialPresentationOwner } from './landrush-island-material-presentation'
import { LANDRUSH_ROBOT_SCREEN_REVEAL_ALPHA_HASH_SCALE } from './robot-screen-reveal-alpha-hash'

const originalTextureLoadAsync = TextureLoader.prototype.loadAsync

afterEach(() => {
  TextureLoader.prototype.loadAsync = originalTextureLoadAsync
  clearMaterialCache()
})

function createMesh(material: Material | Material[]) {
  return new Mesh(new PlaneGeometry(1, 1), material)
}

function readAlphaTestNode(material: Material) {
  return (material as Material & { alphaTestNode?: unknown }).alphaTestNode ?? null
}

function disposeMesh(mesh: Mesh) {
  mesh.geometry.dispose()
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  for (const material of new Set(materials)) material.dispose()
}

describe('Landrush island material presentation ownership', () => {
  test('reuses one shared-source reveal variant across leave and re-entry without retaining inactive meshes', () => {
    expect(LANDRUSH_ROBOT_SCREEN_REVEAL_ALPHA_HASH_SCALE).toBe(4)
    const owner = new LandrushIslandMaterialPresentationOwner()
    const source = new MeshBasicMaterial({ transparent: false })
    const foreground = createMesh(source)
    const background = createMesh(source)
    const sourceVersion = source.version

    owner.syncRevealMeshes([foreground], { kind: 'soft' })
    const reveal = foreground.material as Material & { opacityNode?: unknown }

    expect(reveal).not.toBe(source)
    expect(background.material).toBe(source)
    expect(source.transparent).toBe(false)
    expect(source.version).toBe(sourceVersion)
    expect(Object.hasOwn(source, 'opacityNode')).toBe(false)
    expect(source.alphaHash).toBe(false)
    expect(reveal.transparent).toBe(false)
    expect(reveal.alphaHash).toBe(false)
    expect(reveal.alphaToCoverage).toBe(false)
    expect(readAlphaTestNode(reveal)).not.toBeNull()
    expect(reveal.depthWrite).toBe(true)
    expect(Object.hasOwn(reveal, 'opacityNode')).toBe(true)

    const revealVersion = reveal.version
    let disposeCount = 0
    reveal.addEventListener('dispose', () => {
      disposeCount += 1
    })
    owner.syncRevealMeshes([foreground], { kind: 'soft' })
    expect(foreground.material).toBe(reveal)
    expect(reveal.version).toBe(revealVersion)

    owner.clearReveal()
    expect(foreground.material).toBe(source)
    expect(owner.activeBindingCount).toBe(0)
    expect(owner.ownedMaterialCount).toBe(1)
    expect(disposeCount).toBe(0)

    owner.syncRevealMeshes([background], { kind: 'soft' })
    expect(background.material).toBe(reveal)
    expect(foreground.material).toBe(source)
    expect(reveal.version).toBe(revealVersion)
    owner.syncRevealMeshes([foreground, background], { kind: 'soft' })
    expect(foreground.material).toBe(reveal)
    expect(background.material).toBe(reveal)
    expect(reveal.version).toBe(revealVersion)
    owner.clearReveal()
    expect(owner.activeBindingCount).toBe(0)

    owner.dispose()
    expect(owner.ownedMaterialCount).toBe(0)
    expect(disposeCount).toBe(1)
    owner.dispose()
    expect(disposeCount).toBe(1)

    foreground.geometry.dispose()
    background.geometry.dispose()
    source.dispose()
  })

  test('reuses the same combined variant for floor then reveal and reveal then floor', () => {
    const firstOwner = new LandrushIslandMaterialPresentationOwner()
    const firstSource = new MeshBasicMaterial()
    const firstMesh = createMesh(firstSource)

    firstOwner.acquireFloorFade(firstMesh)
    const firstFloor = firstMesh.material
    firstOwner.syncRevealMeshes([firstMesh], { kind: 'soft' })
    const firstCombined = firstMesh.material as Material
    expect(firstCombined).not.toBe(firstFloor)
    expect(firstCombined.transparent).toBe(false)
    expect(firstCombined.alphaHash).toBe(false)
    expect(readAlphaTestNode(firstCombined)).not.toBeNull()
    expect(firstCombined.depthWrite).toBe(true)
    firstOwner.releaseFloorFade(firstMesh)
    expect(firstMesh.material).not.toBe(firstCombined)
    firstOwner.acquireFloorFade(firstMesh)
    expect(firstMesh.material).toBe(firstCombined)
    firstOwner.clearReveal()
    expect(firstMesh.material).toBe(firstFloor)
    firstOwner.releaseFloorFade(firstMesh)
    expect(firstMesh.material).toBe(firstSource)
    expect(firstOwner.activeBindingCount).toBe(0)

    const secondOwner = new LandrushIslandMaterialPresentationOwner()
    const secondSource = new MeshBasicMaterial()
    const secondMesh = createMesh(secondSource)

    secondOwner.syncRevealMeshes([secondMesh], { kind: 'soft' })
    const secondReveal = secondMesh.material
    secondOwner.acquireFloorFade(secondMesh)
    const secondCombined = secondMesh.material as Material
    expect(secondCombined).not.toBe(secondReveal)
    expect(secondCombined.transparent).toBe(false)
    expect(secondCombined.alphaHash).toBe(false)
    expect(readAlphaTestNode(secondCombined)).not.toBeNull()
    expect(secondCombined.depthWrite).toBe(true)
    secondOwner.clearReveal()
    const secondFloor = secondMesh.material
    secondOwner.syncRevealMeshes([secondMesh], { kind: 'soft' })
    expect(secondMesh.material).toBe(secondCombined)
    secondOwner.clearReveal()
    expect(secondMesh.material).toBe(secondFloor)
    secondOwner.releaseFloorFade(secondMesh)
    expect(secondMesh.material).toBe(secondSource)
    expect(secondOwner.activeBindingCount).toBe(0)

    firstOwner.dispose()
    secondOwner.dispose()

    firstMesh.geometry.dispose()
    firstSource.dispose()
    secondMesh.geometry.dispose()
    secondSource.dispose()
  })

  test('owns every array slot and restores the exact original material array', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const firstSource = new MeshBasicMaterial()
    const integratedRevealSource = new MeshBasicMaterial()
    integratedRevealSource.userData.landrushRobotScreenRevealSoftMask = true
    const original = [firstSource, integratedRevealSource]
    const mesh = createMesh(original)
    const unaffected = createMesh(firstSource)

    owner.syncRevealMeshes([mesh], { kind: 'soft' })
    const revealMaterials = mesh.material as Material[]
    expect(revealMaterials[0]).not.toBe(firstSource)
    expect(revealMaterials[1]).toBe(integratedRevealSource)
    expect(unaffected.material).toBe(firstSource)

    owner.acquireFloorFade(mesh)
    const combinedMaterials = mesh.material as Material[]
    expect(combinedMaterials[0]).not.toBe(firstSource)
    expect(combinedMaterials[1]).not.toBe(integratedRevealSource)
    expect(combinedMaterials[0]?.transparent).toBe(false)
    expect(combinedMaterials[0]?.alphaHash).toBe(false)
    expect(readAlphaTestNode(combinedMaterials[0]!)).not.toBeNull()
    expect(combinedMaterials[0]?.depthWrite).toBe(true)
    expect(combinedMaterials[1]?.transparent).toBe(false)
    expect(combinedMaterials[1]?.alphaHash).toBe(false)
    expect(readAlphaTestNode(combinedMaterials[1]!)).toBeNull()

    owner.clearReveal()
    const floorMaterials = mesh.material as Material[]
    expect(floorMaterials[0]).not.toBe(firstSource)
    expect(floorMaterials[1]).not.toBe(integratedRevealSource)
    owner.releaseFloorFade(mesh)
    expect(mesh.material).toBe(original)
    expect(owner.activeBindingCount).toBe(0)
    expect(owner.ownedMaterialCount).toBeGreaterThan(0)
    owner.dispose()
    expect(owner.ownedMaterialCount).toBe(0)

    mesh.geometry.dispose()
    unaffected.geometry.dispose()
    firstSource.dispose()
    integratedRevealSource.dispose()
  })

  test('keeps prepared floors opaque and blends only their fractional opacity state', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const source = new MeshBasicMaterial({ depthWrite: true })
    const firstMesh = createMesh(source)
    const secondMesh = createMesh(source)

    owner.acquireFloorFade(firstMesh)
    owner.acquireFloorFade(secondMesh)
    const opaqueVariant = firstMesh.material as Material
    const opaqueVersion = opaqueVariant.version
    expect(secondMesh.material).toBe(opaqueVariant)
    expect(opaqueVariant.transparent).toBe(false)
    expect(opaqueVariant.alphaHash).toBe(false)
    expect(readAlphaTestNode(opaqueVariant)).toBeNull()
    expect(opaqueVariant.depthWrite).toBe(true)

    owner.updateFloorFade(firstMesh, true)
    const translucentVariant = firstMesh.material as Material
    expect(translucentVariant).not.toBe(opaqueVariant)
    expect(translucentVariant.transparent).toBe(true)
    expect(translucentVariant.alphaHash).toBe(false)
    expect(translucentVariant.alphaToCoverage).toBe(false)
    expect(readAlphaTestNode(translucentVariant)).toBeNull()
    expect(translucentVariant.depthWrite).toBe(false)
    expect(secondMesh.material).toBe(opaqueVariant)
    expect(opaqueVariant.depthWrite).toBe(true)

    owner.updateFloorFade(firstMesh, false)
    expect(firstMesh.material).toBe(opaqueVariant)
    expect(opaqueVariant.version).toBe(opaqueVersion)
    owner.releaseFloorFade(firstMesh)
    owner.releaseFloorFade(secondMesh)
    expect(owner.activeBindingCount).toBe(0)
    owner.dispose()

    firstMesh.geometry.dispose()
    secondMesh.geometry.dispose()
    source.dispose()
  })

  test('prepares only floor, reveal, and overlap states declared reachable per mesh', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const source = new MeshBasicMaterial({ depthWrite: true })
    const floorMesh = createMesh(source)
    const revealMesh = createMesh(source)
    const overlapMesh = createMesh(source)
    const inactiveMesh = createMesh(source)

    const group = owner.createRenderReadinessRepresentative(
      [
        { floor: true, mesh: floorMesh, reveal: false },
        { floor: true, mesh: floorMesh, reveal: false },
        { floor: false, mesh: revealMesh, reveal: true },
        { floor: true, mesh: overlapMesh, reveal: true },
        { floor: false, mesh: inactiveMesh, reveal: false },
      ],
      { kind: 'soft' },
    )
    const representatives = group.children as Mesh[]
    const floorRepresentatives = representatives.filter(
      (representative) => representative.geometry === floorMesh.geometry,
    )
    const revealRepresentatives = representatives.filter(
      (representative) => representative.geometry === revealMesh.geometry,
    )
    const overlapRepresentatives = representatives.filter(
      (representative) => representative.geometry === overlapMesh.geometry,
    )

    expect(representatives).toHaveLength(5)
    expect(floorRepresentatives).toHaveLength(2)
    expect(revealRepresentatives).toHaveLength(1)
    expect(overlapRepresentatives).toHaveLength(2)
    expect(
      representatives.filter((representative) => representative.geometry === inactiveMesh.geometry),
    ).toHaveLength(0)
    expect(new Set(representatives.map((representative) => representative.material)).size).toBe(5)
    expect(owner.ownedMaterialCount).toBe(5)
    expect(owner.activeBindingCount).toBe(0)
    expect(floorMesh.material).toBe(source)
    expect(revealMesh.material).toBe(source)
    expect(overlapMesh.material).toBe(source)
    expect(inactiveMesh.material).toBe(source)

    group.clear()
    owner.dispose()
    floorMesh.geometry.dispose()
    revealMesh.geometry.dispose()
    overlapMesh.geometry.dispose()
    inactiveMesh.geometry.dispose()
    source.dispose()
  })

  test('skips unreachable soft reveal states for sources with an integrated soft mask', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const source = new MeshBasicMaterial({ depthWrite: true })
    source.userData.landrushRobotScreenRevealSoftMask = true
    const revealMesh = createMesh(source)
    const overlapMesh = createMesh(source)

    const group = owner.createRenderReadinessRepresentative(
      [
        { floor: false, mesh: revealMesh, reveal: true },
        { floor: true, mesh: overlapMesh, reveal: true },
      ],
      { kind: 'soft' },
    )
    const representatives = group.children as Mesh[]

    expect(representatives).toHaveLength(2)
    expect(
      representatives.filter((representative) => representative.geometry === revealMesh.geometry),
    ).toHaveLength(0)
    expect(
      representatives.filter((representative) => representative.geometry === overlapMesh.geometry),
    ).toHaveLength(2)
    expect((representatives[0]!.material as Material).alphaHash).toBe(false)
    expect(readAlphaTestNode(representatives[0]!.material as Material)).toBeNull()
    expect((representatives[1]!.material as Material).alphaHash).toBe(false)
    expect((representatives[1]!.material as Material).transparent).toBe(true)
    expect(readAlphaTestNode(representatives[1]!.material as Material)).toBeNull()
    expect(owner.ownedMaterialCount).toBe(2)
    expect(revealMesh.material).toBe(source)
    expect(overlapMesh.material).toBe(source)

    group.clear()
    owner.dispose()
    revealMesh.geometry.dispose()
    overlapMesh.geometry.dispose()
    source.dispose()
  })

  test('prepares every reachable assignment for mixed multi-material meshes', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const source = new MeshBasicMaterial({ depthWrite: true })
    const integratedSource = new MeshBasicMaterial({ depthWrite: true })
    integratedSource.userData.landrushRobotScreenRevealSoftMask = true
    const original = [source, integratedSource]
    const mesh = createMesh(original)

    const group = owner.createRenderReadinessRepresentative([{ floor: true, mesh, reveal: true }], {
      kind: 'soft',
    })
    const representatives = group.children as Mesh[]
    const assignments = representatives.map(
      (representative) => representative.material as Material[],
    )

    expect(representatives).toHaveLength(5)
    expect(assignments.every((assignment) => Array.isArray(assignment))).toBe(true)
    expect(assignments.every((assignment) => assignment.length === 2)).toBe(true)
    expect(assignments[2]![1]).toBe(integratedSource)
    expect(assignments[3]![1]).toBe(assignments[0]![1])
    expect(assignments[4]![1]).toBe(assignments[1]![1])
    expect(new Set(assignments.map((assignment) => assignment[0])).size).toBe(5)
    expect(owner.ownedMaterialCount).toBe(7)
    expect(owner.activeBindingCount).toBe(0)
    expect(mesh.material).toBe(original)

    group.clear()
    owner.dispose()
    mesh.geometry.dispose()
    source.dispose()
    integratedSource.dispose()
  })

  test('prepares detached soft states once and reuses every cached variant at runtime', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const source = new MeshBasicMaterial({ depthWrite: true })
    const firstMesh = createMesh(source)
    const secondMesh = createMesh(source)

    const group = owner.createRenderReadinessRepresentative(
      [
        { floor: true, mesh: firstMesh, reveal: true },
        { floor: true, mesh: firstMesh, reveal: true },
        { floor: true, mesh: secondMesh, reveal: true },
      ],
      { kind: 'soft' },
    )
    const representatives = group.children as Mesh[]
    const firstRepresentatives = representatives.slice(0, 5)
    const preparedMaterials = new Set(
      firstRepresentatives.map((representative) => representative.material as Material),
    )

    expect(representatives).toHaveLength(5)
    expect(firstRepresentatives).toHaveLength(5)
    expect(preparedMaterials.size).toBe(5)
    expect((firstRepresentatives[2]!.material as Material).transparent).toBe(false)
    expect((firstRepresentatives[2]!.material as Material).alphaHash).toBe(false)
    expect(readAlphaTestNode(firstRepresentatives[2]!.material as Material)).not.toBeNull()
    expect((firstRepresentatives[2]!.material as Material).depthWrite).toBe(true)
    expect((firstRepresentatives[3]!.material as Material).transparent).toBe(false)
    expect((firstRepresentatives[3]!.material as Material).alphaHash).toBe(false)
    expect(readAlphaTestNode(firstRepresentatives[3]!.material as Material)).not.toBeNull()
    expect((firstRepresentatives[3]!.material as Material).depthWrite).toBe(true)
    expect((firstRepresentatives[4]!.material as Material).transparent).toBe(true)
    expect((firstRepresentatives[4]!.material as Material).alphaHash).toBe(false)
    expect((firstRepresentatives[4]!.material as Material).depthWrite).toBe(false)
    expect(owner.ownedMaterialCount).toBe(5)
    expect(owner.activeBindingCount).toBe(0)
    expect(firstMesh.material).toBe(source)
    expect(secondMesh.material).toBe(source)
    for (const representative of firstRepresentatives) {
      expect(representative).not.toBe(firstMesh)
      expect(representative).toBeInstanceOf(Mesh)
      expect(representative.geometry).toBe(firstMesh.geometry)
      expect(representative.parent).toBe(group)
    }
    expect(
      representatives.some((representative) => representative.geometry === secondMesh.geometry),
    ).toBe(false)

    owner.acquireFloorFade(firstMesh)
    expect(firstMesh.material).toBe(firstRepresentatives[0]!.material)
    owner.updateFloorFade(firstMesh, true)
    expect(firstMesh.material).toBe(firstRepresentatives[1]!.material)
    owner.syncRevealMeshes([firstMesh], { kind: 'soft' })
    expect(firstMesh.material).toBe(firstRepresentatives[4]!.material)
    owner.updateFloorFade(firstMesh, false)
    expect(firstMesh.material).toBe(firstRepresentatives[3]!.material)
    owner.releaseFloorFade(firstMesh)
    expect(firstMesh.material).toBe(firstRepresentatives[2]!.material)
    expect(owner.ownedMaterialCount).toBe(5)
    owner.clearReveal()
    expect(firstMesh.material).toBe(source)
    expect(owner.activeBindingCount).toBe(0)

    let materialDisposeCount = 0
    for (const material of preparedMaterials) {
      material.addEventListener('dispose', () => {
        materialDisposeCount += 1
      })
    }
    let geometryDisposeCount = 0
    firstMesh.geometry.addEventListener('dispose', () => {
      geometryDisposeCount += 1
    })
    secondMesh.geometry.addEventListener('dispose', () => {
      geometryDisposeCount += 1
    })

    group.clear()
    expect(group.children).toHaveLength(0)
    expect(materialDisposeCount).toBe(0)
    expect(geometryDisposeCount).toBe(0)
    expect(owner.ownedMaterialCount).toBe(5)

    owner.dispose()
    expect(materialDisposeCount).toBe(5)
    expect(geometryDisposeCount).toBe(0)
    expect(owner.ownedMaterialCount).toBe(0)
    owner.dispose()
    expect(materialDisposeCount).toBe(5)

    firstMesh.geometry.dispose()
    secondMesh.geometry.dispose()
    source.dispose()
  })

  test('collapses many equivalent meshes while preserving distinct material and geometry pipelines', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const source = new MeshBasicMaterial()
    const distinctSource = new MeshBasicMaterial()
    const equivalentMeshes = Array.from({ length: 96 }, () => createMesh(source))
    const distinctMaterialMesh = createMesh(distinctSource)
    const nonIndexedMesh = new Mesh(new PlaneGeometry(1, 1).toNonIndexed(), source)
    const coloredGeometry = new PlaneGeometry(1, 1)
    coloredGeometry.setAttribute(
      'color',
      new Float32BufferAttribute(
        new Float32Array(coloredGeometry.getAttribute('position').count * 3),
        3,
      ),
    )
    const coloredMesh = new Mesh(coloredGeometry, source)
    const instancedMesh = new InstancedMesh(new PlaneGeometry(1, 1), source, 2)
    const morphGeometry = new PlaneGeometry(1, 1)
    morphGeometry.morphAttributes.position = [
      new Float32BufferAttribute(
        new Float32Array(morphGeometry.getAttribute('position').count * 3),
        3,
      ),
    ]
    const morphMesh = new Mesh(morphGeometry, source)
    morphMesh.updateMorphTargets()
    const skinnedGeometry = new PlaneGeometry(1, 1)
    const skinnedVertexCount = skinnedGeometry.getAttribute('position').count
    skinnedGeometry.setAttribute(
      'skinIndex',
      new Uint16BufferAttribute(new Uint16Array(skinnedVertexCount * 4), 4),
    )
    const skinWeights = new Float32Array(skinnedVertexCount * 4)
    for (let index = 0; index < skinnedVertexCount; index += 1) skinWeights[index * 4] = 1
    skinnedGeometry.setAttribute('skinWeight', new Float32BufferAttribute(skinWeights, 4))
    const skinnedMesh = new SkinnedMesh(skinnedGeometry, source)
    const bone = new Bone()
    skinnedMesh.add(bone)
    skinnedMesh.bind(new Skeleton([bone]))

    const group = owner.createRenderReadinessRepresentative(
      [
        ...equivalentMeshes.map((mesh) => ({ floor: true, mesh, reveal: true })),
        { floor: true, mesh: distinctMaterialMesh, reveal: true },
        { floor: true, mesh: nonIndexedMesh, reveal: true },
        { floor: true, mesh: coloredMesh, reveal: true },
        { floor: true, mesh: instancedMesh, reveal: true },
        { floor: true, mesh: morphMesh, reveal: true },
        { floor: true, mesh: skinnedMesh, reveal: true },
      ],
      { kind: 'soft' },
    )
    const representatives = group.children as Mesh[]

    expect(representatives).toHaveLength(35)
    expect(
      representatives.filter(
        (representative) => representative.geometry === equivalentMeshes[0]!.geometry,
      ),
    ).toHaveLength(5)
    for (const duplicate of equivalentMeshes.slice(1)) {
      expect(
        representatives.some((representative) => representative.geometry === duplicate.geometry),
      ).toBe(false)
    }
    for (const distinct of [
      distinctMaterialMesh,
      nonIndexedMesh,
      coloredMesh,
      instancedMesh,
      morphMesh,
      skinnedMesh,
    ]) {
      expect(
        representatives.filter((representative) => representative.geometry === distinct.geometry),
      ).toHaveLength(5)
    }

    group.clear()
    owner.dispose()
    for (const mesh of equivalentMeshes) mesh.geometry.dispose()
    distinctMaterialMesh.geometry.dispose()
    nonIndexedMesh.geometry.dispose()
    coloredGeometry.dispose()
    instancedMesh.geometry.dispose()
    morphGeometry.dispose()
    skinnedGeometry.dispose()
    source.dispose()
    distinctSource.dispose()
  })

  test('retains representatives for each material-array group selection', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const firstSource = new MeshBasicMaterial()
    const secondSource = new MeshBasicMaterial()
    const materials = [firstSource, secondSource]
    const firstGeometry = new PlaneGeometry(1, 1)
    firstGeometry.clearGroups()
    firstGeometry.addGroup(0, firstGeometry.index!.count, 0)
    const secondGeometry = new PlaneGeometry(1, 1)
    secondGeometry.clearGroups()
    secondGeometry.addGroup(0, secondGeometry.index!.count, 1)
    const firstMesh = new Mesh(firstGeometry, materials)
    const secondMesh = new Mesh(secondGeometry, materials)

    const group = owner.createRenderReadinessRepresentative(
      [
        { floor: false, mesh: firstMesh, reveal: true },
        { floor: false, mesh: secondMesh, reveal: true },
      ],
      { kind: 'soft' },
    )

    expect(group.children).toHaveLength(2)
    expect((group.children[0] as Mesh).geometry).toBe(firstGeometry)
    expect((group.children[1] as Mesh).geometry).toBe(secondGeometry)

    group.clear()
    owner.dispose()
    firstGeometry.dispose()
    secondGeometry.dispose()
    firstSource.dispose()
    secondSource.dispose()
  })

  test('keeps the owned variant count exact across many source buckets and repeated eviction', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const sources = Array.from({ length: 128 }, () => new MeshBasicMaterial())
    const meshes = sources.map((source) => createMesh(source))
    const representatives = owner.createRenderReadinessRepresentative(
      meshes.map((mesh) => ({ floor: false, mesh, reveal: true })),
      { kind: 'soft' },
    )

    expect(representatives.children).toHaveLength(sources.length)
    expect(owner.ownedMaterialCount).toBe(sources.length)
    for (let index = 0; index < sources.length; index += 2) sources[index]!.dispose()
    expect(owner.ownedMaterialCount).toBe(sources.length / 2)
    for (let index = 0; index < sources.length; index += 2) sources[index]!.dispose()
    expect(owner.ownedMaterialCount).toBe(sources.length / 2)

    owner.dispose()
    expect(owner.ownedMaterialCount).toBe(0)
    owner.dispose()
    expect(owner.ownedMaterialCount).toBe(0)
    representatives.clear()
    for (const mesh of meshes) mesh.geometry.dispose()
    for (let index = 1; index < sources.length; index += 2) sources[index]!.dispose()
  })

  test('prepares from an active binding source without composing presentation variants', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const source = new MeshBasicMaterial({ depthWrite: true })
    const mesh = createMesh(source)

    expect(owner.acquireFloorFade(mesh)).toBe(1)
    const floorOpaque = mesh.material
    const group = owner.createRenderReadinessRepresentative([{ floor: true, mesh, reveal: true }], {
      kind: 'soft',
    })
    const representatives = group.children as Mesh[]

    expect(representatives).toHaveLength(5)
    expect(owner.ownedMaterialCount).toBe(5)
    expect(owner.activeBindingCount).toBe(1)
    expect(mesh.material).toBe(floorOpaque)
    expect(representatives[0]!.material).toBe(floorOpaque)

    owner.updateFloorFade(mesh, true)
    expect(mesh.material).toBe(representatives[1]!.material)
    owner.syncRevealMeshes([mesh], { kind: 'soft' })
    expect(mesh.material).toBe(representatives[4]!.material)
    owner.updateFloorFade(mesh, false)
    expect(mesh.material).toBe(representatives[3]!.material)
    owner.releaseFloorFade(mesh)
    expect(mesh.material).toBe(representatives[2]!.material)
    expect(owner.ownedMaterialCount).toBe(5)
    owner.clearReveal()
    expect(mesh.material).toBe(source)
    expect(owner.activeBindingCount).toBe(0)

    group.clear()
    owner.dispose()
    mesh.geometry.dispose()
    source.dispose()
  })

  test('deduplicates integrated-soft array states while preserving authored blending', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const transparentSource = new MeshBasicMaterial({ depthWrite: false, transparent: true })
    transparentSource.userData.landrushRobotScreenRevealSoftMask = true
    const transmissionSource = new MeshPhysicalMaterial({ transmission: 0.8 })
    transmissionSource.userData.landrushRobotScreenRevealSoftMask = true
    const original = [transparentSource, transmissionSource]
    const mesh = createMesh(original)

    const group = owner.createRenderReadinessRepresentative(
      [
        { floor: true, mesh, reveal: true },
        { floor: true, mesh, reveal: true },
      ],
      { kind: 'soft' },
    )
    const representatives = group.children as Mesh[]
    const opaqueMaterials = representatives[0]!.material as Material[]
    const translucentMaterials = representatives[1]!.material as Material[]

    expect(representatives).toHaveLength(2)
    expect(owner.ownedMaterialCount).toBe(4)
    expect(owner.activeBindingCount).toBe(0)
    expect(mesh.material).toBe(original)
    expect(opaqueMaterials).not.toBe(original)
    expect(translucentMaterials).not.toBe(original)
    expect(opaqueMaterials[0]).not.toBe(transparentSource)
    expect(opaqueMaterials[0]?.transparent).toBe(true)
    expect(opaqueMaterials[0]?.alphaHash).toBe(false)
    expect(readAlphaTestNode(opaqueMaterials[0]!)).toBeNull()
    expect(opaqueMaterials[0]?.depthWrite).toBe(false)
    expect((opaqueMaterials[1] as MeshPhysicalMaterial).transmission).toBe(0.8)
    expect(opaqueMaterials[1]?.alphaHash).toBe(false)
    expect(readAlphaTestNode(opaqueMaterials[1]!)).toBeNull()
    expect(opaqueMaterials[1]?.depthWrite).toBe(true)
    expect(translucentMaterials[0]?.transparent).toBe(true)
    expect(translucentMaterials[0]?.alphaHash).toBe(false)
    expect(readAlphaTestNode(translucentMaterials[0]!)).toBeNull()
    expect(translucentMaterials[0]?.depthWrite).toBe(false)
    expect((translucentMaterials[1] as MeshPhysicalMaterial).transmission).toBe(0.8)
    expect(translucentMaterials[1]?.alphaHash).toBe(false)
    expect(readAlphaTestNode(translucentMaterials[1]!)).toBeNull()
    expect(translucentMaterials[1]?.depthWrite).toBe(false)
    expect(transparentSource.alphaHash).toBe(false)
    expect(transmissionSource.alphaHash).toBe(false)
    expect(transmissionSource.depthWrite).toBe(true)

    group.clear()
    owner.dispose()
    mesh.geometry.dispose()
    transparentSource.dispose()
    transmissionSource.dispose()
  })

  test('keeps special-compositor soft reveals on the sorted blending path', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const transparentSource = new MeshBasicMaterial({ depthWrite: false, transparent: true })
    const transmissionSource = new MeshPhysicalMaterial({ transmission: 0.8 })
    const backdropSource = new MeshBasicNodeMaterial()
    const backdropNode = color('#334455')
    backdropSource.backdropNode = backdropNode
    const blendedSource = new MeshBasicMaterial({ blending: AdditiveBlending, depthWrite: false })
    const noBlendingSource = new MeshBasicMaterial({ blending: NoBlending })
    const transparentMesh = createMesh(transparentSource)
    const transmissionMesh = createMesh(transmissionSource)
    const backdropMesh = createMesh(backdropSource)
    const blendedMesh = createMesh(blendedSource)
    const noBlendingMesh = createMesh(noBlendingSource)

    owner.syncRevealMeshes(
      [transparentMesh, transmissionMesh, backdropMesh, blendedMesh, noBlendingMesh],
      { kind: 'soft' },
    )

    const transparentReveal = transparentMesh.material as Material
    const transmissionReveal = transmissionMesh.material as MeshPhysicalMaterial
    const backdropReveal = backdropMesh.material as MeshBasicNodeMaterial
    const blendedReveal = blendedMesh.material as Material
    const noBlendingReveal = noBlendingMesh.material as Material
    expect(transparentReveal.transparent).toBe(true)
    expect(transparentReveal.blending).toBe(NormalBlending)
    expect(transparentReveal.alphaHash).toBe(false)
    expect(readAlphaTestNode(transparentReveal)).toBeNull()
    expect(transparentReveal.depthWrite).toBe(false)
    expect(transmissionReveal.transparent).toBe(true)
    expect(transmissionReveal.blending).toBe(NormalBlending)
    expect(transmissionReveal.transmission).toBe(0.8)
    expect(transmissionReveal.alphaHash).toBe(false)
    expect(readAlphaTestNode(transmissionReveal)).toBeNull()
    expect(transmissionReveal.depthWrite).toBe(false)
    expect(backdropReveal.transparent).toBe(true)
    expect(backdropReveal.blending).toBe(NormalBlending)
    expect(backdropReveal.backdropNode).toBe(backdropNode)
    expect(backdropReveal.alphaHash).toBe(false)
    expect(backdropReveal.depthWrite).toBe(false)
    expect(blendedReveal.transparent).toBe(true)
    expect(blendedReveal.blending).toBe(AdditiveBlending)
    expect(blendedReveal.alphaHash).toBe(false)
    expect(readAlphaTestNode(blendedReveal)).toBeNull()
    expect(blendedReveal.depthWrite).toBe(false)
    expect(noBlendingReveal.transparent).toBe(true)
    expect(noBlendingReveal.blending).toBe(NormalBlending)
    expect(noBlendingReveal.alphaHash).toBe(false)
    expect(noBlendingReveal.depthWrite).toBe(false)

    owner.clearReveal()
    expect(transparentMesh.material).toBe(transparentSource)
    expect(transmissionMesh.material).toBe(transmissionSource)
    expect(backdropMesh.material).toBe(backdropSource)
    expect(blendedMesh.material).toBe(blendedSource)
    expect(noBlendingMesh.material).toBe(noBlendingSource)
    expect(transparentSource.alphaHash).toBe(false)
    expect(transparentSource.transparent).toBe(true)
    expect(transparentSource.depthWrite).toBe(false)
    expect(transmissionSource.alphaHash).toBe(false)
    expect(transmissionSource.transparent).toBe(false)
    expect(transmissionSource.depthWrite).toBe(true)
    expect(backdropSource.transparent).toBe(false)
    expect(backdropSource.depthWrite).toBe(true)
    expect(blendedSource.alphaHash).toBe(false)
    expect(blendedSource.transparent).toBe(false)
    expect(blendedSource.blending).toBe(AdditiveBlending)
    expect(noBlendingSource.transparent).toBe(false)
    expect(noBlendingSource.blending).toBe(NoBlending)

    owner.dispose()
    transparentMesh.geometry.dispose()
    transmissionMesh.geometry.dispose()
    backdropMesh.geometry.dispose()
    blendedMesh.geometry.dispose()
    noBlendingMesh.geometry.dispose()
    transparentSource.dispose()
    transmissionSource.dispose()
    backdropSource.dispose()
    blendedSource.dispose()
    noBlendingSource.dispose()
  })

  test('preserves authored cutout modes while composing the soft-reveal threshold', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const hashedSource = new MeshBasicMaterial()
    hashedSource.alphaHash = true
    const coverageSource = new MeshBasicMaterial()
    coverageSource.alphaToCoverage = true
    const alphaTestSource = new MeshBasicMaterial({ alphaTest: 0.35 })
    const authoredAlphaTestNode = float(0.45)
    ;(
      alphaTestSource as Material & {
        alphaTestNode?: unknown
      }
    ).alphaTestNode = authoredAlphaTestNode
    const hashedMesh = createMesh(hashedSource)
    const coverageMesh = createMesh(coverageSource)
    const alphaTestMesh = createMesh(alphaTestSource)

    owner.syncRevealMeshes([hashedMesh, coverageMesh, alphaTestMesh], { kind: 'soft' })

    const hashedReveal = hashedMesh.material as Material
    const coverageReveal = coverageMesh.material as Material
    const alphaTestReveal = alphaTestMesh.material as Material
    expect(hashedReveal.alphaHash).toBe(false)
    expect(hashedReveal.alphaToCoverage).toBe(false)
    expect(readAlphaTestNode(hashedReveal)).not.toBeNull()
    expect(hashedReveal.transparent).toBe(false)
    expect(hashedReveal.depthWrite).toBe(true)
    expect(coverageReveal.alphaHash).toBe(false)
    expect(coverageReveal.alphaToCoverage).toBe(true)
    expect(readAlphaTestNode(coverageReveal)).toBeNull()
    expect(coverageReveal.transparent).toBe(false)
    expect(coverageReveal.depthWrite).toBe(true)
    expect(alphaTestReveal.alphaHash).toBe(false)
    expect(alphaTestReveal.alphaToCoverage).toBe(false)
    expect(alphaTestReveal.alphaTest).toBe(0.35)
    expect(readAlphaTestNode(alphaTestReveal)).not.toBeNull()
    expect(readAlphaTestNode(alphaTestReveal)).not.toBe(authoredAlphaTestNode)
    expect(alphaTestReveal.transparent).toBe(false)
    expect(alphaTestReveal.depthWrite).toBe(true)
    expect(hashedSource.alphaHash).toBe(true)
    expect(coverageSource.alphaToCoverage).toBe(true)
    expect(readAlphaTestNode(alphaTestSource)).toBe(authoredAlphaTestNode)

    owner.dispose()
    hashedMesh.geometry.dispose()
    coverageMesh.geometry.dispose()
    alphaTestMesh.geometry.dispose()
    hashedSource.dispose()
    coverageSource.dispose()
    alphaTestSource.dispose()
  })

  test('preserves numeric alpha testing while composing the soft-reveal threshold', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const source = new MeshBasicMaterial({ alphaTest: 0.3 })
    const mesh = createMesh(source)

    owner.syncRevealMeshes([mesh], { kind: 'soft' })

    const reveal = mesh.material as Material
    expect(reveal.alphaTest).toBe(0.3)
    expect(reveal.alphaHash).toBe(false)
    expect(reveal.alphaToCoverage).toBe(false)
    expect(readAlphaTestNode(reveal)).not.toBeNull()
    expect(reveal.transparent).toBe(false)
    expect(reveal.depthWrite).toBe(true)
    expect(readAlphaTestNode(source)).toBeNull()

    owner.dispose()
    mesh.geometry.dispose()
    source.dispose()
  })

  test('keeps clipping variants stable and restores source clipping exactly', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const sourcePlane = new Plane()
    const revealPlanes = [new Plane()]
    const source = new MeshBasicMaterial()
    source.clippingPlanes = [sourcePlane]
    source.clipIntersection = false
    const mesh = createMesh(source)

    owner.syncRevealMeshes([mesh], { clippingPlanes: revealPlanes, kind: 'clip' })
    const reveal = mesh.material as Material
    const revealVersion = reveal.version
    expect(reveal).not.toBe(source)
    expect(reveal.clippingPlanes).toBe(revealPlanes)
    expect(reveal.clipIntersection).toBe(true)
    expect(reveal.alphaHash).toBe(false)
    expect(readAlphaTestNode(reveal)).toBeNull()
    expect(reveal.alphaToCoverage).toBe(true)
    expect(source.clippingPlanes).toEqual([sourcePlane])
    expect(source.clipIntersection).toBe(false)
    expect(source.alphaToCoverage).toBe(false)

    owner.syncRevealMeshes([mesh], { clippingPlanes: revealPlanes, kind: 'clip' })
    expect(mesh.material).toBe(reveal)
    expect(reveal.version).toBe(revealVersion)
    revealPlanes[0]!.constant = 3
    owner.syncRevealMeshes([mesh], { clippingPlanes: revealPlanes, kind: 'clip' })
    expect(mesh.material).toBe(reveal)
    expect(reveal.version).toBe(revealVersion)
    const replacementPlanes = [new Plane()]
    owner.syncRevealMeshes([mesh], { clippingPlanes: replacementPlanes, kind: 'clip' })
    const replacementReveal = mesh.material as Material
    const replacementVersion = replacementReveal.version
    expect(replacementReveal).not.toBe(reveal)
    expect(replacementReveal.clippingPlanes).toBe(replacementPlanes)
    owner.syncRevealMeshes([mesh], { clippingPlanes: replacementPlanes, kind: 'clip' })
    expect(mesh.material).toBe(replacementReveal)
    expect(replacementReveal.version).toBe(replacementVersion)
    owner.clearReveal()
    expect(mesh.material).toBe(source)
    expect(owner.activeBindingCount).toBe(0)
    owner.syncRevealMeshes([mesh], { clippingPlanes: revealPlanes, kind: 'clip' })
    expect(mesh.material).toBe(reveal)
    expect(reveal.version).toBe(revealVersion)
    owner.clearReveal()
    owner.dispose()

    disposeMesh(mesh)
  })

  test('retires variants on a source replacement and restores the replacement on dispose', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const firstSource = new MeshBasicMaterial()
    const replacementSource = new MeshBasicMaterial()
    const mesh = createMesh(firstSource)

    owner.acquireFloorFade(mesh)
    const firstVariant = mesh.material as Material
    let firstDisposeCount = 0
    firstVariant.addEventListener('dispose', () => {
      firstDisposeCount += 1
    })

    mesh.material = replacementSource
    owner.updateFloorFade(mesh, true)
    const replacementVariant = mesh.material as Material
    let replacementDisposeCount = 0
    replacementVariant.addEventListener('dispose', () => {
      replacementDisposeCount += 1
    })

    expect(firstDisposeCount).toBe(0)
    expect(replacementVariant).not.toBe(replacementSource)
    expect(replacementVariant.transparent).toBe(true)
    expect(replacementVariant.alphaHash).toBe(false)
    expect(readAlphaTestNode(replacementVariant)).toBeNull()
    expect(replacementVariant.depthWrite).toBe(false)
    expect(owner.ownedMaterialCount).toBe(2)

    firstSource.dispose()
    expect(firstDisposeCount).toBe(1)
    expect(replacementDisposeCount).toBe(0)
    expect(owner.ownedMaterialCount).toBe(1)
    expect(mesh.material).toBe(replacementVariant)
    firstSource.dispose()
    expect(firstDisposeCount).toBe(1)

    owner.dispose()
    expect(mesh.material).toBe(replacementSource)
    expect(firstDisposeCount).toBe(1)
    expect(replacementDisposeCount).toBe(1)
    expect(owner.ownedMaterialCount).toBe(0)
    owner.dispose()
    replacementSource.dispose()
    expect(replacementDisposeCount).toBe(1)

    mesh.geometry.dispose()
  })

  test('prepares high-slot floor assignments one variant at a time and commits without material allocation', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const ownerToken = owner.createFloorFadeOwnerToken()
    const sources = Array.from({ length: 4 }, () => new MeshBasicMaterial())
    const mesh = createMesh(sources)
    owner.syncRevealMeshes([mesh], { kind: 'soft' })
    const revealAssignment = mesh.material
    const handle = owner.beginFloorFadePreparation(mesh)

    for (let step = 0; step < sources.length * 2; step += 1) {
      const materialCountBefore = owner.ownedMaterialCount
      const result = owner.advanceFloorFadePreparation(handle)
      expect(result.materialDelta).toBe(1)
      expect(owner.ownedMaterialCount - materialCountBefore).toBe(1)
      expect(result.status).toBe(step === sources.length * 2 - 1 ? 'complete' : 'pending')
      expect(mesh.material).toBe(revealAssignment)
    }

    const materialCountBeforeCommit = owner.ownedMaterialCount
    expect(
      owner.commitFloorFadePreparation(handle, {
        ownerToken,
        translucent: true,
      }),
    ).toEqual({ materialDelta: 0, status: 'committed' })
    expect(owner.ownedMaterialCount).toBe(materialCountBeforeCommit)
    const fractionalAssignment = mesh.material
    expect(fractionalAssignment).not.toBe(revealAssignment)

    expect(owner.applyPreparedFloorFade(mesh, false)).toBe('applied')
    expect(owner.ownedMaterialCount).toBe(materialCountBeforeCommit)
    expect(mesh.material).not.toBe(fractionalAssignment)
    expect(owner.applyPreparedFloorFade(mesh, true)).toBe('applied')
    expect(owner.ownedMaterialCount).toBe(materialCountBeforeCommit)
    expect(mesh.material).toBe(fractionalAssignment)
    expect(
      owner.commitFloorFadePreparation(handle, {
        ownerToken,
        translucent: false,
      }),
    ).toEqual({ materialDelta: 0, status: 'committed' })

    owner.releasePreparedFloorFade(mesh, ownerToken)
    expect(mesh.material).toBe(revealAssignment)
    owner.clearReveal()
    expect(mesh.material).toBe(sources)
    owner.dispose()
    mesh.geometry.dispose()
    for (const source of sources) source.dispose()
  })

  test('keeps same-record rescans reference-neutral while independent records acquire ownership', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const firstOwnerToken = owner.createFloorFadeOwnerToken()
    const secondOwnerToken = owner.createFloorFadeOwnerToken()
    const source = new MeshBasicMaterial()
    const mesh = createMesh(source)
    const prepare = () => {
      const handle = owner.beginFloorFadePreparation(mesh)
      let status: 'complete' | 'pending' | 'stale' = 'pending'
      while (status === 'pending') status = owner.advanceFloorFadePreparation(handle).status
      expect(status).toBe('complete')
      return handle
    }

    expect(
      owner.commitFloorFadePreparation(prepare(), {
        ownerToken: firstOwnerToken,
        translucent: true,
      }).status,
    ).toBe('committed')
    const assigned = mesh.material
    expect(
      owner.commitFloorFadePreparation(prepare(), {
        ownerToken: firstOwnerToken,
        translucent: true,
      }).status,
    ).toBe('committed')
    owner.releasePreparedFloorFade(mesh, firstOwnerToken)
    expect(mesh.material).toBe(source)

    expect(
      owner.commitFloorFadePreparation(prepare(), {
        ownerToken: firstOwnerToken,
        translucent: true,
      }).status,
    ).toBe('committed')
    expect(mesh.material).toBe(assigned)
    expect(
      owner.commitFloorFadePreparation(prepare(), {
        ownerToken: secondOwnerToken,
        translucent: true,
      }).status,
    ).toBe('committed')
    owner.releasePreparedFloorFade(mesh, firstOwnerToken)
    expect(mesh.material).toBe(assigned)
    owner.releasePreparedFloorFade(mesh, secondOwnerToken)
    expect(mesh.material).toBe(source)

    owner.dispose()
    mesh.geometry.dispose()
    source.dispose()
  })

  test('rejects stale floor preparation without mutating a binding or external assignment', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const ownerToken = owner.createFloorFadeOwnerToken()
    const source = new MeshBasicMaterial()
    const replacement = new MeshBasicMaterial()
    const mesh = createMesh(source)
    const handle = owner.beginFloorFadePreparation(mesh)

    expect(owner.advanceFloorFadePreparation(handle).status).toBe('pending')
    mesh.material = replacement
    expect(owner.advanceFloorFadePreparation(handle)).toEqual({
      materialDelta: 0,
      status: 'stale',
    })
    expect(
      owner.commitFloorFadePreparation(handle, {
        ownerToken,
        translucent: true,
      }),
    ).toEqual({ materialDelta: 0, status: 'stale' })
    expect(owner.activeBindingCount).toBe(0)
    expect(mesh.material).toBe(replacement)

    const revealSource = new MeshBasicMaterial()
    const revealMesh = createMesh(revealSource)
    owner.syncRevealMeshes([revealMesh], { kind: 'soft' })
    const revealHandle = owner.beginFloorFadePreparation(revealMesh)
    expect(owner.advanceFloorFadePreparation(revealHandle).status).toBe('pending')
    owner.syncRevealMeshes([revealMesh], { clippingPlanes: [new Plane()], kind: 'clip' })
    const clipAssignment = revealMesh.material
    expect(owner.advanceFloorFadePreparation(revealHandle).status).toBe('stale')
    expect(
      owner.commitFloorFadePreparation(revealHandle, {
        ownerToken,
        translucent: false,
      }).status,
    ).toBe('stale')
    expect(revealMesh.material).toBe(clipAssignment)

    const ownedSource = new MeshBasicMaterial()
    const ownedReplacement = new MeshBasicMaterial()
    const ownedMesh = createMesh(ownedSource)
    const ownedHandle = owner.beginFloorFadePreparation(ownedMesh)
    while (owner.advanceFloorFadePreparation(ownedHandle).status === 'pending') {}
    expect(
      owner.commitFloorFadePreparation(ownedHandle, {
        ownerToken,
        translucent: true,
      }).status,
    ).toBe('committed')
    const ownedMaterialCount = owner.ownedMaterialCount
    ownedMesh.material = ownedReplacement
    expect(owner.applyPreparedFloorFade(ownedMesh, false)).toBe('stale')
    expect(ownedMesh.material).toBe(ownedReplacement)
    owner.releasePreparedFloorFade(ownedMesh, ownerToken)
    expect(ownedMesh.material).toBe(ownedReplacement)
    expect(owner.activeBindingCount).toBe(1)
    expect(owner.ownedMaterialCount).toBe(ownedMaterialCount)

    owner.dispose()
    mesh.geometry.dispose()
    revealMesh.geometry.dispose()
    ownedMesh.geometry.dispose()
    source.dispose()
    replacement.dispose()
    revealSource.dispose()
    ownedSource.dispose()
    ownedReplacement.dispose()
  })

  test('invalidates preparation on real cache eviction but not deferred source disposal', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const ownerToken = owner.createFloorFadeOwnerToken()
    const source = new MeshBasicMaterial()
    const mesh = createMesh(source)
    const handle = owner.beginFloorFadePreparation(mesh)

    expect(owner.advanceFloorFadePreparation(handle).status).toBe('pending')
    expect(owner.ownedMaterialCount).toBe(1)
    source.dispose()
    expect(owner.ownedMaterialCount).toBe(0)
    expect(owner.advanceFloorFadePreparation(handle).status).toBe('stale')
    expect(owner.commitFloorFadePreparation(handle, { ownerToken, translucent: true }).status).toBe(
      'stale',
    )
    expect(owner.activeBindingCount).toBe(0)

    const liveSource = new MeshBasicMaterial()
    const liveMesh = createMesh(liveSource)
    owner.acquireFloorFade(liveMesh)
    const liveHandle = owner.beginFloorFadePreparation(liveMesh)
    liveSource.dispose()
    expect(owner.ownedMaterialCount).toBe(1)
    expect(owner.advanceFloorFadePreparation(liveHandle).status).toBe('pending')
    owner.releaseFloorFade(liveMesh)
    expect(owner.ownedMaterialCount).toBe(0)
    expect(owner.advanceFloorFadePreparation(liveHandle).status).toBe('stale')

    owner.dispose()
    mesh.geometry.dispose()
    liveMesh.geometry.dispose()
  })

  test('detects in-place source and prepared assignment mutations and repairs with fresh arrays', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const ownerToken = owner.createFloorFadeOwnerToken()
    const firstSource = new MeshBasicMaterial()
    const replacedSource = new MeshBasicMaterial()
    const replacementSource = new MeshBasicMaterial()
    const intruder = new MeshBasicMaterial()
    const original = [firstSource, replacedSource]
    const mesh = createMesh(original)
    const finishPreparation = () => {
      const handle = owner.beginFloorFadePreparation(mesh)
      let status = owner.advanceFloorFadePreparation(handle).status
      while (status === 'pending') status = owner.advanceFloorFadePreparation(handle).status
      expect(status).toBe('complete')
      return handle
    }

    const staleSourceHandle = owner.beginFloorFadePreparation(mesh)
    expect(owner.advanceFloorFadePreparation(staleSourceHandle).status).toBe('pending')
    original[1] = replacementSource
    expect(owner.advanceFloorFadePreparation(staleSourceHandle).status).toBe('stale')
    expect(
      owner.commitFloorFadePreparation(staleSourceHandle, {
        ownerToken,
        translucent: true,
      }).status,
    ).toBe('stale')

    expect(
      owner.commitFloorFadePreparation(finishPreparation(), {
        ownerToken,
        translucent: true,
      }).status,
    ).toBe('committed')
    const firstFractional = mesh.material as Material[]
    expect(owner.applyPreparedFloorFade(mesh, false)).toBe('applied')
    const firstOpaque = mesh.material as Material[]
    firstFractional[0] = intruder
    expect(owner.applyPreparedFloorFade(mesh, true)).toBe('stale')
    expect(mesh.material).toBe(firstOpaque)

    expect(
      owner.commitFloorFadePreparation(finishPreparation(), {
        ownerToken,
        translucent: true,
      }).status,
    ).toBe('committed')
    const repairedFractional = mesh.material as Material[]
    expect(repairedFractional).not.toBe(firstFractional)
    expect(repairedFractional).not.toContain(intruder)
    repairedFractional[0] = intruder
    expect(owner.applyPreparedFloorFade(mesh, false)).toBe('stale')

    expect(
      owner.commitFloorFadePreparation(finishPreparation(), {
        ownerToken,
        translucent: false,
      }).status,
    ).toBe('committed')
    expect(mesh.material).not.toBe(repairedFractional)
    expect(mesh.material as Material[]).not.toContain(intruder)
    owner.releasePreparedFloorFade(mesh, ownerToken)
    expect(mesh.material).toBe(original)

    owner.dispose()
    mesh.geometry.dispose()
    firstSource.dispose()
    replacedSource.dispose()
    replacementSource.dispose()
    intruder.dispose()
  })

  test('allows owner-controlled mode switches during rescan and enforces owner tokens', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const foreignOwner = new LandrushIslandMaterialPresentationOwner()
    const ownerToken = owner.createFloorFadeOwnerToken()
    const foreignToken = foreignOwner.createFloorFadeOwnerToken()
    const source = new MeshBasicMaterial()
    const mesh = createMesh(source)
    const finish = (handle: ReturnType<typeof owner.beginFloorFadePreparation>) => {
      let status = owner.advanceFloorFadePreparation(handle).status
      while (status === 'pending') status = owner.advanceFloorFadePreparation(handle).status
      expect(status).toBe('complete')
    }

    const initialHandle = owner.beginFloorFadePreparation(mesh)
    finish(initialHandle)
    expect(
      owner.commitFloorFadePreparation(initialHandle, {
        ownerToken: foreignToken,
        translucent: true,
      }).status,
    ).toBe('stale')
    expect(owner.activeBindingCount).toBe(0)
    expect(
      owner.commitFloorFadePreparation(initialHandle, { ownerToken, translucent: true }).status,
    ).toBe('committed')

    const rescanHandle = owner.beginFloorFadePreparation(mesh)
    expect(owner.advanceFloorFadePreparation(rescanHandle).status).toBe('pending')
    expect(owner.applyPreparedFloorFade(mesh, false)).toBe('applied')
    let status = owner.advanceFloorFadePreparation(rescanHandle).status
    while (status === 'pending') status = owner.advanceFloorFadePreparation(rescanHandle).status
    expect(status).toBe('complete')
    expect(
      owner.commitFloorFadePreparation(rescanHandle, { ownerToken, translucent: false }).status,
    ).toBe('committed')

    const assigned = mesh.material
    owner.releasePreparedFloorFade(mesh, foreignToken)
    expect(mesh.material).toBe(assigned)
    owner.releasePreparedFloorFade(mesh, ownerToken)
    expect(mesh.material).toBe(source)

    owner.dispose()
    foreignOwner.dispose()
    mesh.geometry.dispose()
    source.dispose()
  })

  test('detaches every presentation lease before disposal and respects external replacement', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const firstSource = new MeshBasicMaterial()
    const secondSource = new MeshBasicMaterial()
    const original = [firstSource, secondSource]
    const mesh = createMesh(original)
    owner.syncRevealMeshes([mesh], { kind: 'soft' })
    owner.acquireFloorFade(mesh)
    owner.acquireFloorFade(mesh)
    const ownedMaterialCount = owner.ownedMaterialCount

    owner.detachMeshBeforeDispose(mesh)
    expect(mesh.material).toBe(original)
    expect(owner.activeBindingCount).toBe(0)
    expect(owner.ownedMaterialCount).toBe(ownedMaterialCount)
    owner.detachMeshBeforeDispose(mesh)
    owner.clearReveal()
    expect(mesh.material).toBe(original)
    expect(owner.ownedMaterialCount).toBe(ownedMaterialCount)

    const externalSource = new MeshBasicMaterial()
    const externalReplacement = new MeshBasicMaterial()
    const externalMesh = createMesh(externalSource)
    owner.acquireFloorFade(externalMesh)
    const externalVariant = externalMesh.material as Material
    let externalSourceDisposeCount = 0
    let externalVariantDisposeCount = 0
    externalSource.addEventListener('dispose', () => {
      externalSourceDisposeCount += 1
    })
    externalVariant.addEventListener('dispose', () => {
      externalVariantDisposeCount += 1
    })
    const ownedBeforeExternalDetach = owner.ownedMaterialCount
    externalMesh.material = externalReplacement
    owner.detachMeshBeforeDispose(externalMesh)
    expect(externalMesh.material).toBe(externalReplacement)
    expect(owner.activeBindingCount).toBe(0)
    expect(owner.ownedMaterialCount).toBe(ownedBeforeExternalDetach - 1)
    expect(externalSourceDisposeCount).toBe(1)
    expect(externalVariantDisposeCount).toBe(1)
    owner.detachMeshBeforeDispose(externalMesh)
    expect(externalSourceDisposeCount).toBe(1)
    expect(externalVariantDisposeCount).toBe(1)

    const cachedSource = new MeshBasicMaterial()
    cachedSource.userData.__pascalCachedMaterial = true
    const cachedReplacement = new MeshBasicMaterial()
    const cachedMesh = createMesh(cachedSource)
    owner.acquireFloorFade(cachedMesh)
    const cachedVariant = cachedMesh.material as Material
    let cachedSourceDisposeCount = 0
    let cachedVariantDisposeCount = 0
    cachedSource.addEventListener('dispose', () => {
      cachedSourceDisposeCount += 1
    })
    cachedVariant.addEventListener('dispose', () => {
      cachedVariantDisposeCount += 1
    })
    cachedMesh.material = cachedReplacement
    owner.detachMeshBeforeDispose(cachedMesh)
    expect(cachedMesh.material).toBe(cachedReplacement)
    expect(cachedSourceDisposeCount).toBe(0)
    expect(cachedVariantDisposeCount).toBe(0)

    owner.dispose()
    expect(cachedSourceDisposeCount).toBe(0)
    expect(cachedVariantDisposeCount).toBe(1)
    cachedSource.dispose()
    expect(cachedSourceDisposeCount).toBe(1)
    mesh.geometry.dispose()
    externalMesh.geometry.dispose()
    cachedMesh.geometry.dispose()
    firstSource.dispose()
    secondSource.dispose()
    externalReplacement.dispose()
    cachedReplacement.dispose()
  })

  test('child removal restores the true source before disposal without retiring a shared live variant', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const source = new MeshBasicMaterial()
    const firstMesh = createMesh(source)
    const secondMesh = createMesh(source)
    owner.acquireFloorFade(firstMesh)
    owner.acquireFloorFade(secondMesh)
    const sharedVariant = firstMesh.material as Material
    let sharedVariantDisposeCount = 0
    sharedVariant.addEventListener('dispose', () => {
      sharedVariantDisposeCount += 1
    })
    const group = new Group()
    group.add(firstMesh, secondMesh)
    group.addEventListener('childremoved', (event) => {
      event.child.traverse((object) => {
        const mesh = object as Mesh
        if (mesh.isMesh) owner.detachMeshBeforeDispose(mesh)
      })
    })

    group.remove(firstMesh)
    expect(firstMesh.material).toBe(source)
    source.dispose()
    expect(sharedVariantDisposeCount).toBe(0)
    expect(secondMesh.material).toBe(sharedVariant)

    group.remove(secondMesh)
    expect(secondMesh.material).toBe(source)
    expect(sharedVariantDisposeCount).toBe(1)
    expect(owner.ownedMaterialCount).toBe(0)
    source.dispose()
    expect(sharedVariantDisposeCount).toBe(1)
    owner.dispose()
    expect(sharedVariantDisposeCount).toBe(1)

    firstMesh.geometry.dispose()
    secondMesh.geometry.dispose()
  })

  test('detaches nested floor and reveal-only bindings before recursive geometry disposal', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const source = new MeshBasicMaterial()
    const levelRoot = new Group()
    const registeredNodeGroup = new Group()
    const generatedRoot = new Group()
    const revealMesh = createMesh(source)
    const floorMesh = createMesh(source)
    generatedRoot.add(revealMesh, floorMesh)
    registeredNodeGroup.add(generatedRoot)
    levelRoot.add(registeredNodeGroup)

    owner.syncRevealMeshes([revealMesh], { kind: 'soft' })
    owner.acquireFloorFade(floorMesh)
    const revealVariant = revealMesh.material as Material
    const floorVariant = floorMesh.material as Material
    let revealVariantDisposeCount = 0
    let floorVariantDisposeCount = 0
    revealVariant.addEventListener('dispose', () => {
      revealVariantDisposeCount += 1
    })
    floorVariant.addEventListener('dispose', () => {
      floorVariantDisposeCount += 1
    })
    expect(owner.activeBindingCount).toBe(2)
    expect(owner.activeAncestorListenerCount).toBe(3)

    registeredNodeGroup.remove(generatedRoot)
    expect(owner.activeBindingCount).toBe(2)
    expect(revealMesh.material).toBe(revealVariant)
    expect(floorMesh.material).toBe(floorVariant)
    registeredNodeGroup.add(generatedRoot)
    generatedRoot.userData.__fromGeometry = true

    let simulatedDisposerRan = false
    registeredNodeGroup.addEventListener('childremoved', (event) => {
      simulatedDisposerRan = true
      expect(owner.activeBindingCount).toBe(0)
      expect(owner.activeAncestorListenerCount).toBe(0)
      event.child.traverse((object) => {
        const mesh = object as Mesh
        if (!mesh.isMesh) return
        expect(mesh.material).toBe(source)
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const material of new Set(materials)) material.dispose()
      })
    })

    registeredNodeGroup.remove(generatedRoot)
    expect(simulatedDisposerRan).toBe(true)
    expect(revealVariantDisposeCount).toBe(1)
    expect(floorVariantDisposeCount).toBe(1)
    expect(owner.ownedMaterialCount).toBe(0)
    expect(owner.activeAncestorListenerCount).toBe(0)
    owner.clearReveal()
    owner.dispose()
    expect(owner.activeAncestorListenerCount).toBe(0)

    revealMesh.geometry.dispose()
    floorMesh.geometry.dispose()
  })

  test('recovers generated-subtree cleanup when a nested removal clears the shared event child', () => {
    const owner = new LandrushIslandMaterialPresentationOwner()
    const source = new MeshBasicMaterial()
    const parent = new Group()
    const generatedRoot = new Group()
    generatedRoot.userData.__fromGeometry = true
    const firstMesh = createMesh(source)
    const secondMesh = createMesh(source)
    generatedRoot.add(firstMesh, secondMesh)
    parent.add(generatedRoot)
    const nestedParent = new Group()
    const nestedChild = new Group()
    nestedParent.add(nestedChild)
    parent.addEventListener('childremoved', () => {
      nestedParent.remove(nestedChild)
    })
    owner.acquireFloorFade(firstMesh)
    owner.acquireFloorFade(secondMesh)
    const sharedVariant = firstMesh.material as Material
    let sharedVariantDisposeCount = 0
    sharedVariant.addEventListener('dispose', () => {
      sharedVariantDisposeCount += 1
    })
    let simulatedDisposerRan = false
    parent.addEventListener('childremoved', () => {
      simulatedDisposerRan = true
      expect(owner.activeBindingCount).toBe(0)
      expect(owner.activeAncestorListenerCount).toBe(0)
      expect(firstMesh.material).toBe(source)
      expect(secondMesh.material).toBe(source)
      source.dispose()
    })

    expect(() => parent.remove(generatedRoot)).not.toThrow()
    expect(simulatedDisposerRan).toBe(true)
    expect(owner.activeBindingCount).toBe(0)
    expect(owner.activeAncestorListenerCount).toBe(0)
    expect(owner.ownedMaterialCount).toBe(0)
    expect(sharedVariantDisposeCount).toBe(1)
    owner.dispose()
    expect(sharedVariantDisposeCount).toBe(1)

    firstMesh.geometry.dispose()
    secondMesh.geometry.dispose()
  })

  test('mirrors a late texture settlement into every live cached variant', async () => {
    let settleTexture!: (texture: Texture) => void
    TextureLoader.prototype.loadAsync = () =>
      new Promise<Texture>((resolve) => {
        settleTexture = resolve
      })
    const source = createMaterial({
      texture: { repeat: [1, 1], url: 'https://example.com/pending-presentation.png' },
    } as unknown as MaterialSchema)
    const owner = new LandrushIslandMaterialPresentationOwner()
    const mesh = new Mesh(new PlaneGeometry(1, 1), source)

    owner.syncRevealMeshes([mesh], { kind: 'soft' })
    const reveal = mesh.material as Material & { map?: Texture | null }
    owner.acquireFloorFade(mesh)
    const combined = mesh.material as Material & { map?: Texture | null }
    expect(reveal.map).toBeNull()
    expect(combined.map).toBeNull()

    settleTexture(new Texture())
    for (let index = 0; index < 8; index += 1) await Promise.resolve()

    const sourceMap = (source as Material & { map?: Texture | null }).map
    expect(sourceMap).not.toBeNull()
    expect(reveal.map).toBe(sourceMap)
    expect(combined.map).toBe(sourceMap)

    owner.dispose()
    expect(mesh.material).toBe(source)
    mesh.geometry.dispose()
  })
})
