import { describe, expect, test } from 'bun:test'
import { ZOMBIE_ESCAPE_SIMULATION } from '@landrush/zombie-gameplay/zombie-escape-config'
import {
  DataTexture,
  Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  RGBAFormat,
} from 'three'
import { materialColor } from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER } from './landrush-zombie-escape-mode'
import {
  LandrushZombieEscapeStructureHitPresentation,
  resolveLandrushZombieEscapeStructureHitPose,
} from './landrush-zombie-escape-structure-hit-presentation'
import {
  LANDRUSH_ZOMBIE_ESCAPE_STRUCTURE_PRESENTATION_FRAME_ORDER,
  restoreLandrushZombieEscapeStructureRoots,
  syncLandrushZombieEscapeStructureRoots,
} from './landrush-zombie-escape-structure-presentation'

describe('Landrush Zombie Escape structure presentation', () => {
  test('applies structure hits after passthrough and restores them after the owned render', () => {
    expect(LANDRUSH_ZOMBIE_ESCAPE_STRUCTURE_PRESENTATION_FRAME_ORDER.visibility).toBeLessThan(
      LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.passthrough,
    )
    expect(LANDRUSH_ZOMBIE_ESCAPE_STRUCTURE_PRESENTATION_FRAME_ORDER.hitApply).toBeGreaterThan(
      LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.passthrough,
    )
    expect(LANDRUSH_ZOMBIE_ESCAPE_STRUCTURE_PRESENTATION_FRAME_ORDER.hitApply).toBeLessThan(
      LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.viewerRender,
    )
    expect(LANDRUSH_ZOMBIE_ESCAPE_STRUCTURE_PRESENTATION_FRAME_ORDER.hitRestore).toBeGreaterThan(
      LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.viewerRender,
    )
  })

  test('hides only destroyed roots and restores their prior visibility', () => {
    const first = new Group()
    const second = new Group()
    const alreadyHidden = new Group()
    alreadyHidden.visible = false
    const hiddenRoots = new Map<Object3D, boolean>()

    syncLandrushZombieEscapeStructureRoots(new Set([first, alreadyHidden]), hiddenRoots)

    expect(first.visible).toBe(false)
    expect(second.visible).toBe(true)
    expect(alreadyHidden.visible).toBe(false)
    expect(hiddenRoots.get(first)).toBe(true)
    expect(hiddenRoots.get(alreadyHidden)).toBe(false)

    syncLandrushZombieEscapeStructureRoots(new Set([second]), hiddenRoots)

    expect(first.visible).toBe(true)
    expect(second.visible).toBe(false)
    expect(alreadyHidden.visible).toBe(false)
    expect(hiddenRoots.has(first)).toBe(false)
    expect(hiddenRoots.has(alreadyHidden)).toBe(false)

    restoreLandrushZombieEscapeStructureRoots(hiddenRoots)

    expect(second.visible).toBe(true)
    expect(hiddenRoots.size).toBe(0)
  })

  test('does not overwrite the captured state while a root remains destroyed', () => {
    const root = new Group()
    const hiddenRoots = new Map<Object3D, boolean>()
    const destroyedRoots = new Set<Object3D>([root])

    syncLandrushZombieEscapeStructureRoots(destroyedRoots, hiddenRoots)
    syncLandrushZombieEscapeStructureRoots(destroyedRoots, hiddenRoots)
    restoreLandrushZombieEscapeStructureRoots(hiddenRoots)

    expect(root.visible).toBe(true)
  })

  test('maps the zombie hit cadence to white and black before leaving only a bounded wiggle', () => {
    const reactionSeconds = ZOMBIE_ESCAPE_SIMULATION.zombieHitReactionSeconds
    const amountAt = (elapsedSeconds: number) => 1 - elapsedSeconds / reactionSeconds

    expect(resolveLandrushZombieEscapeStructureHitPose('wall', amountAt(0.01)).phase).toBe('white')
    expect(resolveLandrushZombieEscapeStructureHitPose('wall', amountAt(0.03)).phase).toBe('black')
    expect(resolveLandrushZombieEscapeStructureHitPose('wall', amountAt(0.05)).phase).toBe('white')
    expect(resolveLandrushZombieEscapeStructureHitPose('wall', amountAt(0.13)).phase).toBe('none')

    for (let step = 0; step <= 30; step += 1) {
      const pose = resolveLandrushZombieEscapeStructureHitPose('wall', 1 - step / 30)
      expect(Math.abs(pose.offsetX)).toBeLessThanOrEqual(0.018)
      expect(Math.abs(pose.offsetZ)).toBeLessThanOrEqual(0.012)
    }
    expect(resolveLandrushZombieEscapeStructureHitPose('wall', 0)).toEqual({
      offsetX: 0,
      offsetZ: 0,
      phase: 'none',
    })
  })

  test('flickers only the attacked mesh, restores its composed source, and never accumulates wiggle', () => {
    const presentation = new LandrushZombieEscapeStructureHitPresentation()
    const source = new MeshStandardMaterial({ color: '#7a452c', emissive: '#112233' })
    const attacked = new Mesh(new PlaneGeometry(1, 1), source)
    const unaffected = new Mesh(new PlaneGeometry(1, 1), source)
    const root = new Group()
    root.position.set(4, 2, -3)
    root.add(attacked)
    const samples = new Map([[root, { amount: 1, objectId: 'crate' }]])

    presentation.sync(samples)
    const firstPosition = root.position.clone()
    const white = attacked.material as MeshStandardMaterial
    expect(white).not.toBe(source)
    expect(white.color.getHexString()).toBe('ffffff')
    expect(white.emissive.getHexString()).toBe('ffffff')
    expect(white.emissiveIntensity).toBe(3.6)
    expect(unaffected.material).toBe(source)
    expect(source.color.getHexString()).toBe('7a452c')
    expect(source.emissive.getHexString()).toBe('112233')

    presentation.sync(samples)
    expect(root.position.toArray()).toEqual(firstPosition.toArray())
    presentation.restore()
    expect(root.position.toArray()).toEqual([4, 2, -3])
    expect(attacked.material).toBe(source)

    presentation.sync(new Map([[root, { amount: 0.9, objectId: 'crate' }]]))
    const black = attacked.material as MeshStandardMaterial
    expect(black).not.toBe(source)
    expect(black.color.getHexString()).toBe('030104')
    expect(black.emissiveIntensity).toBe(0)
    presentation.restore()
    expect(attacked.material).toBe(source)

    presentation.dispose()
    expect(presentation.ownedMaterialCount).toBe(0)
    attacked.geometry.dispose()
    unaffected.geometry.dispose()
    source.dispose()
  })

  test('preserves material array shape and follows an externally replaced composed source', () => {
    const presentation = new LandrushZombieEscapeStructureHitPresentation()
    const first = new MeshStandardMaterial({ color: '#224466' })
    const second = new MeshStandardMaterial({ color: '#886644' })
    const replacement = new MeshStandardMaterial({ color: '#224422' })
    const original = [first, second]
    const mesh = new Mesh(new PlaneGeometry(1, 1), original)
    const root = new Group()
    root.add(mesh)
    const samples = new Map([[root, { amount: 1, objectId: 'barricade' }]])

    presentation.sync(samples)
    const hitMaterials = mesh.material as Material[]
    expect(hitMaterials).toHaveLength(2)
    expect(hitMaterials[0]).not.toBe(first)
    expect(hitMaterials[1]).not.toBe(second)
    presentation.restore()
    expect(mesh.material).toBe(original)

    mesh.material = replacement
    presentation.sync(samples)
    expect(Array.isArray(mesh.material)).toBe(false)
    expect(mesh.material).not.toBe(replacement)
    presentation.restore()
    expect(mesh.material).toBe(replacement)

    presentation.dispose()
    expect(presentation.ownedMaterialCount).toBe(0)
    mesh.geometry.dispose()
    first.dispose()
    second.dispose()
    replacement.dispose()
  })

  test('preserves base-color cutout alpha and shares one hit pair per composed source', () => {
    const presentation = new LandrushZombieEscapeStructureHitPresentation()
    const map = new DataTexture(new Uint8Array([255, 255, 255, 0]), 1, 1, RGBAFormat)
    map.needsUpdate = true
    const source = new MeshStandardNodeMaterial({ map })
    source.alphaTest = 0.5
    const firstMesh = new Mesh(new PlaneGeometry(1, 1), source)
    const secondMesh = new Mesh(new PlaneGeometry(1, 1), source)
    const firstRoot = new Group()
    const secondRoot = new Group()
    firstRoot.add(firstMesh)
    secondRoot.add(secondMesh)
    const samples = new Map([
      [firstRoot, { amount: 1, objectId: 'cutout-a' }],
      [secondRoot, { amount: 1, objectId: 'cutout-b' }],
    ])

    presentation.sync(samples)
    const hitMaterial = firstMesh.material as MeshStandardNodeMaterial
    expect(hitMaterial.map).toBe(map)
    expect(hitMaterial.alphaTest).toBe(0.5)
    let preservesAuthoredAlpha = false
    hitMaterial.colorNode?.traverse((node) => {
      if (node === materialColor) preservesAuthoredAlpha = true
    })
    expect(preservesAuthoredAlpha).toBe(true)
    expect(firstMesh.material).toBe(secondMesh.material)
    expect(presentation.ownedMaterialCount).toBe(2)
    const cachedWhite = firstMesh.material

    presentation.sync(new Map())
    expect(presentation.ownedMaterialCount).toBe(2)
    presentation.sync(samples)
    expect(firstMesh.material).toBe(cachedWhite)

    presentation.dispose()
    expect(firstMesh.material).toBe(source)
    expect(secondMesh.material).toBe(source)
    expect(presentation.ownedMaterialCount).toBe(0)
    firstMesh.geometry.dispose()
    secondMesh.geometry.dispose()
    source.dispose()
    map.dispose()
  })

  test('wiggles and restores a manually managed local matrix', () => {
    const presentation = new LandrushZombieEscapeStructureHitPresentation()
    const source = new MeshStandardMaterial()
    const mesh = new Mesh(new PlaneGeometry(1, 1), source)
    const root = new Group()
    root.matrixAutoUpdate = false
    root.matrix.makeTranslation(4, 2, -3)
    const baseMatrix = root.matrix.clone()
    root.add(mesh)

    presentation.sync(new Map([[root, { amount: 1, objectId: 'static-item' }]]))
    expect(root.matrix.equals(baseMatrix)).toBe(false)
    presentation.restore()
    expect(root.matrix.equals(baseMatrix)).toBe(true)

    presentation.dispose()
    mesh.geometry.dispose()
    source.dispose()
  })
})
