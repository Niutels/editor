'use client'

import type { PascalWaterLandSurface } from '@pascal-app/nodes'
import { getMaterialRendererBackend, renderScheduler } from '@pascal-app/viewer'
import { useFrame } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  type InstancedMesh,
  type Material,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three'
import {
  attribute,
  float,
  hash,
  mix,
  positionLocal,
  pow,
  sin,
  clamp as tslClamp,
  color as tslColor,
  uniform,
  vec3,
} from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import type { LandrushRoadSegment } from '@/components/landrush/types'
import { createStylizedPathNetworkGeometries } from './stylized-path-network-layer'

export type CliffLandscapeDebugMode = 'final' | 'terrain' | 'habitat' | 'cliffs' | 'wind'
export type CliffLandscapeQuality = 'balanced' | 'dense'
export type CliffCameraBookmark = 'design' | 'near' | 'far'

export type CliffLandscapeMetrics = {
  cliffTriangles: number
  cliffVertices: number
  cypressTrees: number
  estimatedTriangles: number
  grassInstances: number
  pineTrees: number
  rockInstances: number
  seed: number
  shrubInstances: number
  terrainTriangles: number
  terrainVertices: number
  totalInstances: number
}

export type CliffLandscapeRuntimeMetrics = {
  drawCalls: number
  fps: number
  triangles: number
}

type Point2 = { x: number; z: number }
type Segment2 = { ax: number; az: number; bx: number; bz: number }
type LandscapeSample = {
  edgeDistance: number
  elevation: number
  habitat: number
  inside: boolean
  macro: number
  roadDistance: number
}
type LandscapeField = {
  baseElevation: number
  bounds: { maxX: number; maxZ: number; minX: number; minZ: number }
  center: Point2
  points: readonly Point2[]
  sample: (x: number, z: number) => LandscapeSample
}
type VegetationInstance = {
  scale: number
  seed: number
  x: number
  y: number
  yaw: number
  z: number
}
type RockInstance = {
  palette: number
  pitch: number
  roll: number
  scaleX: number
  scaleY: number
  scaleZ: number
  x: number
  y: number
  yaw: number
  z: number
}
type CliffData = {
  geometry: BufferGeometry
  rocks: readonly RockInstance[]
}
type VegetationPlan = {
  cypresses: readonly VegetationInstance[]
  grass: readonly VegetationInstance[]
  pines: readonly VegetationInstance[]
  shrubs: readonly VegetationInstance[]
}
type WindMaterialBundle = {
  material: Material
  time: { value: number }
}

const QUALITY_SETTINGS: Record<
  CliffLandscapeQuality,
  {
    cypresses: number
    grass: number
    pines: number
    rocks: number
    shrubs: number
    terrainRings: number
  }
> = {
  balanced: {
    cypresses: 16,
    grass: 5200,
    pines: 28,
    rocks: 150,
    shrubs: 520,
    terrainRings: 14,
  },
  dense: {
    cypresses: 24,
    grass: 9200,
    pines: 40,
    rocks: 240,
    shrubs: 900,
    terrainRings: 20,
  },
}

const WIND_DIRECTION = { x: Math.cos(Math.PI * 0.23), z: Math.sin(Math.PI * 0.23) }
const CLIFF_TOE_ELEVATION = -0.02
const UP = new Vector3(0, 1, 0)

export function ProceduralCliffLandscape({
  debugMode,
  onMetrics,
  onRuntimeMetrics,
  quality,
  roads,
  seed,
  showCliffs,
  showPaths,
  showVegetation,
  surface,
  windPaused,
}: {
  debugMode: CliffLandscapeDebugMode
  onMetrics: (metrics: CliffLandscapeMetrics) => void
  onRuntimeMetrics: (metrics: CliffLandscapeRuntimeMetrics) => void
  quality: CliffLandscapeQuality
  roads: readonly LandrushRoadSegment[]
  seed: number
  showCliffs: boolean
  showPaths: boolean
  showVegetation: boolean
  surface: PascalWaterLandSurface
  windPaused: boolean
}) {
  const settings = QUALITY_SETTINGS[quality]
  const field = useMemo(
    () =>
      createLandscapeField(surface.grassSurfacePoints, roads, surface.grassSurfaceElevation, seed),
    [roads, seed, surface.grassSurfaceElevation, surface.grassSurfacePoints],
  )
  const terrainGeometry = useMemo(
    () => createTerrainGeometry(field, settings.terrainRings, debugMode),
    [debugMode, field, settings.terrainRings],
  )
  const cliffData = useMemo(
    () => createCliffData(surface, seed, debugMode, settings.rocks),
    [debugMode, seed, settings.rocks, surface],
  )
  const vegetation = useMemo(
    () => createVegetationPlan(field, seed, settings),
    [field, seed, settings],
  )
  const metrics = useMemo<CliffLandscapeMetrics>(() => {
    const terrainVertices = terrainGeometry.getAttribute('position')?.count ?? 0
    const cliffVertices = cliffData.geometry.getAttribute('position')?.count ?? 0
    const terrainTriangles = (terrainGeometry.getIndex()?.count ?? 0) / 3
    const cliffTriangles = (cliffData.geometry.getIndex()?.count ?? cliffVertices) / 3
    const estimatedTriangles =
      terrainTriangles +
      cliffTriangles +
      vegetation.grass.length * 24 +
      vegetation.shrubs.length * 80 +
      vegetation.pines.length * (56 + 4 * 24 + 5 * 80) +
      vegetation.cypresses.length * 64 +
      cliffData.rocks.length * 36
    return {
      cliffTriangles,
      cliffVertices,
      cypressTrees: vegetation.cypresses.length,
      estimatedTriangles,
      grassInstances: vegetation.grass.length,
      pineTrees: vegetation.pines.length,
      rockInstances: cliffData.rocks.length,
      seed,
      shrubInstances: vegetation.shrubs.length,
      terrainTriangles,
      terrainVertices,
      totalInstances:
        vegetation.grass.length +
        vegetation.shrubs.length +
        vegetation.pines.length +
        vegetation.cypresses.length +
        cliffData.rocks.length,
    }
  }, [cliffData, seed, terrainGeometry, vegetation])

  useEffect(() => {
    onMetrics(metrics)
    renderScheduler.requestFrame('geometry:changed')
  }, [metrics, onMetrics])

  useEffect(
    () => () => {
      terrainGeometry.dispose()
      cliffData.geometry.dispose()
    },
    [cliffData.geometry, terrainGeometry],
  )

  return (
    <>
      <color args={['#78c5dc']} attach="background" />
      <fog args={['#bdd6e8', 155, 270]} attach="fog" />
      <mesh position={[0, -0.12, 0]} renderOrder={0} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2400, 2400, 1, 1]} />
        <meshBasicMaterial color="#319fbe" toneMapped={false} />
      </mesh>
      <mesh position={[0, -40, 0]} renderOrder={-1} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6000, 6000, 1, 1]} />
        <meshBasicMaterial color="#319fbe" toneMapped={false} />
      </mesh>
      <mesh
        castShadow
        geometry={terrainGeometry}
        name="procedural-cliff-terrain"
        receiveShadow
        renderOrder={8}
      >
        <meshStandardMaterial metalness={0} roughness={0.94} vertexColors />
      </mesh>

      {showCliffs ? (
        <>
          <mesh
            castShadow
            geometry={cliffData.geometry}
            name="procedural-cliff-strata"
            receiveShadow
            renderOrder={7}
          >
            <meshStandardMaterial
              flatShading
              metalness={0}
              roughness={0.88}
              side={DoubleSide}
              vertexColors
            />
          </mesh>
          <RockInstances instances={cliffData.rocks} />
        </>
      ) : null}

      {showPaths ? (
        <CliffRoadNetworkLayer
          elevation={field.baseElevation + 0.012}
          perimeter={field.points}
          roads={roads}
        />
      ) : null}

      {showVegetation ? (
        <>
          <GrassInstances debugMode={debugMode} instances={vegetation.grass} paused={windPaused} />
          <ShrubInstances debugMode={debugMode} instances={vegetation.shrubs} paused={windPaused} />
          <PineInstances debugMode={debugMode} instances={vegetation.pines} paused={windPaused} />
          <CypressInstances
            debugMode={debugMode}
            instances={vegetation.cypresses}
            paused={windPaused}
          />
        </>
      ) : null}

      <LandscapeRuntimeProbe
        estimatedTriangles={metrics.estimatedTriangles}
        onMetrics={onRuntimeMetrics}
      />
    </>
  )
}

function createLandscapeField(
  inputPoints: readonly Point2[],
  roads: readonly LandrushRoadSegment[],
  baseElevation: number,
  seed: number,
): LandscapeField {
  const points = cleanRing(inputPoints)
  const center = centerOf(points)
  const bounds = boundsOf(points)
  const edgeSegments = ringSegments(points)
  const roadSegments = roads.flatMap((road) => polylineSegments(road.points))

  const sample = (x: number, z: number): LandscapeSample => {
    const inside = pointInPolygon(x, z, points)
    const edgeDistance = minDistanceToSegments(x, z, edgeSegments)
    const roadDistance = minDistanceToSegments(x, z, roadSegments)
    const macroA = fbm(x * 0.027 + 13.7, z * 0.027 - 8.2, seed)
    const macroB = fbm(x * 0.011 - 31.4, z * 0.011 + 24.3, seed ^ 0x51f15e)
    const macro = clamp01(macroA * 0.68 + macroB * 0.32)
    const moisture = clamp01(
      fbm(x * 0.036 - 18.2, z * 0.036 + 42.6, seed ^ 0x9e3779b9) * 0.72 +
        fbm(x * 0.012 + 77.1, z * 0.012 - 55.8, seed ^ 0x85ebca6b) * 0.28,
    )
    const roadClearance = smoothstep(3.5, 6.5, roadDistance)
    const rimClearance = smoothstep(1.0, 6.2, edgeDistance)
    const rawRelief = clamp((macro - 0.43) * 2.45, -0.22, 1.55)
    const terracedRelief = lerp(rawRelief, Math.round(rawRelief / 0.32) * 0.32, 0.24)
    const relief = terracedRelief * roadClearance * rimClearance
    const habitat = clamp01(
      moisture * 0.64 +
        (1 - Math.abs(macro - 0.52) * 1.5) * 0.36 -
        (1 - roadClearance) * 0.45 -
        (1 - rimClearance) * 0.3,
    )

    return {
      edgeDistance,
      elevation: baseElevation + relief,
      habitat,
      inside,
      macro,
      roadDistance,
    }
  }

  return { baseElevation, bounds, center, points, sample }
}

function createTerrainGeometry(
  field: LandscapeField,
  ringCount: number,
  debugMode: CliffLandscapeDebugMode,
) {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const boundary = field.points
  const centerSample = field.sample(field.center.x, field.center.z)
  pushTerrainVertex(
    positions,
    colors,
    field.center.x,
    centerSample.elevation,
    field.center.z,
    centerSample,
    debugMode,
  )

  for (let ringIndex = 1; ringIndex <= ringCount; ringIndex += 1) {
    const radius = ringIndex / ringCount
    for (const boundaryPoint of boundary) {
      const x = lerp(field.center.x, boundaryPoint.x, radius)
      const z = lerp(field.center.z, boundaryPoint.z, radius)
      const sample = field.sample(x, z)
      pushTerrainVertex(positions, colors, x, sample.elevation, z, sample, debugMode)
    }
  }

  const pointCount = boundary.length
  for (let index = 0; index < pointCount; index += 1) {
    const next = (index + 1) % pointCount
    indices.push(0, 1 + next, 1 + index)
  }
  for (let ringIndex = 1; ringIndex < ringCount; ringIndex += 1) {
    const innerStart = 1 + (ringIndex - 1) * pointCount
    const outerStart = innerStart + pointCount
    for (let index = 0; index < pointCount; index += 1) {
      const next = (index + 1) % pointCount
      const innerA = innerStart + index
      const innerB = innerStart + next
      const outerA = outerStart + index
      const outerB = outerStart + next
      indices.push(innerA, outerB, outerA, innerA, innerB, outerB)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometry.userData.proceduralField = 'macro-relief-road-clearance-rim-clearance-habitat'
  return geometry
}

function pushTerrainVertex(
  positions: number[],
  colors: number[],
  x: number,
  y: number,
  z: number,
  sample: LandscapeSample,
  debugMode: CliffLandscapeDebugMode,
) {
  positions.push(x, y, z)
  const color = terrainColor(sample, debugMode)
  colors.push(color.r, color.g, color.b)
}

function terrainColor(sample: LandscapeSample, debugMode: CliffLandscapeDebugMode) {
  if (debugMode === 'terrain') {
    const t = clamp01((sample.elevation - 10.4) / 2.2)
    return new Color('#315f83').lerp(new Color('#e2a85f'), t)
  }
  if (debugMode === 'habitat') {
    return new Color('#24352a').lerp(new Color('#c5de73'), sample.habitat)
  }
  if (debugMode === 'cliffs') return new Color('#727d56')
  const dry = new Color('#a5ad57').lerp(new Color('#c5ad68'), 1 - sample.habitat)
  const lush = new Color('#3f773e').lerp(new Color('#275f42'), sample.habitat)
  return dry.lerp(lush, clamp01(sample.habitat * 0.88 + sample.macro * 0.15))
}

function createCliffData(
  surface: PascalWaterLandSurface,
  seed: number,
  debugMode: CliffLandscapeDebugMode,
  rockCount: number,
): CliffData {
  const plateau = cleanRing(surface.plateauPoints)
  const shoreline = cleanRing(surface.shorelinePoints)
  const center = centerOf(plateau)
  const sampleCount = Math.max(96, Math.min(192, plateau.length))
  const levels = [
    { coast: 0, height: 0 },
    { coast: 0.09, height: 0.045 },
    { coast: 0.27, height: 0.3 },
    { coast: 0.39, height: 0.33 },
    { coast: 0.54, height: 0.59 },
    { coast: 0.68, height: 0.62 },
    { coast: 0.85, height: 0.87 },
    { coast: 1, height: 1 },
  ] as const
  const profile: Vector3[][] = []

  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / sampleCount
    const top = indexedRingPoint(plateau, t)
    const shore = indexedRingPoint(shoreline, t)
    let outX = shore.x - top.x
    let outZ = shore.z - top.z
    let reach = Math.hypot(outX, outZ)
    if (reach < 0.2) {
      outX = top.x - center.x
      outZ = top.z - center.z
      reach = Math.max(4.2, Math.hypot(outX, outZ))
    }
    const inv = 1 / Math.max(0.001, Math.hypot(outX, outZ))
    outX *= inv
    outZ *= inv
    const contourNoise = valueNoise(index * 0.18, seed * 0.013, seed ^ 0x27d4eb2d)
    const heightNoise = (valueNoise(index * 0.11 + 40, seed * 0.021, seed) - 0.5) * 0.5
    const points: Vector3[] = []
    for (let levelIndex = 0; levelIndex < levels.length; levelIndex += 1) {
      const level = levels[levelIndex]!
      const shelfBulge =
        (levelIndex === 2 || levelIndex === 4 || levelIndex === 6 ? 0.52 : 0.12) *
        (0.6 + contourNoise * 0.8)
      const x = lerp(top.x, shore.x, level.coast) + outX * shelfBulge
      const z = lerp(top.z, shore.z, level.coast) + outZ * shelfBulge
      const exactEndpoint = levelIndex === 0 || levelIndex === levels.length - 1
      const y =
        lerp(surface.plateauElevation, CLIFF_TOE_ELEVATION, level.height) +
        (exactEndpoint ? 0 : heightNoise * Math.sin(level.height * Math.PI))
      points.push(new Vector3(x, y, z))
    }
    profile.push(points)
  }

  const positions: number[] = []
  const colors: number[] = []
  const finalPalette = ['#d7895f', '#b85f48', '#df8a5c', '#9f4e40', '#cd704f', '#8e473c', '#b65c45']
  const debugPalette = ['#f5d547', '#e8793f', '#f2b84b', '#df4f52', '#d88ce2', '#6aa9ff', '#5ce1c2']

  for (let levelIndex = 0; levelIndex < levels.length - 1; levelIndex += 1) {
    for (let index = 0; index < sampleCount; index += 1) {
      const next = (index + 1) % sampleCount
      const a = profile[index]?.[levelIndex]
      const b = profile[next]?.[levelIndex]
      const c = profile[index]?.[levelIndex + 1]
      const d = profile[next]?.[levelIndex + 1]
      if (!(a && b && c && d)) continue
      const palette = debugMode === 'cliffs' ? debugPalette : finalPalette
      const baseColor = new Color(palette[levelIndex] ?? '#b85f48')
      const variation = valueNoise(index * 0.31, levelIndex * 0.77, seed) - 0.5
      const segmentDirection = new Vector3().subVectors(b, a).normalize()
      const outward = new Vector3(segmentDirection.z, 0, -segmentDirection.x)
      const lightResponse = clamp01(outward.dot(new Vector3(0.58, 0, 0.81)))
      const brightness = 0.83 + lightResponse * 0.22 + variation * 0.18
      baseColor.multiplyScalar(brightness)
      pushColoredTriangle(positions, colors, a, c, b, baseColor)
      pushColoredTriangle(positions, colors, b, c, d, baseColor)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  geometry.userData.proceduralField = 'continuous-terraced-coast-profile'

  const random = new SeededRandom(seed ^ 0xa511e9b3)
  const rocks: RockInstance[] = []
  for (let rockIndex = 0; rockIndex < rockCount; rockIndex += 1) {
    const contourIndex = random.integer(0, sampleCount)
    const band = [2, 4, 6][random.integer(0, 3)] ?? 4
    const point = profile[contourIndex]?.[band]
    if (!point) continue
    const top = profile[contourIndex]?.[0] ?? point
    const out = new Vector3(point.x - center.x, 0, point.z - center.z).normalize()
    const scale = random.range(0.45, 1.3)
    rocks.push({
      palette: random.integer(0, 3),
      pitch: random.range(-0.32, 0.32),
      roll: random.range(-0.26, 0.26),
      scaleX: scale * random.range(0.7, 1.45),
      scaleY: scale * random.range(0.55, 1.2),
      scaleZ: scale * random.range(0.65, 1.35),
      x: point.x + out.x * random.range(-0.15, 0.65),
      y: Math.min(top.y - 0.3, point.y + random.range(-0.35, 0.45)),
      yaw: random.range(0, Math.PI * 2),
      z: point.z + out.z * random.range(-0.15, 0.65),
    })
  }

  return { geometry, rocks }
}

function pushColoredTriangle(
  positions: number[],
  colors: number[],
  a: Vector3,
  b: Vector3,
  c: Vector3,
  color: Color,
) {
  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  for (let index = 0; index < 3; index += 1) colors.push(color.r, color.g, color.b)
}

function createVegetationPlan(
  field: LandscapeField,
  seed: number,
  settings: (typeof QUALITY_SETTINGS)[CliffLandscapeQuality],
): VegetationPlan {
  const random = new SeededRandom(seed)
  const scatter = (
    count: number,
    minSpacing: number,
    accept: (sample: LandscapeSample, randomValue: number) => boolean,
    scaleRange: readonly [number, number],
  ) => {
    const instances: VegetationInstance[] = []
    const maxAttempts = Math.max(1000, count * 35)
    for (let attempt = 0; attempt < maxAttempts && instances.length < count; attempt += 1) {
      const x = random.range(field.bounds.minX, field.bounds.maxX)
      const z = random.range(field.bounds.minZ, field.bounds.maxZ)
      const sample = field.sample(x, z)
      if (!sample.inside || !accept(sample, random.next())) continue
      if (
        minSpacing > 0 &&
        instances.some((other) => Math.hypot(other.x - x, other.z - z) < minSpacing)
      ) {
        continue
      }
      instances.push({
        scale: random.range(scaleRange[0], scaleRange[1]),
        seed: random.next(),
        x,
        y: sample.elevation,
        yaw: random.range(0, Math.PI * 2),
        z,
      })
    }
    return instances
  }

  const pines = scatter(
    settings.pines,
    8.2,
    (sample, chance) =>
      sample.edgeDistance > 5.2 &&
      sample.roadDistance > 5.4 &&
      chance < 0.36 + sample.habitat * 0.56,
    [0.82, 1.28],
  )
  const cypresses = scatter(
    settings.cypresses,
    5.8,
    (sample, chance) =>
      sample.edgeDistance > 4.2 &&
      sample.roadDistance > 3.8 &&
      sample.roadDistance < 10 &&
      chance < 0.55 + sample.habitat * 0.38,
    [0.82, 1.22],
  )
  const shrubs = scatter(
    settings.shrubs,
    0.72,
    (sample, chance) =>
      sample.edgeDistance > 2 && sample.roadDistance > 4.1 && chance < 0.24 + sample.habitat * 0.7,
    [0.52, 1.35],
  )
  const grass = scatter(
    settings.grass,
    0,
    (sample, chance) =>
      sample.edgeDistance > 1.5 &&
      sample.roadDistance > 3.9 &&
      chance < 0.42 + sample.habitat * 0.52,
    [0.64, 1.34],
  )

  return { cypresses, grass, pines, shrubs }
}

function GrassInstances({
  debugMode,
  instances,
  paused,
}: {
  debugMode: CliffLandscapeDebugMode
  instances: readonly VegetationInstance[]
  paused: boolean
}) {
  const ref = useRef<InstancedMesh>(null)
  const geometry = useMemo(
    () => attachInstanceAttributes(createGrassClusterGeometry(), instances),
    [instances],
  )
  const materialBundle = useMemo(() => createGrassMaterial(debugMode), [debugMode])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new Object3D()
    for (let index = 0; index < instances.length; index += 1) {
      const instance = instances[index]
      if (!instance) continue
      dummy.position.set(instance.x, instance.y + 0.018, instance.z)
      dummy.rotation.set(0, instance.yaw, 0)
      dummy.scale.set(instance.scale, instance.scale * 1.18, instance.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [instances])

  useFrame((_, delta) => {
    if (!paused) materialBundle.time.value += Math.min(delta, 0.05)
  })

  useEffect(
    () => () => {
      geometry.dispose()
      materialBundle.material.dispose()
    },
    [geometry, materialBundle],
  )

  if (instances.length === 0) return null
  return (
    <instancedMesh
      args={[undefined, undefined, instances.length]}
      castShadow={false}
      frustumCulled={false}
      name="procedural-cliff-grass"
      receiveShadow
      ref={ref}
      renderOrder={12}
    >
      <primitive attach="geometry" object={geometry} />
      <primitive attach="material" object={materialBundle.material} />
    </instancedMesh>
  )
}

function ShrubInstances({
  debugMode,
  instances,
  paused,
}: {
  debugMode: CliffLandscapeDebugMode
  instances: readonly VegetationInstance[]
  paused: boolean
}) {
  const ref = useRef<InstancedMesh>(null)
  const geometry = useMemo(
    () => attachInstanceAttributes(new IcosahedronGeometry(1, 1), instances),
    [instances],
  )
  const materialBundle = useMemo(
    () =>
      createRootedWindMaterial({
        debugMode,
        maxY: 1,
        minY: -1,
        rootColor: '#315f36',
        strength: 0.13,
        tipColor: '#5d8d45',
      }),
    [debugMode],
  )

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new Object3D()
    for (let index = 0; index < instances.length; index += 1) {
      const instance = instances[index]
      if (!instance) continue
      dummy.position.set(instance.x, instance.y + instance.scale * 0.66, instance.z)
      dummy.rotation.set(0, instance.yaw, 0)
      dummy.scale.set(instance.scale * 1.15, instance.scale * 0.68, instance.scale * 0.96)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [instances])

  useFrame((_, delta) => {
    if (!paused) materialBundle.time.value += Math.min(delta, 0.05)
  })

  useEffect(
    () => () => {
      geometry.dispose()
      materialBundle.material.dispose()
    },
    [geometry, materialBundle],
  )

  if (instances.length === 0) return null
  return (
    <instancedMesh
      args={[undefined, undefined, instances.length]}
      castShadow
      frustumCulled={false}
      name="procedural-cliff-shrubs"
      receiveShadow
      ref={ref}
      renderOrder={13}
    >
      <primitive attach="geometry" object={geometry} />
      <primitive attach="material" object={materialBundle.material} />
    </instancedMesh>
  )
}

function PineInstances({
  debugMode,
  instances,
  paused,
}: {
  debugMode: CliffLandscapeDebugMode
  instances: readonly VegetationInstance[]
  paused: boolean
}) {
  const trunkRef = useRef<InstancedMesh>(null)
  const branchRef = useRef<InstancedMesh>(null)
  const canopyRef = useRef<InstancedMesh>(null)
  const plan = useMemo(() => createPineRenderPlan(instances), [instances])
  const trunkGeometry = useMemo(() => new CylinderGeometry(0.72, 1, 1, 7, 3, false), [])
  const branchGeometry = useMemo(() => new CylinderGeometry(0.62, 0.84, 1, 6, 1, false), [])
  const canopyGeometry = useMemo(
    () => attachInstanceAttributes(new IcosahedronGeometry(1, 1), plan.canopies),
    [plan.canopies],
  )
  const trunkMaterial = useMemo(
    () => new MeshStandardMaterial({ color: '#6e4a35', roughness: 0.96 }),
    [],
  )
  const canopyMaterial = useMemo(
    () =>
      createRootedWindMaterial({
        debugMode,
        maxY: 1,
        minY: -1,
        rootColor: '#28573b',
        strength: 0.09,
        tipColor: '#3f7750',
      }),
    [debugMode],
  )

  useLayoutEffect(() => {
    const trunkMesh = trunkRef.current
    const branchMesh = branchRef.current
    const canopyMesh = canopyRef.current
    if (trunkMesh) {
      const dummy = new Object3D()
      for (let index = 0; index < instances.length; index += 1) {
        const tree = instances[index]
        if (!tree) continue
        dummy.position.set(tree.x, tree.y + tree.scale * 2.55, tree.z)
        dummy.rotation.set(0, tree.yaw, 0)
        dummy.scale.set(tree.scale * 0.3, tree.scale * 5.1, tree.scale * 0.3)
        dummy.updateMatrix()
        trunkMesh.setMatrixAt(index, dummy.matrix)
      }
      trunkMesh.instanceMatrix.needsUpdate = true
    }
    if (branchMesh) {
      const dummy = new Object3D()
      for (let index = 0; index < plan.branches.length; index += 1) {
        const branch = plan.branches[index]
        if (!branch) continue
        setCylinderTransform(dummy, branch.start, branch.end, branch.radius)
        branchMesh.setMatrixAt(index, dummy.matrix)
      }
      branchMesh.instanceMatrix.needsUpdate = true
    }
    if (canopyMesh) {
      const dummy = new Object3D()
      for (let index = 0; index < plan.canopies.length; index += 1) {
        const canopy = plan.canopies[index]
        if (!canopy) continue
        dummy.position.set(canopy.x, canopy.y, canopy.z)
        dummy.rotation.set(0, canopy.yaw, 0)
        dummy.scale.set(canopy.scale * 1.75, canopy.scale * 0.68, canopy.scale * 1.38)
        dummy.updateMatrix()
        canopyMesh.setMatrixAt(index, dummy.matrix)
      }
      canopyMesh.instanceMatrix.needsUpdate = true
    }
  }, [instances, plan])

  useFrame((_, delta) => {
    if (!paused) canopyMaterial.time.value += Math.min(delta, 0.05)
  })

  useEffect(
    () => () => {
      trunkGeometry.dispose()
      branchGeometry.dispose()
      canopyGeometry.dispose()
      trunkMaterial.dispose()
      canopyMaterial.material.dispose()
    },
    [branchGeometry, canopyGeometry, canopyMaterial, trunkGeometry, trunkMaterial],
  )

  if (instances.length === 0) return null
  return (
    <group name="procedural-mediterranean-pines">
      <instancedMesh
        args={[undefined, undefined, instances.length]}
        castShadow
        frustumCulled={false}
        receiveShadow
        ref={trunkRef}
      >
        <primitive attach="geometry" object={trunkGeometry} />
        <primitive attach="material" object={trunkMaterial} />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, plan.branches.length]}
        castShadow
        frustumCulled={false}
        receiveShadow
        ref={branchRef}
      >
        <primitive attach="geometry" object={branchGeometry} />
        <primitive attach="material" object={trunkMaterial} />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, plan.canopies.length]}
        castShadow
        frustumCulled={false}
        receiveShadow
        ref={canopyRef}
      >
        <primitive attach="geometry" object={canopyGeometry} />
        <primitive attach="material" object={canopyMaterial.material} />
      </instancedMesh>
    </group>
  )
}

function createPineRenderPlan(instances: readonly VegetationInstance[]) {
  const branches: Array<{ end: Vector3; radius: number; start: Vector3 }> = []
  const canopies: VegetationInstance[] = []
  for (const tree of instances) {
    const crownY = tree.y + tree.scale * 5.05
    for (let lobeIndex = 0; lobeIndex < 5; lobeIndex += 1) {
      const central = lobeIndex === 0
      const angle = tree.yaw + (lobeIndex / 4) * Math.PI * 2 + tree.seed * 0.8
      const radius = central ? 0 : tree.scale * (1.35 + ((lobeIndex * 17) % 3) * 0.18)
      const x = tree.x + Math.cos(angle) * radius
      const z = tree.z + Math.sin(angle) * radius
      const y = crownY + tree.scale * (central ? 0.35 : ((lobeIndex % 2) - 0.5) * 0.26)
      canopies.push({
        scale: tree.scale * (central ? 1.08 : 0.82 + ((lobeIndex * 11) % 4) * 0.055),
        seed: tree.seed + lobeIndex * 0.137,
        x,
        y,
        yaw: angle,
        z,
      })
      if (!central) {
        branches.push({
          end: new Vector3(x, y - tree.scale * 0.22, z),
          radius: tree.scale * 0.11,
          start: new Vector3(tree.x, tree.y + tree.scale * 3.75, tree.z),
        })
      }
    }
  }
  return { branches, canopies }
}

function CypressInstances({
  debugMode,
  instances,
  paused,
}: {
  debugMode: CliffLandscapeDebugMode
  instances: readonly VegetationInstance[]
  paused: boolean
}) {
  const ref = useRef<InstancedMesh>(null)
  const geometry = useMemo(
    () => attachInstanceAttributes(new ConeGeometry(1, 1, 8, 4, false), instances),
    [instances],
  )
  const materialBundle = useMemo(
    () =>
      createRootedWindMaterial({
        debugMode,
        maxY: 0.5,
        minY: -0.5,
        rootColor: '#183e31',
        strength: 0.07,
        tipColor: '#2f6645',
      }),
    [debugMode],
  )

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new Object3D()
    for (let index = 0; index < instances.length; index += 1) {
      const tree = instances[index]
      if (!tree) continue
      const height = tree.scale * 5.9
      dummy.position.set(tree.x, tree.y + height * 0.5, tree.z)
      dummy.rotation.set(0, tree.yaw, 0)
      dummy.scale.set(tree.scale * 0.82, height, tree.scale * 0.82)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [instances])

  useFrame((_, delta) => {
    if (!paused) materialBundle.time.value += Math.min(delta, 0.05)
  })

  useEffect(
    () => () => {
      geometry.dispose()
      materialBundle.material.dispose()
    },
    [geometry, materialBundle],
  )

  if (instances.length === 0) return null
  return (
    <instancedMesh
      args={[undefined, undefined, instances.length]}
      castShadow
      frustumCulled={false}
      name="procedural-cypress-trees"
      receiveShadow
      ref={ref}
    >
      <primitive attach="geometry" object={geometry} />
      <primitive attach="material" object={materialBundle.material} />
    </instancedMesh>
  )
}

function createGrassClusterGeometry() {
  const positions: number[] = []
  const indices: number[] = []
  const planes = 3
  const segments = 4
  for (let plane = 0; plane < planes; plane += 1) {
    const angle = (plane / planes) * Math.PI
    const cosAngle = Math.cos(angle)
    const sinAngle = Math.sin(angle)
    const base = positions.length / 3
    for (let segment = 0; segment <= segments; segment += 1) {
      const t = segment / segments
      const halfWidth = 0.105 * (1 - t) ** 1.2 + 0.008
      const lean = t * t * 0.08
      for (const side of [-1, 1]) {
        const localX = halfWidth * side
        positions.push(localX * cosAngle - lean * sinAngle, t, localX * sinAngle + lean * cosAngle)
      }
    }
    for (let segment = 0; segment < segments; segment += 1) {
      const row = base + segment * 2
      indices.push(row, row + 2, row + 1, row + 1, row + 2, row + 3)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

function attachInstanceAttributes(
  geometry: BufferGeometry,
  instances: readonly VegetationInstance[],
) {
  const origins = new Float32Array(instances.length * 2)
  const seeds = new Float32Array(instances.length)
  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index]
    if (!instance) continue
    origins[index * 2] = instance.x
    origins[index * 2 + 1] = instance.z
    seeds[index] = instance.seed
  }
  geometry.setAttribute('aOrigin', new InstancedBufferAttribute(origins, 2))
  geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 1))
  return geometry
}

function createGrassMaterial(debugMode: CliffLandscapeDebugMode): WindMaterialBundle {
  if (getMaterialRendererBackend() === 'webgl') {
    return {
      material: new MeshStandardMaterial({
        color: debugMode === 'wind' ? '#5ed4e6' : '#789d45',
        roughness: 0.9,
        side: DoubleSide,
      }),
      time: { value: 0 },
    }
  }

  const time = uniform(0)
  const origin = attribute<'vec2'>('aOrigin', 'vec2')
  const instanceSeed = attribute<'float'>('aSeed', 'float')
  const bladeT = tslClamp(positionLocal.y, 0, 1)
  const primary = sin(
    time
      .mul(0.92)
      .add(origin.x.mul(WIND_DIRECTION.x * 0.13))
      .add(origin.y.mul(WIND_DIRECTION.z * 0.13))
      .add(instanceSeed.mul(6.283)),
  )
  const gust = primary
    .mul(0.68)
    .add(sin(time.mul(1.81).add(origin.x.mul(0.045)).sub(origin.y.mul(0.052))).mul(0.24))
  const rooted = pow(bladeT, 1.55)
  const bend = gust.mul(0.34).mul(rooted)
  const deformed = vec3(
    positionLocal.x.add(bend.mul(WIND_DIRECTION.x)),
    positionLocal.y.sub(gust.abs().mul(0.055).mul(rooted)),
    positionLocal.z.add(bend.mul(WIND_DIRECTION.z)),
  )
  const patch = hash(instanceSeed.add(9.17))
  const gradientA = mix(tslColor('#55783c'), tslColor('#9eba55'), pow(bladeT, 1.18))
  const gradientB = mix(tslColor('#6f8240'), tslColor('#c4b95b'), pow(bladeT, 1.12))
  const finalColor = mix(gradientA, gradientB, patch.mul(0.72))
  const windColor = mix(tslColor('#27678a'), tslColor('#f0c65b'), gust.abs())
  const material = new MeshStandardNodeMaterial({ side: DoubleSide })
  material.positionNode = deformed
  material.colorNode = debugMode === 'wind' ? windColor : finalColor
  material.roughnessNode = float(0.9)
  return { material, time }
}

function createRootedWindMaterial({
  debugMode,
  maxY,
  minY,
  rootColor,
  strength,
  tipColor,
}: {
  debugMode: CliffLandscapeDebugMode
  maxY: number
  minY: number
  rootColor: string
  strength: number
  tipColor: string
}): WindMaterialBundle {
  if (getMaterialRendererBackend() === 'webgl') {
    return {
      material: new MeshStandardMaterial({
        color: debugMode === 'wind' ? '#5ed4e6' : rootColor,
        flatShading: true,
        roughness: 0.92,
      }),
      time: { value: 0 },
    }
  }

  const time = uniform(0)
  const origin = attribute<'vec2'>('aOrigin', 'vec2')
  const instanceSeed = attribute<'float'>('aSeed', 'float')
  const rootT = tslClamp(positionLocal.y.sub(minY).div(Math.max(0.001, maxY - minY)), 0, 1)
  const wave = sin(
    time
      .mul(0.72)
      .add(origin.x.mul(WIND_DIRECTION.x * 0.105))
      .add(origin.y.mul(WIND_DIRECTION.z * 0.105))
      .add(instanceSeed.mul(5.4)),
  )
    .mul(0.72)
    .add(sin(time.mul(1.37).add(instanceSeed.mul(11.7))).mul(0.2))
  const rooted = pow(rootT, 1.72)
  const bend = wave.mul(strength).mul(rooted)
  const deformed = vec3(
    positionLocal.x.add(bend.mul(WIND_DIRECTION.x)),
    positionLocal.y.sub(
      wave
        .abs()
        .mul(strength * 0.12)
        .mul(rooted),
    ),
    positionLocal.z.add(bend.mul(WIND_DIRECTION.z)),
  )
  const tonalVariation = mix(float(0.82), float(1.14), hash(instanceSeed.add(4.3)))
  const finalColor = mix(tslColor(rootColor), tslColor(tipColor), rootT.mul(0.62).add(0.18)).mul(
    tonalVariation,
  )
  const windColor = mix(tslColor('#27678a'), tslColor('#f2c24f'), wave.abs())
  const material = new MeshStandardNodeMaterial({ flatShading: true })
  material.positionNode = deformed
  material.colorNode = debugMode === 'wind' ? windColor : finalColor
  material.roughnessNode = float(0.92)
  return { material, time }
}

function RockInstances({ instances }: { instances: readonly RockInstance[] }) {
  const colors = ['#a85442', '#c96d4d', '#8f493e'] as const
  return (
    <group name="procedural-cliff-outcrops">
      {colors.map((color, palette) => (
        <RockPaletteInstances
          color={color}
          instances={instances.filter((instance) => instance.palette === palette)}
          key={color}
        />
      ))}
    </group>
  )
}

function RockPaletteInstances({
  color,
  instances,
}: {
  color: string
  instances: readonly RockInstance[]
}) {
  const ref = useRef<InstancedMesh>(null)
  const geometry = useMemo(() => new DodecahedronGeometry(1, 0), [])
  const material = useMemo(
    () => new MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 }),
    [color],
  )

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new Object3D()
    for (let index = 0; index < instances.length; index += 1) {
      const rock = instances[index]
      if (!rock) continue
      dummy.position.set(rock.x, rock.y, rock.z)
      dummy.rotation.set(rock.pitch, rock.yaw, rock.roll)
      dummy.scale.set(rock.scaleX, rock.scaleY, rock.scaleZ)
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [instances])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  if (instances.length === 0) return null
  return (
    <instancedMesh
      args={[undefined, undefined, instances.length]}
      castShadow
      frustumCulled={false}
      receiveShadow
      ref={ref}
      renderOrder={9}
    >
      <primitive attach="geometry" object={geometry} />
      <primitive attach="material" object={material} />
    </instancedMesh>
  )
}

function CliffRoadNetworkLayer({
  elevation,
  perimeter,
  roads,
}: {
  elevation: number
  perimeter: readonly Point2[]
  roads: readonly LandrushRoadSegment[]
}) {
  const geometries = useMemo(
    () => createStylizedPathNetworkGeometries({ elevation, perimeter, roads }),
    [elevation, perimeter, roads],
  )

  useEffect(
    () => () => {
      geometries.sidewalks.dispose()
      geometries.seams.dispose()
      geometries.roadbeds.dispose()
      geometries.roadbedWalls.dispose()
      geometries.outerCurbWalls.dispose()
    },
    [geometries],
  )

  return (
    <group name="procedural-cliff-road-network">
      {hasPositions(geometries.outerCurbWalls) ? (
        <mesh geometry={geometries.outerCurbWalls} renderOrder={20}>
          <meshStandardMaterial color="#8e826f" roughness={0.96} side={DoubleSide} />
        </mesh>
      ) : null}
      {hasPositions(geometries.sidewalks) ? (
        <mesh geometry={geometries.sidewalks} receiveShadow renderOrder={21}>
          <meshStandardMaterial color="#c9c1a7" roughness={0.94} side={DoubleSide} />
        </mesh>
      ) : null}
      {hasPositions(geometries.roadbedWalls) ? (
        <mesh geometry={geometries.roadbedWalls} renderOrder={22}>
          <meshStandardMaterial color="#3f474b" roughness={0.92} side={DoubleSide} />
        </mesh>
      ) : null}
      {hasPositions(geometries.seams) ? (
        <mesh geometry={geometries.seams} renderOrder={23}>
          <meshStandardMaterial color="#ddd3b7" roughness={0.94} side={DoubleSide} />
        </mesh>
      ) : null}
      {hasPositions(geometries.roadbeds) ? (
        <mesh geometry={geometries.roadbeds} receiveShadow renderOrder={24}>
          <meshStandardMaterial color="#586167" roughness={0.9} side={DoubleSide} />
        </mesh>
      ) : null}
    </group>
  )
}

function LandscapeRuntimeProbe({
  estimatedTriangles,
  onMetrics,
}: {
  estimatedTriangles: number
  onMetrics: (metrics: CliffLandscapeRuntimeMetrics) => void
}) {
  const elapsedRef = useRef(0)
  const framesRef = useRef(0)
  const lastCallsRef = useRef(0)
  useFrame(({ gl }, delta) => {
    elapsedRef.current += Math.min(delta, 0.1)
    framesRef.current += 1
    if (elapsedRef.current < 0.75) return
    const info = (
      gl as unknown as {
        info?: { render?: { calls?: number; triangles?: number } }
      }
    ).info?.render
    const currentCalls = info?.calls ?? 0
    const callDelta =
      currentCalls >= lastCallsRef.current ? currentCalls - lastCallsRef.current : currentCalls
    onMetrics({
      drawCalls: Math.round(callDelta / Math.max(1, framesRef.current)),
      fps: framesRef.current / Math.max(0.001, elapsedRef.current),
      triangles: info?.triangles && info.triangles > 0 ? info.triangles : estimatedTriangles,
    })
    lastCallsRef.current = currentCalls
    elapsedRef.current = 0
    framesRef.current = 0
  })
  return null
}

function setCylinderTransform(object: Object3D, start: Vector3, end: Vector3, radius: number) {
  const direction = new Vector3().subVectors(end, start)
  const length = direction.length()
  const midpoint = new Vector3().addVectors(start, end).multiplyScalar(0.5)
  const quaternion = new Quaternion().setFromUnitVectors(UP, direction.normalize())
  object.position.copy(midpoint)
  object.quaternion.copy(quaternion)
  object.scale.set(radius, length, radius)
  object.updateMatrix()
}

function cleanRing(points: readonly Point2[]) {
  const result = [...points]
  const first = result[0]
  const last = result.at(-1)
  if (first && last && Math.hypot(first.x - last.x, first.z - last.z) < 0.0001) {
    result.pop()
  }
  return result
}

function centerOf(points: readonly Point2[]) {
  if (points.length === 0) return { x: 0, z: 0 }
  const sum = points.reduce((total, point) => ({ x: total.x + point.x, z: total.z + point.z }), {
    x: 0,
    z: 0,
  })
  return { x: sum.x / points.length, z: sum.z / points.length }
}

function boundsOf(points: readonly Point2[]) {
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minZ = Math.min(minZ, point.z)
    maxX = Math.max(maxX, point.x)
    maxZ = Math.max(maxZ, point.z)
  }
  return { maxX, maxZ, minX, minZ }
}

function ringSegments(points: readonly Point2[]) {
  const segments: Segment2[] = []
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    if (!start || !end) continue
    segments.push({ ax: start.x, az: start.z, bx: end.x, bz: end.z })
  }
  return segments
}

function polylineSegments(points: readonly Point2[]) {
  const segments: Segment2[] = []
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    if (!start || !end) continue
    segments.push({ ax: start.x, az: start.z, bx: end.x, bz: end.z })
  }
  return segments
}

function pointInPolygon(x: number, z: number, points: readonly Point2[]) {
  let inside = false
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const currentPoint = points[index]
    const previousPoint = points[previous]
    if (!currentPoint || !previousPoint) continue
    const intersects =
      currentPoint.z > z !== previousPoint.z > z &&
      x <
        ((previousPoint.x - currentPoint.x) * (z - currentPoint.z)) /
          (previousPoint.z - currentPoint.z + Number.EPSILON) +
          currentPoint.x
    if (intersects) inside = !inside
  }
  return inside
}

function minDistanceToSegments(x: number, z: number, segments: readonly Segment2[]) {
  if (segments.length === 0) return Infinity
  let minimum = Infinity
  for (const segment of segments) {
    const dx = segment.bx - segment.ax
    const dz = segment.bz - segment.az
    const lengthSquared = dx * dx + dz * dz
    const t =
      lengthSquared > 0
        ? clamp(((x - segment.ax) * dx + (z - segment.az) * dz) / lengthSquared, 0, 1)
        : 0
    const px = segment.ax + dx * t
    const pz = segment.az + dz * t
    minimum = Math.min(minimum, Math.hypot(x - px, z - pz))
  }
  return minimum
}

function indexedRingPoint(points: readonly Point2[], t: number) {
  const scaled = t * points.length
  const index = Math.floor(scaled) % points.length
  const next = (index + 1) % points.length
  const alpha = scaled - Math.floor(scaled)
  const a = points[index] ?? { x: 0, z: 0 }
  const b = points[next] ?? a
  return { x: lerp(a.x, b.x, alpha), z: lerp(a.z, b.z, alpha) }
}

function valueNoise(x: number, z: number, seed: number) {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  const a = latticeHash(ix, iz, seed)
  const b = latticeHash(ix + 1, iz, seed)
  const c = latticeHash(ix, iz + 1, seed)
  const d = latticeHash(ix + 1, iz + 1, seed)
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz)
}

function fbm(x: number, z: number, seed: number) {
  let value = 0
  let amplitude = 0.54
  let frequency = 1
  let total = 0
  for (let octave = 0; octave < 4; octave += 1) {
    value += valueNoise(x * frequency, z * frequency, seed + octave * 1013) * amplitude
    total += amplitude
    amplitude *= 0.5
    frequency *= 2.03
  }
  return value / total
}

function latticeHash(x: number, z: number, seed: number) {
  let value = Math.imul(x, 0x1f123bb5) ^ Math.imul(z, 0x5f356495) ^ seed
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296
}

function hasPositions(geometry: BufferGeometry) {
  return (geometry.getAttribute('position')?.count ?? 0) > 0
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

function clamp01(value: number) {
  return clamp(value, 0, 1)
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / Math.max(0.000001, edge1 - edge0))
  return t * t * (3 - 2 * t)
}

class SeededRandom {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  next() {
    this.state += 0x6d2b79f5
    let value = this.state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }

  range(minimum: number, maximum: number) {
    return minimum + (maximum - minimum) * this.next()
  }

  integer(minimum: number, maximum: number) {
    return Math.floor(this.range(minimum, maximum))
  }
}
