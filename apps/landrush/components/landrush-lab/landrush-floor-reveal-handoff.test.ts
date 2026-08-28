import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import type { LevelNode } from '@pascal-app/core'
import { clearMaterialCache, readWallCutoutMaterialAssignment } from '@pascal-app/viewer'
import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, Scene } from 'three'
import { applyWallCutoutMaterial } from '../../../../packages/viewer/src/systems/wall/wall-cutout'
import { readLandrushIslandFloorFadeOpacity } from './landrush-floor-fade-opacity'
import { LandrushIslandFloorFadePresentationOwner } from './landrush-floor-fade-presentation'
import { LandrushIslandMaterialPresentationOwner } from './landrush-island-material-presentation'

afterEach(() => {
  clearMaterialCache()
})

function createHandoffFixture(meshCount: number) {
  const scene = new Scene()
  const root = new Group()
  const source = new MeshBasicMaterial({ color: '#302b29' })
  const geometry = new PlaneGeometry(2, 2)
  const meshes = Array.from({ length: meshCount }, (_, index) => {
    const mesh = new Mesh(geometry, source)
    mesh.name = index === 0 ? 'upper-main-slab' : `upper-mesh-${index}`
    root.add(mesh)
    return mesh
  })
  scene.add(root)
  const materialPresentation = new LandrushIslandMaterialPresentationOwner()
  const floorPresentation = new LandrushIslandFloorFadePresentationOwner<LevelNode['id']>(
    materialPresentation,
  )
  const level = {
    levelId: 'level_floor_reveal_handoff' as LevelNode['id'],
    root,
    structuralToken: 0,
  }
  let opacity = 1
  let revealMeshes: readonly Mesh[] = []
  let clock = 0
  let maxPreparationSteps = 0
  // A deterministic step cost forces the real 1.5ms preparation budget across frames.
  const now = spyOn(performance, 'now').mockImplementation(() => {
    clock += 0.0125
    return clock
  })

  function frame() {
    // Production runs floor presentation at .92, then reveal participation at .95.
    floorPresentation.ensureLevel(level)
    const metrics = floorPresentation.prepareFrame(1 / 60)
    floorPresentation.applyLevelOpacity({ ...level, opacity })
    materialPresentation.syncRevealMeshes(revealMeshes, { kind: 'soft' })
    maxPreparationSteps = Math.max(maxPreparationSteps, metrics.preparationSteps)
    expect(metrics.materialsPrepared).toBeLessThanOrEqual(1)
    expect(metrics.objectsVisited).toBeLessThanOrEqual(192)
    expect(metrics.preparationSteps).toBeLessThanOrEqual(128)
    return metrics
  }

  function frames(count: number) {
    for (let index = 0; index < count; index += 1) frame()
  }

  function presentFrame(nextOpacity: number, nextRevealMeshes: readonly Mesh[]) {
    opacity = nextOpacity
    revealMeshes = nextRevealMeshes
    return frame()
  }

  function expectOpaqueReady() {
    const { canonicalRoot, ...state } = floorPresentation.readLevel(level.levelId)!
    expect(canonicalRoot).toBe(root)
    expect(state).toMatchObject({
      appliedOpacity: 1,
      assignmentMismatchCount: 0,
      canonicalVisible: true,
      desiredOpacity: 1,
      materialMode: 'opaque',
      pending: false,
      presentationOpacity: 1,
      quarantineCount: 0,
      ready: true,
    })
    expect(root.children).toHaveLength(meshCount)
    for (const mesh of meshes) {
      expect(mesh.visible).toBe(true)
      expect(readLandrushIslandFloorFadeOpacity(mesh)).toBe(1)
      expect(mesh.material.transparent).toBe(false)
      expect(mesh.material.depthWrite).toBe(true)
    }
  }

  function prepareInitialLevel() {
    floorPresentation.ensureLevel(level)
    let frameCount = 0
    for (; frameCount < 240 && floorPresentation.hasPendingWork; frameCount += 1) frame()
    expectOpaqueReady()
    if (meshCount === 63) {
      expect(frameCount).toBeGreaterThan(1)
      expect(maxPreparationSteps).toBeGreaterThan(64)
    }
  }

  function crossFloor(nextRevealMeshes: readonly Mesh[], afterReveal?: () => void) {
    opacity = 0.35
    frame()
    opacity = 0
    frame()
    expect(root.visible).toBe(false)
    revealMeshes = nextRevealMeshes
    frame()
    afterReveal?.()
    for (const amount of [0.1, 0.35, 0.8, 1]) {
      opacity = amount
      frame()
    }
    frames(240)
  }

  function expectIdle() {
    const materialCount = materialPresentation.ownedMaterialCount
    for (let index = 0; index < 30; index += 1) {
      const metrics = frame()
      expect(metrics.preparationSteps).toBe(0)
      expect(metrics.materialsPrepared).toBe(0)
      expect(metrics.meshesPrepared).toBe(0)
    }
    expect(materialPresentation.ownedMaterialCount).toBe(materialCount)
    expect(floorPresentation.hasPendingWork).toBe(false)
  }

  function dispose() {
    try {
      floorPresentation.disposeExactAll()
      materialPresentation.dispose()
      geometry.dispose()
      source.dispose()
    } finally {
      now.mockRestore()
    }
  }

  return {
    crossFloor,
    dispose,
    expectIdle,
    expectOpaqueReady,
    floorPresentation,
    frames,
    level,
    materialPresentation,
    meshes,
    prepareInitialLevel,
    presentFrame,
  }
}

describe('Landrush floor/reveal handoff', () => {
  test('restores opaque material flags in the one-mesh handoff that already settles', () => {
    const fixture = createHandoffFixture(1)
    try {
      fixture.prepareInitialLevel()
      fixture.crossFloor(fixture.meshes)
      fixture.expectOpaqueReady()
      fixture.expectIdle()
    } finally {
      fixture.dispose()
    }
  })

  test('settles a sliced 63-mesh level without reveal participation', () => {
    const fixture = createHandoffFixture(63)
    try {
      fixture.prepareInitialLevel()
      fixture.crossFloor([])
      fixture.expectOpaqueReady()
      fixture.expectIdle()
    } finally {
      fixture.dispose()
    }
  })

  test('releases slab quarantine after repeated 0-to-1 crossings with later reveal updates', () => {
    const fixture = createHandoffFixture(63)
    try {
      fixture.prepareInitialLevel()
      const revealMeshes = fixture.meshes.slice(0, 5)
      for (const participants of [revealMeshes, [], revealMeshes]) {
        fixture.crossFloor(participants)
        fixture.expectOpaqueReady()
        fixture.expectIdle()
      }
    } finally {
      fixture.dispose()
    }
  })

  test('keeps prepared geometry visible while floor modes and reveal membership change', () => {
    const fixture = createHandoffFixture(63)
    try {
      fixture.prepareInitialLevel()
      const revealMeshes = fixture.meshes.slice(0, 5)
      const transitions = [
        { label: 'fractional-reveal-enter', opacity: 0.35, revealMeshes },
        { label: 'opaque-reveal-present', opacity: 1, revealMeshes },
        { label: 'fractional-reveal-exit', opacity: 0.35, revealMeshes: [] },
        { label: 'opaque-reveal-absent', opacity: 1, revealMeshes: [] },
        { label: 'fractional-reveal-reenter', opacity: 0.35, revealMeshes },
        { label: 'opaque-reveal-exit', opacity: 1, revealMeshes: [] },
      ]
      const disappearances = transitions.flatMap(({ label, opacity, revealMeshes }) => {
        fixture.presentFrame(opacity, revealMeshes)
        const state = fixture.floorPresentation.readLevel(fixture.level.levelId)!
        const hiddenMeshes = fixture.meshes.filter(
          (mesh) =>
            !fixture.level.root.visible ||
            !mesh.visible ||
            readLandrushIslandFloorFadeOpacity(mesh) <= 0,
        )
        return hiddenMeshes.length === 0
          ? []
          : [
              {
                label,
                materialMode: state.materialMode,
                pending: state.pending,
                quarantineCount: state.quarantineCount,
                requestedOpacity: opacity,
                rootOpacity: state.presentationOpacity,
                slabVisible: fixture.meshes[0]!.visible,
                visibleMeshCount: fixture.meshes.length - hiddenMeshes.length,
              },
            ]
      })
      expect(disappearances).toEqual([])
      fixture.frames(240)
      fixture.expectOpaqueReady()
    } finally {
      fixture.dispose()
    }
  })

  test('switches cached current-reveal floor modes without allocation or preparation', () => {
    const fixture = createHandoffFixture(63)
    try {
      fixture.prepareInitialLevel()
      const revealMeshes = fixture.meshes.slice(0, 5)
      const representatives = fixture.materialPresentation.createRenderReadinessRepresentative(
        revealMeshes.map((mesh) => ({ floor: true, mesh, reveal: true })),
        { kind: 'soft' },
      )
      representatives.clear()
      const materialCount = fixture.materialPresentation.ownedMaterialCount

      for (const [opacity, participants] of [
        [0.35, revealMeshes],
        [1, revealMeshes],
        [0.35, revealMeshes],
        [1, []],
        [0.35, []],
        [1, []],
      ] as const) {
        const metrics = fixture.presentFrame(opacity, participants)
        expect(metrics.materialsPrepared).toBe(0)
        expect(metrics.meshesPrepared).toBe(0)
        expect(metrics.preparationSteps).toBe(0)
        expect(fixture.materialPresentation.ownedMaterialCount).toBe(materialCount)
        expect(fixture.floorPresentation.readLevel(fixture.level.levelId)).toMatchObject({
          appliedOpacity: opacity,
          canonicalVisible: true,
          materialMode: opacity === 1 ? 'opaque' : 'fractional',
          pending: false,
          quarantineCount: 0,
          ready: true,
        })
        for (const mesh of fixture.meshes) {
          expect(mesh.visible).toBe(true)
          expect(readLandrushIslandFloorFadeOpacity(mesh)).toBeCloseTo(opacity)
          expect(mesh.material.transparent).toBe(opacity !== 1)
          expect(mesh.material.depthWrite).toBe(opacity === 1)
        }
      }
      fixture.expectOpaqueReady()
      fixture.expectIdle()
    } finally {
      fixture.dispose()
    }
  })

  test('keeps a cold nested cover drawable in the correct inherited floor mode', () => {
    const scene = new Scene()
    const parent = new Group()
    const cover = new Group()
    const geometry = new PlaneGeometry(2, 2)
    const floorSource = new MeshBasicMaterial({ color: '#302b29' })
    const coverSource = new MeshBasicMaterial({ color: '#b8b1a5' })
    const floorMesh = new Mesh(geometry, floorSource)
    const coverMesh = new Mesh(geometry, coverSource)
    parent.add(floorMesh, cover)
    cover.add(coverMesh)
    scene.add(parent)
    const materialPresentation = new LandrushIslandMaterialPresentationOwner()
    const floorPresentation = new LandrushIslandFloorFadePresentationOwner<LevelNode['id']>(
      materialPresentation,
    )
    const parentLevel = {
      excludedRoots: [cover],
      levelId: 'level_floor_reveal_parent' as LevelNode['id'],
      root: parent,
      structuralToken: 0,
    }
    const coverLevel = {
      levelId: 'level_floor_reveal_cover' as LevelNode['id'],
      root: cover,
      structuralToken: 0,
    }
    let clock = 0
    const now = spyOn(performance, 'now').mockImplementation(() => {
      clock += 0.0125
      return clock
    })

    function frame(parentOpacity: number, revealMeshes: readonly Mesh[]) {
      floorPresentation.ensureLevel(parentLevel)
      floorPresentation.ensureLevel(coverLevel)
      const metrics = floorPresentation.prepareFrame(1 / 60)
      const { appliedOpacity } = floorPresentation.applyLevelOpacity({
        ...parentLevel,
        opacity: parentOpacity,
      })
      floorPresentation.applyLevelOpacity({
        ...coverLevel,
        effectiveOpacity: appliedOpacity,
        opacity: 1,
      })
      materialPresentation.syncRevealMeshes(revealMeshes, { kind: 'soft' })
      expect(metrics.materialsPrepared).toBeLessThanOrEqual(1)
      expect(metrics.objectsVisited).toBeLessThanOrEqual(192)
      expect(metrics.preparationSteps).toBeLessThanOrEqual(128)
      return metrics
    }

    function expectDrawable(parentOpacity: number) {
      expect(parent.visible).toBe(true)
      expect(cover.visible).toBe(true)
      expect(floorPresentation.readLevel(coverLevel.levelId)).toMatchObject({
        appliedOpacity: 1,
        canonicalVisible: true,
        presentationOpacity: 1,
        quarantineCount: 0,
      })
      for (const mesh of [floorMesh, coverMesh]) {
        expect(mesh.visible).toBe(true)
        expect(readLandrushIslandFloorFadeOpacity(mesh)).toBeCloseTo(parentOpacity)
        expect(mesh.material.transparent).toBe(parentOpacity !== 1)
        expect(mesh.material.depthWrite).toBe(parentOpacity === 1)
      }
    }

    try {
      frame(1, [])
      for (let index = 0; index < 240 && floorPresentation.hasPendingWork; index += 1) {
        frame(1, [])
      }
      expect(floorPresentation.readLevel(parentLevel.levelId)?.ready).toBe(true)
      expect(floorPresentation.readLevel(coverLevel.levelId)?.ready).toBe(true)

      frame(1, [coverMesh])
      const materialCountBeforeColdFade = materialPresentation.ownedMaterialCount
      const coldFrame = frame(0.35, [coverMesh])
      expect(coldFrame.materialsPrepared).toBe(0)
      expect(materialPresentation.ownedMaterialCount).toBe(materialCountBeforeColdFade)
      expect(floorPresentation.readLevel(coverLevel.levelId)?.pending).toBe(true)
      expectDrawable(0.35)

      for (let index = 0; index < 240 && floorPresentation.hasPendingWork; index += 1) {
        frame(0.35, [coverMesh])
        expectDrawable(0.35)
      }
      expect(floorPresentation.hasPendingWork).toBe(false)
      expect(floorPresentation.readLevel(coverLevel.levelId)).toMatchObject({
        materialMode: 'fractional',
        pending: false,
        ready: true,
      })

      frame(1, [coverMesh])
      expectDrawable(1)
      const settledMaterialCount = materialPresentation.ownedMaterialCount
      for (let index = 0; index < 20; index += 1) {
        const metrics = frame(1, [coverMesh])
        expect(metrics.materialsPrepared).toBe(0)
        expect(metrics.meshesPrepared).toBe(0)
        expect(metrics.preparationSteps).toBe(0)
      }
      expect(floorPresentation.hasPendingWork).toBe(false)
      expect(materialPresentation.ownedMaterialCount).toBe(settledMaterialCount)
    } finally {
      try {
        floorPresentation.disposeExactAll()
        materialPresentation.dispose()
        geometry.dispose()
        floorSource.dispose()
        coverSource.dispose()
      } finally {
        now.mockRestore()
      }
    }
  })

  test('rejects a mutated cached reveal array and preserves a later authored replacement', () => {
    const scene = new Scene()
    const root = new Group()
    const geometry = new PlaneGeometry(2, 2)
    const firstSource = new MeshBasicMaterial({ color: '#302b29' })
    const secondSource = new MeshBasicMaterial({ color: '#b8b1a5' })
    const replacementSource = new MeshBasicMaterial({ color: '#338855' })
    const intruder = new MeshBasicMaterial({ color: '#ff00ff' })
    firstSource.userData.handoffSource = 'first-authored-slot'
    secondSource.userData.handoffSource = 'second-authored-slot'
    replacementSource.userData.handoffSource = 'replacement-authored-slot'
    const mesh = new Mesh(geometry, [firstSource, secondSource])
    root.add(mesh)
    scene.add(root)
    const materialPresentation = new LandrushIslandMaterialPresentationOwner()
    const ownerTokens = spyOn(materialPresentation, 'createFloorFadeOwnerToken')
    const floorPresentation = new LandrushIslandFloorFadePresentationOwner<LevelNode['id']>(
      materialPresentation,
    )
    const level = {
      levelId: 'level_floor_cached_reveal_array' as LevelNode['id'],
      root,
      structuralToken: 0,
    }
    let clock = 0
    const now = spyOn(performance, 'now').mockImplementation(() => {
      clock += 0.0125
      return clock
    })

    function frame(opacity: number, reveal = true) {
      floorPresentation.ensureLevel(level)
      const metrics = floorPresentation.prepareFrame(1 / 60)
      floorPresentation.applyLevelOpacity({ ...level, opacity })
      materialPresentation.syncRevealMeshes(reveal ? [mesh] : [], { kind: 'soft' })
      expect(metrics.materialsPrepared).toBeLessThanOrEqual(1)
      expect(metrics.preparationSteps).toBeLessThanOrEqual(128)
      return metrics
    }

    function settle(opacity: number, reveal = true) {
      for (let index = 0; index < 240 && floorPresentation.hasPendingWork; index += 1) {
        frame(opacity, reveal)
      }
      expect(floorPresentation.hasPendingWork).toBe(false)
      expect(floorPresentation.readLevel(level.levelId)).toMatchObject({
        pending: false,
        quarantineCount: 0,
        ready: true,
      })
    }

    try {
      frame(1, false)
      settle(1, false)
      expect(ownerTokens).toHaveBeenCalledTimes(1)
      const ownerToken = ownerTokens.mock.results[0]!.value as ReturnType<
        typeof materialPresentation.createFloorFadeOwnerToken
      >
      const representatives = materialPresentation.createRenderReadinessRepresentative(
        [{ floor: true, mesh, reveal: true }],
        { kind: 'soft' },
      )
      representatives.clear()
      const materialCount = materialPresentation.ownedMaterialCount
      frame(1)
      const cachedSwitch = frame(0.35)
      expect(cachedSwitch.preparationSteps).toBe(0)
      expect(materialPresentation.ownedMaterialCount).toBe(materialCount)
      expect(materialPresentation.readOwnedFloorFadeAssignment(mesh, ownerToken)).toBe(
        mesh.material,
      )

      const corruptedAssignment = mesh.material
      corruptedAssignment[0] = intruder
      expect(materialPresentation.readOwnedFloorFadeAssignment(mesh, ownerToken) === null).toBe(
        true,
      )
      expect(materialPresentation.applyPreparedFloorFade(mesh, false)).toBe('stale')
      expect(mesh.material).toBe(corruptedAssignment)

      floorPresentation.applyLevelOpacity({ ...level, opacity: 1 })
      expect(floorPresentation.hasPendingWork).toBe(true)
      frame(1)
      settle(1)
      expect(mesh.material).not.toBe(corruptedAssignment)
      expect(mesh.material).not.toContain(intruder)
      expect(mesh.material.map((material) => material.userData.handoffSource)).toEqual([
        'first-authored-slot',
        'second-authored-slot',
      ])

      const authoredReplacement = [replacementSource, secondSource]
      mesh.material = authoredReplacement
      frame(1)
      settle(1)
      expect(mesh.material.map((material) => material.userData.handoffSource)).toEqual([
        'replacement-authored-slot',
        'second-authored-slot',
      ])
      expect(materialPresentation.readOwnedFloorFadeAssignment(mesh, ownerToken)).toBe(
        mesh.material,
      )

      floorPresentation.disposeExactAll()
      materialPresentation.dispose()
      expect(mesh.material).toBe(authoredReplacement)
      expect(mesh.material[0]).toBe(replacementSource)
    } finally {
      try {
        floorPresentation.disposeExactAll()
        materialPresentation.dispose()
        geometry.dispose()
        firstSource.dispose()
        secondSource.dispose()
        replacementSource.dispose()
        intruder.dispose()
      } finally {
        ownerTokens.mockRestore()
        now.mockRestore()
      }
    }
  })

  test('preserves an external source replacement between reveal and floor callbacks', () => {
    const fixture = createHandoffFixture(63)
    const replacementSource = new MeshBasicMaterial({ color: '#338855' })
    replacementSource.userData.handoffSource = 'external-after-reveal'
    const slab = fixture.meshes[0]!
    try {
      fixture.prepareInitialLevel()
      fixture.crossFloor(fixture.meshes.slice(0, 5), () => {
        slab.material = replacementSource
      })
      fixture.expectOpaqueReady()
      expect(slab.material).not.toBe(replacementSource)
      expect(slab.material.color.equals(replacementSource.color)).toBe(true)
      expect(slab.material.userData.handoffSource).toBe('external-after-reveal')

      fixture.crossFloor([])
      fixture.expectOpaqueReady()
      expect(slab.material.color.equals(replacementSource.color)).toBe(true)
      expect(slab.material.userData.handoffSource).toBe('external-after-reveal')
      fixture.expectIdle()
    } finally {
      fixture.dispose()
      replacementSource.dispose()
    }
  })

  test('preserves a wall cutout source change while reveal owns the displayed assignment', () => {
    const fixture = createHandoffFixture(63)
    const wall = fixture.meshes[1]!
    const replacementSource = new MeshBasicMaterial({ color: '#4466aa' })
    replacementSource.userData.handoffSource = 'wall-cutout-after-reveal'
    let wallOwnership = applyWallCutoutMaterial(undefined, wall, wall.material, 'visible-v0')
    try {
      fixture.prepareInitialLevel()
      fixture.crossFloor(fixture.meshes.slice(0, 5), () => {
        const revealAssignment = wall.material
        wallOwnership = applyWallCutoutMaterial(
          wallOwnership,
          wall,
          replacementSource,
          'visible-v1',
        )
        expect(wall.material).toBe(revealAssignment)
        expect(readWallCutoutMaterialAssignment(wall)).toBe(replacementSource)
      })
      fixture.expectOpaqueReady()
      expect(wall.material).not.toBe(replacementSource)
      expect(wall.material.color.equals(replacementSource.color)).toBe(true)
      expect(wall.material.userData.handoffSource).toBe('wall-cutout-after-reveal')

      fixture.crossFloor([])
      fixture.expectOpaqueReady()
      expect(wall.material.color.equals(replacementSource.color)).toBe(true)
      expect(wall.material.userData.handoffSource).toBe('wall-cutout-after-reveal')
      fixture.expectIdle()
    } finally {
      fixture.dispose()
      replacementSource.dispose()
    }
  })

  test('releases quarantine when an already-pending source loses its presentation binding', () => {
    const fixture = createHandoffFixture(63)
    const slab = fixture.meshes[0]!
    const replacementSource = new MeshBasicMaterial({ color: '#aa6633' })
    replacementSource.userData.handoffSource = 'pending-source-after-binding-loss'
    try {
      fixture.prepareInitialLevel()
      const ownedAssignment = slab.material
      slab.material = replacementSource
      fixture.floorPresentation.ensureLevel(fixture.level)
      expect(slab.material).toBe(ownedAssignment)
      expect(fixture.floorPresentation.readLevel(fixture.level.levelId)?.pending).toBe(true)

      // The same source loses its owner before the queued generation can scan it.
      slab.material = replacementSource
      fixture.materialPresentation.detachMeshBeforeDispose(slab)
      expect(fixture.materialPresentation.activeBindingCount).toBe(62)
      fixture.floorPresentation.ensureLevel(fixture.level)
      expect(slab.material).toBe(replacementSource)
      expect(slab.visible).toBe(false)

      fixture.frames(240)
      fixture.expectOpaqueReady()
      expect(slab.material.color.equals(replacementSource.color)).toBe(true)
      expect(slab.material.userData.handoffSource).toBe('pending-source-after-binding-loss')
      fixture.expectIdle()
    } finally {
      fixture.dispose()
      replacementSource.dispose()
    }
  })
})
