import { afterEach, describe, expect, test } from 'bun:test'
import type { LevelNode } from '@pascal-app/core'
import { clearMaterialCache } from '@pascal-app/viewer'
import {
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Scene,
} from 'three'
import {
  LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY,
  readLandrushIslandFloorFadeOpacity,
} from './landrush-floor-fade-opacity'
import {
  LANDRUSH_ISLAND_FLOOR_FADE_EPSILON,
  LandrushIslandFloorFadePresentationOwner,
} from './landrush-floor-fade-presentation'
import { LandrushIslandMaterialPresentationOwner } from './landrush-island-material-presentation'

type LevelId = LevelNode['id']

afterEach(() => {
  clearMaterialCache()
})

function asLevelId(value: string) {
  return value as LevelId
}

function createMesh(material: Material | Material[] = new MeshBasicMaterial()) {
  return new Mesh(new PlaneGeometry(2, 2), material)
}

function createRoot(meshCount = 1) {
  const root = new Group()
  const meshes: Mesh[] = []
  const materials: Material[] = []
  for (let index = 0; index < meshCount; index += 1) {
    const material = new MeshBasicMaterial()
    const mesh = createMesh(material)
    root.add(mesh)
    meshes.push(mesh)
    materials.push(material)
  }
  return { materials, meshes, root }
}

function createOwners(requestFrame?: () => void) {
  const materialPresentation = new LandrushIslandMaterialPresentationOwner()
  const floorPresentation = new LandrushIslandFloorFadePresentationOwner<LevelId>(
    materialPresentation,
    requestFrame,
  )
  return { floorPresentation, materialPresentation }
}

function ensureLevel({
  excludedRoots,
  floorPresentation,
  forceVisible = false,
  levelId,
  root,
  structuralToken = 0,
}: {
  excludedRoots?: Iterable<Object3D>
  floorPresentation: LandrushIslandFloorFadePresentationOwner<LevelId>
  forceVisible?: boolean
  levelId: LevelId
  root: Object3D
  structuralToken?: unknown
}) {
  floorPresentation.ensureLevel({
    excludedRoots,
    forceVisible,
    levelId,
    root,
    structuralToken,
  })
}

function prepareUntilReady(
  floorPresentation: LandrushIslandFloorFadePresentationOwner<LevelId>,
  levelId: LevelId,
  maxFrames = 20_000,
) {
  for (let frame = 0; frame < maxFrames; frame += 1) {
    if (floorPresentation.readLevel(levelId)?.pending === false) return
    floorPresentation.prepareFrame(1 / 60)
  }
  throw new Error('floor preparation did not settle')
}

function prepareAllWork(
  floorPresentation: LandrushIslandFloorFadePresentationOwner<LevelId>,
  maxFrames = 20_000,
) {
  for (let frame = 0; frame < maxFrames; frame += 1) {
    if (!floorPresentation.hasPendingWork) return
    floorPresentation.prepareFrame(1 / 60)
  }
  throw new Error('floor presentation work did not settle')
}

function disposeOwners({
  floorPresentation,
  materialPresentation,
}: ReturnType<typeof createOwners>) {
  floorPresentation.disposeExactAll()
  materialPresentation.dispose()
}

describe('Landrush floor fade presentation owner', () => {
  test('prepares both modes incrementally and switches opacity without allocation', () => {
    const levelId = asLevelId('level-multi-material')
    const scene = new Scene()
    const sources = [new MeshBasicMaterial(), new MeshBasicMaterial(), new MeshBasicMaterial()]
    const root = new Group()
    const mesh = createMesh(sources)
    root.add(mesh)
    scene.add(root)
    const owners = createOwners()

    ensureLevel({ floorPresentation: owners.floorPresentation, levelId, root })
    while (owners.floorPresentation.readLevel(levelId)?.pending) {
      const metrics = owners.floorPresentation.prepareFrame(1 / 60)
      expect(metrics.materialsPrepared).toBeLessThanOrEqual(1)
    }

    expect(owners.materialPresentation.ownedMaterialCount).toBe(6)
    const opaqueAssignment = mesh.material
    const ownedBeforeFade = owners.materialPresentation.ownedMaterialCount
    const faded = owners.floorPresentation.applyLevelOpacity({
      levelId,
      opacity: 0.35,
      root,
    })
    expect(faded).toEqual({ appliedOpacity: 0.35, ready: true })
    expect(mesh.material).not.toBe(opaqueAssignment)
    expect(owners.materialPresentation.ownedMaterialCount).toBe(ownedBeforeFade)
    expect((mesh.material as Material[]).every((material) => !material.depthWrite)).toBe(true)

    owners.floorPresentation.applyLevelOpacity({ levelId, opacity: 1, root })
    expect(mesh.material).toBe(opaqueAssignment)
    expect(owners.materialPresentation.ownedMaterialCount).toBe(ownedBeforeFade)

    disposeOwners(owners)
    expect(mesh.material).toBe(sources)
    mesh.geometry.dispose()
    for (const source of sources) source.dispose()
  })

  test('keeps an incomplete fractional root at the source-safe opaque endpoint', () => {
    const levelId = asLevelId('level-opaque-hold')
    const scene = new Scene()
    const { root } = createRoot(4)
    scene.add(root)
    const owners = createOwners()

    ensureLevel({ floorPresentation: owners.floorPresentation, levelId, root })
    const result = owners.floorPresentation.applyLevelOpacity({
      levelId,
      opacity: 0.35,
      root,
    })

    expect(result).toEqual({ appliedOpacity: 1, ready: false })
    expect(root.visible).toBe(true)
    expect(root.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBe(1)

    prepareUntilReady(owners.floorPresentation, levelId)
    expect(owners.floorPresentation.readLevel(levelId)?.appliedOpacity).toBe(0.35)
    expect(root.visible).toBe(true)
    expect(readLandrushIslandFloorFadeOpacity(root.children[0])).toBe(0.35)

    disposeOwners(owners)
  })

  test('covers every destination-presence, readiness, and target endpoint cell', () => {
    const presences = ['present', 'absent', 'authored-hidden'] as const
    const readinessValues = ['pending', 'ready'] as const
    const targets = [0, 0.35, 1] as const

    for (const presence of presences) {
      for (const readiness of readinessValues) {
        for (const target of targets) {
          const levelId = asLevelId(['matrix', presence, readiness, String(target)].join('-'))
          const scene = new Scene()
          const { root } = createRoot()
          if (presence === 'authored-hidden') root.visible = false
          if (presence !== 'absent') scene.add(root)
          const owners = createOwners()

          ensureLevel({ floorPresentation: owners.floorPresentation, levelId, root })
          if (readiness === 'ready') {
            prepareUntilReady(owners.floorPresentation, levelId)
          }
          const result = owners.floorPresentation.applyLevelOpacity({
            levelId,
            opacity: target,
            root,
          })

          if (target === 0) {
            expect(root.visible).toBe(false)
            expect(result.appliedOpacity).toBe(0)
          } else if (presence !== 'present') {
            expect(root.visible).toBe(false)
            expect(result.appliedOpacity).toBe(0)
          } else if (target === 1) {
            expect(root.visible).toBe(true)
            expect(result.appliedOpacity).toBe(1)
          } else if (readiness === 'ready') {
            expect(root.visible).toBe(true)
            expect(result.appliedOpacity).toBe(0.35)
          } else {
            expect(root.visible).toBe(true)
            expect(result.appliedOpacity).toBe(1)
          }

          disposeOwners(owners)
        }
      }
    }
  })

  test('does not spin a ready detached candidate and promotes it allocation-free when attached', () => {
    const levelId = asLevelId('level-ready-detached')
    const scene = new Scene()
    const { root } = createRoot()
    let frameRequests = 0
    const owners = createOwners(() => {
      frameRequests += 1
    })

    ensureLevel({ floorPresentation: owners.floorPresentation, levelId, root })
    owners.floorPresentation.applyLevelOpacity({ levelId, opacity: 0.35, root })
    prepareUntilReady(owners.floorPresentation, levelId)
    const settledRequests = frameRequests
    expect(owners.floorPresentation.hasPendingWork).toBe(false)
    expect(root.visible).toBe(false)

    owners.floorPresentation.prepareFrame(1 / 60)
    expect(frameRequests).toBe(settledRequests)

    const ownedBeforeAttach = owners.materialPresentation.ownedMaterialCount
    scene.add(root)
    const result = owners.floorPresentation.applyLevelOpacity({
      levelId,
      opacity: 0.35,
      root,
    })
    expect(result).toEqual({ appliedOpacity: 0.35, ready: true })
    expect(root.visible).toBe(true)
    expect(owners.materialPresentation.ownedMaterialCount).toBe(ownedBeforeAttach)

    disposeOwners(owners)
  })

  test('does not let an authored-hidden candidate retire a renderable fallback', () => {
    const levelId = asLevelId('level-authored-hidden-replacement')
    const scene = new Scene()
    const first = createRoot()
    const second = createRoot()
    second.root.visible = false
    scene.add(first.root, second.root)
    const owners = createOwners()

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: first.root,
    })
    prepareUntilReady(owners.floorPresentation, levelId)
    owners.floorPresentation.applyLevelOpacity({
      levelId,
      opacity: 0.35,
      root: first.root,
    })

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: second.root,
      structuralToken: 1,
    })
    prepareUntilReady(owners.floorPresentation, levelId)
    owners.floorPresentation.applyLevelOpacity({
      levelId,
      opacity: 0.35,
      root: second.root,
    })

    expect(first.root.visible).toBe(true)
    expect(second.root.visible).toBe(false)

    const ownedBeforeForce = owners.materialPresentation.ownedMaterialCount
    ensureLevel({
      floorPresentation: owners.floorPresentation,
      forceVisible: true,
      levelId,
      root: second.root,
      structuralToken: 1,
    })
    expect(first.root.visible).toBe(false)
    expect(second.root.visible).toBe(true)
    expect(owners.materialPresentation.ownedMaterialCount).toBe(ownedBeforeForce)

    disposeOwners(owners)
  })

  test('retains a prepared fallback throughout a fractional replacement', () => {
    const levelId = asLevelId('level-replacement')
    const scene = new Scene()
    const first = createRoot()
    const second = createRoot(8)
    scene.add(first.root, second.root)
    const owners = createOwners()

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: first.root,
    })
    prepareUntilReady(owners.floorPresentation, levelId)
    owners.floorPresentation.applyLevelOpacity({
      levelId,
      opacity: 0.35,
      root: first.root,
    })
    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: second.root,
      structuralToken: 1,
    })

    expect(first.root.visible).toBe(true)
    expect(second.root.visible).toBe(false)
    owners.floorPresentation.prepareFrame(1 / 60)
    expect(first.root.visible).toBe(true)
    expect(second.root.visible).toBe(false)

    prepareUntilReady(owners.floorPresentation, levelId)
    expect(first.root.visible).toBe(false)
    expect(second.root.visible).toBe(true)
    expect(readLandrushIslandFloorFadeOpacity(second.root.children[0])).toBe(0.35)

    disposeOwners(owners)
  })

  test('rebases A to B to A or C without hiding the sole safe root', () => {
    const levelId = asLevelId('level-rebase')
    const scene = new Scene()
    const first = createRoot()
    const second = createRoot(12)
    const third = createRoot(12)
    scene.add(first.root, second.root, third.root)
    const owners = createOwners()

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: first.root,
    })
    prepareUntilReady(owners.floorPresentation, levelId)
    owners.floorPresentation.applyLevelOpacity({
      levelId,
      opacity: 0.35,
      root: first.root,
    })

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: second.root,
      structuralToken: 1,
    })
    expect(first.root.visible).toBe(true)

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: first.root,
      structuralToken: 2,
    })
    expect(first.root.visible).toBe(true)
    expect(second.root.visible).toBe(false)

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: third.root,
      structuralToken: 3,
    })
    expect(first.root.visible).toBe(true)
    expect(third.root.visible).toBe(false)

    prepareUntilReady(owners.floorPresentation, levelId)
    expect(first.root.visible).toBe(false)
    expect(third.root.visible).toBe(true)

    disposeOwners(owners)
  })

  test('rebases an incomplete opaque hold before a second supersession', () => {
    const levelId = asLevelId('level-opaque-rebase')
    const scene = new Scene()
    const first = createRoot()
    const firstParent = new Group()
    firstParent.add(first.root)
    scene.add(firstParent)
    const second = createRoot(12)
    const third = createRoot(12)
    scene.add(second.root, third.root)
    const owners = createOwners()

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: first.root,
    })
    prepareUntilReady(owners.floorPresentation, levelId)
    owners.floorPresentation.applyLevelOpacity({
      levelId,
      opacity: 0.35,
      root: first.root,
    })

    firstParent.visible = false
    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: second.root,
      structuralToken: 1,
    })
    expect(second.root.visible).toBe(true)
    expect(readLandrushIslandFloorFadeOpacity(second.root)).toBe(1)

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: third.root,
      structuralToken: 2,
    })
    expect(second.root.visible).toBe(true)
    expect(third.root.visible).toBe(false)

    disposeOwners(owners)
  })

  test('defers a ready replacement below hidden and detached ancestors', () => {
    for (const ancestorState of ['hidden', 'detached'] as const) {
      const levelId = asLevelId(['level-ancestor', ancestorState].join('-'))
      const scene = new Scene()
      const first = createRoot()
      const second = createRoot()
      const secondAncestor = new Group()
      secondAncestor.add(second.root)
      scene.add(first.root)
      if (ancestorState === 'hidden') {
        secondAncestor.visible = false
        scene.add(secondAncestor)
      }
      const owners = createOwners()

      ensureLevel({
        floorPresentation: owners.floorPresentation,
        levelId,
        root: first.root,
      })
      prepareUntilReady(owners.floorPresentation, levelId)
      owners.floorPresentation.applyLevelOpacity({
        levelId,
        opacity: 0.35,
        root: first.root,
      })
      ensureLevel({
        floorPresentation: owners.floorPresentation,
        levelId,
        root: second.root,
        structuralToken: 1,
      })
      prepareUntilReady(owners.floorPresentation, levelId)

      expect(first.root.visible).toBe(true)
      expect(second.root.visible).toBe(false)
      const ownedBeforePresence = owners.materialPresentation.ownedMaterialCount

      if (ancestorState === 'hidden') secondAncestor.visible = true
      else scene.add(secondAncestor)
      owners.floorPresentation.applyLevelOpacity({
        levelId,
        opacity: 0.35,
        root: second.root,
      })

      expect(first.root.visible).toBe(false)
      expect(second.root.visible).toBe(true)
      expect(owners.materialPresentation.ownedMaterialCount).toBe(ownedBeforePresence)
      disposeOwners(owners)
    }
  })

  test('settles nested parent and cover handoffs to a fixed point in one frame', () => {
    const parentId = asLevelId('level-parent')
    const coverId = asLevelId('level-cover')
    const scene = new Scene()
    const oldParent = new Group()
    const oldCover = new Group()
    oldParent.add(oldCover)
    const nextParent = new Group()
    const nextCover = new Group()
    nextParent.add(nextCover)
    scene.add(oldParent, nextParent)
    const owners = createOwners()

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId: parentId,
      root: oldParent,
    })
    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId: coverId,
      root: oldCover,
    })
    prepareUntilReady(owners.floorPresentation, parentId)
    prepareUntilReady(owners.floorPresentation, coverId)
    owners.floorPresentation.applyLevelOpacity({
      levelId: parentId,
      opacity: 0.35,
      root: oldParent,
    })
    owners.floorPresentation.applyLevelOpacity({
      levelId: coverId,
      opacity: 0.35,
      root: oldCover,
    })

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId: coverId,
      root: nextCover,
      structuralToken: 1,
    })
    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId: parentId,
      root: nextParent,
      structuralToken: 1,
    })
    while (
      owners.floorPresentation.readLevel(parentId)?.pending ||
      owners.floorPresentation.readLevel(coverId)?.pending
    ) {
      owners.floorPresentation.prepareFrame(1 / 60)
    }

    expect(oldParent.visible).toBe(false)
    expect(oldCover.visible).toBe(false)
    expect(nextParent.visible).toBe(true)
    expect(nextCover.visible).toBe(true)
    disposeOwners(owners)
  })

  test('keeps shared nested-mesh ownership until every root token releases it', () => {
    const parentId = asLevelId('level-shared-parent')
    const coverId = asLevelId('level-shared-cover')
    const scene = new Scene()
    const parent = new Group()
    const cover = new Group()
    const source = new MeshBasicMaterial()
    const mesh = createMesh(source)
    cover.add(mesh)
    parent.add(cover)
    scene.add(parent)
    const owners = createOwners()

    ensureLevel({ floorPresentation: owners.floorPresentation, levelId: parentId, root: parent })
    ensureLevel({ floorPresentation: owners.floorPresentation, levelId: coverId, root: cover })
    prepareUntilReady(owners.floorPresentation, parentId)
    prepareUntilReady(owners.floorPresentation, coverId)
    expect(mesh.material).not.toBe(source)

    owners.floorPresentation.pruneLevels(new Map([[parentId, parent]]))
    expect(mesh.material).not.toBe(source)
    expect(owners.materialPresentation.activeBindingCount).toBe(1)

    owners.floorPresentation.pruneLevels(new Map())
    expect(mesh.material).toBe(source)
    expect(owners.materialPresentation.activeBindingCount).toBe(0)

    owners.floorPresentation.disposeExactAll()
    owners.materialPresentation.dispose()
    mesh.geometry.dispose()
    source.dispose()
  })

  test('partitions nested cover meshes while using their effective ancestor opacity', () => {
    const parentId = asLevelId('level-partitioned-parent')
    const coverId = asLevelId('level-partitioned-cover')
    const scene = new Scene()
    const parent = new Group()
    const parentMesh = createMesh()
    const parentSource = parentMesh.material as Material
    const cover = new Group()
    const coverMesh = createMesh()
    const coverSource = coverMesh.material as Material
    cover.add(coverMesh)
    parent.add(parentMesh, cover)
    scene.add(parent)
    const owners = createOwners()

    ensureLevel({
      excludedRoots: [cover],
      floorPresentation: owners.floorPresentation,
      levelId: parentId,
      root: parent,
    })
    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId: coverId,
      root: cover,
    })
    prepareUntilReady(owners.floorPresentation, parentId)
    prepareUntilReady(owners.floorPresentation, coverId)

    owners.floorPresentation.applyLevelOpacity({
      levelId: parentId,
      opacity: 0.35,
      root: parent,
    })
    owners.floorPresentation.applyLevelOpacity({
      effectiveOpacity: 0.35,
      levelId: coverId,
      opacity: 1,
      root: cover,
    })

    expect(readLandrushIslandFloorFadeOpacity(parentMesh)).toBe(0.35)
    expect(readLandrushIslandFloorFadeOpacity(coverMesh)).toBe(0.35)
    expect(owners.floorPresentation.readLevel(parentId)).toMatchObject({
      assignmentMismatchCount: 0,
      materialMode: 'fractional',
    })
    expect(owners.floorPresentation.readLevel(coverId)).toMatchObject({
      assignmentMismatchCount: 0,
      materialMode: 'fractional',
    })

    disposeOwners(owners)
    parentMesh.geometry.dispose()
    coverMesh.geometry.dispose()
    parentSource.dispose()
    coverSource.dispose()
  })

  test('bounds the first scan tick for a ten-thousand-object root', () => {
    const levelId = asLevelId('level-large')
    const scene = new Scene()
    const root = new Group()
    for (let index = 0; index < 10_000; index += 1) root.add(new Object3D())
    scene.add(root)
    const owners = createOwners()

    ensureLevel({ floorPresentation: owners.floorPresentation, levelId, root })
    const metrics = owners.floorPresentation.prepareFrame(1 / 60)

    expect(metrics.objectsVisited).toBeGreaterThan(0)
    expect(metrics.objectsVisited).toBeLessThanOrEqual(192)
    expect(metrics.edgesTraversed).toBeLessThanOrEqual(metrics.preparationSteps)
    expect(metrics.stackItemsAdded).toBe(metrics.edgesTraversed)
    expect(metrics.maxPendingStackDepth).toBeLessThanOrEqual(2)
    expect(metrics.preparationSteps).toBeLessThanOrEqual(384)
    expect(owners.floorPresentation.readLevel(levelId)?.pending).toBe(true)
    disposeOwners(owners)
  })

  test('coalesces structural tokens and completes a follow-up generation without starvation', () => {
    const levelId = asLevelId('level-coalesced-revision')
    const scene = new Scene()
    const root = new Group()
    for (let index = 0; index < 800; index += 1) root.add(new Object3D())
    scene.add(root)
    const owners = createOwners()

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root,
      structuralToken: 0,
    })
    for (let token = 1; token <= 20; token += 1) {
      ensureLevel({
        floorPresentation: owners.floorPresentation,
        levelId,
        root,
        structuralToken: token,
      })
      owners.floorPresentation.prepareFrame(1 / 60)
    }
    prepareUntilReady(owners.floorPresentation, levelId)

    const snapshot = owners.floorPresentation.readPreparationSnapshot()
    expect(snapshot.completeLevelIds.has(levelId)).toBe(true)
    expect(snapshot.pendingLevelIds.has(levelId)).toBe(false)
    disposeOwners(owners)
  })

  test('quarantines generated children synchronously, then fades their prepared presentation in', () => {
    const levelId = asLevelId('level-child-added')
    const scene = new Scene()
    const { root } = createRoot()
    scene.add(root)
    let frameRequests = 0
    const owners = createOwners(() => {
      frameRequests += 1
    })

    ensureLevel({ floorPresentation: owners.floorPresentation, levelId, root })
    prepareUntilReady(owners.floorPresentation, levelId)
    const requestsBeforeAdd = frameRequests

    const generatedChildren: Group[] = []
    for (let index = 0; index < 8; index += 1) {
      const generated = new Group()
      generated.userData.__fromGeometry = true
      generated.add(createMesh())
      generatedChildren.push(generated)
      root.add(generated)
    }

    expect(generatedChildren.every((child) => !child.visible)).toBe(true)
    expect(frameRequests).toBe(requestsBeforeAdd + 1)

    prepareUntilReady(owners.floorPresentation, levelId)
    const first = generatedChildren[0]
    expect(first?.visible).toBe(true)
    expect(first?.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBeLessThan(1)
    expect(owners.floorPresentation.hasPendingWork).toBe(true)

    prepareAllWork(owners.floorPresentation)
    expect(generatedChildren.every((child) => child.visible)).toBe(true)
    expect(
      generatedChildren.every(
        (child) => child.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] === undefined,
      ),
    ).toBe(true)

    disposeOwners(owners)
  })

  test('quarantines a populated unmarked group until its fractional materials are ready', () => {
    const levelId = asLevelId('level-populated-unmarked')
    const scene = new Scene()
    const root = new Group()
    scene.add(root)
    const owners = createOwners()

    ensureLevel({ floorPresentation: owners.floorPresentation, levelId, root })
    prepareUntilReady(owners.floorPresentation, levelId)
    owners.floorPresentation.applyLevelOpacity({ levelId, opacity: 0.35, root })

    const source = new MeshBasicMaterial()
    const mesh = createMesh(source)
    const populatedGroup = new Group()
    populatedGroup.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = 0.72
    populatedGroup.add(mesh)
    root.add(populatedGroup)
    expect(populatedGroup.visible).toBe(false)
    expect(populatedGroup.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBe(0)
    expect(mesh.material).toBe(source)
    expect(owners.floorPresentation.retainedLeaseCount).toBe(2)

    let preparationFrames = 0
    while (owners.floorPresentation.readLevel(levelId)?.pending) {
      const metrics = owners.floorPresentation.prepareFrame(1 / 60)
      expect(metrics.materialsPrepared).toBeLessThanOrEqual(1)
      if (mesh.material === source) expect(populatedGroup.visible).toBe(false)
      preparationFrames += 1
      if (preparationFrames > 100) throw new Error('populated group preparation did not settle')
    }
    expect(mesh.material).not.toBe(source)
    expect((mesh.material as Material).depthWrite).toBe(false)
    expect(populatedGroup.visible).toBe(true)
    expect(populatedGroup.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBeLessThan(
      0.72,
    )

    prepareAllWork(owners.floorPresentation)
    expect(populatedGroup.visible).toBe(true)
    expect(populatedGroup.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBe(0.72)
    expect(readLandrushIslandFloorFadeOpacity(mesh)).toBeCloseTo(0.35 * 0.72)
    expect(owners.floorPresentation.retainedLeaseCount).toBe(1)

    const holdingRoot = new Group()
    scene.add(holdingRoot)
    const movedBeforePreparation = new Group()
    movedBeforePreparation.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = 0.44
    root.add(movedBeforePreparation)
    expect(movedBeforePreparation.visible).toBe(false)
    holdingRoot.add(movedBeforePreparation)
    expect(movedBeforePreparation.visible).toBe(true)
    expect(movedBeforePreparation.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBe(
      0.44,
    )
    expect(owners.floorPresentation.retainedLeaseCount).toBe(1)
    prepareAllWork(owners.floorPresentation)

    disposeOwners(owners)
    expect(mesh.material).toBe(source)
    expect(populatedGroup.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBe(0.72)
    mesh.geometry.dispose()
    source.dispose()
  })

  test('keeps an opaque addition quarantined when the root fades before preparation', () => {
    const levelId = asLevelId('level-opaque-add-fractional-before-preparation')
    const scene = new Scene()
    const root = new Group()
    scene.add(root)
    const owners = createOwners()

    ensureLevel({ floorPresentation: owners.floorPresentation, levelId, root })
    prepareUntilReady(owners.floorPresentation, levelId)

    const source = new MeshBasicMaterial()
    const mesh = createMesh(source)
    const populatedGroup = new Group()
    populatedGroup.add(mesh)
    root.add(populatedGroup)
    expect(populatedGroup.visible).toBe(false)
    expect(mesh.material).toBe(source)

    const faded = owners.floorPresentation.applyLevelOpacity({
      levelId,
      opacity: 0.35,
      root,
    })
    expect(faded).toEqual({ appliedOpacity: 0.35, ready: false })
    expect(populatedGroup.visible).toBe(false)
    expect(mesh.material).toBe(source)

    prepareUntilReady(owners.floorPresentation, levelId)
    expect(populatedGroup.visible).toBe(true)
    expect(populatedGroup.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBeLessThan(
      1,
    )
    expect(mesh.material).not.toBe(source)
    expect((mesh.material as Material).depthWrite).toBe(false)

    prepareAllWork(owners.floorPresentation)
    expect(
      populatedGroup.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY],
    ).toBeUndefined()
    expect(owners.floorPresentation.retainedLeaseCount).toBe(1)

    disposeOwners(owners)
    expect(mesh.material).toBe(source)
    mesh.geometry.dispose()
    source.dispose()
  })

  test('keeps an ancestor arrival monotonic when a child is added during its fade', () => {
    const levelId = asLevelId('level-child-during-ancestor-arrival')
    const scene = new Scene()
    const root = new Group()
    scene.add(root)
    const owners = createOwners()

    ensureLevel({ floorPresentation: owners.floorPresentation, levelId, root })
    prepareUntilReady(owners.floorPresentation, levelId)
    owners.floorPresentation.applyLevelOpacity({ levelId, opacity: 0.35, root })

    const registeredGroup = new Group()
    root.add(registeredGroup)
    prepareUntilReady(owners.floorPresentation, levelId)
    owners.floorPresentation.prepareFrame(1 / 60)
    const ancestorAmount = registeredGroup.userData[
      LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY
    ] as number
    expect(ancestorAmount).toBeGreaterThan(0)

    const source = new MeshBasicMaterial()
    const mesh = createMesh(source)
    const generated = new Group()
    generated.userData.__fromGeometry = true
    generated.add(mesh)
    registeredGroup.add(generated)
    expect(registeredGroup.visible).toBe(true)
    expect(registeredGroup.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBe(
      ancestorAmount,
    )
    expect(generated.visible).toBe(false)
    expect(generated.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBe(0)
    expect(owners.floorPresentation.retainedLeaseCount).toBe(3)

    let previousAmount = ancestorAmount
    for (let frame = 0; owners.floorPresentation.hasPendingWork && frame < 100; frame += 1) {
      owners.floorPresentation.prepareFrame(1 / 60)
      const currentAmount =
        registeredGroup.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]
      if (typeof currentAmount === 'number') {
        expect(currentAmount).toBeGreaterThanOrEqual(previousAmount)
        previousAmount = currentAmount
      }
    }
    expect(owners.floorPresentation.hasPendingWork).toBe(false)
    expect(
      registeredGroup.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY],
    ).toBeUndefined()
    expect(generated.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBeUndefined()
    expect(owners.floorPresentation.retainedLeaseCount).toBe(1)

    disposeOwners(owners)
    mesh.geometry.dispose()
    source.dispose()
  })

  test('observes empty nested renderer groups before their generated children can flash', () => {
    const levelId = asLevelId('level-nested-child-added')
    const scene = new Scene()
    const root = new Group()
    const initialRegisteredGroup = new Group()
    root.add(initialRegisteredGroup)
    scene.add(root)
    let frameRequests = 0
    const owners = createOwners(() => {
      frameRequests += 1
    })

    ensureLevel({ floorPresentation: owners.floorPresentation, levelId, root })
    prepareUntilReady(owners.floorPresentation, levelId)
    owners.floorPresentation.applyLevelOpacity({ levelId, opacity: 0.35, root })

    const initialGenerated = new Group()
    initialGenerated.userData.__fromGeometry = true
    const initialMesh = createMesh()
    initialGenerated.add(initialMesh)
    initialRegisteredGroup.add(initialGenerated)
    expect(initialGenerated.visible).toBe(false)
    expect(initialGenerated.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBe(0)

    const lateRegisteredGroup = new Group()
    root.add(lateRegisteredGroup)
    expect(owners.floorPresentation.retainedLeaseCount).toBe(3)
    const lateGenerated = new Group()
    lateGenerated.userData.__fromGeometry = true
    const lateMesh = createMesh()
    lateGenerated.add(lateMesh)
    lateRegisteredGroup.add(lateGenerated)
    expect(lateRegisteredGroup.visible).toBe(false)
    expect(lateRegisteredGroup.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBe(0)
    expect(lateGenerated.visible).toBe(true)
    expect(lateGenerated.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBeUndefined()
    expect(owners.floorPresentation.retainedLeaseCount).toBe(3)

    prepareUntilReady(owners.floorPresentation, levelId)
    expect(initialGenerated.visible).toBe(true)
    expect(
      initialGenerated.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY],
    ).toBeLessThan(1)
    expect(lateRegisteredGroup.visible).toBe(true)
    expect(
      lateRegisteredGroup.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY],
    ).toBeLessThan(1)
    expect(lateGenerated.visible).toBe(true)
    expect(lateGenerated.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBeUndefined()
    expect((initialMesh.material as Material).depthWrite).toBe(false)
    expect((lateMesh.material as Material).depthWrite).toBe(false)

    prepareAllWork(owners.floorPresentation)
    expect(initialGenerated.visible).toBe(true)
    expect(
      initialGenerated.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY],
    ).toBeUndefined()
    expect(lateRegisteredGroup.visible).toBe(true)
    expect(
      lateRegisteredGroup.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY],
    ).toBeUndefined()
    expect(lateGenerated.visible).toBe(true)
    expect(owners.floorPresentation.retainedLeaseCount).toBe(1)

    let detached = 0
    const detach = owners.materialPresentation.detachMeshBeforeDispose.bind(
      owners.materialPresentation,
    )
    owners.materialPresentation.detachMeshBeforeDispose = (mesh) => {
      detached += 1
      detach(mesh)
    }
    initialRegisteredGroup.remove(initialGenerated)
    expect(detached).toBe(1)
    prepareUntilReady(owners.floorPresentation, levelId)

    owners.floorPresentation.restoreCanonicalLevels()
    const requestsAfterRestore = frameRequests
    const afterRestore = new Group()
    afterRestore.userData.__fromGeometry = true
    const afterRestoreMesh = createMesh()
    afterRestore.add(afterRestoreMesh)
    lateRegisteredGroup.add(afterRestore)
    expect(afterRestore.visible).toBe(true)
    expect(afterRestore.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBeUndefined()
    expect(owners.floorPresentation.hasPendingWork).toBe(false)
    expect(frameRequests).toBe(requestsAfterRestore)

    owners.floorPresentation.disposeExactAll()
    owners.materialPresentation.dispose()
    for (const mesh of [initialMesh, lateMesh, afterRestoreMesh]) {
      const material = mesh.material as Material
      mesh.geometry.dispose()
      material.dispose()
    }
  })

  test('moves an observed renderer group between roots without stale quarantine ownership', () => {
    const firstLevelId = asLevelId('level-observer-move-first')
    const secondLevelId = asLevelId('level-observer-move-second')
    const scene = new Scene()
    const firstRoot = new Group()
    const secondRoot = new Group()
    const registeredGroup = new Group()
    firstRoot.add(registeredGroup)
    scene.add(firstRoot, secondRoot)
    let frameRequests = 0
    const owners = createOwners(() => {
      frameRequests += 1
    })

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId: firstLevelId,
      root: firstRoot,
    })
    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId: secondLevelId,
      root: secondRoot,
    })
    prepareUntilReady(owners.floorPresentation, firstLevelId)
    prepareUntilReady(owners.floorPresentation, secondLevelId)
    owners.floorPresentation.applyLevelOpacity({
      levelId: firstLevelId,
      opacity: 0.35,
      root: firstRoot,
    })
    owners.floorPresentation.applyLevelOpacity({
      levelId: secondLevelId,
      opacity: 0.35,
      root: secondRoot,
    })

    secondRoot.add(registeredGroup)
    const source = new MeshBasicMaterial()
    const mesh = createMesh(source)
    const generated = new Group()
    generated.userData.__fromGeometry = true
    generated.add(mesh)
    registeredGroup.add(generated)
    expect(registeredGroup.visible).toBe(false)
    expect(registeredGroup.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBe(0)
    expect(generated.visible).toBe(true)
    expect(generated.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBeUndefined()
    expect(owners.floorPresentation.retainedLeaseCount).toBe(3)

    prepareAllWork(owners.floorPresentation)
    expect(owners.floorPresentation.readLevel(firstLevelId)?.pending).toBe(false)
    expect(owners.floorPresentation.readLevel(secondLevelId)?.pending).toBe(false)
    expect(registeredGroup.visible).toBe(true)
    expect(
      registeredGroup.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY],
    ).toBeUndefined()
    expect(generated.visible).toBe(true)
    expect(generated.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBeUndefined()
    expect(readLandrushIslandFloorFadeOpacity(mesh)).toBe(0.35)
    expect(owners.floorPresentation.retainedLeaseCount).toBe(2)

    const holdingRoot = new Group()
    scene.add(holdingRoot)
    holdingRoot.add(registeredGroup)
    prepareAllWork(owners.floorPresentation)
    const requestsAfterSettle = frameRequests
    const untrackedSource = new MeshBasicMaterial()
    const untrackedMesh = createMesh(untrackedSource)
    const untrackedGenerated = new Group()
    untrackedGenerated.userData.__fromGeometry = true
    untrackedGenerated.add(untrackedMesh)
    registeredGroup.add(untrackedGenerated)
    expect(untrackedGenerated.visible).toBe(true)
    expect(
      untrackedGenerated.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY],
    ).toBeUndefined()
    expect(frameRequests).toBe(requestsAfterSettle)
    expect(owners.floorPresentation.hasPendingWork).toBe(false)
    expect(owners.floorPresentation.retainedLeaseCount).toBe(2)

    owners.floorPresentation.restoreCanonicalLevels()
    expect(owners.floorPresentation.retainedLeaseCount).toBe(0)
    owners.floorPresentation.disposeExactAll()
    owners.materialPresentation.dispose()
    for (const [candidate, material] of [
      [mesh, source],
      [untrackedMesh, untrackedSource],
    ] as const) {
      candidate.geometry.dispose()
      material.dispose()
    }
  })

  test('detaches known generated meshes before GeometrySystem can dispose them', () => {
    const levelId = asLevelId('level-child-removed')
    const scene = new Scene()
    const root = new Group()
    const generated = new Group()
    generated.userData.__fromGeometry = true
    const source = new MeshBasicMaterial()
    const mesh = createMesh(source)
    generated.add(mesh)
    root.add(generated)
    scene.add(root)
    const owners = createOwners()

    ensureLevel({ floorPresentation: owners.floorPresentation, levelId, root })
    prepareUntilReady(owners.floorPresentation, levelId)
    expect(mesh.material).not.toBe(source)

    let detached = 0
    const detach = owners.materialPresentation.detachMeshBeforeDispose.bind(
      owners.materialPresentation,
    )
    owners.materialPresentation.detachMeshBeforeDispose = (candidate) => {
      detached += 1
      detach(candidate)
    }

    root.remove(generated)
    expect(detached).toBe(1)
    expect(mesh.material).toBe(source)
    expect(owners.materialPresentation.activeBindingCount).toBe(0)

    disposeOwners(owners)
    mesh.geometry.dispose()
    source.dispose()
  })

  test('keeps a same-mesh source change on the prepared fractional assignment while rebasing', () => {
    const levelId = asLevelId('level-source-change')
    const scene = new Scene()
    const source = new MeshBasicMaterial()
    const replacementSource = new MeshBasicMaterial()
    const root = new Group()
    const mesh = createMesh(source)
    root.add(mesh)
    scene.add(root)
    const owners = createOwners()

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root,
      structuralToken: 0,
    })
    prepareUntilReady(owners.floorPresentation, levelId)
    owners.floorPresentation.applyLevelOpacity({ levelId, opacity: 0.35, root })

    mesh.material = replacementSource
    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root,
      structuralToken: 1,
    })
    expect(owners.floorPresentation.hasPendingWork).toBe(true)
    while (owners.floorPresentation.hasPendingWork) {
      owners.floorPresentation.prepareFrame(1 / 60)
      expect(mesh.visible).toBe(true)
      expect(owners.floorPresentation.readLevel(levelId)).toMatchObject({
        assignmentMismatchCount: 0,
        quarantineCount: 0,
      })
    }

    expect(mesh.material).not.toBe(replacementSource)
    expect(owners.floorPresentation.readLevel(levelId)).toMatchObject({
      appliedOpacity: 0.35,
      assignmentMismatchCount: 0,
      quarantineCount: 0,
      ready: true,
    })

    disposeOwners(owners)
    mesh.geometry.dispose()
    source.dispose()
    replacementSource.dispose()
  })

  test('adopts an opaque same-mesh material source change without hiding it', () => {
    const levelId = asLevelId('level-opaque-source-change')
    const scene = new Scene()
    const source = new MeshBasicMaterial()
    const replacementSource = new MeshBasicMaterial()
    const root = new Group()
    const mesh = createMesh(source)
    root.add(mesh)
    scene.add(root)
    const owners = createOwners()

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root,
      structuralToken: 0,
    })
    prepareUntilReady(owners.floorPresentation, levelId)

    mesh.material = replacementSource
    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root,
      structuralToken: 0,
    })
    expect(owners.floorPresentation.hasPendingWork).toBe(true)

    while (owners.floorPresentation.hasPendingWork) {
      owners.floorPresentation.prepareFrame(1 / 60)
      expect(mesh.visible).toBe(true)
    }

    expect(owners.floorPresentation.readLevel(levelId)).toMatchObject({
      assignmentMismatchCount: 0,
      quarantineCount: 0,
      ready: true,
    })
    expect(mesh.material).not.toBe(replacementSource)

    disposeOwners(owners)
    mesh.geometry.dispose()
    source.dispose()
    replacementSource.dispose()
  })

  test('releases completed child and canonical leases across repeated churn', () => {
    const levelId = asLevelId('level-lease-churn')
    const scene = new Scene()
    const { root } = createRoot()
    scene.add(root)
    const owners = createOwners()

    ensureLevel({ floorPresentation: owners.floorPresentation, levelId, root })
    prepareUntilReady(owners.floorPresentation, levelId)
    expect(owners.floorPresentation.retainedLeaseCount).toBe(1)

    for (let index = 0; index < 20; index += 1) {
      const generated = new Group()
      generated.userData.__fromGeometry = true
      generated.add(createMesh())
      root.add(generated)
      prepareAllWork(owners.floorPresentation)
      expect(owners.floorPresentation.retainedLeaseCount).toBe(1)
      root.remove(generated)
      prepareUntilReady(owners.floorPresentation, levelId)
      expect(owners.floorPresentation.retainedLeaseCount).toBe(1)
    }

    owners.floorPresentation.restoreCanonicalLevels()
    expect(owners.floorPresentation.retainedLeaseCount).toBe(0)
    owners.floorPresentation.disposeExactAll()
    owners.materialPresentation.dispose()
  })

  test('discards superseded queued generations in constant work without exposing them', () => {
    const levelId = asLevelId('level-stale-queue')
    const scene = new Scene()
    const first = createRoot(16)
    const second = createRoot(16)
    scene.add(first.root, second.root)
    const owners = createOwners()

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: first.root,
    })
    owners.floorPresentation.applyLevelOpacity({
      levelId,
      opacity: 0.35,
      root: first.root,
    })
    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: second.root,
      structuralToken: 1,
    })

    const metrics = owners.floorPresentation.prepareFrame(1 / 60)
    expect(metrics.preparationSteps).toBeLessThanOrEqual(384)
    expect(first.root.visible).toBe(true)
    expect(second.root.visible).toBe(false)

    prepareUntilReady(owners.floorPresentation, levelId)
    expect(first.root.visible).toBe(false)
    expect(second.root.visible).toBe(true)
    disposeOwners(owners)
  })

  test('prunes and restores only the canonical identity, then exact-all restores provenance', () => {
    const levelId = asLevelId('level-prune')
    const scene = new Scene()
    const first = createRoot()
    const second = createRoot(10)
    scene.add(first.root, second.root)
    const owners = createOwners()

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: first.root,
    })
    prepareUntilReady(owners.floorPresentation, levelId)
    owners.floorPresentation.applyLevelOpacity({
      levelId,
      opacity: 0.35,
      root: first.root,
    })
    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: second.root,
      structuralToken: 1,
    })

    owners.floorPresentation.pruneLevels(new Map())
    expect(first.root.visible).toBe(false)
    expect(second.root.visible).toBe(true)
    expect(owners.materialPresentation.activeBindingCount).toBe(0)

    owners.floorPresentation.disposeExactAll()
    expect(first.root.visible).toBe(true)
    expect(second.root.visible).toBe(true)
    owners.materialPresentation.dispose()
  })

  test('preserves authored visibility and opacity through A to B to A reuse', () => {
    const levelId = asLevelId('level-provenance-reuse')
    const scene = new Scene()
    const first = createRoot()
    const second = createRoot()
    first.root.visible = false
    first.root.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = 0.42
    scene.add(first.root, second.root)
    const owners = createOwners()

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      forceVisible: true,
      levelId,
      root: first.root,
    })
    prepareUntilReady(owners.floorPresentation, levelId)
    owners.floorPresentation.applyLevelOpacity({
      levelId,
      opacity: 0.35,
      root: first.root,
    })

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: second.root,
      structuralToken: 1,
    })
    prepareUntilReady(owners.floorPresentation, levelId)
    ensureLevel({
      floorPresentation: owners.floorPresentation,
      forceVisible: true,
      levelId,
      root: first.root,
      structuralToken: 2,
    })
    prepareUntilReady(owners.floorPresentation, levelId)

    owners.floorPresentation.restoreCanonicalLevels()
    expect(first.root.visible).toBe(false)
    expect(first.root.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBe(0.42)
    expect(second.root.visible).toBe(false)

    owners.floorPresentation.disposeExactAll()
    expect(second.root.visible).toBe(true)
    owners.materialPresentation.dispose()
  })

  test('exact-all restores a still-attached fallback after its replacement was promoted', () => {
    const levelId = asLevelId('level-promoted-exact-all')
    const scene = new Scene()
    const first = createRoot()
    const second = createRoot()
    first.root.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = 0.42
    scene.add(first.root, second.root)
    const owners = createOwners()

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: first.root,
    })
    prepareUntilReady(owners.floorPresentation, levelId)
    owners.floorPresentation.applyLevelOpacity({
      levelId,
      opacity: 0.35,
      root: first.root,
    })
    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: second.root,
      structuralToken: 1,
    })
    prepareUntilReady(owners.floorPresentation, levelId)

    expect(first.root.visible).toBe(false)
    expect(second.root.visible).toBe(true)
    expect(owners.floorPresentation.retainedLeaseCount).toBe(2)

    owners.floorPresentation.disposeExactAll()
    expect(first.root.visible).toBe(true)
    expect(first.root.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]).toBe(0.42)
    expect(second.root.visible).toBe(true)
    expect(owners.floorPresentation.retainedLeaseCount).toBe(0)
    owners.materialPresentation.dispose()
  })

  test('reclaims a suppressed root lease after its subtree detaches from the scene', () => {
    const levelId = asLevelId('level-detached-suppressed')
    const scene = new Scene()
    const first = createRoot()
    const second = createRoot()
    scene.add(first.root, second.root)
    const owners = createOwners()

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: first.root,
    })
    prepareUntilReady(owners.floorPresentation, levelId)
    owners.floorPresentation.applyLevelOpacity({
      levelId,
      opacity: 0.35,
      root: first.root,
    })
    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: second.root,
      structuralToken: 1,
    })
    prepareUntilReady(owners.floorPresentation, levelId)
    expect(owners.floorPresentation.retainedLeaseCount).toBe(2)

    scene.remove(first.root)
    owners.floorPresentation.prepareFrame(1 / 60)
    expect(first.root.visible).toBe(true)
    expect(owners.floorPresentation.retainedLeaseCount).toBe(1)

    disposeOwners(owners)
  })

  test('exact-all teardown restores both active canonical and fallback roots', () => {
    const levelId = asLevelId('level-exact-all')
    const scene = new Scene()
    const first = createRoot()
    const second = createRoot(12)
    scene.add(first.root, second.root)
    const owners = createOwners()

    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: first.root,
    })
    prepareUntilReady(owners.floorPresentation, levelId)
    owners.floorPresentation.applyLevelOpacity({
      levelId,
      opacity: 0.35,
      root: first.root,
    })
    ensureLevel({
      floorPresentation: owners.floorPresentation,
      levelId,
      root: second.root,
      structuralToken: 1,
    })
    expect(first.root.visible).toBe(true)
    expect(second.root.visible).toBe(false)

    owners.floorPresentation.disposeExactAll()
    expect(first.root.visible).toBe(true)
    expect(second.root.visible).toBe(true)
    expect(owners.floorPresentation.retainedLeaseCount).toBe(0)
    owners.materialPresentation.dispose()
  })

  test('treats epsilon endpoints as exact hidden and opaque states', () => {
    const levelId = asLevelId('level-epsilon')
    const scene = new Scene()
    const { root } = createRoot()
    scene.add(root)
    const owners = createOwners()

    ensureLevel({ floorPresentation: owners.floorPresentation, levelId, root })
    prepareUntilReady(owners.floorPresentation, levelId)

    const hidden = owners.floorPresentation.applyLevelOpacity({
      levelId,
      opacity: LANDRUSH_ISLAND_FLOOR_FADE_EPSILON,
      root,
    })
    expect(hidden.appliedOpacity).toBe(0)
    expect(root.visible).toBe(false)

    const opaque = owners.floorPresentation.applyLevelOpacity({
      levelId,
      opacity: 1 - LANDRUSH_ISLAND_FLOOR_FADE_EPSILON,
      root,
    })
    expect(opaque.appliedOpacity).toBe(1)
    expect(root.visible).toBe(true)

    disposeOwners(owners)
  })
})
