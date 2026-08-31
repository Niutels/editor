import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  BufferGeometry,
  Float32BufferAttribute,
  Frustum,
  InstancedBufferAttribute,
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  Vector3,
} from 'three'
import {
  advanceStylizedGrassPreparedDrawMembership,
  createInitialStylizedGrassCellCoverage,
  createInitialStylizedGrassExactDrawMembership,
  createInitialStylizedGrassPreparedDrawMembershipProgress,
  createStylizedGrassArrivalState,
  createStylizedGrassDenseDrawState,
  createStylizedGrassExactDrawCellKeys,
  createStylizedGrassPreparedResidencyContainmentScratch,
  createStylizedGrassPreparedResidencyFallbackGate,
  createStylizedGrassResidentCells,
  createStylizedGrassStreamGrid,
  isStylizedGrassPreparedResidencyExtentContained,
  markStylizedGrassDrawArrivals,
  markStylizedGrassInstanceSlotSpanUpdated,
  markStylizedGrassInstanceSlotsUpdated,
  packStylizedGrassScaleHeight,
  reconcileStylizedGrassArrivalState,
  reconcileStylizedGrassCellCoverage,
  reconcileStylizedGrassDenseDrawCellDelta,
  reconcileStylizedGrassDenseDrawInstances,
  reconcileStylizedGrassExactDrawMembership,
  reconcileStylizedGrassPinnedDrawCellKeys,
  reconcileStylizedGrassPreparedDrawMembershipTarget,
  resolveStylizedGrassArrivalFade,
  resolveStylizedGrassDrawEnvelope,
  resolveStylizedGrassDrawMembershipApplyDecision,
  resolveStylizedGrassFadeUploadSlots,
  resolveStylizedGrassPreparedDrawMembershipActive,
  resolveStylizedGrassPreparedDrawMembershipReadiness,
  resolveStylizedGrassPreparedResidencyCameraPolicy,
  resolveStylizedGrassPreparedResidencyReadiness,
  resolveStylizedGrassResidentUpdateDue,
  resolveStylizedGrassStructuralUploadSlots,
  STYLIZED_SCENE_PREPARED_DRAW_CELL_BUDGET_PER_FRAME,
  type StylizedGrassDrawEnvelope,
  type StylizedGrassInstance,
  type StylizedGrassStreamCell,
  selectStylizedGrassDrawInstances,
  shouldForceStylizedGrassPreparedResidencyFallback,
  shouldReconcileStylizedGrassExactDrawMembership,
  shouldSettleStylizedGrassPreparedResidencyBaselines,
  stylizedGrassPreparedResidencyContainsCamera,
  stylizedGrassStreamCellIntersectsFrustum,
  withStylizedGrassInstanceAttributes,
} from './stylized-scene-land-layers'
import {
  resolveZombieEscapeGameplayCameraGroundFootprintRadiusMeters,
  ZOMBIE_ESCAPE_GAMEPLAY_CAMERA_ENVELOPE,
  ZOMBIE_ESCAPE_REPLACEMENT_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from './zombie-escape-config'

const DRAW_ENVELOPE: StylizedGrassDrawEnvelope = {
  horizontalMargin: 0.25,
  maxHeight: 4,
  minHeight: -0.1,
}

function createInstance(id: string, seed = 1000): StylizedGrassInstance {
  return {
    heightFactor: 1,
    id,
    macroVariation: 0.5,
    patchVariation: 0.5,
    scaleFactor: 1,
    seed,
    x: 0,
    yaw: 0,
    z: 0,
  }
}

function createCell(cellX: number, cellZ: number, index = 0): StylizedGrassStreamCell {
  return { cellX, cellZ, index, key: `${cellX}:${cellZ}` }
}

function createCameraFrustum(
  position: [number, number, number],
  target: [number, number, number],
  fov = 24,
) {
  const camera = new PerspectiveCamera(fov, 1, 0.1, 40)
  camera.position.set(...position)
  camera.lookAt(...target)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  return new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    camera.coordinateSystem,
  )
}

function createZombieGameplayCamera(aspectRatio: number, halfHeightScale = 1) {
  const config = ZOMBIE_ESCAPE_GAMEPLAY_CAMERA_ENVELOPE
  const aspect = Math.max(0.1, aspectRatio)
  const horizontalHalfWidth =
    config.halfHeightMeters * Math.min(aspect, config.maximumAspectRatio) * halfHeightScale
  const verticalHalfHeight = horizontalHalfWidth / aspect
  const camera = new OrthographicCamera(
    -horizontalHalfWidth,
    horizontalHalfWidth,
    verticalHalfHeight,
    -verticalHalfHeight,
    config.nearMeters,
    config.farMeters,
  )
  const horizontalDistance = Math.cos(config.elevationRadians) * config.distanceMeters
  const target = new Vector3(0, config.targetHeightMeters, 0)
  camera.position.set(
    Math.sin(config.azimuthRadians) * horizontalDistance,
    target.y + Math.sin(config.elevationRadians) * config.distanceMeters,
    Math.cos(config.azimuthRadians) * horizontalDistance,
  )
  camera.lookAt(target)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  return camera
}

function createBoxFrustum({
  maxX,
  maxY = 10,
  maxZ = 10,
  minX,
  minY = -10,
  minZ = -10,
}: {
  maxX: number
  maxY?: number
  maxZ?: number
  minX: number
  minY?: number
  minZ?: number
}) {
  return new Frustum(
    new Plane(new Vector3(1, 0, 0), -minX),
    new Plane(new Vector3(-1, 0, 0), maxX),
    new Plane(new Vector3(0, 1, 0), -minY),
    new Plane(new Vector3(0, -1, 0), maxY),
    new Plane(new Vector3(0, 0, 1), -minZ),
    new Plane(new Vector3(0, 0, -1), maxZ),
  )
}

function reconcileMembership(
  membership: ReturnType<typeof createInitialStylizedGrassExactDrawMembership>,
  cells: readonly StylizedGrassStreamCell[],
  frustum: Frustum,
  changedAtMs: number,
) {
  return reconcileStylizedGrassExactDrawMembership({
    cells,
    changedAtMs,
    drawEnvelope: DRAW_ENVELOPE,
    elevation: 0,
    frustum,
    membership,
  })
}

function instancesByCell(instances: readonly StylizedGrassInstance[]) {
  return new Map(
    instances.map((instance) => [instance.id.slice(0, instance.id.lastIndexOf(':')), [instance]]),
  )
}

function preparedCameraPolicy(
  overrides: Partial<{
    cameraContained: boolean
    committedContentGeneration: number
    committedContentRevision: number
    currentContentGeneration: number
    currentContentRevision: number
    currentCoverageRevision: number
    preparedCoverageRevision: number
    preparedGeneration: string | null
    ready: boolean
    requestGeneration: string
    transitionActive: boolean
  }> = {},
) {
  const state = {
    cameraContained: true,
    committedContentGeneration: 3,
    committedContentRevision: 7,
    currentContentGeneration: 3,
    currentContentRevision: 7,
    currentCoverageRevision: 5,
    preparedCoverageRevision: 5,
    preparedGeneration: 'prepared:1' as string | null,
    ready: true,
    requestGeneration: 'prepared:1',
    transitionActive: true,
    ...overrides,
  }
  return resolveStylizedGrassPreparedResidencyCameraPolicy(
    state.transitionActive,
    state.ready,
    state.cameraContained,
    state.preparedGeneration,
    state.requestGeneration,
    state.preparedCoverageRevision,
    state.currentCoverageRevision,
    state.committedContentGeneration,
    state.currentContentGeneration,
    state.committedContentRevision,
    state.currentContentRevision,
  )
}

describe('stylized grass prepared transition residency', () => {
  test('uses the conservative gameplay footprint plus collision and authored safety', () => {
    const camera = ZOMBIE_ESCAPE_GAMEPLAY_CAMERA_ENVELOPE
    expect(ZOMBIE_ESCAPE_REPLACEMENT_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS).toBeCloseTo(
      resolveZombieEscapeGameplayCameraGroundFootprintRadiusMeters(camera.maximumAspectRatio) +
        ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS +
        camera.replacementSpawnMarginMeters,
      10,
    )
  })

  test('contains final portrait, maximum-aspect, and capped-ultrawide camera slabs', () => {
    const scratch = createStylizedGrassPreparedResidencyContainmentScratch()
    for (const aspect of [
      9 / 16,
      ZOMBIE_ESCAPE_GAMEPLAY_CAMERA_ENVELOPE.maximumAspectRatio,
      32 / 9,
    ]) {
      expect(
        stylizedGrassPreparedResidencyContainsCamera(
          createZombieGameplayCamera(aspect),
          0,
          0,
          DRAW_ENVELOPE,
          0,
          ZOMBIE_ESCAPE_REPLACEMENT_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS,
          scratch,
        ),
      ).toBe(true)
    }
    expect(
      stylizedGrassPreparedResidencyContainsCamera(
        createZombieGameplayCamera(16 / 9, 2),
        0,
        0,
        DRAW_ENVELOPE,
        0,
        ZOMBIE_ESCAPE_REPLACEMENT_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS,
        scratch,
      ),
    ).toBe(false)
  })

  test('includes the exact-draw vertical exit guard for a 14-degree source camera', () => {
    const config = ZOMBIE_ESCAPE_GAMEPLAY_CAMERA_ENVELOPE
    const pitch = (14 * Math.PI) / 180
    const target = new Vector3(0, config.targetHeightMeters, 0)
    const horizontalDistance = Math.cos(pitch) * config.distanceMeters
    const halfHeight = 1
    const aspect = 16 / 9
    const camera = new OrthographicCamera(
      -halfHeight * aspect,
      halfHeight * aspect,
      halfHeight,
      -halfHeight,
      config.nearMeters,
      config.farMeters,
    )
    camera.position.set(0, target.y + Math.sin(pitch) * config.distanceMeters, horizontalDistance)
    camera.lookAt(target)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)

    expect(
      stylizedGrassPreparedResidencyContainsCamera(
        camera,
        0,
        0,
        DRAW_ENVELOPE,
        0,
        15,
        createStylizedGrassPreparedResidencyContainmentScratch(),
      ),
    ).toBe(false)
  })

  test('accepts the exact prepared boundary and rejects an epsilon outside', () => {
    const footprint = ZOMBIE_ESCAPE_REPLACEMENT_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS
    const boundaryExtent = footprint + 9 - DRAW_ENVELOPE.horizontalMargin - 3 - Math.SQRT2
    expect(
      isStylizedGrassPreparedResidencyExtentContained(
        boundaryExtent,
        footprint,
        DRAW_ENVELOPE.horizontalMargin,
      ),
    ).toBe(true)
    expect(
      isStylizedGrassPreparedResidencyExtentContained(
        boundaryExtent + 0.000001,
        footprint,
        DRAW_ENVELOPE.horizontalMargin,
      ),
    ).toBe(false)
  })

  test('stages only the prepared circle and keeps exact draw membership independent', () => {
    const grid = createStylizedGrassStreamGrid({ maxX: 40, maxZ: 40, minX: -40, minZ: -40 })
    const awayFrustum = createCameraFrustum([0, 3, 60], [0, 3, 80])
    const scan = createStylizedGrassResidentCells({
      drawEnvelope: DRAW_ENVELOPE,
      elevation: 0,
      frustum: awayFrustum,
      grid,
      interaction: null,
      preparedResidency: {
        centerX: 0,
        centerZ: 0,
        footprintRadiusMeters: ZOMBIE_ESCAPE_REPLACEMENT_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS,
      },
      previousCells: [],
    })
    const residentKeys = new Set(scan.cells.map((cell) => cell.key))
    expect(scan.preparedCells.length).toBeGreaterThan(0)
    expect(scan.preparedCells.length).toBeLessThan(grid.cells.length)
    expect(scan.preparedCells.every((cell) => residentKeys.has(cell.key))).toBe(true)
    expect(
      createStylizedGrassExactDrawCellKeys({
        cells: scan.cells,
        drawEnvelope: DRAW_ENVELOPE,
        elevation: 0,
        frustum: awayFrustum,
      }).size,
    ).toBe(0)
  })

  test('prewarms one prepared draw footprint, freezes it during handoff, and releases at settle', () => {
    const grid = createStylizedGrassStreamGrid({ maxX: 40, maxZ: 40, minX: -40, minZ: -40 })
    const awayFrustum = createCameraFrustum([0, 3, 60], [0, 3, 80])
    const scan = createStylizedGrassResidentCells({
      drawEnvelope: DRAW_ENVELOPE,
      elevation: 0,
      frustum: awayFrustum,
      grid,
      interaction: null,
      preparedResidency: {
        centerX: 0,
        centerZ: 0,
        footprintRadiusMeters: ZOMBIE_ESCAPE_REPLACEMENT_SPAWN_PLAYER_EXCLUSION_RADIUS_METERS,
      },
      previousCells: [],
    })
    const pinnedCellKeys = new Set<string>()
    const membership = createInitialStylizedGrassExactDrawMembership()
    const progress = createInitialStylizedGrassPreparedDrawMembershipProgress()

    expect(
      reconcileStylizedGrassPreparedDrawMembershipTarget(
        progress,
        scan.preparedCells,
        'prepared:1',
      ),
    ).toBe(true)
    let appliedRevision = membership.revision
    let frameCount = 0
    while (
      !resolveStylizedGrassPreparedDrawMembershipReadiness(
        progress,
        appliedRevision,
        membership.revision,
        'prepared:1',
      )
    ) {
      const previousCellIndex = progress.nextCellIndex
      const remainingCellCount = progress.targetCells.length - previousCellIndex
      const stage = advanceStylizedGrassPreparedDrawMembership({
        cellBudget: STYLIZED_SCENE_PREPARED_DRAW_CELL_BUDGET_PER_FRAME,
        changedAtMs: 10 + frameCount,
        membership,
        pinnedCellKeys,
        progress,
      })
      frameCount += 1
      expect(stage.processedCells).toBe(
        Math.min(STYLIZED_SCENE_PREPARED_DRAW_CELL_BUDGET_PER_FRAME, remainingCellCount),
      )
      expect(progress.nextCellIndex - previousCellIndex).toBe(stage.processedCells)
      if (progress.nextCellIndex < progress.targetCells.length) {
        expect(
          resolveStylizedGrassPreparedDrawMembershipReadiness(
            progress,
            appliedRevision,
            membership.revision,
            'prepared:1',
          ),
        ).toBe(false)
      }
      if (stage.membershipChanged) appliedRevision = membership.revision
    }
    expect(frameCount).toBe(
      Math.ceil(progress.targetCells.length / STYLIZED_SCENE_PREPARED_DRAW_CELL_BUDGET_PER_FRAME),
    )
    expect(frameCount).toBeLessThanOrEqual(20)
    expect(membership.exact).toEqual(pinnedCellKeys)
    const preparedRevision = membership.revision

    expect(shouldReconcileStylizedGrassExactDrawMembership(false, true, 'suppress')).toBe(false)
    expect(shouldReconcileStylizedGrassExactDrawMembership(true, true, 'suppress')).toBe(true)
    expect(shouldReconcileStylizedGrassExactDrawMembership(false, true, 'fallback')).toBe(true)
    expect(shouldReconcileStylizedGrassExactDrawMembership(false, true, 'normal')).toBe(true)
    expect(membership.revision).toBe(preparedRevision)

    expect(
      reconcileStylizedGrassPinnedDrawCellKeys(
        pinnedCellKeys,
        scan.preparedCells.map((cell) => ({ ...cell })),
      ),
    ).toBe(false)
    expect(shouldReconcileStylizedGrassExactDrawMembership(false, false, 'normal', true)).toBe(true)
    expect(reconcileStylizedGrassPinnedDrawCellKeys(pinnedCellKeys, [])).toBe(true)
    expect(
      reconcileStylizedGrassExactDrawMembership({
        cells: scan.cells,
        changedAtMs: 20,
        drawEnvelope: DRAW_ENVELOPE,
        elevation: 0,
        frustum: awayFrustum,
        membership,
        pinnedCellKeys,
      }),
    ).toBe(true)
    expect(membership.exact.size).toBe(0)
    expect(membership.revision).toBe(preparedRevision + 1)
  })

  test('keeps partial and unapplied prepared membership non-ready', () => {
    const cells = [createCell(0, 0), createCell(1, 0, 1), createCell(2, 0, 2)]
    const progress = createInitialStylizedGrassPreparedDrawMembershipProgress()
    const membership = createInitialStylizedGrassExactDrawMembership()
    const pinnedCellKeys = new Set<string>()
    reconcileStylizedGrassPreparedDrawMembershipTarget(progress, cells, 'prepared:1')

    const partial = advanceStylizedGrassPreparedDrawMembership({
      cellBudget: 2,
      changedAtMs: 10,
      membership,
      pinnedCellKeys,
      progress,
    })
    expect(partial.processedCells).toBe(2)
    expect(pinnedCellKeys.size).toBe(2)
    expect(
      resolveStylizedGrassPreparedDrawMembershipReadiness(
        progress,
        membership.revision,
        membership.revision,
        'prepared:1',
      ),
    ).toBe(false)

    const appliedBeforeFinalStage = membership.revision
    advanceStylizedGrassPreparedDrawMembership({
      cellBudget: 2,
      changedAtMs: 11,
      membership,
      pinnedCellKeys,
      progress,
    })
    expect(
      resolveStylizedGrassPreparedDrawMembershipReadiness(
        progress,
        appliedBeforeFinalStage,
        membership.revision,
        'prepared:1',
      ),
    ).toBe(false)
    expect(
      resolveStylizedGrassPreparedDrawMembershipReadiness(
        progress,
        membership.revision,
        membership.revision,
        'prepared:1',
      ),
    ).toBe(true)
    expect(resolveStylizedGrassPreparedDrawMembershipActive(true, false, true, false, false)).toBe(
      false,
    )
    expect(resolveStylizedGrassPreparedDrawMembershipActive(true, true, false, false, false)).toBe(
      false,
    )
    expect(resolveStylizedGrassPreparedDrawMembershipActive(true, true, true, false, false)).toBe(
      true,
    )
    expect(resolveStylizedGrassPreparedDrawMembershipActive(false, true, true, true, true)).toBe(
      true,
    )
    expect(resolveStylizedGrassPreparedDrawMembershipActive(false, true, false, true, true)).toBe(
      false,
    )
  })

  test('publishes prepared readiness after applying exact draw membership in the same commit', () => {
    const source = readFileSync(
      new URL('./stylized-scene-land-layers.tsx', import.meta.url),
      'utf8',
    )
    const readinessMarker = source.indexOf('void preparedCoverageVersion')
    const effectStart = source.lastIndexOf('useLayoutEffect(() => {', readinessMarker)
    const effectEnd = source.indexOf('\n  useLayoutEffect(() => {', readinessMarker)
    const readinessEffect = source.slice(effectStart, effectEnd)
    const committedSources = readinessEffect.indexOf(
      'committedResidentDrawSourcesRef.current = residentSources',
    )
    const appliedMembership = readinessEffect.indexOf('applyExactDrawMembership(performance.now())')
    const resolvedReadiness = readinessEffect.indexOf(
      'preparedState.drawMembershipReady = resolveStylizedGrassPreparedDrawMembershipReadiness',
    )

    expect(effectStart).toBeGreaterThan(-1)
    expect(effectEnd).toBeGreaterThan(effectStart)
    expect(committedSources).toBeGreaterThan(-1)
    expect(appliedMembership).toBeGreaterThan(committedSources)
    expect(resolvedReadiness).toBeGreaterThan(appliedMembership)
  })

  test('suppresses only a fully current contained transition and falls back immediately', () => {
    expect(preparedCameraPolicy()).toBe('suppress')
    expect(preparedCameraPolicy({ transitionActive: false })).toBe('normal')
    expect(preparedCameraPolicy({ cameraContained: false })).toBe('fallback')
    expect(preparedCameraPolicy({ ready: false })).toBe('fallback')
    expect(preparedCameraPolicy({ preparedGeneration: 'prepared:stale' })).toBe('fallback')
    expect(preparedCameraPolicy({ preparedCoverageRevision: 4 })).toBe('fallback')
    expect(preparedCameraPolicy({ committedContentGeneration: 2 })).toBe('fallback')
    expect(preparedCameraPolicy({ committedContentRevision: 6 })).toBe('fallback')
  })

  test('suppresses only timed camera work and settles only a valid prepared handoff', () => {
    expect(
      resolveStylizedGrassResidentUpdateDue(true, false, false, false, 'suppress', false, true),
    ).toBe(false)
    expect(
      resolveStylizedGrassResidentUpdateDue(true, true, false, false, 'suppress', false, false),
    ).toBe(true)
    expect(
      resolveStylizedGrassResidentUpdateDue(true, false, true, false, 'suppress', false, false),
    ).toBe(true)
    expect(
      resolveStylizedGrassResidentUpdateDue(true, false, false, true, 'suppress', false, false),
    ).toBe(true)
    expect(
      resolveStylizedGrassResidentUpdateDue(true, false, false, false, 'fallback', true, false),
    ).toBe(true)
    expect(shouldSettleStylizedGrassPreparedResidencyBaselines(false, 'suppress')).toBe(true)
    expect(shouldSettleStylizedGrassPreparedResidencyBaselines(false, 'fallback')).toBe(false)
    expect(shouldSettleStylizedGrassPreparedResidencyBaselines(true, 'suppress')).toBe(false)
  })

  test('forces one outside fallback and rearms for a new invalidity signature', () => {
    const gate = createStylizedGrassPreparedResidencyFallbackGate()
    const force = (
      overrides: Partial<{
        cameraContained: boolean
        currentContentRevision: number
        currentCoverageRevision: number
        transitionActive: boolean
      }> = {},
    ) => {
      const state = {
        cameraContained: false,
        currentContentRevision: 7,
        currentCoverageRevision: 5,
        transitionActive: true,
        ...overrides,
      }
      return shouldForceStylizedGrassPreparedResidencyFallback(
        gate,
        state.transitionActive,
        state.transitionActive ? 'fallback' : 'normal',
        true,
        state.cameraContained,
        'prepared:1',
        'prepared:1',
        5,
        state.currentCoverageRevision,
        3,
        3,
        7,
        state.currentContentRevision,
      )
    }

    expect(force()).toBe(true)
    expect(force()).toBe(false)
    expect(force({ currentCoverageRevision: 6 })).toBe(true)
    expect(force({ currentCoverageRevision: 6 })).toBe(false)
    expect(force({ currentContentRevision: 8, currentCoverageRevision: 6 })).toBe(true)
    expect(force({ currentContentRevision: 8, currentCoverageRevision: 6 })).toBe(false)
    expect(force({ transitionActive: false })).toBe(false)
    expect(force({ currentContentRevision: 8, currentCoverageRevision: 6 })).toBe(true)
  })

  test('requires committed content for every resident cell and accepts empty cells', () => {
    const cells = [createCell(0, 0), createCell(1, 0, 1)]
    const readiness = (
      residentInstancesByCell: ReadonlyMap<string, readonly StylizedGrassInstance[]>,
    ) =>
      resolveStylizedGrassPreparedResidencyReadiness({
        committedContentGeneration: 2,
        committedContentRevision: 4,
        coverageRevision: 3,
        currentContentGeneration: 2,
        currentContentRevision: 4,
        prepared: true,
        preparedCoverageRevision: 3,
        preparedGeneration: 'prepared:1',
        requestGeneration: 'prepared:1',
        residentCells: cells,
        residentInstancesByCell,
      })

    expect(readiness(new Map())).toBe(false)
    expect(readiness(new Map([['0:0', []]]))).toBe(false)
    expect(
      readiness(
        new Map([
          ['0:0', []],
          ['1:0', [createInstance('1:0:0')]],
        ]),
      ),
    ).toBe(true)
    expect(
      resolveStylizedGrassPreparedResidencyReadiness({
        committedContentGeneration: 1,
        committedContentRevision: 4,
        coverageRevision: 3,
        currentContentGeneration: 2,
        currentContentRevision: 4,
        prepared: true,
        preparedCoverageRevision: 3,
        preparedGeneration: 'prepared:1',
        requestGeneration: 'prepared:1',
        residentCells: cells,
        residentInstancesByCell: new Map([
          ['0:0', []],
          ['1:0', []],
        ]),
      }),
    ).toBe(false)
  })

  test('gates only the build-to-night start on matching prepared readiness', () => {
    const source = readFileSync(new URL('./landrush-island-client.tsx', import.meta.url), 'utf8')
    expect(source).toContain(
      "prepareDrawMembership: zombieEscapePhase === 'build' && zombieEscapeBasePhaseReady",
    )
    expect(source).toMatch(
      /zombieEscapePhase !== 'build' \|\|\s+\(zombieEscapeGrassResidencyReadiness\?\.generation === zombieEscapeGrassResidencyGeneration &&\s+zombieEscapeGrassResidencyReadiness\.ready &&\s+zombieEscapeGrassResidencyReadiness\.drawMembershipReady\)/,
    )
    expect(source).toMatch(
      /const zombieEscapeBasePhaseReady = resolveLandrushZombieEscapePhaseReady/,
    )
    expect(source).toMatch(
      /const zombieEscapePhaseReady =\s+zombieEscapeGrassResidencyReadyForNightStart && zombieEscapeBasePhaseReady/,
    )
  })
})

describe('stylized grass residency and exact draw membership', () => {
  test('publishes stable exact membership atomically and keeps no-op deltas intact', () => {
    const cells = [createCell(0, 0), createCell(1, 0, 1)]
    const both = createBoxFrustum({ maxX: 3, minX: -1 })
    const firstOnly = createBoxFrustum({ maxX: -2.5, minX: -10 })
    const neither = createBoxFrustum({ maxX: -3.5, minX: -10 })
    const membership = createInitialStylizedGrassExactDrawMembership()
    const exactIdentity = membership.exact
    const addedIdentity = membership.addedKeys
    const removedIdentity = membership.removedKeys
    let revision = membership.revision
    let expectedPublish: { added: string[]; exact: string[]; removed: string[] } | null = null
    Object.defineProperty(membership, 'revision', {
      configurable: true,
      get: () => revision,
      set: (next: number) => {
        expect(expectedPublish).not.toBeNull()
        expect([...membership.exact]).toEqual(expectedPublish?.exact)
        expect(membership.addedKeys).toEqual(expectedPublish?.added)
        expect(membership.removedKeys).toEqual(expectedPublish?.removed)
        revision = next
      },
    })

    expectedPublish = { added: ['0:0', '1:0'], exact: ['0:0', '1:0'], removed: [] }
    expect(reconcileMembership(membership, cells, both, 10)).toBe(true)
    expect(membership.revision).toBe(1)
    expect(membership.changedAtMs).toBe(10)
    expect(membership.exact).toBe(exactIdentity)
    expect(membership.addedKeys).toBe(addedIdentity)
    expect(membership.removedKeys).toBe(removedIdentity)

    expectedPublish = null
    expect(reconcileMembership(membership, [...cells], both, 20)).toBe(false)
    expect(membership.revision).toBe(1)
    expect(membership.changedAtMs).toBe(10)
    expect(membership.addedKeys).toEqual(['0:0', '1:0'])

    expectedPublish = { added: [], exact: ['0:0'], removed: ['1:0'] }
    expect(reconcileMembership(membership, cells, firstOnly, 30)).toBe(true)
    expectedPublish = { added: [], exact: [], removed: ['0:0'] }
    expect(reconcileMembership(membership, cells, neither, 40)).toBe(true)
    expect(membership.revision).toBe(3)
    expect(membership.exact.size).toBe(0)
    expectedPublish = null
    expect(reconcileMembership(membership, cells, neither, 50)).toBe(false)
    expect(membership.removedKeys).toEqual(['0:0'])

    const coverage = reconcileStylizedGrassCellCoverage(
      createInitialStylizedGrassCellCoverage(),
      cells,
    )
    expect(reconcileStylizedGrassCellCoverage(coverage, [...cells])).toBe(coverage)
    const reducedCoverage = reconcileStylizedGrassCellCoverage(coverage, cells.slice(0, 1))
    expect(reducedCoverage).not.toBe(coverage)
    expect(reducedCoverage.residentRevision).toBe(coverage.residentRevision + 1)
  })

  test('guards entry and retains existing edge cells across camera jitter', () => {
    const cell = createCell(1, 0)
    const membership = createInitialStylizedGrassExactDrawMembership()
    const outsideEnterGuard = createBoxFrustum({ maxX: -0.8, minX: -10 })
    const insideEnterGuard = createBoxFrustum({ maxX: -0.7, minX: -10 })
    const betweenGuards = createBoxFrustum({ maxX: -1.5, minX: -10 })
    const outsideExitGuard = createBoxFrustum({ maxX: -2.3, minX: -10 })

    expect(reconcileMembership(membership, [cell], outsideEnterGuard, 1)).toBe(false)
    expect(reconcileMembership(membership, [cell], insideEnterGuard, 2)).toBe(true)
    expect([...membership.exact]).toEqual([cell.key])
    expect(reconcileMembership(membership, [cell], betweenGuards, 3)).toBe(false)
    expect([...membership.exact]).toEqual([cell.key])
    expect(reconcileMembership(membership, [cell], outsideExitGuard, 4)).toBe(true)
    expect(membership.exact.size).toBe(0)
    expect(reconcileMembership(membership, [cell], betweenGuards, 5)).toBe(false)
    expect(membership.exact.size).toBe(0)
    expect(reconcileMembership(membership, [cell], insideEnterGuard, 6)).toBe(true)
    expect([...membership.exact]).toEqual([cell.key])
  })

  test('reacts to yaw without React residency churn and submits zero looking away', () => {
    const grid = createStylizedGrassStreamGrid({ maxX: 8, maxZ: 8, minX: -8, minZ: -8 })
    const firstFrustum = createCameraFrustum([0, 2, 10], [0, 0, 0])
    const yawedFrustum = createCameraFrustum([0, 2, 10], [6, 0, 0])
    const awayFrustum = createCameraFrustum([0, 2, 30], [0, 2, 40])
    const drawMembership = createInitialStylizedGrassExactDrawMembership()
    const coverage = reconcileStylizedGrassCellCoverage(
      createInitialStylizedGrassCellCoverage(),
      grid.cells,
    )
    expect(reconcileMembership(drawMembership, grid.cells, firstFrustum, 1)).toBe(true)
    const firstKeys = [...drawMembership.exact]
    expect(firstKeys.length).toBeGreaterThan(0)
    expect(reconcileMembership(drawMembership, grid.cells, yawedFrustum, 2)).toBe(true)
    expect([...drawMembership.exact]).not.toEqual(firstKeys)
    expect(reconcileStylizedGrassCellCoverage(coverage, [...grid.cells])).toBe(coverage)

    reconcileMembership(drawMembership, grid.cells, awayFrustum, 3)
    expect(drawMembership.exact.size).toBe(0)
    expect(
      selectStylizedGrassDrawInstances({
        capacity: 100,
        density: 1,
        exactDrawCellKeys: drawMembership.exact,
        residentCells: [createCell(0, 0)],
        residentInstancesByCell: new Map([['0:0', [createInstance('0:0:0')]]]),
      }).instances,
    ).toHaveLength(0)
  })

  test('keeps draw membership and the React resident snapshot stable through fine yaw jitter', () => {
    const grid = createStylizedGrassStreamGrid({ maxX: 25, maxZ: 25, minX: -25, minZ: -25 })
    const drawMembership = createInitialStylizedGrassExactDrawMembership()
    let coverage = reconcileStylizedGrassCellCoverage(
      createInitialStylizedGrassCellCoverage(),
      grid.cells,
    )
    const stableCoverage = coverage
    let drawUpdates = 0
    let removedCells = 0
    let reactUpdates = 0

    reconcileMembership(
      drawMembership,
      grid.cells,
      createCameraFrustum([0, 3, 0], [0, 0, -20], 18),
      0,
    )
    for (let step = 0; step < 120; step += 1) {
      const yaw = (step % 2 === 0 ? -0.25 : 0.25) * (Math.PI / 180)
      const frustum = createCameraFrustum(
        [0, 3, 0],
        [Math.sin(yaw) * 20, 0, -Math.cos(yaw) * 20],
        18,
      )
      const previousRevision = drawMembership.revision
      reconcileMembership(drawMembership, grid.cells, frustum, step)
      const nextCoverage = reconcileStylizedGrassCellCoverage(coverage, [...grid.cells])
      if (nextCoverage !== coverage) reactUpdates += 1
      if (drawMembership.revision !== previousRevision) {
        drawUpdates += 1
        removedCells += drawMembership.removedKeys.length
      }
      coverage = nextCoverage
    }

    expect(drawUpdates).toBeLessThan(10)
    expect(removedCells).toBe(0)
    expect(reactUpdates).toBe(0)
    expect(coverage).toBe(stableCoverage)
  })

  test('keeps interaction-prefetched cells resident without drawing them outside the frustum', () => {
    const grid = createStylizedGrassStreamGrid({ maxX: 25, maxZ: 1, minX: 24, minZ: 0 })
    const frustum = createCameraFrustum([0, 2, 8], [0, 0, 0], 30)
    const residentCells = createStylizedGrassResidentCells({
      drawEnvelope: DRAW_ENVELOPE,
      elevation: 0,
      frustum,
      grid,
      interaction: { radius: 1, speed: 0, x: 24.5, z: 0.5 },
      previousCells: [],
    }).cells
    const drawKeys = createStylizedGrassExactDrawCellKeys({
      cells: residentCells,
      drawEnvelope: DRAW_ENVELOPE,
      elevation: 0,
      frustum,
    })

    expect(residentCells.length).toBeGreaterThan(0)
    expect(drawKeys.size).toBe(0)
    expect([...drawKeys].every((key) => residentCells.some((cell) => cell.key === key))).toBe(true)
  })

  test('reuses the caller-owned resident membership scratch set', () => {
    const grid = createStylizedGrassStreamGrid({ maxX: 2, maxZ: 1, minX: 0, minZ: 0 })
    const previousCells = [createCell(0, 0, 0), createCell(1, 0, 1)]
    const previousCellIndices = new Set([99])
    createStylizedGrassResidentCells({
      drawEnvelope: DRAW_ENVELOPE,
      elevation: 0,
      frustum: createBoxFrustum({ maxX: 4, minX: -2 }),
      grid,
      interaction: null,
      previousCellIndices,
      previousCells,
    })

    expect(previousCellIndices).toEqual(new Set([0, 1]))
  })

  test('prioritizes exact cells before applying the GPU capacity', () => {
    const residentInstances = [
      createInstance('0:0:0'),
      createInstance('0:0:1'),
      createInstance('2:0:0'),
      createInstance('2:0:1'),
      createInstance('2:0:2'),
    ]
    const selected = selectStylizedGrassDrawInstances({
      capacity: 2,
      density: 1,
      exactDrawCellKeys: new Set(['2:0']),
      residentCells: [createCell(0, 0), createCell(2, 0, 1)],
      residentInstancesByCell: new Map([
        ['0:0', residentInstances.slice(0, 2)],
        ['2:0', residentInstances.slice(2)],
      ]),
    })

    expect(selected.instances.map((instance) => instance.id)).toEqual(['2:0:0', '2:0:1'])
    expect(selected.eligibleTotal).toBe(3)
    expect(selected.saturated).toBe(true)
  })

  test('uses canonical resident order independent of Set and Map insertion history', () => {
    const cells = [createCell(0, 0), createCell(1, 0, 1), createCell(2, 0, 2)]
    const a = createInstance('0:0:0')
    const b = createInstance('1:0:0')
    const c = createInstance('2:0:0')
    const scrambledMap = new Map([
      ['2:0', [c]],
      ['1:0', [b]],
      ['0:0', [a]],
    ])
    const selected = selectStylizedGrassDrawInstances({
      capacity: 2,
      density: 1,
      exactDrawCellKeys: new Set(['2:0', '1:0', '0:0']),
      residentCells: cells,
      residentInstancesByCell: scrambledMap,
    })

    expect(selected.instances).toEqual([a, b])
    expect(selected.eligibleTotal).toBe(3)
    expect(selected.saturated).toBe(true)
  })

  test('does no draw work for broad residency commits outside unchanged exact membership', () => {
    const membership = createInitialStylizedGrassExactDrawMembership()
    membership.exact.add('0:0')
    membership.addedKeys.push('0:0')
    membership.revision = 1
    const firstSources = new Map([['0:0', [createInstance('0:0:0')]]])
    const nextSources = new Map(firstSources)
    nextSources.set('9:9', [createInstance('9:9:0')])

    expect(
      resolveStylizedGrassDrawMembershipApplyDecision({
        appliedRevision: 1,
        forceCanonical: false,
        membership,
        residentInstancesByCell: firstSources,
      }),
    ).toBe('none')
    expect(
      resolveStylizedGrassDrawMembershipApplyDecision({
        appliedRevision: 1,
        forceCanonical: false,
        membership,
        residentInstancesByCell: nextSources,
      }),
    ).toBe('none')
  })

  test('waits for added cell materialization while accepting empty and nonempty cells', () => {
    const membership = createInitialStylizedGrassExactDrawMembership()
    membership.exact.add('1:0')
    membership.addedKeys.push('1:0')
    membership.revision = 1

    expect(
      resolveStylizedGrassDrawMembershipApplyDecision({
        appliedRevision: 0,
        forceCanonical: false,
        membership,
        residentInstancesByCell: new Map(),
      }),
    ).toBe('wait')
    expect(
      resolveStylizedGrassDrawMembershipApplyDecision({
        appliedRevision: 0,
        forceCanonical: false,
        membership,
        residentInstancesByCell: new Map([['1:0', []]]),
      }),
    ).toBe('delta')
    expect(
      resolveStylizedGrassDrawMembershipApplyDecision({
        appliedRevision: 0,
        forceCanonical: false,
        membership,
        residentInstancesByCell: new Map([['1:0', [createInstance('1:0:0')]]]),
      }),
    ).toBe('delta')
  })

  test('defers remove plus missing add atomically and catches up once sources commit', () => {
    const previous = createInstance('0:0:0')
    const added = createInstance('1:0:0')
    const state = createStylizedGrassDenseDrawState()
    reconcileStylizedGrassDenseDrawInstances({
      capacity: 4,
      nextInstances: [previous],
      state,
    })
    const membership = createInitialStylizedGrassExactDrawMembership()
    membership.exact.add('1:0')
    membership.addedKeys.push('1:0')
    membership.removedKeys.push('0:0')
    membership.revision = 2
    const pendingSources = new Map([['0:0', [previous]]])

    expect(
      resolveStylizedGrassDrawMembershipApplyDecision({
        appliedRevision: 1,
        forceCanonical: false,
        membership,
        residentInstancesByCell: pendingSources,
      }),
    ).toBe('wait')
    expect(state.instances).toEqual([previous])

    const committedSources = new Map([
      ['0:0', [previous]],
      ['1:0', [added]],
    ])
    expect(
      resolveStylizedGrassDrawMembershipApplyDecision({
        appliedRevision: 1,
        forceCanonical: true,
        membership,
        residentInstancesByCell: committedSources,
      }),
    ).toBe('canonical')
    const selection = selectStylizedGrassDrawInstances({
      capacity: 4,
      density: 1,
      exactDrawCellKeys: membership.exact,
      residentCells: [createCell(0, 0), createCell(1, 0, 1)],
      residentInstancesByCell: committedSources,
    })
    reconcileStylizedGrassDenseDrawInstances({
      capacity: 4,
      eligibleTotal: selection.eligibleTotal,
      nextInstances: selection.instances,
      state,
    })
    expect(state.instances).toEqual([added])
  })

  test('falls back without mutating when a removed cell source is unavailable', () => {
    const previous = createInstance('0:0:0')
    const state = createStylizedGrassDenseDrawState()
    reconcileStylizedGrassDenseDrawInstances({
      capacity: 4,
      nextInstances: [previous],
      state,
    })

    const delta = reconcileStylizedGrassDenseDrawCellDelta({
      addedCellKeys: [],
      capacity: 4,
      density: 1,
      removedCellKeys: ['0:0'],
      residentInstancesByCell: new Map(),
      state,
    })

    expect(delta.requiresFullRebuild).toBe(true)
    expect(delta.changedSlots).toEqual([])
    expect(state.instances).toEqual([previous])
    expect(state.slotById.get(previous.id)).toBe(0)

    reconcileStylizedGrassDenseDrawInstances({
      capacity: 4,
      nextInstances: [],
      state,
    })
    expect(state.instances).toEqual([])
    expect(state.slotById.has(previous.id)).toBe(false)
  })

  test('canonicalizes skipped revisions and explicit structural invalidations', () => {
    const membership = createInitialStylizedGrassExactDrawMembership()
    membership.exact.add('2:0')
    membership.addedKeys.push('2:0')
    membership.revision = 3
    const readySources = new Map([['2:0', [createInstance('2:0:0')]]])

    expect(
      resolveStylizedGrassDrawMembershipApplyDecision({
        appliedRevision: 1,
        forceCanonical: false,
        membership,
        residentInstancesByCell: readySources,
      }),
    ).toBe('canonical')
    expect(
      resolveStylizedGrassDrawMembershipApplyDecision({
        appliedRevision: 3,
        forceCanonical: true,
        membership,
        residentInstancesByCell: readySources,
      }),
    ).toBe('canonical')
    expect(
      resolveStylizedGrassDrawMembershipApplyDecision({
        appliedRevision: 1,
        forceCanonical: false,
        membership,
        residentInstancesByCell: new Map(),
      }),
    ).toBe('wait')
  })
})

describe('stylized grass arrival and compact draw slots', () => {
  test('completes every seeded arrival variation within 153ms', () => {
    const state = createStylizedGrassArrivalState()
    const initialCell = createCell(0, 0)
    const arrivingCell = createCell(1, 0, 1)
    const seededInstances = Array.from({ length: 1_000 }, (_, seed) =>
      createInstance(`${arrivingCell.key}:${seed}`, seed),
    )

    reconcileStylizedGrassArrivalState(state, [initialCell], 0)
    reconcileStylizedGrassArrivalState(state, [initialCell, arrivingCell], 100)

    expect(
      seededInstances.some((instance) => resolveStylizedGrassArrivalFade(instance, state, 252) < 1),
    ).toBe(true)
    expect(
      seededInstances.every(
        (instance) => resolveStylizedGrassArrivalFade(instance, state, 253) === 1,
      ),
    ).toBe(true)
  })

  test('preserves arrival progress through draw exit and restarts only after residency eviction', () => {
    const state = createStylizedGrassArrivalState()
    const initialCell = createCell(0, 0)
    const arrivingCell = createCell(1, 0, 1)
    const arrivingInstance = createInstance('1:0:0', 2500)

    reconcileStylizedGrassArrivalState(state, [], 0)
    expect(state.initialized).toBe(false)
    reconcileStylizedGrassArrivalState(state, [initialCell], 0)
    expect(resolveStylizedGrassArrivalFade(createInstance('0:0:0'), state, 0)).toBe(1)
    reconcileStylizedGrassArrivalState(state, [initialCell, arrivingCell], 100)
    expect(resolveStylizedGrassArrivalFade(arrivingInstance, state, 100)).toBe(0)
    const partialFade = resolveStylizedGrassArrivalFade(arrivingInstance, state, 180)
    expect(partialFade).toBeGreaterThan(0)
    expect(partialFade).toBeLessThan(1)
    expect(resolveStylizedGrassArrivalFade(arrivingInstance, state, 260)).toBeGreaterThan(
      partialFade,
    )
    expect(resolveStylizedGrassArrivalFade(arrivingInstance, state, 1000)).toBe(1)

    reconcileStylizedGrassArrivalState(state, [initialCell], 1100)
    expect(state.startedAtByCell.has(arrivingCell.key)).toBe(false)
    reconcileStylizedGrassArrivalState(state, [initialCell, arrivingCell], 1200)
    expect(resolveStylizedGrassArrivalFade(arrivingInstance, state, 1200)).toBe(0)
  })

  test('fades cells admitted late by exact draw membership without fading the initial field', () => {
    const state = createStylizedGrassArrivalState()
    const initialCell = createCell(0, 0)
    const lateCell = createCell(1, 0, 1)
    const lateInstance = createInstance('1:0:0', 2500)

    markStylizedGrassDrawArrivals(state, [initialCell.key], 0)
    reconcileStylizedGrassArrivalState(state, [initialCell, lateCell], 0)
    expect(resolveStylizedGrassArrivalFade(createInstance('0:0:0'), state, 0)).toBe(1)

    markStylizedGrassDrawArrivals(state, [lateCell.key], 100)
    expect(resolveStylizedGrassArrivalFade(lateInstance, state, 100)).toBe(0)
    expect(resolveStylizedGrassArrivalFade(lateInstance, state, 220)).toBeGreaterThan(0)

    markStylizedGrassDrawArrivals(state, [lateCell.key], 300)
    expect(resolveStylizedGrassArrivalFade(lateInstance, state, 300)).toBe(0)
  })

  test('keeps slots dense and marks moved or replaced data for upload', () => {
    const state = createStylizedGrassDenseDrawState()
    const first = createInstance('0:0:0')
    const removed = createInstance('1:0:0')
    const moved = createInstance('2:0:0')
    const initial = reconcileStylizedGrassDenseDrawInstances({
      capacity: 3,
      nextInstances: [first, removed, moved],
      state,
    })
    expect(initial.changedSlots).toEqual([0, 1, 2])

    const refreshedMoved = { ...moved, x: 9 }
    const compacted = reconcileStylizedGrassDenseDrawInstances({
      capacity: 3,
      nextInstances: [first, refreshedMoved],
      state,
    })
    expect(compacted.instances).toEqual([first, refreshedMoved])
    expect(compacted.changedSlots).toEqual([1])
    expect(state.slotById.get(refreshedMoved.id)).toBe(1)
    expect(state.slotById.has(removed.id)).toBe(false)
    expect(state.slotById.size).toBe(state.instances.length)

    const replacement = createInstance('3:0:0')
    const replaced = reconcileStylizedGrassDenseDrawInstances({
      capacity: 3,
      nextInstances: [first, replacement],
      state,
    })
    expect(replaced.instances).toEqual([first, replacement])
    expect(replaced.changedSlots).toEqual([1])
    expect(state.slotById.size).toBe(2)
  })

  test('preserves retained slots across source reorder and ignores equal payload clones', () => {
    const state = createStylizedGrassDenseDrawState()
    const [a, b, c] = ['a', 'b', 'c'].map((id) => createInstance(`0:0:${id}`))
    reconcileStylizedGrassDenseDrawInstances({
      capacity: 3,
      nextInstances: [a!, b!, c!],
      state,
    })
    const slotsBefore = new Map(state.slotById)

    const reordered = reconcileStylizedGrassDenseDrawInstances({
      capacity: 3,
      nextInstances: [{ ...c! }, { ...a! }, { ...b! }],
      state,
    })

    expect(reordered.changedSlots).toEqual([])
    expect(state.instances).toEqual([a, b, c])
    expect(state.slotById).toEqual(slotsBefore)

    const changed = reconcileStylizedGrassDenseDrawInstances({
      capacity: 3,
      nextInstances: [c!, { ...a!, x: 4 }, b!],
      state,
    })
    expect(changed.changedSlots).toEqual([0])
    expect(state.slotById.get(a!.id)).toBe(0)
    expect(state.instances[0]?.x).toBe(4)
  })

  test('drops superseded compaction uploads outside the new live range', () => {
    const state = createStylizedGrassDenseDrawState()
    const [a, b, c, d] = ['a', 'b', 'c', 'd'].map((id) => createInstance(`0:0:${id}`))
    reconcileStylizedGrassDenseDrawInstances({
      capacity: 4,
      nextInstances: [a!, b!, c!, d!],
      state,
    })

    const compacted = reconcileStylizedGrassDenseDrawInstances({
      capacity: 4,
      nextInstances: [a!, d!],
      state,
    })

    expect(compacted.instances).toEqual([a, d])
    expect(compacted.changedSlots).toEqual([1])
    expect(compacted.changedSlots.every((slot) => slot < compacted.instances.length)).toBe(true)
  })

  test('applies multi-remove swaps and same-frame additions with dense valid uploads', () => {
    const initial = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) =>
      createInstance(`${index}:0:${id}`),
    )
    const map = instancesByCell(initial)
    const state = createStylizedGrassDenseDrawState()
    const streamFades = new Map(initial.map((instance) => [instance.id, 0.5]))
    reconcileStylizedGrassDenseDrawInstances({
      capacity: 8,
      nextInstances: initial,
      state,
    })
    const removed = reconcileStylizedGrassDenseDrawCellDelta({
      addedCellKeys: [],
      capacity: 8,
      density: 1,
      removedCellKeys: ['0:0', '2:0', '4:0'],
      residentInstancesByCell: map,
      state,
      streamFadeById: streamFades,
    })

    expect(removed.requiresFullRebuild).toBe(false)
    expect(removed.removedIds.sort()).toEqual([initial[0]!.id, initial[2]!.id, initial[4]!.id])
    expect(removed.changedSlots).toEqual([0, 2])
    expect(state.instances.map((instance) => instance.id).sort()).toEqual(
      [initial[1]!.id, initial[3]!.id, initial[5]!.id].sort(),
    )
    expect(removed.removedIds.every((id) => !streamFades.has(id))).toBe(true)
    expect(
      state.instances.every((instance, index) => state.slotById.get(instance.id) === index),
    ).toBe(true)

    const nextState = createStylizedGrassDenseDrawState()
    const [a, b, c, d, e, f] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) =>
      createInstance(`${index}:0:${id}`),
    )
    const nextMap = instancesByCell([a!, b!, c!, d!, e!, f!])
    reconcileStylizedGrassDenseDrawInstances({
      capacity: 8,
      nextInstances: [a!, b!, c!, d!],
      state: nextState,
    })
    const replaced = reconcileStylizedGrassDenseDrawCellDelta({
      addedCellKeys: ['4:0', '5:0'],
      capacity: 8,
      density: 1,
      removedCellKeys: ['1:0', '3:0'],
      residentInstancesByCell: nextMap,
      state: nextState,
    })
    expect(replaced.requiresFullRebuild).toBe(false)
    expect(replaced.removedIds.sort()).toEqual([b!.id, d!.id].sort())
    expect(replaced.addedInstances).toEqual([e, f])
    expect(replaced.changedSlots).toEqual([1, 2, 3])
    expect(nextState.instances.map((instance) => instance.id).sort()).toEqual(
      [a!.id, c!.id, e!.id, f!.id].sort(),
    )
    expect(
      nextState.instances.every((instance, index) => nextState.slotById.get(instance.id) === index),
    ).toBe(true)
  })

  test('matches canonical selection through randomized under-cap cell deltas', () => {
    const cells = Array.from({ length: 12 }, (_, index) => createCell(index, 0, index))
    const map = new Map(
      cells.map((cell, index) => [cell.key, [createInstance(`${cell.key}:0`, 500 + index * 37)]]),
    )
    const state = createStylizedGrassDenseDrawState()
    let exact = new Set<string>()
    let randomState = 0x51f15e
    const random = () => {
      randomState = (randomState * 1_664_525 + 1_013_904_223) >>> 0
      return randomState / 0x1_0000_0000
    }

    for (let step = 0; step < 240; step += 1) {
      const nextExact = new Set(cells.filter(() => random() < 0.48).map((cell) => cell.key))
      const added = [...nextExact].filter((key) => !exact.has(key))
      const removed = [...exact].filter((key) => !nextExact.has(key))
      const before = state.instances.slice()
      let update: ReturnType<typeof reconcileStylizedGrassDenseDrawInstances>
      const clonedKey = step % 19 === 0 ? [...nextExact][0] : undefined
      if (clonedKey) {
        const previous = map.get(clonedKey)?.[0]
        if (previous) map.set(clonedKey, [{ ...previous, x: step }])
        const canonical = selectStylizedGrassDrawInstances({
          capacity: 20,
          density: 1,
          exactDrawCellKeys: nextExact,
          residentCells: cells,
          residentInstancesByCell: map,
        })
        update = reconcileStylizedGrassDenseDrawInstances({
          capacity: 20,
          eligibleTotal: canonical.eligibleTotal,
          nextInstances: canonical.instances,
          state,
        })
      } else {
        const delta = reconcileStylizedGrassDenseDrawCellDelta({
          addedCellKeys: added,
          capacity: 20,
          density: 1,
          removedCellKeys: removed,
          residentInstancesByCell: map,
          state,
        })
        expect(delta.requiresFullRebuild).toBe(false)
        update = delta
      }

      const canonical = selectStylizedGrassDrawInstances({
        capacity: 20,
        density: 1,
        exactDrawCellKeys: nextExact,
        residentCells: cells,
        residentInstancesByCell: map,
      })
      const payload = (instances: readonly StylizedGrassInstance[]) =>
        instances
          .map(({ id, seed, x }) => ({ id, seed, x }))
          .sort((first, second) => first.id.localeCompare(second.id))
      expect(payload(state.instances)).toEqual(payload(canonical.instances))
      expect(state.slotById.size).toBe(state.instances.length)
      expect(
        state.instances.every((instance, index) => state.slotById.get(instance.id) === index),
      ).toBe(true)
      expect(update.changedSlots).toEqual([...new Set(update.changedSlots)].sort((a, b) => a - b))
      expect(update.changedSlots.every((slot) => slot < state.instances.length)).toBe(true)
      for (let index = 0; index < state.instances.length; index += 1) {
        if (before[index] !== state.instances[index]) expect(update.changedSlots).toContain(index)
      }
      exact = nextExact
    }
  })

  test('falls back canonically for saturation, backfill, capacity, and density changes', () => {
    const cells = [createCell(0, 0), createCell(1, 0, 1), createCell(2, 0, 2)]
    const [a, b, c] = [
      createInstance('0:0:0', 1000),
      createInstance('1:0:0', 6000),
      createInstance('2:0:0', 9000),
    ]
    const map = instancesByCell([a, b, c])
    const state = createStylizedGrassDenseDrawState()
    const applyCanonical = (exact: ReadonlySet<string>, capacity: number, density = 1) => {
      const selection = selectStylizedGrassDrawInstances({
        capacity,
        density,
        exactDrawCellKeys: exact,
        residentCells: cells,
        residentInstancesByCell: map,
      })
      reconcileStylizedGrassDenseDrawInstances({
        capacity,
        eligibleTotal: selection.eligibleTotal,
        nextInstances: selection.instances,
        state,
      })
      return selection
    }

    applyCanonical(new Set(['0:0', '1:0', '2:0']), 2)
    expect(state.instances).toEqual([a, b])
    expect(state.saturated).toBe(true)
    const backfill = reconcileStylizedGrassDenseDrawCellDelta({
      addedCellKeys: [],
      capacity: 2,
      density: 1,
      removedCellKeys: ['0:0'],
      residentInstancesByCell: map,
      state,
    })
    expect(backfill.requiresFullRebuild).toBe(true)
    applyCanonical(new Set(['1:0', '2:0']), 2)
    expect(state.instances).toEqual([b, c])

    const overflow = reconcileStylizedGrassDenseDrawCellDelta({
      addedCellKeys: ['0:0'],
      capacity: 2,
      density: 1,
      removedCellKeys: [],
      residentInstancesByCell: map,
      state,
    })
    expect(overflow.requiresFullRebuild).toBe(true)
    applyCanonical(new Set(['2:0', '1:0', '0:0']), 2)
    expect(state.instances).toEqual([b, a])
    applyCanonical(new Set(['2:0', '1:0', '0:0']), 3)
    expect(state.instances).toEqual([b, a, c])
    applyCanonical(new Set(['0:0', '1:0', '2:0']), 3, 0.5)
    expect(state.instances).toEqual([a])
    applyCanonical(new Set(['0:0', '1:0', '2:0']), 3, 1)
    expect(state.instances).toEqual([a, b, c])
  })
})

describe('stylized grass fade upload policy and lifecycle', () => {
  test('targets unchanged zones and fully reevaluates active or removed zones', () => {
    expect(
      resolveStylizedGrassFadeUploadSlots({
        changedSlots: [1, 4],
        fadeZonesActive: true,
        fadeZonesChanged: false,
        instanceCount: 6,
      }),
    ).toEqual([1, 4])
    expect(
      resolveStylizedGrassFadeUploadSlots({
        changedSlots: [],
        fadeZonesActive: true,
        fadeZonesChanged: true,
        instanceCount: 6,
      }),
    ).toEqual([0, 1, 2, 3, 4, 5])
    expect(
      resolveStylizedGrassFadeUploadSlots({
        changedSlots: [],
        fadeZonesActive: false,
        fadeZonesChanged: true,
        instanceCount: 6,
      }),
    ).toEqual([0, 1, 2, 3, 4, 5])
    expect(
      resolveStylizedGrassFadeUploadSlots({
        changedSlots: [1],
        fadeZonesActive: false,
        fadeZonesChanged: false,
        instanceCount: 6,
      }),
    ).toEqual([])
  })

  test('uses one structural upload set for every static instance buffer', () => {
    const changedSlots = [1, 4]
    expect(
      resolveStylizedGrassStructuralUploadSlots({
        changedSlots,
        instanceCount: 6,
        resourceReallocated: false,
      }),
    ).toBe(changedSlots)
    expect(
      resolveStylizedGrassStructuralUploadSlots({
        changedSlots,
        instanceCount: 6,
        resourceReallocated: true,
      }),
    ).toEqual([0, 1, 2, 3, 4, 5])
  })

  test('keeps every shader-owned spatial field in one transform attribute', () => {
    const source = new BufferGeometry()
    source.setAttribute('position', new Float32BufferAttribute([0, 0, 0], 3))
    const geometry = withStylizedGrassInstanceAttributes(source, 4)

    expect(geometry.getAttribute('aOrigin')).toBeUndefined()
    expect(geometry.getAttribute('aVariationYaw')).toBeUndefined()
    expect(geometry.getAttribute('aTransform')).toBeInstanceOf(InstancedBufferAttribute)
    expect(geometry.getAttribute('aTransform')?.itemSize).toBe(4)
    expect(geometry.getAttribute('aVariation')?.itemSize).toBe(1)
    geometry.dispose()
    source.dispose()
  })

  test('packs scale and height into the exact float integer range', () => {
    const packed = packStylizedGrassScaleHeight(0.73, 1.37)
    const scaleCode = Math.floor(packed / 4096)
    const heightCode = packed - scaleCode * 4096
    const scale = 0.5 + (scaleCode / 4095) * 0.5
    const height = 0.2 + (heightCode / 4095) * 1.6

    expect(packed).toBeLessThanOrEqual(16_777_215)
    expect(scale).toBeCloseTo(0.73, 3)
    expect(height).toBeCloseTo(1.37, 3)
  })

  test('unions pending dirty ranges across multiple pre-render writers', () => {
    const attribute = new InstancedBufferAttribute(new Float32Array(24), 2)

    markStylizedGrassInstanceSlotsUpdated(attribute, [1])
    markStylizedGrassInstanceSlotsUpdated(attribute, [10])
    markStylizedGrassInstanceSlotsUpdated(attribute, [3])

    expect(attribute.updateRanges).toEqual([
      { start: 2, count: 6 },
      { start: 20, count: 2 },
    ])
  })

  test('reuses one contiguous update range throughout arrival fades', () => {
    const attribute = new InstancedBufferAttribute(new Float32Array(24), 2)
    markStylizedGrassInstanceSlotsUpdated(attribute, [1, 10])

    markStylizedGrassInstanceSlotSpanUpdated(attribute, 3, 7)
    expect(attribute.updateRanges).toEqual([{ start: 2, count: 20 }])
    const range = attribute.updateRanges[0]

    attribute.clearUpdateRanges()
    markStylizedGrassInstanceSlotSpanUpdated(attribute, 4, 6)
    expect(attribute.updateRanges).toEqual([{ start: 8, count: 6 }])
    expect(attribute.updateRanges[0]).toBe(range)
  })

  test('keeps active arrival fades sparse and resolves the runtime probe only once per page', () => {
    const source = readFileSync(
      new URL('./stylized-scene-land-layers.tsx', import.meta.url),
      'utf8',
    )
    const advanceStart = source.indexOf('function advanceStylizedGrassStreamFades(')
    const advanceEnd = source.indexOf(
      '\nfunction reconcileStylizedGrassDrawInstances(',
      advanceStart,
    )
    const advanceSource = source.slice(advanceStart, advanceEnd)
    const probeStart = source.indexOf('function stylizedGrassRuntimeProbeIsEnabled()')
    const probeEnd = source.indexOf('\nfunction takeStylizedGrassCacheStats(', probeStart)
    const probeSource = source.slice(probeStart, probeEnd)

    expect(advanceSource).toContain('state.streamFadeChangedSlots.push(slot)')
    expect(advanceSource).toContain(
      'markStylizedGrassInstanceSlotsUpdated(streamFade, state.streamFadeChangedSlots)',
    )
    expect(advanceSource).not.toContain('markStylizedGrassInstanceSlotSpanUpdated')
    expect(probeSource.match(/window\.location\.search/g)).toHaveLength(1)
  })

  test('retains dense and arrival identities through canonical resource-style rebuilds', () => {
    const drawState = createStylizedGrassDenseDrawState()
    const instancesIdentity = drawState.instances
    const slotsIdentity = drawState.slotById
    const a = createInstance('0:0:0')
    const b = createInstance('1:0:0')
    const initial = reconcileStylizedGrassDenseDrawInstances({
      capacity: 2,
      nextInstances: [a],
      state: drawState,
    })
    expect(initial.changedSlots).toEqual([0])
    const expanded = reconcileStylizedGrassDenseDrawInstances({
      capacity: 4,
      nextInstances: [a, b],
      state: drawState,
    })
    expect(expanded.changedSlots).toEqual([1])
    const unchanged = reconcileStylizedGrassDenseDrawInstances({
      capacity: 4,
      nextInstances: [a, b],
      state: drawState,
    })
    expect(unchanged.addedInstances).toEqual([])
    expect(unchanged.changedSlots).toEqual([])
    expect(unchanged.removedIds).toEqual([])
    expect(drawState.instances).toBe(instancesIdentity)
    expect(drawState.slotById).toBe(slotsIdentity)
    expect(drawState.instances).toEqual([a, b])

    const refreshedB = { ...b, x: 2 }
    const refreshed = reconcileStylizedGrassDenseDrawInstances({
      capacity: 4,
      nextInstances: [a, refreshedB],
      state: drawState,
    })
    expect(refreshed.changedSlots).toEqual([1])
    expect(drawState.instances).toEqual([a, refreshedB])

    const arrival = createStylizedGrassArrivalState()
    const cellA = createCell(0, 0)
    const cellB = createCell(1, 0, 1)
    reconcileStylizedGrassArrivalState(arrival, [cellA], 0)
    reconcileStylizedGrassArrivalState(arrival, [cellA, cellB], 100)
    const beforeHidden = resolveStylizedGrassArrivalFade(refreshedB, arrival, 180)
    expect(resolveStylizedGrassArrivalFade(refreshedB, arrival, 800)).toBeGreaterThan(beforeHidden)
    expect(arrival.startedAtByCell.get(cellB.key)).toBe(100)
  })
})

describe('stylized grass deformation-aware frustum bounds', () => {
  test('keeps positive and negative edge cells at deformation tangency', () => {
    const positiveFrustum = createBoxFrustum({ maxX: 0.75, minX: -10 })
    const negativeFrustum = createBoxFrustum({ maxX: 10, minX: -0.75 })
    const zeroMargin = { ...DRAW_ENVELOPE, horizontalMargin: 0 }
    const positiveCell = createCell(1, 0)
    const negativeCell = createCell(-2, 0)

    expect(
      stylizedGrassStreamCellIntersectsFrustum(positiveCell, positiveFrustum, 0, zeroMargin),
    ).toBe(false)
    expect(
      stylizedGrassStreamCellIntersectsFrustum(positiveCell, positiveFrustum, 0, DRAW_ENVELOPE),
    ).toBe(true)
    expect(
      stylizedGrassStreamCellIntersectsFrustum(negativeCell, negativeFrustum, 0, zeroMargin),
    ).toBe(false)
    expect(
      stylizedGrassStreamCellIntersectsFrustum(negativeCell, negativeFrustum, 0, DRAW_ENVELOPE),
    ).toBe(true)
  })

  test('includes maximum height, root width, wind, and interaction deformation', () => {
    const envelope = resolveStylizedGrassDrawEnvelope({
      bladeHeight: 2,
      flutter: 0.4,
      horizontalRadius: 0.3,
      scale: 1.3,
      turbulence: 0.5,
      windStrength: 0.25,
    })

    expect(envelope.maxHeight).toBeGreaterThan(2 * 1.8)
    expect(envelope.horizontalMargin).toBeGreaterThan(0.3 * 1.8)
    expect(envelope.minHeight).toBeLessThan(0)
  })
})
