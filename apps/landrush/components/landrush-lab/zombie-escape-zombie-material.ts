import {
  type BufferGeometry,
  type Material,
  type MeshPhysicalMaterial,
  type MeshStandardMaterial,
  type Texture,
  Vector3,
} from 'three'
import {
  color,
  float,
  fwidth,
  materialColor,
  materialEmissive,
  materialReference,
  mix,
  mx_noise_float,
  positionGeometry,
  positionWorld,
  smoothstep,
  uniform,
  vec3,
  vec4,
  vertexColor,
} from 'three/tsl'
import {
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  type Node as TSLNode,
} from 'three/webgpu'
import {
  LANDRUSH_ROBOT_SHOULDER_TORCH_CONE_ANGLE,
  LANDRUSH_ROBOT_SHOULDER_TORCH_DISTANCE,
  LANDRUSH_ROBOT_SHOULDER_TORCH_PENUMBRA,
  type LandrushRobotShoulderTorchLightingState,
} from './landrush-robot-shoulder-torch'

export type ZombieEscapeZombieMaterialDebugMode =
  | 'final'
  | 'mottle'
  | 'roughness'
  | 'tissue'
  | 'veins'

export type ZombieEscapeZombieShader = Readonly<{
  createMaterial: (source: Material, geometry: BufferGeometry, seed: number) => Material
  debugMode: ZombieEscapeZombieMaterialDebugMode
  getPhaseAmount: () => number
  getOutsideTorchVisibility: () => number
  setTorchLighting: (state: Readonly<LandrushRobotShoulderTorchLightingState> | null) => void
  setPhaseAmount: (amount: number) => void
}>

type ZombieMaterialBounds = Readonly<{
  halfWidth: number
  height: number
  minY: number
}>

type ZombieFloatNode = TSLNode<'float'>
type ZombieVec3Node = TSLNode<'vec3'>
type ZombieVec4Node = TSLNode<'vec4'>
type ZombiePhaseUniformNode = ZombieFloatNode & { value: number }
type ZombieVec3UniformNode = ZombieVec3Node & { value: Vector3 }

type ZombieTorchFieldNodes = Readonly<{
  active: ZombieFloatNode
  direction: ZombieVec3Node
  origin: ZombieVec3Node
  outsideVisibility: ZombieFloatNode
}>

export function createZombieEscapeZombieShader({
  debugMode = 'final',
  outsideTorchVisibility = 1,
  phaseAmount = 0,
}: {
  debugMode?: ZombieEscapeZombieMaterialDebugMode
  outsideTorchVisibility?: number
  phaseAmount?: number
} = {}): ZombieEscapeZombieShader {
  const clampedInitialPhase = clampPhaseAmount(phaseAmount)
  const clampedOutsideTorchVisibility = clampPhaseAmount(outsideTorchVisibility)
  const phaseNode = uniform(clampedInitialPhase) as ZombiePhaseUniformNode
  const phaseUniform = { value: clampedInitialPhase }
  const torchActiveNode = uniform(0) as ZombiePhaseUniformNode
  const torchDirection = new Vector3(0, 0, 1)
  const torchDirectionNode = uniform(torchDirection) as ZombieVec3UniformNode
  const torchOrigin = new Vector3()
  const torchOriginNode = uniform(torchOrigin) as ZombieVec3UniformNode
  const outsideTorchVisibilityNode = uniform(
    clampedOutsideTorchVisibility,
  ) as ZombiePhaseUniformNode
  const torchFieldNodes: ZombieTorchFieldNodes | null =
    clampedOutsideTorchVisibility < 1
      ? {
          active: torchActiveNode,
          direction: torchDirectionNode,
          origin: torchOriginNode,
          outsideVisibility: outsideTorchVisibilityNode,
        }
      : null
  const untexturedFieldGraphs = new Map<string, ReturnType<typeof createZombieMaterialFieldGraph>>()
  const texturedFieldGraphs = new WeakMap<
    Texture,
    Map<string, ReturnType<typeof createZombieMaterialFieldGraph>>
  >()

  return {
    createMaterial(source, geometry, seed) {
      const clonedMaterial = source.clone()
      if (!isStandardMaterial(clonedMaterial)) return clonedMaterial

      const bounds = resolveMaterialBounds(geometry)
      const graphKey = createFieldGraphKey(bounds, seed, clonedMaterial.vertexColors)
      let fieldGraphs = untexturedFieldGraphs
      if (clonedMaterial.map) {
        fieldGraphs = texturedFieldGraphs.get(clonedMaterial.map) ?? new Map()
        texturedFieldGraphs.set(clonedMaterial.map, fieldGraphs)
      }
      let graph = fieldGraphs.get(graphKey)
      if (!graph) {
        graph = createZombieMaterialFieldGraph(
          bounds,
          seed,
          phaseNode,
          torchFieldNodes,
          debugMode,
          clonedMaterial.vertexColors,
        )
        fieldGraphs.set(graphKey, graph)
      }

      const material = isPhysicalMaterial(clonedMaterial)
        ? new MeshPhysicalNodeMaterial()
        : new MeshStandardNodeMaterial()
      try {
        material.copy(clonedMaterial as unknown as typeof material)
        material.vertexColors = false
        material.colorNode = graph.colorNode
        material.emissiveNode = graph.emissiveNode
        material.roughnessNode = graph.roughnessNode
        material.userData.zombieTextureShader = {
          debugMode,
          outsideTorchVisibility: clampedOutsideTorchVisibility,
          phaseScoped: true,
          seed,
          torchScoped: torchFieldNodes !== null,
        }
        clonedMaterial.dispose()
        return material
      } catch (error) {
        material.dispose()
        clonedMaterial.dispose()
        throw error
      }
    },
    debugMode,
    getPhaseAmount: () => phaseUniform.value,
    getOutsideTorchVisibility: () => outsideTorchVisibilityNode.value,
    setTorchLighting(state) {
      if (!state?.active) {
        torchActiveNode.value = 0
        return
      }
      torchOrigin.set(state.originX, state.originY, state.originZ)
      torchDirection
        .set(
          state.targetX - state.originX,
          state.targetY - state.originY,
          state.targetZ - state.originZ,
        )
        .normalize()
      torchActiveNode.value = 1
    },
    setPhaseAmount(amount) {
      const clampedAmount = clampPhaseAmount(amount)
      phaseUniform.value = clampedAmount
      phaseNode.value = clampedAmount
    },
  }
}

function createZombieMaterialFieldGraph(
  bounds: ZombieMaterialBounds,
  seed: number,
  phaseNode: ZombieFloatNode,
  torchFieldNodes: ZombieTorchFieldNodes | null,
  debugMode: ZombieEscapeZombieMaterialDebugMode,
  usesVertexColors: boolean,
) {
  const seedOffset = createSeedOffset(seed)
  const normalizedPosition = vec3(
    positionGeometry.x.div(bounds.height),
    positionGeometry.y.sub(bounds.minY).div(bounds.height),
    positionGeometry.z.div(bounds.height),
  )
  const broadCoordinates = normalizedPosition
    .mul(vec3(5.2, 4.4, 7.1))
    .add(vec3(seedOffset[0], seedOffset[1], seedOffset[2]))
  const detailCoordinates = normalizedPosition
    .mul(vec3(18.7, 15.3, 21.1))
    .add(vec3(seedOffset[2] + 7.3, seedOffset[0] + 19.1, seedOffset[1] + 31.7))
  const mottle = mx_noise_float(broadCoordinates).mul(0.5).add(0.5).clamp(0, 1)
  const veinDistance = mx_noise_float(detailCoordinates).abs()
  const veinAntialiasing = fwidth(veinDistance).mul(1.35).max(0.01)
  const veins = smoothstep(
    float(0.085).sub(veinAntialiasing),
    float(0.085).add(veinAntialiasing),
    veinDistance,
  ).oneMinus()

  const normalizedHeight = normalizedPosition.y.clamp(0, 1)
  const centerColumn = smoothstep(
    0.34,
    0.58,
    positionGeometry.x.abs().div(bounds.halfWidth),
  ).oneMinus()
  const head = smoothstep(0.58, 0.7, normalizedHeight).mul(centerColumn)
  const armReach = smoothstep(0.46, 0.78, positionGeometry.x.abs().div(bounds.halfWidth))
  const armBand = smoothstep(0.22, 0.38, normalizedHeight).mul(
    smoothstep(0.79, 0.9, normalizedHeight).oneMinus(),
  )
  const anatomy = head.max(armReach.mul(armBand))

  const authoredColor = materialColor as unknown as ZombieVec4Node
  const sourceColor = (
    usesVertexColors ? authoredColor.mul(vertexColor()) : authoredColor
  ) as ZombieVec4Node
  const sourceEmissive = materialEmissive as unknown as ZombieVec3Node
  const sourceRoughness = materialReference('roughness', 'float') as unknown as ZombieFloatNode
  const baseRgb = sourceColor.rgb
  const luminance = baseRgb.dot(vec3(0.2126, 0.7152, 0.0722))
  const warmTone = smoothstep(0.015, 0.16, baseRgb.r.sub(baseRgb.b))
  const greenSupport = smoothstep(-0.055, 0.1, baseRgb.g.sub(baseRgb.b))
  const visibleTone = smoothstep(0.075, 0.32, luminance)
  const notNearWhite = smoothstep(0.72, 0.96, luminance).oneMinus()
  const skinCandidate = warmTone.mul(greenSupport).mul(visibleTone).mul(notNearWhite)
  const upperBodySkin = skinCandidate.mul(smoothstep(0.46, 0.62, normalizedHeight))
  const tissue = anatomy.max(upperBodySkin.mul(1.6)).clamp(0, 1)
  const bruise = smoothstep(0.38, 0.7, mottle).mul(float(0.24).add(tissue.mul(0.76)))
  const vesselMask = veins
    .mul(float(0.18).add(tissue.mul(0.82)))
    .mul(float(0.42).add(mottle.mul(0.58)))

  const textureRetention = float(0.82).sub(tissue.mul(0.78))
  const cadaverTone = mix(asVec3(color('#6eada2')), asVec3(color('#b8c59f')), mottle)
  const corpseSurface = mix(cadaverTone, baseRgb, textureRetention).mul(
    float(0.88).add(mottle.mul(0.14)),
  )
  const bruisedSurface = mix(
    corpseSurface,
    asVec3(color('#70405f')),
    bruise.mul(float(0.2).add(tissue.mul(0.62))),
  )
  const zombieRgb = mix(bruisedSurface, asVec3(color('#381124')), vesselMask.mul(0.78))

  const dryTissue = float(0.055).add(mottle.mul(tissue).mul(0.2))
  const wetNecrosis = bruise.mul(vesselMask).mul(0.16)
  const zombieRoughness = sourceRoughness.add(dryTissue).sub(wetNecrosis).clamp(0.3, 1)
  let diagnosticRgb = vec3(zombieRgb)
  switch (debugMode) {
    case 'mottle':
      diagnosticRgb = vec3(mottle)
      break
    case 'roughness':
      diagnosticRgb = vec3(zombieRoughness)
      break
    case 'tissue':
      diagnosticRgb = vec3(mix(asVec3(color('#071019')), asVec3(color('#d9ff76')), tissue))
      break
    case 'veins':
      diagnosticRgb = vec3(mix(asVec3(color('#09050a')), asVec3(color('#ff2e63')), vesselMask))
      break
  }
  const zombieEmissive =
    debugMode === 'final'
      ? sourceEmissive.mul(float(0.68).sub(tissue.mul(0.52))).add(zombieRgb.mul(tissue).mul(0.06))
      : vec3(0)

  const phaseVisibility = torchFieldNodes
    ? createZombieTorchVisibilityNode(torchFieldNodes, phaseNode)
    : float(1)

  return {
    colorNode: vec4(mix(baseRgb, diagnosticRgb, phaseNode).mul(phaseVisibility), sourceColor.a),
    emissiveNode: mix(sourceEmissive, zombieEmissive, phaseNode).mul(phaseVisibility),
    roughnessNode: mix(sourceRoughness, zombieRoughness, phaseNode),
  }
}

function createZombieTorchVisibilityNode(
  torchFieldNodes: ZombieTorchFieldNodes,
  phaseNode: ZombieFloatNode,
) {
  const torchOffset = positionWorld.sub(torchFieldNodes.origin)
  const distanceAlongBeam = torchOffset.dot(torchFieldNodes.direction)
  const radialDistance = torchOffset.sub(torchFieldNodes.direction.mul(distanceAlongBeam)).length()
  const outerConeRadius = distanceAlongBeam
    .max(0)
    .mul(Math.tan(LANDRUSH_ROBOT_SHOULDER_TORCH_CONE_ANGLE))
    .add(0.02)
  const innerConeRadius = distanceAlongBeam
    .max(0)
    .mul(
      Math.tan(
        LANDRUSH_ROBOT_SHOULDER_TORCH_CONE_ANGLE * (1 - LANDRUSH_ROBOT_SHOULDER_TORCH_PENUMBRA),
      ),
    )
    .add(0.02)
  const insideCone = smoothstep(innerConeRadius, outerConeRadius, radialDistance).oneMinus()
  const insideNearPlane = smoothstep(0, 0.18, distanceAlongBeam)
  const insideFarPlane = smoothstep(
    LANDRUSH_ROBOT_SHOULDER_TORCH_DISTANCE - 0.8,
    LANDRUSH_ROBOT_SHOULDER_TORCH_DISTANCE,
    distanceAlongBeam,
  ).oneMinus()
  const torchVisibility = insideCone
    .mul(insideNearPlane)
    .mul(insideFarPlane)
    .mul(torchFieldNodes.active)
  const zombieNightVisibility = mix(torchFieldNodes.outsideVisibility, float(1), torchVisibility)
  return mix(float(1), zombieNightVisibility, phaseNode)
}

function resolveMaterialBounds(geometry: BufferGeometry): ZombieMaterialBounds {
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  const bounds = geometry.boundingBox
  if (!bounds) return { halfWidth: 1, height: 1, minY: 0 }
  return {
    halfWidth: Math.max(0.0001, Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
    height: Math.max(0.0001, bounds.max.y - bounds.min.y),
    minY: bounds.min.y,
  }
}

function createFieldGraphKey(
  bounds: ZombieMaterialBounds,
  seed: number,
  usesVertexColors: boolean,
) {
  return `${seed}:${bounds.minY.toFixed(5)}:${bounds.height.toFixed(5)}:${bounds.halfWidth.toFixed(5)}:${usesVertexColors ? 1 : 0}`
}

function createSeedOffset(seed: number): readonly [number, number, number] {
  const normalizedSeed = Math.abs(Math.trunc(seed)) + 1
  return [
    seededFraction(normalizedSeed * 12.9898) * 37,
    seededFraction(normalizedSeed * 78.233) * 41,
    seededFraction(normalizedSeed * 39.425) * 43,
  ]
}

function seededFraction(value: number) {
  const result = Math.sin(value) * 43_758.5453
  return result - Math.floor(result)
}

function clampPhaseAmount(amount: number) {
  if (!Number.isFinite(amount)) return 0
  return Math.min(1, Math.max(0, amount))
}

function asVec3(node: unknown) {
  return node as ZombieVec3Node
}

function isStandardMaterial(material: Material): material is MeshStandardMaterial {
  return 'isMeshStandardMaterial' in material && material.isMeshStandardMaterial === true
}

function isPhysicalMaterial(material: Material): material is MeshPhysicalMaterial {
  return 'isMeshPhysicalMaterial' in material && material.isMeshPhysicalMaterial === true
}
