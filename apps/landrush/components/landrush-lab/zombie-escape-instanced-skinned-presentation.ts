import {
  type AnimationAction,
  type AnimationClip,
  AnimationMixer,
  type BufferGeometry,
  DataArrayTexture,
  DataUtils,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  HalfFloatType,
  InstancedBufferAttribute,
  InstancedMesh,
  LoopOnce,
  LoopRepeat,
  type Material,
  Matrix4,
  type MeshStandardMaterial,
  NearestFilter,
  Quaternion,
  type SkinnedMesh,
  Sphere,
  Vector3,
  Vector4,
} from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import {
  attribute,
  color,
  getCurrentStack,
  int,
  ivec2,
  materialColor,
  mix,
  normalLocal,
  positionLocal,
  setCurrentStack,
  smoothstep,
  textureLoad,
  vec3,
  vec4,
  vertexIndex,
} from 'three/tsl'
import { MeshStandardNodeMaterial, type NodeBuilder, type Node as TSLNode } from 'three/webgpu'
import {
  isZombieEscapeAttackPresentationActive,
  resolveZombieEscapeAttackNormalizedPhase,
} from './zombie-escape-attack-presentation'
import { resolveZombieEscapeDeathNormalizedPhase } from './zombie-escape-character-motion'
import {
  createZombieEscapePresentationPose,
  resolveZombieEscapePresentationPose,
} from './zombie-escape-presentation-pose'
import type { ZombieEscapeZombieShader } from './zombie-escape-zombie-material'

type ZombieEscapeModelTransform = Readonly<{
  bodyCenterY?: number
  offset: Vector3
  scale: number
}>

type CreateZombieEscapeAuthoredInstancePresentationOptions = Readonly<{
  attackClip: AnimationClip | null
  deathClip?: AnimationClip | null
  instanceCapacity: number
  modelTransform: ZombieEscapeModelTransform
  runClip: AnimationClip | null
  source: Group
  variantIndex: number
  walkClip: AnimationClip | null
  zombieShader: ZombieEscapeZombieShader
}>

export const ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT = 12

const ZOMBIE_ESCAPE_AUTHORED_BAKED_TOTAL_FRAME_COUNT =
  1 + ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT * 4
const ZOMBIE_ESCAPE_AUTHORED_BAKED_TEXTURE_WIDTH = 4096
const ZOMBIE_ESCAPE_AUTHORED_BATCH_BOUNDS_PADDING_METERS = 2.5
const ZOMBIE_ESCAPE_AUTHORED_FRAME_ATTRIBUTE = 'zombieBakedFrame'
const ZOMBIE_ESCAPE_AUTHORED_TEXTURE_FETCHES_PER_VERTEX = 2
const ZOMBIE_ESCAPE_AUTHORED_HALF_FLOAT_MAX = 65_504
const TWO_PI = Math.PI * 2
const ONE = new Vector3(1, 1, 1)

type ZombieEscapeAuthoredMotion = 'attack' | 'death' | 'idle' | 'run' | 'walk'
type ZombieEscapeAuthoredMaterialMode = 'authored-texture-grade'

export type ZombieEscapeAuthoredInstanceReadinessSnapshot = Readonly<{
  bakedFrameCount: number
  failed: boolean
  meshCount: number
  ready: boolean
}>

export type ZombieEscapeAuthoredInstanceDebugSnapshot = Readonly<{
  activeCount: number
  animationMode: 'baked-vertex'
  attackFrameIndex: number
  bakedFrameCount: number
  bakedTextureBytes: number
  bakedTextureCount: number
  bakedTextureFormat: 'rgba16float'
  batchCount: number
  computeDispatchCount: 0
  deathFrameIndex: number
  materialMode: ZombieEscapeAuthoredMaterialMode
  runtimeGeometryUploadCount: 0
  runtimeMixerCount: 0
  runFrameIndex: number
  spatialBoundsValid: boolean
  textureFetchesPerVertex: 2
  vertexCount: number
  walkFrameIndex: number
}>

export type ZombieEscapeAuthoredInstanceState = Readonly<{
  attackCooldown: Float32Array
  deathPresentationSeconds: Float32Array
  heading: Float32Array
  hitImpulseX: Float32Array
  hitImpulseY: Float32Array
  hitImpulseZ: Float32Array
  hitReaction: Float32Array
  health: Float32Array
  intent: Uint8Array
  locomotionBlend: Float32Array
  locomotionPhase: Float32Array
  pool: Readonly<{ active: Uint8Array }>
  runBlend: Float32Array
  spawnOrdinal: Uint32Array
  variant: Uint8Array
  x: Float32Array
  y: Float32Array
  z: Float32Array
}>

export type ZombieEscapeAuthoredInstancePresentation = Readonly<{
  dispose: () => void
  getDebugSnapshot: () => ZombieEscapeAuthoredInstanceDebugSnapshot
  getReadinessSnapshot: () => ZombieEscapeAuthoredInstanceReadinessSnapshot
  root: Group
  update: (input: {
    detailedSlots: Uint8Array
    elapsedSeconds: number
    zombies: ZombieEscapeAuthoredInstanceState
  }) => void
}>

type BakedTextureSet = {
  baseGeometry: BufferGeometry
  data: Uint16Array
  height: number
  texture: DataArrayTexture
  vertexCount: number
  width: number
}

type BakedMeshState = {
  frameAttribute: InstancedBufferAttribute
  materials: Material[]
  mesh: InstancedMesh
  meshToRoot: Matrix4
  textureSet: BakedTextureSet
  vertexCount: number
}

type BakedVertexNodes = Readonly<{
  normal: TSLNode<'vec3'>
  position: TSLNode<'vec3'>
}>

class ZombieEscapeBakedNodeMaterial extends MeshStandardNodeMaterial {
  private readonly bakedNormalNode: TSLNode<'vec3'>
  private readonly bakedPositionNode: TSLNode<'vec3'>

  constructor(nodes: BakedVertexNodes) {
    super()
    this.bakedNormalNode = nodes.normal
    this.bakedPositionNode = nodes.position
  }

  override setupPosition(builder: NodeBuilder) {
    const previousStack = getCurrentStack()
    setCurrentStack(builder.stack)
    try {
      positionLocal.assign(this.bakedPositionNode)
      normalLocal.assign(this.bakedNormalNode)
      return super.setupPosition(builder)
    } finally {
      setCurrentStack(previousStack)
    }
  }
}

export function countZombieEscapeAuthoredVariantCapacity(
  variantByPoolSlot: Uint8Array,
  variantIndex: number,
) {
  assertVariantIndex(variantIndex)
  let count = 0
  for (const variant of variantByPoolSlot) {
    if (variant === variantIndex) count += 1
  }
  return count
}

export function collectZombieEscapeAuthoredInstanceSlots(
  {
    active,
    detailed,
    variant,
    variantIndex,
  }: {
    active: Uint8Array
    detailed: Uint8Array
    variant: Uint8Array
    variantIndex: number
  },
  output: Uint16Array,
) {
  assertVariantIndex(variantIndex)
  if (detailed.length < active.length || variant.length < active.length) {
    throw new Error('Authored zombie instance selection arrays must cover the active pool.')
  }
  let count = 0
  for (let slot = 0; slot < active.length; slot += 1) {
    if (active[slot] === 0 || detailed[slot] !== 0 || variant[slot] !== variantIndex) continue
    if (count >= output.length) {
      throw new Error(
        `Authored zombie instance capacity ${String(output.length)} is below the selected count.`,
      )
    }
    output[count] = slot
    count += 1
  }
  return count
}

export function resolveZombieEscapeBakedAnimationSample(phase: number) {
  const normalizedPhase = positiveModulo(phase, TWO_PI) / TWO_PI
  const continuousFrame = normalizedPhase * ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT
  const frame0 = Math.floor(continuousFrame) % ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT
  return {
    alpha: continuousFrame - Math.floor(continuousFrame),
    frame0,
    frame1: (frame0 + 1) % ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT,
  }
}

export function resolveZombieEscapeAuthoredBakedFrame({
  attackCooldown,
  attackIntent,
  deathPresentationSeconds = 0,
  health = 1,
  locomotionBlend,
  locomotionPhase,
  runBlend,
}: {
  attackCooldown: number
  attackIntent: number
  deathPresentationSeconds?: number
  health?: number
  locomotionBlend: number
  locomotionPhase: number
  runBlend: number
}) {
  const attackActive = isZombieEscapeAttackPresentationActive(attackIntent)
  const deathActive = health <= 0
  const motion = resolveAuthoredMotion(locomotionBlend, runBlend, attackActive, deathActive)
  if (motion === 'idle') return 0
  if (motion === 'death') {
    return (
      1 +
      ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT * 3 +
      resolveNearestNormalizedBakedFrame(
        resolveZombieEscapeDeathNormalizedPhase(deathPresentationSeconds),
      )
    )
  }
  if (motion === 'attack') {
    return (
      1 +
      ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT * 2 +
      resolveNearestNormalizedBakedFrame(resolveZombieEscapeAttackNormalizedPhase(attackCooldown))
    )
  }
  const frame = resolveNearestCyclicBakedFrame(locomotionPhase)
  return motion === 'walk' ? 1 + frame : 1 + ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT + frame
}

export function encodeZombieEscapeBakedTextureComponent(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) > ZOMBIE_ESCAPE_AUTHORED_HALF_FLOAT_MAX) {
    throw new Error(
      `Baked zombie texture component is outside the finite half-float range: ${value}.`,
    )
  }
  return DataUtils.toHalfFloat(value)
}

export function createZombieEscapeAuthoredInstancePresentation(
  options: CreateZombieEscapeAuthoredInstancePresentationOptions,
): ZombieEscapeAuthoredInstancePresentation {
  const build = createZombieEscapeAuthoredInstancePresentationSteps(options)
  let step = build.next()
  while (!step.done) step = build.next()
  return step.value
}

export async function createZombieEscapeAuthoredInstancePresentationCooperatively({
  signal,
  waitForBuildSlice,
  ...options
}: CreateZombieEscapeAuthoredInstancePresentationOptions &
  Readonly<{
    signal?: AbortSignal
    waitForBuildSlice: () => Promise<void>
  }>): Promise<ZombieEscapeAuthoredInstancePresentation> {
  const build = createZombieEscapeAuthoredInstancePresentationSteps(options)
  try {
    while (true) {
      throwIfZombieEscapeAuthoredBuildAborted(signal)
      await waitForZombieEscapeAuthoredBuildSlice(waitForBuildSlice, signal)
      throwIfZombieEscapeAuthoredBuildAborted(signal)
      const step = build.next()
      if (step.done) return step.value
    }
  } catch (error) {
    try {
      build.throw(error)
    } catch {}
    throw error
  }
}

function* createZombieEscapeAuthoredInstancePresentationSteps({
  attackClip,
  deathClip = null,
  instanceCapacity,
  modelTransform,
  runClip,
  source,
  variantIndex,
  walkClip,
}: CreateZombieEscapeAuthoredInstancePresentationOptions): Generator<
  void,
  ZombieEscapeAuthoredInstancePresentation,
  void
> {
  if (!(Number.isSafeInteger(instanceCapacity) && instanceCapacity >= 1)) {
    throw new Error(
      `Authored zombie instance capacity must be a positive integer; received ${String(instanceCapacity)}.`,
    )
  }
  assertVariantIndex(variantIndex)

  yield
  const samplerRoot = cloneSkeleton(source) as Group
  const samplerMeshes: SkinnedMesh[] = []
  samplerRoot.traverse((object) => {
    const candidate = object as SkinnedMesh
    if (candidate.isSkinnedMesh) samplerMeshes.push(candidate)
  })
  if (samplerMeshes.length === 0) {
    throw new Error('Authored zombie source contains no skinned mesh.')
  }
  samplerRoot.updateMatrixWorld(true)

  const root = new Group()
  root.visible = false
  root.userData.authoredZombieInstances = {
    activeCount: 0,
    animationMode: 'baked-vertex',
    bakedFrameCount: ZOMBIE_ESCAPE_AUTHORED_BAKED_TOTAL_FRAME_COUNT,
    bakedTextureFormat: 'rgba16float',
    capacity: instanceCapacity,
    computeDispatchCount: 0,
    materialMode: 'authored-texture-grade',
    runtimeGeometryUploadCount: 0,
    runtimeMixerCount: 0,
    textureFetchesPerVertex: ZOMBIE_ESCAPE_AUTHORED_TEXTURE_FETCHES_PER_VERTEX,
    variantIndex,
  }
  const bakedTextureSets = yield* bakeAnimationTextureSteps({
    attackClip,
    deathClip,
    runClip,
    samplerMeshes,
    samplerRoot,
    walkClip,
  })
  const rootWorldInverse = samplerRoot.matrixWorld.clone().invert()
  const modelMatrix = new Matrix4().compose(
    modelTransform.offset,
    samplerRoot.quaternion,
    new Vector3(modelTransform.scale, modelTransform.scale, modelTransform.scale),
  )
  const bakedMeshes: BakedMeshState[] = []
  let ownershipTransferred = false
  try {
    for (let meshIndex = 0; meshIndex < samplerMeshes.length; meshIndex += 1) {
      yield
      const state = createBakedMeshState({
        instanceCapacity,
        modelMatrix,
        rootWorldInverse,
        sourceMesh: samplerMeshes[meshIndex]!,
        textureSet: bakedTextureSets[meshIndex]!,
        variantIndex,
      })
      bakedMeshes.push(state)
      root.add(state.mesh)
    }

    const sharedPosition = new Vector3()
    const sharedQuaternion = new Quaternion()
    const presentationPose = createZombieEscapePresentationPose()
    const meshInstanceMatrix = new Matrix4()
    const selectedSlots = new Uint16Array(instanceCapacity)
    const selectedFrames = new Float32Array(instanceCapacity)
    const selectedRootMatrices = Array.from({ length: instanceCapacity }, () => new Matrix4())
    const bounds = new Sphere()
    let disposed = false
    let activeInstanceCount = 0
    let activeBatchCount = 0
    let attackFrameIndex = 0
    let deathFrameIndex = 0
    let runFrameIndex = 0
    let walkFrameIndex = 0
    let spatialBoundsValid = false
    const vertexCount = bakedMeshes.reduce((total, state) => total + state.vertexCount, 0)
    const bakedTextureBytes = bakedMeshes.reduce(
      (total, state) => total + state.textureSet.data.byteLength,
      0,
    )

    const presentation: ZombieEscapeAuthoredInstancePresentation = {
      dispose() {
        if (disposed) return
        disposed = true
        disposeBakedMeshes(bakedMeshes)
        root.clear()
      },
      getDebugSnapshot() {
        return {
          activeCount: activeInstanceCount,
          animationMode: 'baked-vertex',
          attackFrameIndex,
          bakedFrameCount: ZOMBIE_ESCAPE_AUTHORED_BAKED_TOTAL_FRAME_COUNT,
          bakedTextureBytes,
          bakedTextureCount: bakedMeshes.length,
          bakedTextureFormat: 'rgba16float',
          batchCount: activeBatchCount,
          computeDispatchCount: 0,
          deathFrameIndex,
          materialMode: 'authored-texture-grade',
          runtimeGeometryUploadCount: 0,
          runtimeMixerCount: 0,
          runFrameIndex,
          spatialBoundsValid,
          textureFetchesPerVertex: ZOMBIE_ESCAPE_AUTHORED_TEXTURE_FETCHES_PER_VERTEX,
          vertexCount,
          walkFrameIndex,
        }
      },
      getReadinessSnapshot() {
        return {
          bakedFrameCount: ZOMBIE_ESCAPE_AUTHORED_BAKED_TOTAL_FRAME_COUNT,
          failed: false,
          meshCount: bakedMeshes.length,
          ready: !disposed && bakedMeshes.length > 0,
        }
      },
      root,
      update({ detailedSlots, zombies }) {
        if (disposed) throw new Error('Authored zombie instance presentation was disposed.')
        const selectedCount = collectZombieEscapeAuthoredInstanceSlots(
          {
            active: zombies.pool.active,
            detailed: detailedSlots,
            variant: zombies.variant,
            variantIndex,
          },
          selectedSlots,
        )
        activeInstanceCount = selectedCount
        attackFrameIndex = 0
        deathFrameIndex = 0
        runFrameIndex = 0
        walkFrameIndex = 0
        let foundRunFrame = false
        let foundWalkFrame = false
        let foundAttackFrame = false
        let foundDeathFrame = false
        let minimumX = Number.POSITIVE_INFINITY
        let minimumY = Number.POSITIVE_INFINITY
        let minimumZ = Number.POSITIVE_INFINITY
        let maximumX = Number.NEGATIVE_INFINITY
        let maximumY = Number.NEGATIVE_INFINITY
        let maximumZ = Number.NEGATIVE_INFINITY
        for (let instance = 0; instance < selectedCount; instance += 1) {
          const slot = selectedSlots[instance]!
          resolveZombieEscapePresentationPose(
            zombies.x[slot] ?? 0,
            zombies.y[slot] ?? 0,
            zombies.z[slot] ?? 0,
            zombies.heading[slot] ?? 0,
            zombies.hitReaction[slot] ?? 0,
            zombies.hitImpulseX[slot] ?? 0,
            zombies.hitImpulseY[slot] ?? 0,
            zombies.hitImpulseZ[slot] ?? 0,
            presentationPose,
            modelTransform.bodyCenterY ?? 0,
            zombies.health[slot]! <= 0
              ? resolveZombieEscapeDeathNormalizedPhase(zombies.deathPresentationSeconds[slot] ?? 0)
              : 0,
            zombies.spawnOrdinal[slot] ?? 0,
          )
          sharedPosition.set(presentationPose.x, presentationPose.y, presentationPose.z)
          sharedQuaternion.set(
            presentationPose.quaternionX,
            presentationPose.quaternionY,
            presentationPose.quaternionZ,
            presentationPose.quaternionW,
          )
          selectedRootMatrices[instance]!.compose(sharedPosition, sharedQuaternion, ONE)
          const motion = resolveAuthoredMotion(
            zombies.locomotionBlend[slot] ?? 0,
            zombies.runBlend[slot] ?? 0,
            isZombieEscapeAttackPresentationActive(zombies.intent[slot] ?? 0),
            zombies.health[slot]! <= 0,
          )
          const bakedFrame = resolveZombieEscapeAuthoredBakedFrame({
            attackCooldown: zombies.attackCooldown[slot] ?? 0,
            attackIntent: zombies.intent[slot] ?? 0,
            deathPresentationSeconds: zombies.deathPresentationSeconds[slot] ?? 0,
            health: zombies.health[slot] ?? 0,
            locomotionBlend: zombies.locomotionBlend[slot] ?? 0,
            locomotionPhase: zombies.locomotionPhase[slot] ?? 0,
            runBlend: zombies.runBlend[slot] ?? 0,
          })
          selectedFrames[instance] = bakedFrame
          if (motion === 'attack' && !foundAttackFrame) {
            attackFrameIndex = bakedFrame - 1 - ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT * 2
            foundAttackFrame = true
          }
          if (motion === 'death' && !foundDeathFrame) {
            deathFrameIndex = bakedFrame - 1 - ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT * 3
            foundDeathFrame = true
          }
          if (motion === 'run' && !foundRunFrame) {
            runFrameIndex = bakedFrame - 1 - ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT
            foundRunFrame = true
          }
          if (motion === 'walk' && !foundWalkFrame) {
            walkFrameIndex = bakedFrame - 1
            foundWalkFrame = true
          }
          minimumX = Math.min(minimumX, presentationPose.x)
          minimumY = Math.min(minimumY, presentationPose.y)
          minimumZ = Math.min(minimumZ, presentationPose.z)
          maximumX = Math.max(maximumX, presentationPose.x)
          maximumY = Math.max(maximumY, presentationPose.y)
          maximumZ = Math.max(maximumZ, presentationPose.z)
        }

        if (selectedCount > 0) {
          updateBatchBounds(bounds, minimumX, minimumY, minimumZ, maximumX, maximumY, maximumZ)
        } else {
          bounds.center.set(0, 0, 0)
          bounds.radius = 0
        }
        activeBatchCount = selectedCount > 0 ? bakedMeshes.length : 0
        for (const state of bakedMeshes) {
          const mesh = state.mesh
          mesh.count = selectedCount
          mesh.visible = selectedCount > 0
          if (selectedCount === 0) continue
          for (let instance = 0; instance < selectedCount; instance += 1) {
            meshInstanceMatrix.multiplyMatrices(selectedRootMatrices[instance]!, state.meshToRoot)
            mesh.setMatrixAt(instance, meshInstanceMatrix)
            state.frameAttribute.setX(instance, selectedFrames[instance]!)
          }
          mesh.instanceMatrix.needsUpdate = true
          state.frameAttribute.needsUpdate = true
          if (mesh.boundingSphere) mesh.boundingSphere.copy(bounds)
          else mesh.boundingSphere = bounds.clone()
        }
        spatialBoundsValid = selectedCount > 0 && Number.isFinite(bounds.radius)
        root.visible = selectedCount > 0
        root.userData.authoredZombieInstances.activeCount = selectedCount
      },
    }
    ownershipTransferred = true
    return presentation
  } finally {
    if (!ownershipTransferred) {
      disposeBakedMeshes(bakedMeshes)
      for (let index = bakedMeshes.length; index < bakedTextureSets.length; index += 1) {
        disposeBakedTextureSet(bakedTextureSets[index]!)
      }
    }
  }
}

function* bakeAnimationTextureSteps({
  attackClip,
  deathClip,
  runClip,
  samplerMeshes,
  samplerRoot,
  walkClip,
}: {
  attackClip: AnimationClip | null
  deathClip: AnimationClip | null
  runClip: AnimationClip | null
  samplerMeshes: readonly SkinnedMesh[]
  samplerRoot: Group
  walkClip: AnimationClip | null
}): Generator<void, BakedTextureSet[], void> {
  for (const sourceMesh of samplerMeshes) assertSkinnedGeometry(sourceMesh.geometry)
  const sets: BakedTextureSet[] = []
  let completed = false
  let mixer: AnimationMixer | null = null
  try {
    for (let meshIndex = 0; meshIndex < samplerMeshes.length; meshIndex += 1) {
      yield
      const set = createBakedTextureSet(samplerMeshes[meshIndex]!)
      sets.push(set)
      yield
      captureBakedTextureFrame(samplerMeshes[meshIndex]!, set, 0)
      updateBaseGeometryFromTexture(set)
    }
    mixer = new AnimationMixer(samplerRoot)
    const walkAction = createLocomotionAction(mixer, walkClip, samplerRoot)
    const runAction = createLocomotionAction(mixer, runClip, samplerRoot)
    const attackAction = createLocomotionAction(mixer, attackClip, samplerRoot)
    const deathAction = createOneShotAction(mixer, deathClip, samplerRoot)
    for (let frame = 0; frame < ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT; frame += 1) {
      yield
      sampleAnimationClip({
        activeAction: walkAction,
        activeClip: walkClip,
        inactiveAction: runAction,
        secondaryInactiveAction: attackAction,
        tertiaryInactiveAction: deathAction,
        mixer,
        normalizedTime: frame / ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT,
        samplerRoot,
      })
      for (let meshIndex = 0; meshIndex < samplerMeshes.length; meshIndex += 1) {
        captureBakedTextureFrame(samplerMeshes[meshIndex]!, sets[meshIndex]!, 1 + frame)
      }
    }
    for (let frame = 0; frame < ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT; frame += 1) {
      yield
      sampleAnimationClip({
        activeAction: runAction,
        activeClip: runClip,
        inactiveAction: walkAction,
        secondaryInactiveAction: attackAction,
        tertiaryInactiveAction: deathAction,
        mixer,
        normalizedTime: frame / ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT,
        samplerRoot,
      })
      for (let meshIndex = 0; meshIndex < samplerMeshes.length; meshIndex += 1) {
        captureBakedTextureFrame(
          samplerMeshes[meshIndex]!,
          sets[meshIndex]!,
          1 + ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT + frame,
        )
      }
    }
    for (let frame = 0; frame < ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT; frame += 1) {
      yield
      sampleAnimationClip({
        activeAction: attackAction,
        activeClip: attackClip,
        inactiveAction: walkAction,
        mixer,
        normalizedTime: frame / (ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT - 1),
        samplerRoot,
        secondaryInactiveAction: runAction,
        tertiaryInactiveAction: deathAction,
      })
      for (let meshIndex = 0; meshIndex < samplerMeshes.length; meshIndex += 1) {
        captureBakedTextureFrame(
          samplerMeshes[meshIndex]!,
          sets[meshIndex]!,
          1 + ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT * 2 + frame,
        )
      }
    }
    for (let frame = 0; frame < ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT; frame += 1) {
      yield
      sampleAnimationClip({
        activeAction: deathAction,
        activeClip: deathClip,
        inactiveAction: walkAction,
        mixer,
        normalizedTime: frame / (ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT - 1),
        samplerRoot,
        secondaryInactiveAction: runAction,
        tertiaryInactiveAction: attackAction,
      })
      for (let meshIndex = 0; meshIndex < samplerMeshes.length; meshIndex += 1) {
        captureBakedTextureFrame(
          samplerMeshes[meshIndex]!,
          sets[meshIndex]!,
          1 + ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT * 3 + frame,
        )
      }
    }
    for (const set of sets) set.texture.needsUpdate = true
    completed = true
    return sets
  } finally {
    mixer?.stopAllAction()
    mixer?.uncacheRoot(samplerRoot)
    if (!completed) {
      for (const set of sets) disposeBakedTextureSet(set)
    }
  }
}

function createBakedTextureSet(sourceMesh: SkinnedMesh): BakedTextureSet {
  const vertexCount = sourceMesh.geometry.getAttribute('position').count
  const texelsPerFrame = vertexCount * ZOMBIE_ESCAPE_AUTHORED_TEXTURE_FETCHES_PER_VERTEX
  const width = Math.min(ZOMBIE_ESCAPE_AUTHORED_BAKED_TEXTURE_WIDTH, texelsPerFrame)
  const height = Math.ceil(texelsPerFrame / width)
  const data = new Uint16Array(width * height * 4 * ZOMBIE_ESCAPE_AUTHORED_BAKED_TOTAL_FRAME_COUNT)
  const texture = new DataArrayTexture(
    data,
    width,
    height,
    ZOMBIE_ESCAPE_AUTHORED_BAKED_TOTAL_FRAME_COUNT,
  )
  texture.type = HalfFloatType
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.generateMipmaps = false
  const baseGeometry = sourceMesh.geometry.clone()
  baseGeometry.deleteAttribute('skinIndex')
  baseGeometry.deleteAttribute('skinWeight')
  return { baseGeometry, data, height, texture, vertexCount, width }
}

function captureBakedTextureFrame(
  sourceMesh: SkinnedMesh,
  textureSet: BakedTextureSet,
  frameIndex: number,
) {
  const sourceNormal = sourceMesh.geometry.getAttribute('normal')
  const position = new Vector3()
  const normal = new Vector4()
  const layerOffset = frameIndex * textureSet.width * textureSet.height * 4
  for (let vertex = 0; vertex < textureSet.vertexCount; vertex += 1) {
    sourceMesh.getVertexPosition(vertex, position)
    normal.set(sourceNormal.getX(vertex), sourceNormal.getY(vertex), sourceNormal.getZ(vertex), 0)
    sourceMesh.applyBoneTransform(vertex, normal)
    normal.normalize()
    const positionOffset = layerOffset + vertex * 8
    textureSet.data[positionOffset] = encodeZombieEscapeBakedTextureComponent(position.x)
    textureSet.data[positionOffset + 1] = encodeZombieEscapeBakedTextureComponent(position.y)
    textureSet.data[positionOffset + 2] = encodeZombieEscapeBakedTextureComponent(position.z)
    textureSet.data[positionOffset + 4] = encodeZombieEscapeBakedTextureComponent(normal.x)
    textureSet.data[positionOffset + 5] = encodeZombieEscapeBakedTextureComponent(normal.y)
    textureSet.data[positionOffset + 6] = encodeZombieEscapeBakedTextureComponent(normal.z)
  }
}

function updateBaseGeometryFromTexture(textureSet: BakedTextureSet) {
  const positions = new Float32Array(textureSet.vertexCount * 3)
  const normals = new Float32Array(textureSet.vertexCount * 3)
  for (let vertex = 0; vertex < textureSet.vertexCount; vertex += 1) {
    const textureOffset = vertex * 8
    const attributeOffset = vertex * 3
    positions[attributeOffset] = DataUtils.fromHalfFloat(textureSet.data[textureOffset]!)
    positions[attributeOffset + 1] = DataUtils.fromHalfFloat(textureSet.data[textureOffset + 1]!)
    positions[attributeOffset + 2] = DataUtils.fromHalfFloat(textureSet.data[textureOffset + 2]!)
    normals[attributeOffset] = DataUtils.fromHalfFloat(textureSet.data[textureOffset + 4]!)
    normals[attributeOffset + 1] = DataUtils.fromHalfFloat(textureSet.data[textureOffset + 5]!)
    normals[attributeOffset + 2] = DataUtils.fromHalfFloat(textureSet.data[textureOffset + 6]!)
  }
  textureSet.baseGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  textureSet.baseGeometry.setAttribute('normal', new Float32BufferAttribute(normals, 3))
  textureSet.baseGeometry.computeBoundingBox()
  textureSet.baseGeometry.computeBoundingSphere()
}

function createBakedMeshState({
  instanceCapacity,
  modelMatrix,
  rootWorldInverse,
  sourceMesh,
  textureSet,
  variantIndex,
}: {
  instanceCapacity: number
  modelMatrix: Matrix4
  rootWorldInverse: Matrix4
  sourceMesh: SkinnedMesh
  textureSet: BakedTextureSet
  variantIndex: number
}): BakedMeshState {
  const frameAttribute = new InstancedBufferAttribute(new Float32Array(instanceCapacity), 1)
  frameAttribute.setUsage(DynamicDrawUsage)
  textureSet.baseGeometry.setAttribute(ZOMBIE_ESCAPE_AUTHORED_FRAME_ATTRIBUTE, frameAttribute)
  const nodes = createBakedVertexNodes(textureSet)
  const sourceMaterials = Array.isArray(sourceMesh.material)
    ? sourceMesh.material
    : [sourceMesh.material]
  const materials: MeshStandardNodeMaterial[] = []
  let mesh: InstancedMesh | null = null
  try {
    for (const sourceMaterial of sourceMaterials) {
      materials.push(
        createAuthoredCrowdMaterial({
          nodes,
          source: sourceMaterial,
          variantIndex,
        }),
      )
    }
    const material = Array.isArray(sourceMesh.material) ? materials : materials[0]!
    mesh = new InstancedMesh(textureSet.baseGeometry, material, instanceCapacity)
    mesh.castShadow = false
    mesh.count = 0
    mesh.frustumCulled = true
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    mesh.receiveShadow = false
    mesh.boundingSphere = new Sphere()
    mesh.visible = false
    mesh.userData.authoredZombieCrowdLod = {
      bakedFrameCount: ZOMBIE_ESCAPE_AUTHORED_BAKED_TOTAL_FRAME_COUNT,
      bakedTextureFormat: 'rgba16float',
      textureFetchesPerVertex: ZOMBIE_ESCAPE_AUTHORED_TEXTURE_FETCHES_PER_VERTEX,
      textureHeight: textureSet.height,
      textureWidth: textureSet.width,
      variantIndex,
    }
    return {
      frameAttribute,
      materials,
      mesh,
      meshToRoot: modelMatrix.clone().multiply(rootWorldInverse).multiply(sourceMesh.matrixWorld),
      textureSet,
      vertexCount: textureSet.vertexCount,
    }
  } catch (error) {
    mesh?.dispose()
    for (const material of materials) material.dispose()
    throw error
  }
}

function createBakedVertexNodes(textureSet: BakedTextureSet): BakedVertexNodes {
  const frame = int(attribute<'float'>(ZOMBIE_ESCAPE_AUTHORED_FRAME_ATTRIBUTE, 'float'))
  const positionTexel = int(vertexIndex).mul(ZOMBIE_ESCAPE_AUTHORED_TEXTURE_FETCHES_PER_VERTEX)
  const normalTexel = positionTexel.add(1)
  const positionRow = positionTexel.div(textureSet.width)
  const normalRow = normalTexel.div(textureSet.width)
  const positionColumn = positionTexel.sub(positionRow.mul(textureSet.width))
  const normalColumn = normalTexel.sub(normalRow.mul(textureSet.width))
  return {
    normal: textureLoad(textureSet.texture, ivec2(normalColumn, normalRow)).depth(frame).xyz,
    position: textureLoad(textureSet.texture, ivec2(positionColumn, positionRow)).depth(frame).xyz,
  }
}

function createAuthoredCrowdMaterial({
  nodes,
  source,
  variantIndex,
}: {
  nodes: BakedVertexNodes
  source: Material
  variantIndex: number
}) {
  if (!isStandardMaterial(source)) {
    throw new Error(`Authored zombie crowd material ${source.type} is not a standard PBR material.`)
  }
  const material = new ZombieEscapeBakedNodeMaterial(nodes)
  try {
    material.copy(source as unknown as MeshStandardNodeMaterial)
    material.colorNode = createAuthoredCrowdColorNode()
    material.userData = {
      ...material.userData,
      authoredZombieCrowdLod: 'baked-texture-instanced',
      crowdMaterialMode: 'authored-texture-grade',
      variantIndex,
    }
    return material
  } catch (error) {
    material.dispose()
    throw error
  }
}

function createAuthoredCrowdColorNode() {
  const sourceColor = materialColor as unknown as TSLNode<'vec4'>
  const sourceRgb = sourceColor.rgb
  const luminance = sourceRgb.dot(vec3(0.2126, 0.7152, 0.0722))
  const warmTone = smoothstep(0.015, 0.16, sourceRgb.r.sub(sourceRgb.b))
  const visibleTone = smoothstep(0.075, 0.32, luminance)
  const notNearWhite = smoothstep(0.72, 0.96, luminance).oneMinus()
  const skinCandidate = warmTone.mul(visibleTone).mul(notNearWhite)
  const corpseTone = mix(asVec3(color('#315f5b')), asVec3(color('#abc39f')), luminance.clamp(0, 1))
  const corpseAmount = skinCandidate.mul(0.48).add(0.38).clamp(0, 1)
  const gradedRgb = mix(sourceRgb, corpseTone, corpseAmount)
  return vec4(gradedRgb, sourceColor.a)
}

function sampleAnimationClip({
  activeAction,
  activeClip,
  inactiveAction,
  mixer,
  normalizedTime,
  samplerRoot,
  secondaryInactiveAction,
  tertiaryInactiveAction,
}: {
  activeAction: AnimationAction | null
  activeClip: AnimationClip | null
  inactiveAction: AnimationAction | null
  mixer: AnimationMixer
  normalizedTime: number
  samplerRoot: Group
  secondaryInactiveAction: AnimationAction | null
  tertiaryInactiveAction: AnimationAction | null
}) {
  inactiveAction?.setEffectiveWeight(0)
  secondaryInactiveAction?.setEffectiveWeight(0)
  tertiaryInactiveAction?.setEffectiveWeight(0)
  if (activeAction && activeClip) {
    activeAction.time = normalizedTime * activeClip.duration
    activeAction.setEffectiveWeight(1)
  }
  mixer.update(0)
  samplerRoot.updateMatrixWorld(true)
}

function createLocomotionAction(mixer: AnimationMixer, clip: AnimationClip | null, root: Group) {
  if (!clip) return null
  const action = mixer.clipAction(clip, root)
  action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY)
  action.play()
  return action
}

function createOneShotAction(mixer: AnimationMixer, clip: AnimationClip | null, root: Group) {
  if (!clip) return null
  const action = mixer.clipAction(clip, root)
  action.setLoop(LoopOnce, 1)
  action.clampWhenFinished = true
  action.play()
  return action
}

function updateBatchBounds(
  target: Sphere,
  minimumX: number,
  minimumY: number,
  minimumZ: number,
  maximumX: number,
  maximumY: number,
  maximumZ: number,
) {
  target.center.set(
    (minimumX + maximumX) * 0.5,
    (minimumY + maximumY) * 0.5 + 1,
    (minimumZ + maximumZ) * 0.5,
  )
  const halfX = (maximumX - minimumX) * 0.5
  const halfY = (maximumY - minimumY) * 0.5 + 1
  const halfZ = (maximumZ - minimumZ) * 0.5
  target.radius =
    Math.hypot(halfX, halfY, halfZ) + ZOMBIE_ESCAPE_AUTHORED_BATCH_BOUNDS_PADDING_METERS
}

function assertSkinnedGeometry(geometry: BufferGeometry) {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const skinIndex = geometry.getAttribute('skinIndex')
  const skinWeight = geometry.getAttribute('skinWeight')
  if (!(position && normal && skinIndex && skinWeight)) {
    throw new Error('Authored zombie skinned geometry is missing required vertex attributes.')
  }
}

function disposeBakedTextureSet(set: BakedTextureSet) {
  set.texture.dispose()
  set.baseGeometry.dispose()
}

function disposeBakedMeshes(states: readonly BakedMeshState[]) {
  for (const state of states) {
    state.mesh.dispose()
    disposeBakedTextureSet(state.textureSet)
    for (const material of state.materials) material.dispose()
  }
}

function asVec3(node: unknown) {
  return node as TSLNode<'vec3'>
}

function isStandardMaterial(material: Material): material is MeshStandardMaterial {
  return 'isMeshStandardMaterial' in material && material.isMeshStandardMaterial === true
}

function resolveAuthoredMotion(
  locomotionBlend: number,
  runBlend: number,
  attackActive: boolean,
  deathActive: boolean,
): ZombieEscapeAuthoredMotion {
  if (deathActive) return 'death'
  if (attackActive) return 'attack'
  if (clamp01(locomotionBlend) < 0.1) return 'idle'
  return clamp01(runBlend) >= 0.5 ? 'run' : 'walk'
}

function resolveNearestCyclicBakedFrame(phase: number) {
  const normalizedPhase = positiveModulo(phase, TWO_PI) / TWO_PI
  return (
    Math.floor(normalizedPhase * ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT + 0.5) %
    ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT
  )
}

function resolveNearestNormalizedBakedFrame(phase: number) {
  return Math.round(clamp01(phase) * (ZOMBIE_ESCAPE_AUTHORED_BAKED_FRAME_COUNT - 1))
}

function assertVariantIndex(variantIndex: number) {
  if (!(Number.isSafeInteger(variantIndex) && variantIndex >= 0 && variantIndex <= 255)) {
    throw new Error(
      `Zombie variant index must be an integer from 0 to 255; received ${String(variantIndex)}.`,
    )
  }
}

function throwIfZombieEscapeAuthoredBuildAborted(signal: AbortSignal | undefined) {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  const error = new Error('Zombie authored presentation build was aborted.')
  error.name = 'AbortError'
  throw error
}

function waitForZombieEscapeAuthoredBuildSlice(
  waitForBuildSlice: () => Promise<void>,
  signal: AbortSignal | undefined,
) {
  if (!signal) return waitForBuildSlice()
  throwIfZombieEscapeAuthoredBuildAborted(signal)
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = () => {
      if (settled) return false
      settled = true
      signal.removeEventListener('abort', handleAbort)
      return true
    }
    const handleAbort = () => {
      if (!finish()) return
      try {
        throwIfZombieEscapeAuthoredBuildAborted(signal)
      } catch (error) {
        reject(error)
      }
    }
    signal.addEventListener('abort', handleAbort, { once: true })
    if (signal.aborted) {
      handleAbort()
      return
    }
    void Promise.resolve()
      .then(waitForBuildSlice)
      .then(
        () => {
          if (finish()) resolve()
        },
        (error: unknown) => {
          if (finish()) reject(error)
        },
      )
  })
}

function clamp01(value: number) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
}

function positiveModulo(value: number, divisor: number) {
  if (!Number.isFinite(value)) return 0
  return ((value % divisor) + divisor) % divisor
}
