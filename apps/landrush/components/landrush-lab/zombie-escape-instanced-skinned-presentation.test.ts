import { describe, expect, spyOn, test } from 'bun:test'
import {
  Bone,
  BufferGeometry,
  DataUtils,
  Float32BufferAttribute,
  Group,
  type InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Texture,
  Uint16BufferAttribute,
  Vector3,
} from 'three'
import { getCurrentStack, setCurrentStack, stack } from 'three/tsl'
import type { MeshStandardNodeMaterial, NodeBuilder } from 'three/webgpu'
import { ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS } from './zombie-escape-attack-presentation'
import { ZOMBIE_ESCAPE_DEATH_ANIMATION_DURATION_SECONDS } from './zombie-escape-character-motion'
import { ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'
import {
  countZombieEscapeAuthoredVariantCapacity,
  createZombieEscapeAuthoredInstancePresentation,
  createZombieEscapeAuthoredInstancePresentationCooperatively,
  encodeZombieEscapeBakedTextureComponent,
  resolveZombieEscapeAuthoredBakedFrame,
  resolveZombieEscapeBakedAnimationSample,
  resolveZombieEscapeBakedTextureLayout,
  ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT,
} from './zombie-escape-instanced-skinned-presentation'
import { ZOMBIE_ESCAPE_ZOMBIE_INTENT } from './zombie-escape-simulation'
import { createZombieEscapeZombieShader } from './zombie-escape-zombie-material'

describe('authored instanced zombie presentation', () => {
  test('counts exact per-variant presentation capacity', () => {
    const variant = new Uint8Array([2, 2, 2, 1, 2, 2])

    expect(countZombieEscapeAuthoredVariantCapacity(variant, 2)).toBe(5)
    expect(countZombieEscapeAuthoredVariantCapacity(variant, 1)).toBe(1)
    expect(countZombieEscapeAuthoredVariantCapacity(variant, 0)).toBe(0)
  })

  test('encodes finite baked positions and normals within half-float error bounds', () => {
    const positionSamples = [-321.125, -1.25, -0.001, 0, 0.001, 1.25, 321.125]
    const normalSamples = [-1, -Math.SQRT1_2, -0.125, 0, 0.125, Math.SQRT1_2, 1]
    for (const value of positionSamples) {
      const decoded = DataUtils.fromHalfFloat(encodeZombieEscapeBakedTextureComponent(value))
      expect(Math.abs(decoded - value)).toBeLessThanOrEqual(
        Math.max(0.000_01, Math.abs(value) * 0.001),
      )
    }
    for (const value of normalSamples) {
      const decoded = DataUtils.fromHalfFloat(encodeZombieEscapeBakedTextureComponent(value))
      expect(Math.abs(decoded - value)).toBeLessThanOrEqual(0.001)
    }
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -65_505, 65_505]) {
      expect(() => encodeZombieEscapeBakedTextureComponent(invalid)).toThrow(
        'outside the finite half-float range',
      )
    }
  })

  test('keeps every adjacent position-normal texel pair on one row across the width edge', () => {
    const cases = [
      {
        expected: { height: 1, width: 2 },
        lastNormal: { column: 1, row: 0 },
        lastPosition: { column: 0, row: 0 },
        vertexCount: 1,
      },
      {
        expected: { height: 1, width: 4096 },
        lastNormal: { column: 4095, row: 0 },
        lastPosition: { column: 4094, row: 0 },
        vertexCount: 2048,
      },
      {
        expected: { height: 2, width: 4096 },
        lastNormal: { column: 1, row: 1 },
        lastPosition: { column: 0, row: 1 },
        vertexCount: 2049,
      },
      {
        expected: { height: 2, width: 4096 },
        lastNormal: { column: 4095, row: 1 },
        lastPosition: { column: 4094, row: 1 },
        vertexCount: 4096,
      },
      {
        expected: { height: 3, width: 4096 },
        lastNormal: { column: 1, row: 2 },
        lastPosition: { column: 0, row: 2 },
        vertexCount: 4097,
      },
    ]

    for (const { expected, lastNormal, lastPosition, vertexCount } of cases) {
      const layout = resolveZombieEscapeBakedTextureLayout(vertexCount)
      expect(layout).toEqual(expected)
      expect(layout.width % 2).toBe(0)
      let everyPairSharesOneRow = true
      for (let vertex = 0; vertex < vertexCount; vertex += 1) {
        const positionTexel = vertex * 2
        const positionRow = Math.floor(positionTexel / layout.width)
        const positionColumn = positionTexel - positionRow * layout.width
        const normalTexel = positionTexel + 1
        everyPairSharesOneRow &&=
          Math.floor(normalTexel / layout.width) === positionRow &&
          normalTexel - positionRow * layout.width === positionColumn + 1
      }
      const lastPositionTexel = (vertexCount - 1) * 2
      const lastPositionRow = Math.floor(lastPositionTexel / layout.width)
      const lastPositionColumn = lastPositionTexel - lastPositionRow * layout.width
      expect(everyPairSharesOneRow).toBe(true)
      expect({ column: lastPositionColumn, row: lastPositionRow }).toEqual(lastPosition)
      expect({ column: lastPositionColumn + 1, row: lastPositionRow }).toEqual(lastNormal)
    }
  })

  test('bakes authored motion once and exposes a compute-free runtime presentation', () => {
    const source = createSkinnedSource()
    const presentation = createZombieEscapeAuthoredInstancePresentation({
      attackClip: null,
      instanceCapacity: 4,
      modelTransform: { offset: new Vector3(), scale: 1 },
      runClip: null,
      source: source.root,
      variantIndex: 0,
      walkClip: null,
      zombieShader: createZombieEscapeZombieShader({ phaseAmount: 1 }),
    })

    try {
      expect(presentation.getReadinessSnapshot()).toEqual({
        bakedFrameCount: 1 + ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT * 4,
        failed: false,
        meshCount: 1,
        ready: true,
      })
      expect(presentation.getDebugSnapshot()).toEqual({
        activeCount: 0,
        animationMode: 'baked-vertex',
        attackFrameIndex: 0,
        bakedFrameCount: 1 + ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT * 4,
        bakedTextureBytes: 2_352,
        bakedTextureCount: 1,
        bakedTextureFormat: 'rgba16float',
        batchCount: 0,
        computeDispatchCount: 0,
        deathFrameIndex: 0,
        materialMode: 'authored-texture-grade',
        runtimeGeometryUploadCount: 0,
        runtimeMixerCount: 0,
        runFrameIndex: 0,
        spatialBoundsValid: false,
        textureFetchesPerVertex: 2,
        vertexCount: 3,
        walkFrameIndex: 0,
      })
      presentation.update(createAuthoredSelection(4, [0]), {
        attackCooldown: new Float32Array(1),
        deathPresentationSeconds: new Float32Array(1),
        heading: new Float32Array(1),
        hitImpulseX: new Float32Array(1),
        hitImpulseY: new Float32Array(1),
        hitImpulseZ: new Float32Array(1),
        hitReaction: new Float32Array(1),
        health: new Float32Array([1]),
        intent: new Uint8Array(1),
        locomotionBlend: new Float32Array([1]),
        locomotionPhase: new Float32Array([Math.PI]),
        pool: { active: new Uint8Array([1]) },
        runBlend: new Float32Array([1]),
        spawnOrdinal: new Uint32Array(1),
        variant: new Uint8Array(1),
        x: new Float32Array([3]),
        y: new Float32Array(1),
        z: new Float32Array([-2]),
      })

      expect(presentation.getDebugSnapshot()).toMatchObject({
        activeCount: 1,
        batchCount: 1,
        computeDispatchCount: 0,
        runtimeMixerCount: 0,
        spatialBoundsValid: true,
      })
      expect(() =>
        presentation.update(createAuthoredSelection(1, [0]), createAuthoredState(1)),
      ).toThrow('selection capacity 1 does not match presentation capacity 4')
      const overflowSelection = createAuthoredSelection(4, [])
      overflowSelection.count = 5
      expect(() => presentation.update(overflowSelection, createAuthoredState(1))).toThrow(
        'selected count must be an integer from 0 to 4',
      )
    } finally {
      presentation.dispose()
      source.geometry.dispose()
      source.material.dispose()
    }
  })

  test('keeps an empty authored pipeline resident without submitting a parked live-batch instance', () => {
    const source = createSkinnedSource()
    const presentation = createZombieEscapeAuthoredInstancePresentation({
      attackClip: null,
      instanceCapacity: 2,
      modelTransform: { offset: new Vector3(), scale: 1 },
      runClip: null,
      source: source.root,
      variantIndex: 0,
      walkClip: null,
      zombieShader: createZombieEscapeZombieShader({ phaseAmount: 1 }),
    })
    const empty = createAuthoredState(2)
    empty.pool.active.fill(0)
    const full = createAuthoredState(2)
    const selection = createAuthoredSelection(2, [])
    const parkedMatrix = new Matrix4()

    try {
      presentation.update(selection, empty)
      const mesh = presentation.root.children[0] as InstancedMesh
      expect(presentation.root.visible).toBe(true)
      expect(mesh.visible).toBe(true)
      expect(mesh.frustumCulled).toBe(false)
      expect(mesh.instanceMatrix.count).toBe(2)
      expect(mesh.geometry.getAttribute('zombieBakedFrame').count).toBe(2)
      expect(mesh.count).toBe(1)
      mesh.getMatrixAt(0, parkedMatrix)
      expect(parkedMatrix.elements[13]).toBe(-1_000_000)
      expect(presentation.getDebugSnapshot()).toMatchObject({ activeCount: 0, batchCount: 0 })

      setAuthoredSelection(selection, [0, 1])
      presentation.update(selection, full)
      expect(mesh.count).toBe(2)
      mesh.getMatrixAt(0, parkedMatrix)
      expect(parkedMatrix.elements[13]).not.toBe(-1_000_000)
      mesh.getMatrixAt(1, parkedMatrix)
      expect(parkedMatrix.elements[13]).not.toBe(-1_000_000)
      expect(presentation.getDebugSnapshot()).toMatchObject({ activeCount: 2, batchCount: 1 })

      full.pool.active[1] = 0
      setAuthoredSelection(selection, [0])
      presentation.update(selection, full)
      expect(mesh.count).toBe(1)
      mesh.getMatrixAt(0, parkedMatrix)
      expect(parkedMatrix.elements[13]).not.toBe(-1_000_000)
      expect(presentation.getDebugSnapshot()).toMatchObject({ activeCount: 1, batchCount: 1 })

      setAuthoredSelection(selection, [])
      presentation.update(selection, empty)
      expect(mesh.count).toBe(1)
      mesh.getMatrixAt(0, parkedMatrix)
      expect(parkedMatrix.elements[13]).toBe(-1_000_000)
      expect(presentation.getDebugSnapshot()).toMatchObject({ activeCount: 0, batchCount: 0 })
    } finally {
      presentation.dispose()
      source.geometry.dispose()
      source.material.dispose()
    }
  })

  test('advances several authored animation bake steps within each bounded cooperative slice', async () => {
    const source = createSkinnedSource()
    let yieldedSliceCount = 0
    const presentation = await createZombieEscapeAuthoredInstancePresentationCooperatively({
      attackClip: null,
      instanceCapacity: 1,
      modelTransform: { offset: new Vector3(), scale: 1 },
      readBuildTimeMs: () => 0,
      runClip: null,
      source: source.root,
      variantIndex: 0,
      waitForBuildSlice: async () => {
        yieldedSliceCount += 1
      },
      walkClip: null,
      zombieShader: createZombieEscapeZombieShader({ phaseAmount: 1 }),
    })

    try {
      expect(yieldedSliceCount).toBe(7)
      expect(presentation.getReadinessSnapshot()).toEqual({
        bakedFrameCount: 1 + ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT * 4,
        failed: false,
        meshCount: 1,
        ready: true,
      })
    } finally {
      presentation.dispose()
    }
  })

  test('starts a new cooperative slice when its foreground-time budget is consumed', async () => {
    const source = createSkinnedSource()
    let yieldedSliceCount = 0
    let buildTimeMs = 0
    const presentation = await createZombieEscapeAuthoredInstancePresentationCooperatively({
      attackClip: null,
      instanceCapacity: 1,
      modelTransform: { offset: new Vector3(), scale: 1 },
      readBuildTimeMs: () => {
        const current = buildTimeMs
        buildTimeMs += 4
        return current
      },
      runClip: null,
      source: source.root,
      variantIndex: 0,
      waitForBuildSlice: async () => {
        yieldedSliceCount += 1
      },
      walkClip: null,
      zombieShader: createZombieEscapeZombieShader({ phaseAmount: 1 }),
    })

    try {
      expect(yieldedSliceCount).toBe(27)
      expect(presentation.getReadinessSnapshot().ready).toBe(true)
    } finally {
      presentation.dispose()
    }
  })

  test('aborts a suspended cooperative slice and disposes partial bake resources', async () => {
    const source = createSkinnedSource()
    const abortController = new AbortController()
    const textureDispose = spyOn(Texture.prototype, 'dispose')
    const geometryDispose = spyOn(BufferGeometry.prototype, 'dispose')
    let sliceCount = 0
    let notifyBlockedSlice = () => {}
    const blockedSlice = new Promise<void>((resolve) => {
      notifyBlockedSlice = resolve
    })
    const presentationPromise = createZombieEscapeAuthoredInstancePresentationCooperatively({
      attackClip: null,
      instanceCapacity: 1,
      modelTransform: { offset: new Vector3(), scale: 1 },
      runClip: null,
      signal: abortController.signal,
      source: source.root,
      variantIndex: 0,
      waitForBuildSlice: () => {
        sliceCount += 1
        if (sliceCount < 4) return Promise.resolve()
        notifyBlockedSlice()
        return new Promise<void>(() => {})
      },
      walkClip: null,
      zombieShader: createZombieEscapeZombieShader({ phaseAmount: 1 }),
    })

    try {
      await blockedSlice
      abortController.abort()
      await expect(presentationPromise).rejects.toMatchObject({ name: 'AbortError' })
      expect(textureDispose).toHaveBeenCalled()
      expect(geometryDispose).toHaveBeenCalled()
    } finally {
      textureDispose.mockRestore()
      geometryDispose.mockRestore()
    }
  })

  test('preserves the authored texture map with the shared phase-scoped zombie shader', () => {
    const source = createSkinnedSource()
    const map = new Texture()
    source.material.map = map
    const zombieShader = createZombieEscapeZombieShader({ phaseAmount: 0 })
    const referenceMaterial = zombieShader.createMaterial(
      source.material,
      source.geometry,
      0,
    ) as MeshStandardNodeMaterial
    const presentation = createZombieEscapeAuthoredInstancePresentation({
      attackClip: null,
      instanceCapacity: 2,
      modelTransform: { offset: new Vector3(), scale: 1 },
      runClip: null,
      source: source.root,
      variantIndex: 0,
      walkClip: null,
      zombieShader,
    })

    try {
      const mesh = presentation.root.children[0] as InstancedMesh
      const material = mesh.material as MeshStandardNodeMaterial
      expect(material.map).toBe(map)
      expect(material.colorNode).toBe(referenceMaterial.colorNode)
      expect(material.emissiveNode).toBe(referenceMaterial.emissiveNode)
      expect(material.roughnessNode).toBe(referenceMaterial.roughnessNode)
      expect(material.userData).toMatchObject({
        authoredZombieCrowdLod: 'baked-texture-instanced',
        crowdMaterialMode: 'authored-texture-grade',
        zombieTextureShader: {
          phaseScoped: true,
          seed: 0,
        },
      })
      zombieShader.setPhaseAmount(1)
      expect(zombieShader.getPhaseAmount()).toBe(1)
      expect(presentation.getDebugSnapshot().materialMode).toBe('authored-texture-grade')
    } finally {
      presentation.dispose()
      referenceMaterial.dispose()
      source.geometry.dispose()
      source.material.dispose()
      map.dispose()
    }
  })

  test('builds baked vertex assignments against the supplied cold-start stack', () => {
    const source = createSkinnedSource()
    const presentation = createZombieEscapeAuthoredInstancePresentation({
      attackClip: null,
      instanceCapacity: 1,
      modelTransform: { offset: new Vector3(), scale: 1 },
      runClip: null,
      source: source.root,
      variantIndex: 0,
      walkClip: null,
      zombieShader: createZombieEscapeZombieShader({ phaseAmount: 1 }),
    })
    const mesh = presentation.root.children[0] as InstancedMesh
    const material = mesh.material as MeshStandardNodeMaterial
    const builderStack = stack()
    const previousStack = getCurrentStack()
    const consoleError = spyOn(console, 'error').mockImplementation(() => {})

    try {
      setCurrentStack(null)
      material.setupPosition({
        geometry: mesh.geometry,
        object: mesh,
        stack: builderStack,
      } as NodeBuilder)

      expect(consoleError).not.toHaveBeenCalled()
      expect(builderStack.nodes.slice(0, 2).every((node) => 'isAssignNode' in node)).toBe(true)
      expect(builderStack.nodes.length).toBeGreaterThan(2)
      expect(getCurrentStack()).toBeNull()
    } finally {
      setCurrentStack(previousStack)
      consoleError.mockRestore()
      presentation.dispose()
      source.geometry.dispose()
      source.material.dispose()
    }
  })

  test('applies canonical model normalization before the instance presentation pose', () => {
    const source = createSkinnedSource()
    source.root.position.set(8, -3, 4)
    source.root.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), 0.31)
    source.root.scale.set(2, 3, 4)
    source.mesh.position.set(0.4, 0.25, -0.3)
    source.mesh.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), -0.22)
    source.mesh.scale.set(0.8, 1.1, 0.9)
    source.root.updateMatrixWorld(true)
    const modelTransform = { offset: new Vector3(1.2, 0.7, -0.6), scale: 1.75 }
    const presentation = createZombieEscapeAuthoredInstancePresentation({
      attackClip: null,
      instanceCapacity: 1,
      modelTransform,
      runClip: null,
      source: source.root,
      variantIndex: 0,
      walkClip: null,
      zombieShader: createZombieEscapeZombieShader({ phaseAmount: 1 }),
    })
    const zombies = createAuthoredState(1)
    zombies.x[0] = 5
    zombies.z[0] = -3
    zombies.heading[0] = 0.43

    try {
      presentation.update(createAuthoredSelection(1, [0]), zombies)
      const mesh = presentation.root.children[0] as InstancedMesh
      const actual = new Matrix4()
      mesh.getMatrixAt(0, actual)
      const poseMatrix = new Matrix4().compose(
        new Vector3(5, 0.03, -3),
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.43),
        new Vector3(1, 1, 1),
      )
      const modelMatrix = new Matrix4().compose(
        modelTransform.offset,
        source.root.quaternion,
        new Vector3(modelTransform.scale, modelTransform.scale, modelTransform.scale),
      )
      const meshRelativeToRoot = source.root.matrixWorld
        .clone()
        .invert()
        .multiply(source.mesh.matrixWorld)
      const expected = poseMatrix.clone().multiply(modelMatrix).multiply(meshRelativeToRoot)
      const legacy = poseMatrix.clone().multiply(meshRelativeToRoot)

      for (let index = 0; index < actual.elements.length; index += 1) {
        expect(actual.elements[index]).toBeCloseTo(expected.elements[index]!, 5)
      }
      expect(
        actual.elements.some((value, index) => Math.abs(value - legacy.elements[index]!) > 0.1),
      ).toBe(true)
    } finally {
      presentation.dispose()
      source.geometry.dispose()
      source.material.dispose()
    }
  })

  test('wraps baked animation frames continuously in both directions', () => {
    expect(resolveZombieEscapeBakedAnimationSample(0)).toEqual({
      alpha: 0,
      frame0: 0,
      frame1: 1,
    })
    expect(resolveZombieEscapeBakedAnimationSample(Math.PI)).toEqual({
      alpha: 0,
      frame0: ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT / 2,
      frame1: ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT / 2 + 1,
    })
    expect(resolveZombieEscapeBakedAnimationSample(-Math.PI / 6)).toEqual({
      alpha: 0,
      frame0: (ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT * 11) / 12,
      frame1: 0,
    })
  })

  test('gives attack intent its authored frame bank even while the zombie is stationary', () => {
    const firstAttackFrame = resolveZombieEscapeAuthoredBakedFrame({
      attackCooldown: ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS,
      attackIntent: ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle,
      locomotionBlend: 0,
      locomotionPhase: 0,
      runBlend: 0,
    })
    const middleAttackFrame = resolveZombieEscapeAuthoredBakedFrame({
      attackCooldown: ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS * 0.5,
      attackIntent: ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle,
      locomotionBlend: 0,
      locomotionPhase: 0,
      runBlend: 0,
    })
    const idleFrame = resolveZombieEscapeAuthoredBakedFrame({
      attackCooldown: ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS * 0.5,
      attackIntent: ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase,
      locomotionBlend: 0,
      locomotionPhase: 0,
      runBlend: 0,
    })

    expect(firstAttackFrame).toBe(1 + ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT * 2)
    expect(middleAttackFrame).toBeGreaterThan(firstAttackFrame)
    expect(middleAttackFrame).toBeLessThanOrEqual(ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT * 3)
    expect(idleFrame).toBe(0)
  })

  test('gives a dead instance the collapse bank and holds its exact terminal frame', () => {
    const firstDeathFrame = resolveZombieEscapeAuthoredBakedFrame({
      attackCooldown: 0,
      attackIntent: ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase,
      deathPresentationSeconds: ZOMBIE_ESCAPE_SIMULATION.zombieDeathPresentationSeconds,
      health: 0,
      locomotionBlend: 1,
      locomotionPhase: Math.PI,
      runBlend: 1,
    })
    const middleDeathFrame = resolveZombieEscapeAuthoredBakedFrame({
      attackCooldown: 0,
      attackIntent: ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase,
      deathPresentationSeconds:
        ZOMBIE_ESCAPE_SIMULATION.zombieDeathPresentationSeconds -
        ZOMBIE_ESCAPE_DEATH_ANIMATION_DURATION_SECONDS * 0.5,
      health: 0,
      locomotionBlend: 1,
      locomotionPhase: Math.PI,
      runBlend: 1,
    })
    const settledDeathFrame = resolveZombieEscapeAuthoredBakedFrame({
      attackCooldown: 0,
      attackIntent: ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase,
      deathPresentationSeconds: 0.2,
      health: 0,
      locomotionBlend: 1,
      locomotionPhase: Math.PI,
      runBlend: 1,
    })

    expect(firstDeathFrame).toBe(1 + ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT * 3)
    expect(middleDeathFrame).toBeGreaterThan(firstDeathFrame)
    expect(settledDeathFrame).toBe(ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT * 4)
  })

  test('keeps each retained instance frame stable when uniformly distributed membership changes', () => {
    const source = createSkinnedSource()
    const presentation = createZombieEscapeAuthoredInstancePresentation({
      attackClip: null,
      instanceCapacity: 4,
      modelTransform: { offset: new Vector3(), scale: 1 },
      runClip: null,
      source: source.root,
      variantIndex: 3,
      walkClip: null,
      zombieShader: createZombieEscapeZombieShader({ phaseAmount: 1 }),
    })
    const zombies = createAuthoredState(4)
    zombies.variant.fill(3)
    zombies.locomotionPhase.set([0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2])
    const selection = createAuthoredSelection(4, [0, 1, 2, 3])

    try {
      presentation.update(selection, zombies)
      const mesh = presentation.root.children[0] as InstancedMesh
      const frames = mesh.geometry.getAttribute('zombieBakedFrame')
      expect(Array.from(frames.array.slice(0, 4))).toEqual(
        Array.from(zombies.locomotionPhase, (phase) =>
          resolveZombieEscapeAuthoredBakedFrame({
            attackCooldown: 0,
            attackIntent: ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase,
            locomotionBlend: 1,
            locomotionPhase: phase,
            runBlend: 1,
          }),
        ),
      )

      zombies.pool.active[0] = 0
      zombies.pool.active[2] = 0
      zombies.locomotionPhase[0] = 0.17
      zombies.locomotionPhase[2] = 4.22
      setAuthoredSelection(selection, [1, 3])
      presentation.update(selection, zombies)
      expect(Array.from(frames.array.slice(0, 2))).toEqual([
        resolveZombieEscapeAuthoredBakedFrame({
          attackCooldown: 0,
          attackIntent: ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase,
          locomotionBlend: 1,
          locomotionPhase: Math.PI / 2,
          runBlend: 1,
        }),
        resolveZombieEscapeAuthoredBakedFrame({
          attackCooldown: 0,
          attackIntent: ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase,
          locomotionBlend: 1,
          locomotionPhase: (Math.PI * 3) / 2,
          runBlend: 1,
        }),
      ])

      zombies.locomotionPhase[1] += Math.PI / 6
      presentation.update(selection, zombies)
      expect(frames.getX(0)).toBe(
        resolveZombieEscapeAuthoredBakedFrame({
          attackCooldown: 0,
          attackIntent: ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase,
          locomotionBlend: 1,
          locomotionPhase: Math.PI / 2 + Math.PI / 6,
          runBlend: 1,
        }),
      )
      expect(frames.getX(1)).toBe(
        resolveZombieEscapeAuthoredBakedFrame({
          attackCooldown: 0,
          attackIntent: ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase,
          locomotionBlend: 1,
          locomotionPhase: (Math.PI * 3) / 2,
          runBlend: 1,
        }),
      )
    } finally {
      presentation.dispose()
      source.geometry.dispose()
      source.material.dispose()
    }
  })

  test('uploads only changed instance matrix and animation-frame ranges', () => {
    const source = createSkinnedSource()
    const presentation = createZombieEscapeAuthoredInstancePresentation({
      attackClip: null,
      instanceCapacity: 2,
      modelTransform: { offset: new Vector3(), scale: 1 },
      runClip: null,
      source: source.root,
      variantIndex: 0,
      walkClip: null,
      zombieShader: createZombieEscapeZombieShader({ phaseAmount: 1 }),
    })
    const zombies = createAuthoredState(2)
    zombies.x.set([2, 4])
    const selection = createAuthoredSelection(2, [0, 1])

    try {
      presentation.update(selection, zombies)
      const mesh = presentation.root.children[0] as InstancedMesh
      const frames = mesh.geometry.getAttribute('zombieBakedFrame')
      mesh.instanceMatrix.clearUpdateRanges()
      frames.clearUpdateRanges()
      const matrixVersion = mesh.instanceMatrix.version
      const frameVersion = frames.version

      presentation.update(selection, zombies)
      expect(mesh.instanceMatrix.version).toBe(matrixVersion)
      expect(frames.version).toBe(frameVersion)
      expect(mesh.instanceMatrix.updateRanges).toEqual([])
      expect(frames.updateRanges).toEqual([])

      zombies.x[1] = 5
      presentation.update(selection, zombies)
      expect(mesh.instanceMatrix.version).toBe(matrixVersion + 1)
      expect(mesh.instanceMatrix.updateRanges).toEqual([{ count: 16, start: 16 }])
      expect(frames.version).toBe(frameVersion)

      mesh.instanceMatrix.clearUpdateRanges()
      zombies.heading[1] = Math.PI / 3
      presentation.update(selection, zombies)
      expect(mesh.instanceMatrix.version).toBe(matrixVersion + 2)
      expect(mesh.instanceMatrix.updateRanges).toEqual([{ count: 16, start: 16 }])
      expect(frames.version).toBe(frameVersion)

      mesh.instanceMatrix.clearUpdateRanges()
      zombies.locomotionPhase[1] = Math.PI / 6
      presentation.update(selection, zombies)
      expect(mesh.instanceMatrix.updateRanges).toEqual([])
      expect(mesh.instanceMatrix.version).toBe(matrixVersion + 2)
      expect(frames.version).toBe(frameVersion + 1)
      expect(frames.updateRanges).toEqual([{ count: 1, start: 1 }])
    } finally {
      presentation.dispose()
      source.geometry.dispose()
      source.material.dispose()
    }
  })

  test('checks every variable affine component and keeps live and parked matrices affine', () => {
    const source = createMultiMeshSkinnedSource()
    const firstSourceMesh = source.root.children[0] as SkinnedMesh
    const secondSourceMesh = source.root.children[1] as SkinnedMesh
    source.root.position.set(2.1, -0.4, 1.3)
    source.root.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), 0.37)
    source.root.scale.set(1.2, 0.9, 1.4)
    firstSourceMesh.position.set(0.3, 0.6, -0.2)
    firstSourceMesh.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), -0.29)
    firstSourceMesh.scale.set(0.8, 1.1, 0.95)
    secondSourceMesh.position.set(-0.5, 0.2, 0.7)
    secondSourceMesh.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), 0.41)
    secondSourceMesh.scale.set(1.05, 0.75, 1.2)
    const presentation = createZombieEscapeAuthoredInstancePresentation({
      attackClip: null,
      instanceCapacity: 1,
      modelTransform: { offset: new Vector3(0.8, 0.25, -0.45), scale: 1.35 },
      runClip: null,
      source: source.root,
      variantIndex: 0,
      walkClip: null,
      zombieShader: createZombieEscapeZombieShader({ phaseAmount: 1 }),
    })
    const zombies = createAuthoredState(1)
    zombies.x[0] = 4.2
    zombies.y[0] = 0.15
    zombies.z[0] = -3.4
    zombies.heading[0] = 0.63
    const selection = createAuthoredSelection(1, [0])
    const variableComponents = [12, 13, 14, 0, 1, 2, 4, 5, 6, 8, 9, 10] as const

    try {
      presentation.update(selection, zombies)
      const meshes = presentation.root.children.map((child) => child as InstancedMesh)
      expect(meshes).toHaveLength(2)
      for (const mesh of meshes) {
        expectInstanceMatrixToBeAffine(mesh)
      }

      const mesh = meshes[0]!
      const expected = new Matrix4()
      mesh.getMatrixAt(0, expected)
      for (const component of variableComponents) {
        mesh.instanceMatrix.clearUpdateRanges()
        const previousVersion = mesh.instanceMatrix.version
        const values = mesh.instanceMatrix.array
        values[component] = Math.fround(values[component]! + 0.25)

        presentation.update(selection, zombies)

        expect(mesh.instanceMatrix.version).toBe(previousVersion + 1)
        expect(mesh.instanceMatrix.updateRanges).toEqual([{ count: 16, start: 0 }])
        expect(values[component]).toBe(Math.fround(expected.elements[component]!))
      }

      setAuthoredSelection(selection, [])
      presentation.update(selection, zombies)
      for (const mesh of meshes) {
        expectInstanceMatrixToBeAffine(mesh)
        const parked = new Matrix4()
        mesh.getMatrixAt(0, parked)
        expect(parked.elements[13]).toBe(-1_000_000)
        mesh.instanceMatrix.clearUpdateRanges()
      }
      const parkedVersions = meshes.map((mesh) => mesh.instanceMatrix.version)
      presentation.update(selection, zombies)
      for (let index = 0; index < meshes.length; index += 1) {
        expect(meshes[index]!.instanceMatrix.version).toBe(parkedVersions[index]!)
        expect(meshes[index]!.instanceMatrix.updateRanges).toEqual([])
      }
    } finally {
      presentation.dispose()
      for (const geometry of source.geometries) geometry.dispose()
      for (const material of source.materials) material.dispose()
    }
  })

  test('shares one animation-frame attribute across every baked submesh', () => {
    const source = createMultiMeshSkinnedSource()
    const presentation = createZombieEscapeAuthoredInstancePresentation({
      attackClip: null,
      instanceCapacity: 2,
      modelTransform: { offset: new Vector3(), scale: 1 },
      runClip: null,
      source: source.root,
      variantIndex: 0,
      walkClip: null,
      zombieShader: createZombieEscapeZombieShader({ phaseAmount: 1 }),
    })
    const zombies = createAuthoredState(2)
    const selection = createAuthoredSelection(2, [0, 1])

    try {
      presentation.update(selection, zombies)
      const firstMesh = presentation.root.children[0] as InstancedMesh
      const secondMesh = presentation.root.children[1] as InstancedMesh
      const firstFrames = firstMesh.geometry.getAttribute('zombieBakedFrame')
      const secondFrames = secondMesh.geometry.getAttribute('zombieBakedFrame')

      expect(firstFrames).toBe(secondFrames)
      firstFrames.clearUpdateRanges()
      const frameVersion = firstFrames.version
      zombies.locomotionPhase[1] = Math.PI / 6
      presentation.update(selection, zombies)

      expect(firstFrames.version).toBe(frameVersion + 1)
      expect(firstFrames.updateRanges).toEqual([{ count: 1, start: 1 }])
      expect(secondFrames.updateRanges).toEqual([{ count: 1, start: 1 }])
    } finally {
      presentation.dispose()
      for (const geometry of source.geometries) geometry.dispose()
      for (const material of source.materials) material.dispose()
    }
  })
})

function createAuthoredSelection(capacity: number, selectedSlots: readonly number[]) {
  return setAuthoredSelection({ count: 0, slots: new Uint16Array(capacity) }, selectedSlots)
}

function setAuthoredSelection(
  selection: { count: number; slots: Uint16Array },
  selectedSlots: readonly number[],
) {
  if (selectedSlots.length > selection.slots.length) {
    throw new Error('Test authored selection exceeds its preallocated capacity.')
  }
  selection.slots.set(selectedSlots)
  selection.count = selectedSlots.length
  return selection
}

function expectInstanceMatrixToBeAffine(mesh: InstancedMesh) {
  const matrix = new Matrix4()
  mesh.getMatrixAt(0, matrix)
  expect(matrix.elements[3] === 0).toBe(true)
  expect(matrix.elements[7] === 0).toBe(true)
  expect(matrix.elements[11] === 0).toBe(true)
  expect(matrix.elements[15]).toBe(1)
}

function createAuthoredState(capacity: number) {
  return {
    attackCooldown: new Float32Array(capacity),
    deathPresentationSeconds: new Float32Array(capacity),
    heading: new Float32Array(capacity),
    hitImpulseX: new Float32Array(capacity),
    hitImpulseY: new Float32Array(capacity),
    hitImpulseZ: new Float32Array(capacity),
    hitReaction: new Float32Array(capacity),
    health: new Float32Array(capacity).fill(1),
    intent: new Uint8Array(capacity),
    locomotionBlend: new Float32Array(capacity).fill(1),
    locomotionPhase: new Float32Array(capacity),
    pool: { active: new Uint8Array(capacity).fill(1) },
    runBlend: new Float32Array(capacity).fill(1),
    spawnOrdinal: new Uint32Array(capacity),
    variant: new Uint8Array(capacity),
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    z: new Float32Array(capacity),
  }
}

function createSkinnedSource() {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3))
  geometry.setAttribute('normal', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3))
  geometry.setAttribute(
    'skinIndex',
    new Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4),
  )
  geometry.setAttribute(
    'skinWeight',
    new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4),
  )
  geometry.setIndex([0, 1, 2])
  const bone = new Bone()
  const skeleton = new Skeleton([bone])
  const material = new MeshStandardMaterial({ color: '#789f77' })
  const mesh = new SkinnedMesh(geometry, material)
  mesh.add(bone)
  mesh.bind(skeleton)
  const root = new Group()
  root.add(mesh)
  return { geometry, material, mesh, root }
}

function createMultiMeshSkinnedSource() {
  const first = createSkinnedSource()
  const secondGeometry = first.geometry.clone()
  const secondMaterial = first.material.clone()
  const secondBone = new Bone()
  const secondSkeleton = new Skeleton([secondBone])
  const secondMesh = new SkinnedMesh(secondGeometry, secondMaterial)
  secondMesh.add(secondBone)
  secondMesh.bind(secondSkeleton)
  secondMesh.position.x = 0.2
  first.root.add(secondMesh)
  return {
    geometries: [first.geometry, secondGeometry],
    materials: [first.material, secondMaterial],
    root: first.root,
  }
}
