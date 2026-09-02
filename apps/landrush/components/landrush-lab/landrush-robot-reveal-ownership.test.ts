import { readFileSync } from 'node:fs'
import { Box3, Matrix4, Object3D, PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, test } from 'vitest'
import {
  classifyLandrushRobotRevealOwnerBounds,
  createLandrushRobotRevealAperture,
  isLandrushRobotRevealOwnerRootLive,
  landrushRobotRevealApertureIntersectsBox,
  reconcileLandrushRobotRevealOwnerStates,
  shouldUpdateLandrushRobotRevealClippingPlanes,
  updateLandrushRobotRevealAperture,
} from './landrush-robot-reveal-ownership'

function observation(ownerId: string, enterIntersects: boolean, exitIntersects: boolean) {
  return { enterIntersects, exitIntersects, ownerId }
}

function createReconcileWorkspace() {
  return {
    observationByOwnerId: new Map<string, ReturnType<typeof observation>>(),
    target: new Set<string>(),
  }
}

describe('Landrush robot reveal semantic ownership', () => {
  test('wires reveal material topology to camera ownership and FPV state', () => {
    const source = readFileSync(new URL('./landrush-island-client.tsx', import.meta.url), 'utf8')

    expect(source).toMatch(
      /visible=\{\s*robotScreenRevealEnabled\s*&&\s*isLandrushIslandRobotScreenRevealCameraOwner\(cameraOwner\)\s*&&\s*!fpvActive\s*\}/,
    )
    expect(source).not.toMatch(/robotScreenRevealEnabled\s*&&\s*!zombieEscapeEnabled/)
  })

  test('requires the current semantic root identity while retaining attached visual roots', () => {
    const scene = new Object3D()
    const staleSemanticRoot = new Object3D()
    const currentSemanticRoot = new Object3D()
    const visualRoot = new Object3D()
    scene.add(staleSemanticRoot, visualRoot)

    const resolveSemanticRoot = (nodeId: string) =>
      nodeId === 'wall-1' ? currentSemanticRoot : undefined
    expect(
      isLandrushRobotRevealOwnerRootLive({
        ownerId: 'node:wall-1',
        ownerRoot: staleSemanticRoot,
        resolveSemanticRoot,
        scene,
      }),
    ).toBe(false)
    expect(
      isLandrushRobotRevealOwnerRootLive({
        ownerId: 'node:wall-1',
        ownerRoot: currentSemanticRoot,
        resolveSemanticRoot,
        scene,
      }),
    ).toBe(true)
    expect(
      isLandrushRobotRevealOwnerRootLive({
        ownerId: 'visual:roof',
        ownerRoot: visualRoot,
        resolveSemanticRoot,
        scene,
      }),
    ).toBe(true)
    visualRoot.removeFromParent()
    expect(
      isLandrushRobotRevealOwnerRootLive({
        ownerId: 'visual:roof',
        ownerRoot: visualRoot,
        resolveSemanticRoot,
        scene,
      }),
    ).toBe(false)
  })

  test('reuses caller-owned output while retaining one owner across short misses', () => {
    const states = new Map()
    const liveOwnerIds = new Set(['node:wall-1'])
    const workspace = createReconcileWorkspace()
    const firstResult = reconcileLandrushRobotRevealOwnerStates({
      ...workspace,
      exitGraceMs: 140,
      liveOwnerIds,
      nowMs: 0,
      observationGeneration: 1,
      observations: [observation('node:wall-1', true, true)],
      states,
    })
    expect(firstResult).toBe(workspace.target)
    expect(firstResult).toEqual(new Set(['node:wall-1']))

    const secondResult = reconcileLandrushRobotRevealOwnerStates({
      ...workspace,
      exitGraceMs: 140,
      liveOwnerIds,
      nowMs: 100,
      observationGeneration: 2,
      observations: [observation('node:wall-1', false, false)],
      states,
    })
    expect(secondResult).toBe(firstResult)
    expect(secondResult).toEqual(new Set(['node:wall-1']))
    expect(
      reconcileLandrushRobotRevealOwnerStates({
        ...workspace,
        exitGraceMs: 140,
        liveOwnerIds,
        nowMs: 180,
        observationGeneration: 3,
        observations: [observation('node:wall-1', false, true)],
        states,
      }),
    ).toEqual(new Set(['node:wall-1']))
  })

  test('uses the wider exit result before grace and releases after monotonic grace', () => {
    const states = new Map()
    const liveOwnerIds = new Set(['node:wall-1'])
    const workspace = createReconcileWorkspace()
    reconcileLandrushRobotRevealOwnerStates({
      ...workspace,
      exitGraceMs: 120,
      liveOwnerIds,
      nowMs: 10,
      observationGeneration: 1,
      observations: [observation('node:wall-1', true, true)],
      states,
    })
    expect(
      reconcileLandrushRobotRevealOwnerStates({
        ...workspace,
        exitGraceMs: 120,
        liveOwnerIds,
        nowMs: 30,
        observationGeneration: 2,
        observations: [observation('node:wall-1', false, true)],
        states,
      }),
    ).toEqual(new Set(['node:wall-1']))
    reconcileLandrushRobotRevealOwnerStates({
      ...workspace,
      exitGraceMs: 120,
      liveOwnerIds,
      nowMs: 50,
      observationGeneration: 3,
      observations: [observation('node:wall-1', false, false)],
      states,
    })
    expect(
      reconcileLandrushRobotRevealOwnerStates({
        ...workspace,
        exitGraceMs: 120,
        liveOwnerIds,
        nowMs: 40,
        observationGeneration: 4,
        observations: [observation('node:wall-1', false, false)],
        states,
      }),
    ).toEqual(new Set(['node:wall-1']))
    expect(
      reconcileLandrushRobotRevealOwnerStates({
        ...workspace,
        exitGraceMs: 120,
        liveOwnerIds,
        nowMs: 170,
        observationGeneration: 5,
        observations: [observation('node:wall-1', false, false)],
        states,
      }),
    ).toEqual(new Set())
  })

  test('does not age an exit miss again while reusing the same observation generation', () => {
    const states = new Map()
    const liveOwnerIds = new Set(['node:wall-1'])
    const workspace = createReconcileWorkspace()
    reconcileLandrushRobotRevealOwnerStates({
      ...workspace,
      exitGraceMs: 120,
      liveOwnerIds,
      nowMs: 0,
      observationGeneration: 1,
      observations: [observation('node:wall-1', true, true)],
      states,
    })
    reconcileLandrushRobotRevealOwnerStates({
      ...workspace,
      exitGraceMs: 120,
      liveOwnerIds,
      nowMs: 50,
      observationGeneration: 2,
      observations: [observation('node:wall-1', false, false)],
      states,
    })

    expect(
      reconcileLandrushRobotRevealOwnerStates({
        ...workspace,
        exitGraceMs: 120,
        liveOwnerIds,
        nowMs: 500,
        observationGeneration: 2,
        observations: [observation('node:wall-1', false, false)],
        states,
      }),
    ).toEqual(new Set(['node:wall-1']))
    expect(states.get('node:wall-1')?.lastEvaluatedAtMs).toBe(50)
  })

  test('gives a missing live owner fresh-observation grace and prunes a dead owner immediately', () => {
    const states = new Map()
    const bothLive = new Set(['node:wall-a', 'node:wall-b'])
    const workspace = createReconcileWorkspace()
    reconcileLandrushRobotRevealOwnerStates({
      ...workspace,
      exitGraceMs: 120,
      liveOwnerIds: bothLive,
      nowMs: 0,
      observationGeneration: 1,
      observations: [
        observation('node:wall-a', true, true),
        observation('node:wall-b', true, true),
      ],
      states,
    })
    expect(
      reconcileLandrushRobotRevealOwnerStates({
        ...workspace,
        exitGraceMs: 120,
        liveOwnerIds: bothLive,
        nowMs: 16,
        observationGeneration: 2,
        observations: [observation('node:wall-b', false, true)],
        states,
      }),
    ).toEqual(new Set(['node:wall-a', 'node:wall-b']))
    expect(
      reconcileLandrushRobotRevealOwnerStates({
        ...workspace,
        exitGraceMs: 120,
        liveOwnerIds: bothLive,
        nowMs: 136,
        observationGeneration: 3,
        observations: [observation('node:wall-b', false, true)],
        states,
      }),
    ).toEqual(new Set(['node:wall-b']))

    expect(
      reconcileLandrushRobotRevealOwnerStates({
        ...workspace,
        exitGraceMs: 120,
        liveOwnerIds: new Set<string>(),
        nowMs: 137,
        observationGeneration: 3,
        observations: [],
        states,
      }),
    ).toEqual(new Set())
  })
})

describe('Landrush robot reveal aperture', () => {
  test('invalidates clipping when the camera changes behind stable screen-mask scalars', () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)
    const lastProjectionMatrix = camera.projectionMatrix.clone()
    const lastWorldMatrix = camera.matrixWorld.clone()
    const unchanged = () =>
      shouldUpdateLandrushRobotRevealClippingPlanes({
        camera,
        lastCamera: camera,
        lastProjectionMatrix,
        lastWorldMatrix,
        maskChanged: false,
      })

    expect(unchanged()).toBe(false)
    camera.position.x = 2
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    expect(unchanged()).toBe(true)
    lastWorldMatrix.copy(camera.matrixWorld)
    expect(unchanged()).toBe(false)

    camera.fov = 62
    camera.updateProjectionMatrix()
    expect(unchanged()).toBe(true)
    lastProjectionMatrix.copy(camera.projectionMatrix)
    expect(unchanged()).toBe(false)
    expect(
      shouldUpdateLandrushRobotRevealClippingPlanes({
        camera,
        lastCamera: new PerspectiveCamera(),
        lastProjectionMatrix: new Matrix4(),
        lastWorldMatrix: new Matrix4(),
        maskChanged: false,
      }),
    ).toBe(true)
  })

  test('reclassifies cached bounds from the latest aperture without reallocating observations', () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)
    const enterAperture = createLandrushRobotRevealAperture(16)
    const exitAperture = createLandrushRobotRevealAperture(16)
    const boundsByOwnerId = new Map([
      [
        'node:wall-1',
        {
          bounds: new Box3(new Vector3(-0.5, -0.5, 4), new Vector3(0.5, 0.5, 5)),
        },
      ],
    ])
    const target = []
    const updateApertures = (centerX: number) => {
      updateLandrushRobotRevealAperture({
        aperture: enterAperture,
        camera,
        centerX,
        centerY: 200,
        farDepth: 9.8,
        height: 400,
        ndcZ: new Vector3(0, 0, 0).project(camera).z,
        radiusPx: 60,
        width: 400,
      })
      updateLandrushRobotRevealAperture({
        aperture: exitAperture,
        camera,
        centerX,
        centerY: 200,
        farDepth: 9.8,
        height: 400,
        ndcZ: new Vector3(0, 0, 0).project(camera).z,
        radiusPx: 72,
        width: 400,
      })
    }

    updateApertures(200)
    classifyLandrushRobotRevealOwnerBounds({
      boundsByOwnerId,
      enterAperture,
      exitAperture,
      target,
    })
    const firstObservation = target[0]
    expect(firstObservation).toEqual(observation('node:wall-1', true, true))

    updateApertures(360)
    classifyLandrushRobotRevealOwnerBounds({
      boundsByOwnerId,
      enterAperture,
      exitAperture,
      target,
    })
    expect(target[0]).toBe(firstObservation)
    expect(target[0]).toEqual(observation('node:wall-1', false, false))
  })

  test('covers the reveal cone, rejects lateral boxes, and stops behind the player depth', () => {
    const camera = new PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)
    const aperture = createLandrushRobotRevealAperture(16)
    updateLandrushRobotRevealAperture({
      aperture,
      camera,
      centerX: 200,
      centerY: 200,
      farDepth: 9.8,
      height: 400,
      ndcZ: new Vector3(0, 0, 0).project(camera).z,
      radiusPx: 60,
      width: 400,
    })

    expect(
      landrushRobotRevealApertureIntersectsBox(
        aperture,
        new Box3(new Vector3(-0.5, -0.5, 4), new Vector3(0.5, 0.5, 5)),
      ),
    ).toBe(true)
    expect(
      landrushRobotRevealApertureIntersectsBox(
        aperture,
        new Box3(new Vector3(5, -0.5, 4), new Vector3(6, 0.5, 5)),
      ),
    ).toBe(false)
    expect(
      landrushRobotRevealApertureIntersectsBox(
        aperture,
        new Box3(new Vector3(-0.5, -0.5, -1), new Vector3(0.5, 0.5, -0.2)),
      ),
    ).toBe(false)
  })
})
