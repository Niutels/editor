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
import { ZOMBIE_ESCAPE_ATTACK_ANIMATION_DURATION_SECONDS } from './zombie-escape-attack-presentation'
import {
  collectZombieEscapeAuthoredInstanceSlots,
  countZombieEscapeAuthoredVariantCapacity,
  createZombieEscapeAuthoredInstancePresentation,
  createZombieEscapeAuthoredInstancePresentationCooperatively,
  encodeZombieEscapeBakedTextureComponent,
  resolveZombieEscapeAuthoredBakedFrame,
  resolveZombieEscapeBakedAnimationSample,
  ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT,
} from './zombie-escape-instanced-skinned-presentation'
import { ZOMBIE_ESCAPE_ZOMBIE_INTENT } from './zombie-escape-simulation'
import { createZombieEscapeZombieShader } from './zombie-escape-zombie-material'

describe('authored instanced zombie presentation', () => {
  test('compacts active nondetailed slots in deterministic pool order', () => {
    const active = new Uint8Array([1, 1, 0, 1, 1, 1])
    const detailed = new Uint8Array([0, 1, 0, 0, 0, 0])
    const variant = new Uint8Array([2, 2, 2, 1, 2, 2])
    const output = new Uint16Array(4)

    const count = collectZombieEscapeAuthoredInstanceSlots(
      { active, detailed, variant, variantIndex: 2 },
      output,
    )

    expect(countZombieEscapeAuthoredVariantCapacity(variant, 2)).toBe(5)
    expect(Array.from(output.slice(0, count))).toEqual([0, 4, 5])
  })

  test('rejects silent presentation capacity overflow', () => {
    expect(() =>
      collectZombieEscapeAuthoredInstanceSlots(
        {
          active: new Uint8Array([1, 1]),
          detailed: new Uint8Array(2),
          variant: new Uint8Array([0, 0]),
          variantIndex: 0,
        },
        new Uint16Array(1),
      ),
    ).toThrow('capacity 1 is below the selected count')
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
        bakedFrameCount: 1 + ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT * 3,
        failed: false,
        meshCount: 1,
        ready: true,
      })
      expect(presentation.getDebugSnapshot()).toEqual({
        activeCount: 0,
        animationMode: 'baked-vertex',
        attackFrameIndex: 0,
        bakedFrameCount: 1 + ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT * 3,
        bakedTextureBytes: 1_776,
        bakedTextureCount: 1,
        bakedTextureFormat: 'rgba16float',
        batchCount: 0,
        computeDispatchCount: 0,
        materialMode: 'authored-texture-grade',
        runtimeGeometryUploadCount: 0,
        runtimeMixerCount: 0,
        runFrameIndex: 0,
        spatialBoundsValid: false,
        textureFetchesPerVertex: 2,
        vertexCount: 3,
        walkFrameIndex: 0,
      })

      presentation.update({
        detailedSlots: new Uint8Array(1),
        elapsedSeconds: 1,
        zombies: {
          attackCooldown: new Float32Array(1),
          heading: new Float32Array(1),
          hitImpulseX: new Float32Array(1),
          hitImpulseY: new Float32Array(1),
          hitImpulseZ: new Float32Array(1),
          hitReaction: new Float32Array(1),
          intent: new Uint8Array(1),
          locomotionBlend: new Float32Array([1]),
          locomotionPhase: new Float32Array([Math.PI]),
          pool: { active: new Uint8Array([1]) },
          runBlend: new Float32Array([1]),
          variant: new Uint8Array(1),
          x: new Float32Array([3]),
          y: new Float32Array(1),
          z: new Float32Array([-2]),
        },
      })

      expect(presentation.getDebugSnapshot()).toMatchObject({
        activeCount: 1,
        batchCount: 1,
        computeDispatchCount: 0,
        runtimeMixerCount: 0,
        spatialBoundsValid: true,
      })
    } finally {
      presentation.dispose()
      source.geometry.dispose()
      source.material.dispose()
    }
  })

  test('cooperatively yields between authored animation bake slices', async () => {
    const source = createSkinnedSource()
    let yieldedSliceCount = 0
    const presentation = await createZombieEscapeAuthoredInstancePresentationCooperatively({
      attackClip: null,
      instanceCapacity: 1,
      modelTransform: { offset: new Vector3(), scale: 1 },
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
      expect(yieldedSliceCount).toBeGreaterThanOrEqual(39)
      expect(presentation.getReadinessSnapshot()).toEqual({
        bakedFrameCount: 1 + ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT * 3,
        failed: false,
        meshCount: 1,
        ready: true,
      })
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

  test('preserves the authored texture map with a deterministic crowd material grade', () => {
    const source = createSkinnedSource()
    const map = new Texture()
    source.material.map = map
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

    try {
      const mesh = presentation.root.children[0] as InstancedMesh
      const material = mesh.material as MeshStandardMaterial & { colorNode?: unknown }
      expect(material.map).toBe(map)
      expect(material.colorNode).toBeDefined()
      expect(material.userData).toMatchObject({
        authoredZombieCrowdLod: 'baked-texture-instanced',
        crowdMaterialMode: 'authored-texture-grade',
      })
      expect(presentation.getDebugSnapshot().materialMode).toBe('authored-texture-grade')
    } finally {
      presentation.dispose()
      source.geometry.dispose()
      source.material.dispose()
      map.dispose()
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
      presentation.update({ detailedSlots: new Uint8Array(1), elapsedSeconds: 0, zombies })
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

    try {
      presentation.update({ detailedSlots: new Uint8Array(4), elapsedSeconds: 5, zombies })
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
      presentation.update({ detailedSlots: new Uint8Array(4), elapsedSeconds: 5, zombies })
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
      presentation.update({
        detailedSlots: new Uint8Array(4),
        elapsedSeconds: 6,
        zombies,
      })
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
})

function createAuthoredState(capacity: number) {
  return {
    attackCooldown: new Float32Array(capacity),
    heading: new Float32Array(capacity),
    hitImpulseX: new Float32Array(capacity),
    hitImpulseY: new Float32Array(capacity),
    hitImpulseZ: new Float32Array(capacity),
    hitReaction: new Float32Array(capacity),
    intent: new Uint8Array(capacity),
    locomotionBlend: new Float32Array(capacity).fill(1),
    locomotionPhase: new Float32Array(capacity),
    pool: { active: new Uint8Array(capacity).fill(1) },
    runBlend: new Float32Array(capacity).fill(1),
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
