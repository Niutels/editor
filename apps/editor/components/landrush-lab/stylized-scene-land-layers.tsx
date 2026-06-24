'use client'

import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  type BufferGeometry,
  DoubleSide,
  type Group,
  InstancedBufferAttribute,
  type InstancedMesh,
  type Mesh,
  MeshStandardMaterial,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three'
import {
  attribute,
  cameraPosition,
  float,
  hash,
  mix,
  mx_noise_float,
  positionLocal,
  positionWorld,
  pow,
  clamp as tslClamp,
  color as tslColor,
  texture as tslTexture,
  vec2,
  vec3,
} from 'three/tsl'
import { MeshStandardNodeMaterial, type Node as TSLNode } from 'three/webgpu'
import type { LandrushPoint2, LandrushRoadSegment } from '@/components/landrush/types'
import type { GrassBladeTuning } from './grass-material'

type StylizedSceneLandLayerProps = {
  elevation: number
  grassInteractionRef?: StylizedGrassInteractionRef
  roads?: readonly LandrushRoadSegment[]
  showBlades?: boolean
  showTrees?: boolean
  surfacePoints?: readonly LandrushPoint2[]
  tuning?: GrassBladeTuning
}

type StylizedSceneTreeProps = {
  elevation: number
  position: [number, number, number]
  rotationY: number
  scale: number
}

type BushInstance = {
  pos: [number, number, number]
  scale: number
  yaw: number
}

type StylizedGrassRoadSpan = {
  end: { x: number; z: number }
  halfWidth: number
  maxX: number
  maxZ: number
  minX: number
  minZ: number
  start: { x: number; z: number }
}

type StylizedGrassRoadGrid = {
  cells: StylizedGrassRoadSpan[][]
  cellsPerAxis: number
  fieldSize: number
}

type StylizedSceneResolvedGrassTuning = {
  colorPatchScale: number
  colorVariation: number
  density: number
  flutter: number
  gustScale: number
  heightNoiseScale: number
  heightVariation: number
  macroScale: number
  macroVariation: number
  projection: number
  scale: number
  treeSway: number
  turbulence: number
  windAngle: number
  windSpeed: number
  windStrength: number
}

type StylizedGrassInstance = {
  heightFactor: number
  seed: number
  x: number
  yaw: number
  z: number
}

export type StylizedGrassInteraction = {
  radius: number
  speed: number
  x: number
  z: number
}

export type StylizedGrassInteractionRef = {
  current: StylizedGrassInteraction | null
}

const STYLIZED_SCENE_BASE = '/landrush-lab/stylized-scene'
const STYLIZED_SCENE_FIELD_SIZE = 132
const STYLIZED_SCENE_REFERENCE_FIELD_SIZE = 40
const STYLIZED_SCENE_STREAM_SIZE = 44
const STYLIZED_SCENE_BASE_STREAM_RADIUS = STYLIZED_SCENE_STREAM_SIZE / 2
const STYLIZED_SCENE_STREAM_RADIUS = STYLIZED_SCENE_BASE_STREAM_RADIUS * 3
const STYLIZED_SCENE_STREAM_CELL_SIZE = 1
const STYLIZED_SCENE_STREAM_UPDATE_METERS = 3
const STYLIZED_SCENE_MAX_GRASS_INSTANCES = 60_000
const STYLIZED_SCENE_GRASS_DENSITY = 5000
const STYLIZED_SCENE_GRASS_SCALE = 1.3
const STYLIZED_SCENE_GRASS_HEIGHT_SCALE = 0.5
const STYLIZED_SCENE_GRASS_SEED = 15_173
const STYLIZED_SCENE_INTERACTION_FULL_SPEED = 5.8
const STYLIZED_SCENE_INTERACTION_MAX_BEND = 0.26
const STYLIZED_SCENE_PATH_CLEARANCE_METERS = 0.48
const STYLIZED_SCENE_PATH_EDGE_JITTER_METERS = 0.22
const STYLIZED_SCENE_PATH_WIDTH_SCALE = 1.08
const STYLIZED_SCENE_TEXTURE_REPEAT = 8
const STYLIZED_TREE_TRUNK_SCALE = 12

const STYLIZED_SCENE_DEFAULT_TUNING: StylizedSceneResolvedGrassTuning = {
  colorPatchScale: 0.7,
  colorVariation: 0.5,
  density: STYLIZED_SCENE_GRASS_DENSITY,
  flutter: 0.28,
  gustScale: 0.5,
  heightNoiseScale: 0.15,
  heightVariation: 1,
  macroScale: 0.115,
  macroVariation: 0.48,
  projection: 0.74,
  scale: STYLIZED_SCENE_GRASS_SCALE,
  treeSway: 0.7,
  turbulence: 0.28,
  windAngle: 45,
  windSpeed: 2,
  windStrength: 0.25,
}

const STYLIZED_SCENE_PATHS = {
  grassBlades: `${STYLIZED_SCENE_BASE}/grass-blades-up.glb`,
  grassTexture: `${STYLIZED_SCENE_BASE}/grass_texture/grass_05_basecolor_1k.webp`,
  leavesAlpha: `${STYLIZED_SCENE_BASE}/leaves-alpha-map.png`,
  pathMask: `${STYLIZED_SCENE_BASE}/path.webp`,
  treeLeaves: `${STYLIZED_SCENE_BASE}/tree-leaves-mesh.glb`,
  treeTrunk: `${STYLIZED_SCENE_BASE}/tree-tronk-transformed.glb`,
} as const

type StylizedGrassRenderCenter = {
  x: number
  z: number
}

type StylizedOrbitControls = {
  target?: { x: number; z: number }
}

const STYLIZED_TREE_LAYOUT: readonly {
  position: [number, number, number]
  rotationY: number
  scale: number
}[] = [
  { position: [13, 0, -13], rotationY: 0, scale: 1 },
  { position: [-13, 0, -13], rotationY: 2.1, scale: 0.9 },
  { position: [-13, 0, 13], rotationY: 4, scale: 1.1 },
  { position: [13, 0, 13], rotationY: 1, scale: 0.95 },
]

const STYLIZED_TREE_BUSHES: readonly BushInstance[] = [
  { pos: [-0.47, 7.59, 0.48], yaw: 0, scale: 0.85 },
  { pos: [-3.87, 6.79, -4.47], yaw: 1.3, scale: 0.76 },
  { pos: [-2.08, 10.5, 0.18], yaw: 2.5, scale: 0.9 },
]

export function StylizedSceneLandLayer({
  elevation,
  grassInteractionRef,
  roads = [],
  showBlades = true,
  showTrees = true,
  surfacePoints = [],
  tuning,
}: StylizedSceneLandLayerProps) {
  return (
    <>
      {showBlades ? (
        <StylizedSceneGrassLayer
          elevation={elevation}
          interactionRef={grassInteractionRef}
          roads={roads}
          surfacePoints={surfacePoints}
          tuning={tuning}
        />
      ) : null}
      {showTrees
        ? STYLIZED_TREE_LAYOUT.map((tree, index) => (
            <StylizedSceneTree
              elevation={elevation}
              key={`${tree.position.join(':')}:${index}`}
              position={tree.position}
              rotationY={tree.rotationY}
              scale={tree.scale}
              tuning={tuning}
            />
          ))
        : null}
    </>
  )
}

function StylizedSceneGrassLayer({
  elevation,
  interactionRef,
  roads,
  surfacePoints,
  tuning,
}: {
  elevation: number
  interactionRef?: StylizedGrassInteractionRef
  roads: readonly LandrushRoadSegment[]
  surfacePoints: readonly LandrushPoint2[]
  tuning?: GrassBladeTuning
}) {
  const { scene } = useGLTF(STYLIZED_SCENE_PATHS.grassBlades)
  const pathMask = useTexture(STYLIZED_SCENE_PATHS.pathMask) as Texture
  const grassTexture = useTexture(STYLIZED_SCENE_PATHS.grassTexture) as Texture
  const resolvedTuning = useMemo(() => resolveStylizedSceneTuning(tuning), [tuning])
  const geometry = useMemo(() => {
    const extractedGeometry = extractFirstMeshGeometry(scene)
    return extractedGeometry ? withStylizedGrassInstanceAttributes(extractedGeometry) : null
  }, [scene])
  const pathMaskData = useMemo(() => extractImageData(pathMask), [pathMask])
  const roadGrid = useMemo(
    () => createStylizedGrassRoadGrid(roads, STYLIZED_SCENE_FIELD_SIZE),
    [roads],
  )
  const renderCenter = useStylizedGrassRenderCenter()
  const instances = useMemo(
    () =>
      createStylizedGrassInstances({
        pathMaskData,
        renderCenter,
        roadGrid,
        surfacePoints,
        tuning: resolvedTuning,
      }),
    [pathMaskData, renderCenter, roadGrid, resolvedTuning, surfacePoints],
  )
  const material = useMemo(
    () => createStylizedGrassNodeMaterial(geometry, grassTexture, resolvedTuning),
    [geometry, grassTexture, resolvedTuning],
  )
  const meshRef = useRef<InstancedMesh>(null!)
  const dummyRef = useRef(new Object3D())

  useEffect(() => {
    grassTexture.colorSpace = SRGBColorSpace
    grassTexture.wrapS = RepeatWrapping
    grassTexture.wrapT = RepeatWrapping
    grassTexture.needsUpdate = true
  }, [grassTexture])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh || !geometry) return

    applyStylizedGrassMatrices(
      mesh,
      instances,
      resolvedTuning,
      dummyRef.current,
      0,
      interactionRef?.current ?? null,
    )
    applyStylizedGrassInstanceAttributes(geometry, instances)
    mesh.count = instances.length
    mesh.instanceMatrix.needsUpdate = true
  }, [geometry, instances, interactionRef, resolvedTuning])

  useFrame(({ clock }) => {
    const mesh = meshRef.current
    if (!mesh || instances.length === 0) return
    applyStylizedGrassMatrices(
      mesh,
      instances,
      resolvedTuning,
      dummyRef.current,
      clock.elapsedTime,
      interactionRef?.current ?? null,
    )
    mesh.instanceMatrix.needsUpdate = true
  })

  useEffect(
    () => () => {
      geometry?.dispose()
      material?.dispose()
    },
    [geometry, material],
  )

  if (!geometry || !material) return null

  return (
    <instancedMesh
      args={[geometry, material, STYLIZED_SCENE_MAX_GRASS_INSTANCES]}
      frustumCulled={false}
      position={[0, elevation + 0.03, 0]}
      receiveShadow
      ref={meshRef}
      renderOrder={14}
    />
  )
}

function StylizedSceneTree({
  elevation,
  position,
  rotationY,
  scale,
  tuning,
}: StylizedSceneTreeProps & { tuning?: GrassBladeTuning }) {
  const treeRef = useRef<Group>(null)
  const { scene: leavesScene } = useGLTF(STYLIZED_SCENE_PATHS.treeLeaves)
  const { scene: trunkScene } = useGLTF(STYLIZED_SCENE_PATHS.treeTrunk)
  const alphaMap = useTexture(STYLIZED_SCENE_PATHS.leavesAlpha) as Texture
  const leavesGeometry = useMemo(() => extractFirstMeshGeometry(leavesScene), [leavesScene])
  const trunk = useMemo(() => {
    const clone = trunkScene.clone(true)
    clone.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
    return clone
  }, [trunkScene])
  const leavesMaterial = useMemo(() => {
    alphaMap.flipY = false
    alphaMap.needsUpdate = true
    return new MeshStandardMaterial({
      alphaMap,
      alphaTest: 0.1,
      color: '#4a6b27',
      metalness: 0,
      roughness: 0.8,
      side: DoubleSide,
    })
  }, [alphaMap])
  const bushesRef = useRef<InstancedMesh>(null!)
  const resolvedTuning = useMemo(() => resolveStylizedSceneTuning(tuning), [tuning])

  useMemo(() => {
    if (!leavesGeometry) return
    const origin = new Float32Array(STYLIZED_TREE_BUSHES.length * 2)
    const facing = new Float32Array(STYLIZED_TREE_BUSHES.length * 2)
    for (let index = 0; index < STYLIZED_TREE_BUSHES.length; index += 1) {
      const bush = STYLIZED_TREE_BUSHES[index]!
      origin[index * 2] = position[0] + bush.pos[0]
      origin[index * 2 + 1] = position[2] + bush.pos[2]
      facing[index * 2] = Math.cos(bush.yaw)
      facing[index * 2 + 1] = Math.sin(bush.yaw)
    }
    leavesGeometry.setAttribute('aOrigin', new InstancedBufferAttribute(origin, 2))
    leavesGeometry.setAttribute('aFacing', new InstancedBufferAttribute(facing, 2))
  }, [leavesGeometry, position])

  useLayoutEffect(() => {
    const mesh = bushesRef.current
    if (!mesh || !leavesGeometry) return

    const dummy = new Object3D()
    for (let index = 0; index < STYLIZED_TREE_BUSHES.length; index += 1) {
      const bush = STYLIZED_TREE_BUSHES[index]!
      dummy.position.set(bush.pos[0], bush.pos[1], bush.pos[2])
      dummy.rotation.set(0, bush.yaw, 0)
      dummy.scale.setScalar(bush.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [leavesGeometry])

  useFrame(({ clock }) => {
    const mesh = bushesRef.current
    if (!mesh || resolvedTuning.treeSway <= 0) return
    const phase =
      clock.elapsedTime * resolvedTuning.windSpeed + position[0] * 0.17 + position[2] * 0.13
    const sway = Math.sin(phase) * resolvedTuning.treeSway * resolvedTuning.windStrength * 0.035
    mesh.rotation.set(sway * 0.65, 0, sway)
  })

  useEffect(
    () => () => {
      leavesGeometry?.dispose()
      leavesMaterial.dispose()
    },
    [leavesGeometry, leavesMaterial],
  )

  if (!leavesGeometry) return null

  return (
    <group
      position={[position[0], elevation + 0.03, position[2]]}
      ref={treeRef}
      rotation={[0, rotationY, 0]}
      scale={scale}
    >
      <primitive object={trunk} scale={STYLIZED_TREE_TRUNK_SCALE} />
      <instancedMesh
        args={[leavesGeometry, leavesMaterial, STYLIZED_TREE_BUSHES.length]}
        castShadow
        frustumCulled={false}
        ref={bushesRef}
      />
    </group>
  )
}

function extractFirstMeshGeometry(scene: Object3D): BufferGeometry | null {
  let geometry: BufferGeometry | null = null
  scene.traverse((child) => {
    if (geometry) return
    const mesh = child as Mesh
    if (mesh.isMesh && mesh.geometry) geometry = mesh.geometry.clone()
  })
  return geometry
}

function useStylizedGrassRenderCenter(): StylizedGrassRenderCenter {
  const [renderCenter, setRenderCenter] = useState<StylizedGrassRenderCenter>(() => ({
    x: 0,
    z: 0,
  }))
  const renderCenterRef = useRef(renderCenter)
  const camera = useThree((state) => state.camera)

  useFrame((state) => {
    const controls = getStylizedOrbitControls(state)
    const target = controls?.target
    const nextCenter = target
      ? { x: target.x, z: target.z }
      : { x: camera.position.x, z: camera.position.z }
    const current = renderCenterRef.current
    if (distanceSquared2(current, nextCenter) < STYLIZED_SCENE_STREAM_UPDATE_METERS ** 2) {
      return
    }

    renderCenterRef.current = nextCenter
    setRenderCenter(nextCenter)
  })

  return renderCenter
}

function getStylizedOrbitControls(state: unknown) {
  return (state as { controls?: StylizedOrbitControls }).controls
}

function resolveStylizedSceneTuning(
  tuning: GrassBladeTuning | undefined,
): StylizedSceneResolvedGrassTuning {
  if (!tuning) return STYLIZED_SCENE_DEFAULT_TUNING
  return {
    colorPatchScale: finiteNumber(
      tuning.colorPatchScale,
      STYLIZED_SCENE_DEFAULT_TUNING.colorPatchScale,
    ),
    colorVariation: finiteNumber(
      tuning.colorVariation,
      STYLIZED_SCENE_DEFAULT_TUNING.colorVariation,
    ),
    density: finiteNumber(tuning.density, STYLIZED_SCENE_DEFAULT_TUNING.density),
    flutter: finiteNumber(tuning.flutter, STYLIZED_SCENE_DEFAULT_TUNING.flutter),
    gustScale: finiteNumber(tuning.gustScale, STYLIZED_SCENE_DEFAULT_TUNING.gustScale),
    heightNoiseScale: finiteNumber(
      tuning.heightNoiseScale,
      STYLIZED_SCENE_DEFAULT_TUNING.heightNoiseScale,
    ),
    heightVariation: finiteNumber(
      tuning.heightVariation,
      STYLIZED_SCENE_DEFAULT_TUNING.heightVariation,
    ),
    macroScale: finiteNumber(tuning.macroScale, STYLIZED_SCENE_DEFAULT_TUNING.macroScale),
    macroVariation: finiteNumber(
      tuning.macroVariation,
      STYLIZED_SCENE_DEFAULT_TUNING.macroVariation,
    ),
    projection: finiteNumber(tuning.projection, STYLIZED_SCENE_DEFAULT_TUNING.projection),
    scale: finiteNumber(tuning.scale, STYLIZED_SCENE_DEFAULT_TUNING.scale),
    treeSway: finiteNumber(tuning.treeSway, STYLIZED_SCENE_DEFAULT_TUNING.treeSway),
    turbulence: finiteNumber(tuning.turbulence, STYLIZED_SCENE_DEFAULT_TUNING.turbulence),
    windAngle: finiteNumber(tuning.windAngle, STYLIZED_SCENE_DEFAULT_TUNING.windAngle),
    windSpeed: finiteNumber(tuning.windSpeed, STYLIZED_SCENE_DEFAULT_TUNING.windSpeed),
    windStrength: finiteNumber(tuning.windStrength, STYLIZED_SCENE_DEFAULT_TUNING.windStrength),
  }
}

function createStylizedGrassInstances({
  pathMaskData,
  renderCenter,
  roadGrid,
  surfacePoints,
  tuning,
}: {
  pathMaskData: ImageData | null
  renderCenter: StylizedGrassRenderCenter
  roadGrid: StylizedGrassRoadGrid | null
  surfacePoints: readonly LandrushPoint2[]
  tuning: StylizedSceneResolvedGrassTuning
}): StylizedGrassInstance[] {
  const streamAreaScale = (STYLIZED_SCENE_STREAM_RADIUS / STYLIZED_SCENE_BASE_STREAM_RADIUS) ** 2
  const targetCount = Math.max(
    0,
    Math.min(
      STYLIZED_SCENE_MAX_GRASS_INSTANCES,
      Math.round(finiteNumber(tuning.density, 0) * streamAreaScale),
    ),
  )
  if (targetCount === 0) return []

  const surfaceRing = openRing(surfacePoints)
  const radius = STYLIZED_SCENE_STREAM_RADIUS
  const radiusSquared = radius * radius
  const cellSize = STYLIZED_SCENE_STREAM_CELL_SIZE
  const densityPerSquareMeter = targetCount / (Math.PI * radiusSquared)
  const cellArea = cellSize * cellSize
  const slotsPerCell = Math.max(1, Math.ceil(densityPerSquareMeter * cellArea * 1.35))
  const candidateAcceptance = clamp01((densityPerSquareMeter * cellArea) / slotsPerCell)
  const minCellX = Math.floor((renderCenter.x - radius) / cellSize)
  const maxCellX = Math.floor((renderCenter.x + radius) / cellSize)
  const minCellZ = Math.floor((renderCenter.z - radius) / cellSize)
  const maxCellZ = Math.floor((renderCenter.z + radius) / cellSize)
  const instances: StylizedGrassInstance[] = []

  for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let slot = 0; slot < slotsPerCell; slot += 1) {
        if (instances.length >= STYLIZED_SCENE_MAX_GRASS_INSTANCES) return instances
        if (stableGrassHash(cellX, cellZ, slot, 0) > candidateAcceptance) continue

        const x = (cellX + stableGrassHash(cellX, cellZ, slot, 11.17)) * cellSize
        const z = (cellZ + stableGrassHash(cellX, cellZ, slot, 23.41)) * cellSize
        if (distanceSquared2(renderCenter, { x, z }) > radiusSquared) continue

        const edgeJitter = stableGrassHash(cellX, cellZ, slot, 37.73)
        if (surfaceRing.length >= 3 && !pointInPolygon({ x, z }, surfaceRing)) continue
        if (isPointOnStylizedGrassRoad(x, z, roadGrid, edgeJitter)) continue
        if (
          surfaceRing.length < 3 &&
          isPointOnReferencePathMask(x, z, pathMaskData, roadGrid, edgeJitter)
        ) {
          continue
        }

        const seed = stableGrassHash(cellX, cellZ, slot, 71.09) * 10_000
        instances.push({
          heightFactor: stylizedGrassHeightFactor(x, z, tuning),
          seed,
          x,
          yaw: stableGrassHash(cellX, cellZ, slot, 53.29) * Math.PI * 2,
          z,
        })
      }
    }
  }

  return instances
}

function applyStylizedGrassMatrices(
  mesh: InstancedMesh,
  instances: readonly StylizedGrassInstance[],
  tuning: StylizedSceneResolvedGrassTuning,
  dummy: Object3D,
  time: number,
  interaction: StylizedGrassInteraction | null,
) {
  const scale = Math.max(0.001, finiteNumber(tuning.scale, STYLIZED_SCENE_GRASS_SCALE))
  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index]!
    const wind = stylizedGrassWind(instance, tuning, time)
    const bend = stylizedGrassInteractionBend(instance, interaction)
    dummy.position.set(instance.x, 0, instance.z)
    dummy.rotation.set(wind.pitch + bend.pitch, instance.yaw + wind.yaw, wind.roll + bend.roll)
    dummy.scale.set(
      scale,
      scale * STYLIZED_SCENE_GRASS_HEIGHT_SCALE * instance.heightFactor * wind.heightPulse,
      scale,
    )
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
  }
}

function withStylizedGrassInstanceAttributes(geometry: BufferGeometry) {
  const instancedGeometry = geometry.clone()
  instancedGeometry.computeBoundingBox()
  instancedGeometry.setAttribute(
    'aOrigin',
    new InstancedBufferAttribute(new Float32Array(STYLIZED_SCENE_MAX_GRASS_INSTANCES * 2), 2),
  )
  instancedGeometry.setAttribute(
    'aSeed',
    new InstancedBufferAttribute(new Float32Array(STYLIZED_SCENE_MAX_GRASS_INSTANCES), 1),
  )
  return instancedGeometry
}

function createStylizedGrassNodeMaterial(
  geometry: BufferGeometry | null,
  grassTexture: Texture,
  tuning: StylizedSceneResolvedGrassTuning,
) {
  if (!geometry) return null

  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox
  const bladeMinY = bounds?.min.y ?? 0
  const bladeHeight = Math.max(0.000001, (bounds?.max.y ?? 1) - bladeMinY)
  const heightAlongBlade = tslClamp(positionLocal.y.sub(bladeMinY).div(bladeHeight), 0, 1)
  const gradientT = pow(heightAlongBlade, 1.4)
  const gradientA = mix(tslColor('#6aa14f'), tslColor('#a1cc33'), gradientT)
  const gradientB = mix(tslColor('#74a022'), tslColor('#e8e84f'), gradientT)
  const instanceOrigin: TSLNode<'vec2'> = attribute<'vec2'>('aOrigin', 'vec2')
  const instanceSeed: TSLNode<'float'> = attribute<'float'>('aSeed', 'float')
  const colorPatchScale = float(tuning.colorPatchScale)
  const colorVariation = float(tuning.colorVariation)
  const macroScale = float(tuning.macroScale)
  const macroVariation = float(tuning.macroVariation)
  const projection = float(tuning.projection)
  const patchNoise = mx_noise_float(instanceOrigin.mul(colorPatchScale)).mul(0.5).add(0.5)
  const patchBlend = tslClamp(patchNoise.mul(colorVariation), 0, 1)
  const baseColor = mix(gradientA, gradientB, patchBlend)
  const groundUv = instanceOrigin
    .div(STYLIZED_SCENE_REFERENCE_FIELD_SIZE)
    .add(0.5)
    .mul(STYLIZED_SCENE_TEXTURE_REPEAT)
  const groundTint = tslTexture(grassTexture, groundUv).rgb
  const projectionStrength = projection.mul(mix(float(1), float(0.4), gradientT))
  const projectedColor = mix(baseColor, baseColor.mul(groundTint), projectionStrength)
  const brightness = mix(float(0.85), float(1.15), hash(instanceSeed.add(13.37)))
  const macroNoise = mx_noise_float(instanceOrigin.add(vec2(137, 91)).mul(macroScale))
    .mul(0.5)
    .add(0.5)
  const macroFactor = float(1).add(macroNoise.sub(0.5).mul(2).mul(macroVariation))
  const viewDir = cameraPosition.sub(positionWorld).normalize()
  const sunDir = vec3(18, 16, 10).normalize()
  const backLight = viewDir.dot(sunDir.negate()).max(0).pow(3)
  const thicknessMask = pow(heightAlongBlade, 1.5)
  const translucency = tslColor(0xcfe06a).mul(backLight).mul(thicknessMask).mul(1.2)
  const fresnel = float(1)
    .sub(vec3(0, 1, 0).dot(viewDir).max(0))
    .pow(4)
  const fresnelRim = tslColor(0xeaf2c0).mul(fresnel).mul(0.25)

  const material = new MeshStandardNodeMaterial({ side: DoubleSide })
  material.colorNode = projectedColor.mul(brightness).mul(macroFactor)
  material.emissiveNode = translucency.add(fresnelRim)
  material.roughnessNode = float(0.85)
  return material
}

function applyStylizedGrassInstanceAttributes(
  geometry: BufferGeometry,
  instances: readonly StylizedGrassInstance[],
) {
  const origin = geometry.getAttribute('aOrigin') as InstancedBufferAttribute | undefined
  const seed = geometry.getAttribute('aSeed') as InstancedBufferAttribute | undefined
  if (!origin || !seed) return

  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index]!
    origin.setXY(index, instance.x, instance.z)
    seed.setX(index, instance.seed)
  }

  origin.needsUpdate = true
  seed.needsUpdate = true
}

function stylizedGrassHeightFactor(x: number, z: number, tuning: StylizedSceneResolvedGrassTuning) {
  const heightNoise = stylizedGrassNoise(
    (x + 53) * tuning.heightNoiseScale,
    (z + 17) * tuning.heightNoiseScale,
  )
  return clamp(1 + (heightNoise - 0.5) * 2 * tuning.heightVariation, 0.2, 1.8)
}

function stylizedGrassWind(
  instance: StylizedGrassInstance,
  tuning: StylizedSceneResolvedGrassTuning,
  time: number,
) {
  const strength = Math.max(0, tuning.windStrength)
  if (strength <= 0) return { heightPulse: 1, pitch: 0, roll: 0, yaw: 0 }
  const direction = (tuning.windAngle / 180) * Math.PI
  const wave =
    time * Math.max(0, tuning.windSpeed) +
    (instance.x * Math.cos(direction) + instance.z * Math.sin(direction)) * tuning.gustScale
  const turbulence =
    (stylizedGrassNoise(instance.x * 0.18 + time * 0.08, instance.z * 0.18 - time * 0.05) - 0.5) *
    tuning.turbulence *
    Math.PI *
    2
  const flutter = Math.sin(wave * 3.1 + instance.seed * 0.37) * tuning.flutter * 0.35
  const gust = Math.sin(wave + turbulence) + flutter
  const lean = strength * gust * 0.18
  return {
    heightPulse: clamp(1 + Math.abs(gust) * strength * 0.04, 0.9, 1.12),
    pitch: Math.sin(direction) * lean,
    roll: Math.cos(direction) * lean,
    yaw: flutter * strength * 0.08,
  }
}

function stylizedGrassInteractionBend(
  instance: StylizedGrassInstance,
  interaction: StylizedGrassInteraction | null,
) {
  if (!interaction || interaction.speed <= 0.05 || interaction.radius <= 0) {
    return { pitch: 0, roll: 0 }
  }

  const dx = instance.x - interaction.x
  const dz = instance.z - interaction.z
  const distance = Math.hypot(dx, dz)
  if (distance >= interaction.radius) return { pitch: 0, roll: 0 }

  const distanceRatio = distance / interaction.radius
  const falloff = 1 - smoothstep(0.15, 1, distanceRatio)
  const speedRatio = clamp01(interaction.speed / STYLIZED_SCENE_INTERACTION_FULL_SPEED)
  const lean = falloff * speedRatio * STYLIZED_SCENE_INTERACTION_MAX_BEND
  if (distance <= 0.0001 || lean <= 0.0001) return { pitch: 0, roll: 0 }

  return {
    pitch: (dz / distance) * lean,
    roll: (dx / distance) * lean,
  }
}

function extractImageData(texture: Texture): ImageData | null {
  if (typeof document === 'undefined') return null
  const image = texture.image as CanvasImageSource | undefined
  if (!image) return null

  const width = imageSizeValue(image, 'width')
  const height = imageSizeValue(image, 'height')
  if (width <= 0 || height <= 0) return null

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(image, 0, 0, width, height)
  return context.getImageData(0, 0, width, height)
}

function sampleImageData(data: ImageData, u: number, v: number) {
  const px = Math.max(0, Math.min(data.width - 1, Math.floor(u * data.width)))
  const py = Math.max(0, Math.min(data.height - 1, Math.floor(v * data.height)))
  return (data.data[(py * data.width + px) * 4] ?? 0) / 255
}

function isPointOnStylizedGrassRoad(
  x: number,
  z: number,
  roadGrid: StylizedGrassRoadGrid | null,
  edgeJitter: number,
) {
  if (!roadGrid) return false

  const spans = stylizedGrassRoadSpansNearPoint({ x, z }, roadGrid)
  if (spans.length === 0) return false

  const signedDistance = signedDistanceToStylizedGrassRoadSpans({ x, z }, spans)
  if (!Number.isFinite(signedDistance)) return false

  const clearance =
    STYLIZED_SCENE_PATH_CLEARANCE_METERS +
    Math.max(0, edgeJitter) * STYLIZED_SCENE_PATH_EDGE_JITTER_METERS
  return signedDistance <= clearance
}

function isPointOnReferencePathMask(
  x: number,
  z: number,
  pathMaskData: ImageData | null,
  roadGrid: StylizedGrassRoadGrid | null,
  edgeJitter: number,
) {
  if (roadGrid || !pathMaskData) return false

  const maskValue = sampleImageData(
    pathMaskData,
    x / STYLIZED_SCENE_FIELD_SIZE + 0.5,
    z / STYLIZED_SCENE_FIELD_SIZE + 0.5,
  )
  return maskValue + (edgeJitter - 0.5) * 0.3 > 0.5
}

function createStylizedGrassRoadGrid(
  roads: readonly LandrushRoadSegment[],
  fieldSize: number,
): StylizedGrassRoadGrid | null {
  const fieldHalf = fieldSize / 2
  const spans: StylizedGrassRoadSpan[] = []

  for (const road of roads) {
    const halfWidth = (Math.max(0.1, road.width) * STYLIZED_SCENE_PATH_WIDTH_SCALE) / 2
    const padding =
      halfWidth + STYLIZED_SCENE_PATH_CLEARANCE_METERS + STYLIZED_SCENE_PATH_EDGE_JITTER_METERS

    for (let index = 0; index < road.points.length - 1; index += 1) {
      const start = road.points[index]
      const end = road.points[index + 1]
      if (!(start && end)) continue

      const minX = Math.min(start.x, end.x) - padding
      const maxX = Math.max(start.x, end.x) + padding
      const minZ = Math.min(start.z, end.z) - padding
      const maxZ = Math.max(start.z, end.z) + padding
      if (maxX < -fieldHalf || minX > fieldHalf || maxZ < -fieldHalf || minZ > fieldHalf) {
        continue
      }

      spans.push({ end, halfWidth, maxX, maxZ, minX, minZ, start })
    }
  }

  if (spans.length === 0) return null

  const cellsPerAxis = Math.max(16, Math.min(64, Math.ceil(fieldSize / 2.5)))
  const cells = Array.from(
    { length: cellsPerAxis * cellsPerAxis },
    () => [] as StylizedGrassRoadSpan[],
  )

  for (const span of spans) {
    const minCellX = stylizedGrassRoadCellIndex(span.minX, fieldSize, cellsPerAxis)
    const maxCellX = stylizedGrassRoadCellIndex(span.maxX, fieldSize, cellsPerAxis)
    const minCellZ = stylizedGrassRoadCellIndex(span.minZ, fieldSize, cellsPerAxis)
    const maxCellZ = stylizedGrassRoadCellIndex(span.maxZ, fieldSize, cellsPerAxis)
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        cells[cellZ * cellsPerAxis + cellX]?.push(span)
      }
    }
  }

  return { cells, cellsPerAxis, fieldSize }
}

function stylizedGrassRoadSpansNearPoint(
  point: { x: number; z: number },
  roadGrid: StylizedGrassRoadGrid,
) {
  const cellX = stylizedGrassRoadCellIndex(point.x, roadGrid.fieldSize, roadGrid.cellsPerAxis)
  const cellZ = stylizedGrassRoadCellIndex(point.z, roadGrid.fieldSize, roadGrid.cellsPerAxis)
  return roadGrid.cells[cellZ * roadGrid.cellsPerAxis + cellX] ?? []
}

function stylizedGrassRoadCellIndex(value: number, fieldSize: number, cellsPerAxis: number) {
  return Math.max(
    0,
    Math.min(cellsPerAxis - 1, Math.floor((value / fieldSize + 0.5) * cellsPerAxis)),
  )
}

function signedDistanceToStylizedGrassRoadSpans(
  point: { x: number; z: number },
  spans: readonly StylizedGrassRoadSpan[],
) {
  let signedDistance = Number.POSITIVE_INFINITY
  for (const span of spans) {
    signedDistance = Math.min(
      signedDistance,
      distanceToStylizedGrassRoadSegment(point, span.start, span.end) - span.halfWidth,
    )
  }
  return signedDistance
}

function distanceToStylizedGrassRoadSegment(
  point: { x: number; z: number },
  start: { x: number; z: number },
  end: { x: number; z: number },
) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const lengthSquared = dx * dx + dz * dz
  if (lengthSquared <= 0.000001) return Math.hypot(point.x - start.x, point.z - start.z)

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared),
  )
  return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t))
}

function imageSizeValue(image: CanvasImageSource, key: 'height' | 'width') {
  const sized = image as {
    height?: number
    naturalHeight?: number
    naturalWidth?: number
    width?: number
  }
  return Math.max(
    0,
    Math.round(
      key === 'width'
        ? (sized.naturalWidth ?? sized.width ?? 0)
        : (sized.naturalHeight ?? sized.height ?? 0),
    ),
  )
}

function stylizedGrassNoise(x: number, z: number) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  return lerp(
    lerp(grassHashUnit(ix, iz), grassHashUnit(ix + 1, iz), ux),
    lerp(grassHashUnit(ix, iz + 1), grassHashUnit(ix + 1, iz + 1), ux),
    uz,
  )
}

function grassHashUnit(x: number, z: number) {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43_758.5453123
  return value - Math.floor(value)
}

function stableGrassHash(cellX: number, cellZ: number, slot: number, salt: number) {
  const value =
    Math.sin(
      cellX * 127.1 + cellZ * 311.7 + slot * 269.5 + salt * 183.3 + STYLIZED_SCENE_GRASS_SEED,
    ) * 43_758.5453123
  return value - Math.floor(value)
}

function pointInPolygon(point: LandrushPoint2, polygon: readonly LandrushPoint2[]) {
  let inside = false
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; index += 1) {
    const current = polygon[index]
    const previous = polygon[previousIndex]
    if (!(current && previous)) continue
    const crosses = current.z > point.z !== previous.z > point.z
    const boundaryX =
      ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z || 0.000001) +
      current.x
    if (crosses && point.x < boundaryX) inside = !inside
    previousIndex = index
  }
  return inside
}

function openRing(points: readonly LandrushPoint2[]) {
  const first = points[0]
  const last = points.at(-1)
  return first && last && Math.hypot(first.x - last.x, first.z - last.z) <= 0.001
    ? points.slice(0, -1)
    : [...points]
}

function distanceSquared2(first: StylizedGrassRenderCenter, second: StylizedGrassRenderCenter) {
  const dx = first.x - second.x
  const dz = first.z - second.z
  return dx * dx + dz * dz
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0 || 0.000001))
  return t * t * (3 - 2 * t)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function finiteNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t
}

useGLTF.preload(STYLIZED_SCENE_PATHS.grassBlades)
useGLTF.preload(STYLIZED_SCENE_PATHS.treeLeaves)
useGLTF.preload(STYLIZED_SCENE_PATHS.treeTrunk)
