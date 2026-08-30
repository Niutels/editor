import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { AnyNode } from '@pascal-app/core'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { LandrushIslandFloorFadePresentationOwner } from './landrush-floor-fade-presentation'
import {
  advanceLandrushIslandFloorPresentationReadiness,
  collectLandrushIslandExpectedFloorPresentationRoots,
  collectLandrushIslandRegisteredFloorPresentationRoots,
  landrushIslandFloorPresentationPoseChanged,
  reconcileLandrushIslandFloorPresentationReadiness,
  resolveLandrushIslandFloorPresentationReady,
} from './landrush-island-floor-presentation-readiness'
import { LandrushIslandMaterialPresentationOwner } from './landrush-island-material-presentation'

describe('Landrush island floor presentation readiness', () => {
  test('keeps settled floor traversal idle until pose or structural inputs change', () => {
    const stacks = []
    const snapshot = { groundY: 0, hasMotion: true, stacks, x: 1, y: 2, z: 3 }

    expect(landrushIslandFloorPresentationPoseChanged(snapshot, stacks, 0, true, 1, 2, 3)).toBe(
      false,
    )
    expect(landrushIslandFloorPresentationPoseChanged(snapshot, stacks, 0, true, 1.01, 2, 3)).toBe(
      true,
    )
    expect(landrushIslandFloorPresentationPoseChanged(snapshot, [], 0, true, 1, 2, 3)).toBe(true)
    expect(landrushIslandFloorPresentationPoseChanged(snapshot, stacks, 0, false, 1, 2, 3)).toBe(
      true,
    )
  })

  test('wires all-scope loading preparation and keeps distance admission after handoff', () => {
    const source = readFileSync(new URL('./landrush-island-client.tsx', import.meta.url), 'utf8')

    expect(source).toContain('startup-readiness:v4')
    expect(source).toContain("id: 'floor-presentation'")
    expect(source).toContain('floorPresentationReady &&')
    expect(source).toContain('dayMaterialPresentationReady &&')
    expect(source).toContain('LANDRUSH_ISLAND_FLOOR_PRESENTATION_MAX_ROOT_ADMISSIONS_PER_FRAME')
    expect(source).toContain('LANDRUSH_ISLAND_FLOOR_PRESENTATION_MAX_MISMATCH_REPAIRS_PER_FRAME')
    expect(source).toContain('readState.assignmentMismatchCount > 0')
    expect(source).toContain('if (preparationScopesChanged)')
    expect(source).toContain('for (const stack of floorStacksCache.stacks)')
    expect(source).toContain('if (floorOpacityPresentationActiveRef.current)')
    expect(source).toContain('isLandrushIslandFloorStackNearPoint(stack, robotPoint)')
    expect(source).toContain('collectLandrushIslandExpectedFloorPresentationRoots')
    expect(source).toContain('collectLandrushIslandRegisteredFloorPresentationRoots')
    expect(source).toContain('registrationComplete')
    expect(
      source.match(
        /for \(let floorIndex = 1; floorIndex < stack\.floors\.length; floorIndex \+= 1\)/g,
      ),
    ).toHaveLength(2)
  })

  test('derives expected roots from explicit render-tree reachability and audited kinds', () => {
    const nodes = {
      building: { children: ['level-live'], parentId: 'site', type: 'building' },
      'cover-live': { children: [], parentId: 'level-live', type: 'ceiling' },
      'cover-semantic': { children: [], parentId: 'level-semantic', type: 'roof' },
      'level-live': {
        children: ['cover-live', 'wall-live'],
        parentId: 'building',
        type: 'level',
      },
      'level-semantic': { children: ['cover-semantic'], parentId: 'building', type: 'level' },
      site: { children: ['building'], parentId: null, type: 'site' },
      'wall-live': { children: [], parentId: 'level-live', type: 'wall' },
    }
    const expectedRoots = collectLandrushIslandExpectedFloorPresentationRoots({
      nodes,
      rootNodeIds: ['site'],
      roots: [
        { levelId: 'level-live', root: null as Group | null },
        { levelId: 'cover-live', root: new Group() as Group | null },
        { levelId: 'wall-live', root: new Group() as Group | null },
        { levelId: 'level-semantic', root: new Group() as Group | null },
        { levelId: 'cover-semantic', root: new Group() as Group | null },
      ],
    })

    expect(expectedRoots.map(({ levelId }) => levelId)).toEqual(['level-live', 'cover-live'])
  })

  test('requires two consecutive complete samples for the same generation', () => {
    const first = advanceLandrushIslandFloorPresentationReadiness({
      admissionComplete: true,
      canonicalReadyRoots: 3,
      generation: 'generation-a',
      hasPendingWork: false,
      previous: { settledGeneration: null },
      registrationComplete: true,
      requestKey: 'request-a',
      total: 3,
    })
    const second = advanceLandrushIslandFloorPresentationReadiness({
      admissionComplete: true,
      canonicalReadyRoots: 3,
      generation: 'generation-a',
      hasPendingWork: false,
      previous: first.state,
      registrationComplete: true,
      requestKey: 'request-a',
      total: 3,
    })

    expect(first.readiness).toEqual({
      completed: 3,
      generation: 'generation-a',
      ready: false,
      requestKey: 'request-a',
      total: 3,
    })
    expect(second.readiness.ready).toBe(true)
  })

  test('blocks a reachable missing root and settles twice after late registration', () => {
    const nodes = {
      'level-late': { children: [], type: 'level' },
      site: { children: ['level-late'], type: 'site' },
    }
    const expectedMissingRoots = collectLandrushIslandExpectedFloorPresentationRoots({
      nodes,
      rootNodeIds: ['site'],
      roots: [{ levelId: 'level-late', root: null as Group | null }],
    })
    const registeredMissingRoots =
      collectLandrushIslandRegisteredFloorPresentationRoots(expectedMissingRoots)
    const firstMissing = advanceLandrushIslandFloorPresentationReadiness({
      admissionComplete: true,
      canonicalReadyRoots: 0,
      generation: 'geometry:1|registry:1|level-late@missing',
      hasPendingWork: false,
      previous: { settledGeneration: null },
      registrationComplete: registeredMissingRoots.length === expectedMissingRoots.length,
      requestKey: 'request-a',
      total: expectedMissingRoots.length,
    })
    const secondMissing = advanceLandrushIslandFloorPresentationReadiness({
      admissionComplete: true,
      canonicalReadyRoots: 0,
      generation: firstMissing.readiness.generation,
      hasPendingWork: false,
      previous: firstMissing.state,
      registrationComplete: registeredMissingRoots.length === expectedMissingRoots.length,
      requestKey: 'request-a',
      total: expectedMissingRoots.length,
    })

    expect(expectedMissingRoots).toHaveLength(1)
    expect(registeredMissingRoots).toHaveLength(0)
    expect(secondMissing.readiness).toMatchObject({ completed: 0, ready: false, total: 1 })
    expect(secondMissing.state.settledGeneration).toBeNull()

    const expectedRegisteredRoots = collectLandrushIslandExpectedFloorPresentationRoots({
      nodes,
      rootNodeIds: ['site'],
      roots: [{ levelId: 'level-late', root: new Group() as Group | null }],
    })
    const registeredRoots =
      collectLandrushIslandRegisteredFloorPresentationRoots(expectedRegisteredRoots)
    const reopened = advanceLandrushIslandFloorPresentationReadiness({
      admissionComplete: true,
      canonicalReadyRoots: 1,
      generation: 'geometry:1|registry:2|level-late@1',
      hasPendingWork: false,
      previous: secondMissing.state,
      registrationComplete: registeredRoots.length === expectedRegisteredRoots.length,
      requestKey: 'request-a',
      total: expectedRegisteredRoots.length,
    })
    const settled = advanceLandrushIslandFloorPresentationReadiness({
      admissionComplete: true,
      canonicalReadyRoots: 1,
      generation: reopened.readiness.generation,
      hasPendingWork: false,
      previous: reopened.state,
      registrationComplete: registeredRoots.length === expectedRegisteredRoots.length,
      requestKey: 'request-a',
      total: expectedRegisteredRoots.length,
    })

    expect(reopened.readiness).toMatchObject({ completed: 1, ready: false, total: 1 })
    expect(settled.readiness).toMatchObject({ completed: 1, ready: true, total: 1 })
  })

  test('repairs one corrupted admitted root without re-ensuring a valid reveal assignment', () => {
    const materialPresentation = new LandrushIslandMaterialPresentationOwner()
    const floorPresentation = new LandrushIslandFloorFadePresentationOwner(materialPresentation)
    const firstSource = new MeshBasicMaterial()
    const secondSource = new MeshBasicMaterial()
    const intruder = new MeshBasicMaterial()
    const geometry = new BoxGeometry()
    const mesh = new Mesh(geometry, [firstSource, secondSource])
    const root = new Group()
    root.add(mesh)
    const levelId = 'upper-floor' as AnyNode['id']
    let ensureCount = 0
    const ensure = () => {
      ensureCount += 1
      floorPresentation.ensureLevel({ levelId, root, structuralToken: 'structure-a' })
    }
    const drain = () => {
      let frames = 0
      while (floorPresentation.hasPendingWork && frames < 100) {
        floorPresentation.prepareFrame(1 / 60)
        frames += 1
      }
      expect(floorPresentation.hasPendingWork).toBe(false)
    }

    ensure()
    drain()
    materialPresentation.syncRevealMeshes([mesh], { kind: 'soft' })
    const validReveal = floorPresentation.readLevel(levelId)
    expect(validReveal?.assignmentMismatchCount).toBe(0)
    if (validReveal && validReveal.assignmentMismatchCount > 0 && ensureCount < 2) ensure()
    expect(ensureCount).toBe(1)

    const corruptedAssignment = mesh.material as MeshBasicMaterial[]
    corruptedAssignment[0] = intruder
    const corrupted = floorPresentation.readLevel(levelId)
    expect(corrupted?.assignmentMismatchCount).toBe(1)
    if (corrupted && corrupted.assignmentMismatchCount > 0 && ensureCount < 2) ensure()
    expect(ensureCount).toBe(2)
    expect(floorPresentation.hasPendingWork).toBe(true)

    drain()
    expect(mesh.material).not.toBe(corruptedAssignment)
    expect(mesh.material as MeshBasicMaterial[]).not.toContain(intruder)
    expect(floorPresentation.readLevel(levelId)).toMatchObject({
      assignmentMismatchCount: 0,
      pending: false,
      quarantineCount: 0,
      ready: true,
    })

    const firstSettledSample = advanceLandrushIslandFloorPresentationReadiness({
      admissionComplete: true,
      canonicalReadyRoots: 1,
      generation: 'generation-a',
      hasPendingWork: false,
      previous: { settledGeneration: null },
      registrationComplete: true,
      requestKey: 'request-a',
      total: 1,
    })
    const secondSettledSample = advanceLandrushIslandFloorPresentationReadiness({
      admissionComplete: true,
      canonicalReadyRoots: 1,
      generation: 'generation-a',
      hasPendingWork: false,
      previous: firstSettledSample.state,
      registrationComplete: true,
      requestKey: 'request-a',
      total: 1,
    })
    expect(firstSettledSample.readiness.ready).toBe(false)
    expect(secondSettledSample.readiness.ready).toBe(true)

    floorPresentation.disposeExactAll()
    materialPresentation.dispose()
    geometry.dispose()
    firstSource.dispose()
    secondSource.dispose()
    intruder.dispose()
  })

  test('withdraws the settled sample for pending, incomplete, unregistered, and changed work', () => {
    const settled = { settledGeneration: 'generation-a' }
    for (const observation of [
      { canonicalReadyRoots: 2, generation: 'generation-a', hasPendingWork: false },
      { canonicalReadyRoots: 3, generation: 'generation-a', hasPendingWork: true },
      {
        canonicalReadyRoots: 3,
        generation: 'generation-a',
        hasPendingWork: false,
        registrationComplete: false,
      },
      { canonicalReadyRoots: 3, generation: 'generation-b', hasPendingWork: false },
    ]) {
      const result = advanceLandrushIslandFloorPresentationReadiness({
        admissionComplete: true,
        previous: settled,
        registrationComplete: true,
        requestKey: 'request-a',
        total: 3,
        ...observation,
      })
      expect(result.readiness.ready).toBe(false)
    }
  })

  test('ignores stale request callbacks and admits only the current ready request', () => {
    const current = {
      completed: 2,
      generation: 'generation-b',
      ready: true,
      requestKey: 'request-b',
      total: 2,
    }
    const stale = {
      completed: 1,
      generation: 'generation-a',
      ready: true,
      requestKey: 'request-a',
      total: 1,
    }

    expect(
      reconcileLandrushIslandFloorPresentationReadiness({
        current,
        currentRequestKey: 'request-b',
        reported: stale,
      }),
    ).toBe(current)
    expect(
      resolveLandrushIslandFloorPresentationReady({
        admitted: true,
        requestKey: 'request-b',
        status: current,
      }),
    ).toBe(true)
  })
})
