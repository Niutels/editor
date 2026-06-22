'use client'

import {
  createLandrushWaterMaterial,
  LANDRUSH_WATER_SURFACE_ELEVATION,
  type LandrushWaterSurfaceMaterial,
  type LandrushWaterSurfaceParameters,
} from '@pascal-app/nodes'
import { OrbitControls, OrthographicCamera } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  LineBasicMaterial,
  Shape,
  Line as ThreeLine,
  Vector3,
} from 'three'
import * as THREE from 'three/webgpu'
import type { LandrushIsland, LandrushPoint2 } from '@/components/landrush/types'
import {
  createDepthReferencePerimeter,
  createSmoothedWaterPerimeter,
  createWaterFieldTexture,
  type WaterFieldParameters,
} from './water-field-texture'
import { WATER_PLANE_SIZE } from './water-material'
import type { WaterViewPreset } from './water-view-presets'

type WaterSceneProps = {
  debugLayer: 'shoreline' | null
  fieldParameters: WaterFieldParameters
  island: LandrushIsland
  materialParameters: LandrushWaterSurfaceParameters
  preset: WaterViewPreset
  showDepthReference: boolean
}

const WATER_LAB_RENDERER_CACHE = new WeakMap<HTMLCanvasElement, Promise<THREE.WebGPURenderer>>()
const WATER_LAB_MIN_DISTANCE = 2
const WATER_LAB_MAX_DISTANCE = 1400
const WATER_LAB_MIN_ZOOM = 0.75
const WATER_LAB_MAX_ZOOM = 80

function createWaterLabRenderer(props: { canvas?: HTMLCanvasElement }) {
  const canvas = props.canvas
  const cached = canvas ? WATER_LAB_RENDERER_CACHE.get(canvas) : undefined
  if (cached) return cached

  const promise = (async () => {
    const renderer = new THREE.WebGPURenderer(props as never)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    await renderer.init()
    return renderer
  })()
  if (canvas) WATER_LAB_RENDERER_CACHE.set(canvas, promise)
  return promise
}

export function WaterScene({
  debugLayer,
  fieldParameters,
  island,
  materialParameters,
  preset,
  showDepthReference,
}: WaterSceneProps) {
  const controlsTarget = useMemo(() => new Vector3(...preset.camera.target), [preset.camera.target])

  return (
    <Canvas
      className="h-full w-full"
      dpr={[1, 1.5]}
      frameloop="always"
      gl={createWaterLabRenderer as never}
      shadows={false}
    >
      <color args={['#164a77']} attach="background" />
      <OrthographicCamera
        far={900}
        makeDefault
        near={0.1}
        position={preset.camera.position}
        zoom={preset.camera.zoom}
      />
      <CameraTarget target={preset.camera.target} />
      <OrbitControls
        dampingFactor={0.08}
        enableDamping
        makeDefault
        maxDistance={WATER_LAB_MAX_DISTANCE}
        maxZoom={WATER_LAB_MAX_ZOOM}
        minDistance={WATER_LAB_MIN_DISTANCE}
        minZoom={WATER_LAB_MIN_ZOOM}
        target={controlsTarget}
      />
      <ambientLight intensity={1.25} />
      <directionalLight intensity={1.9} position={[46, 72, 34]} />
      <WaterMeshes
        debugLayer={debugLayer}
        fieldParameters={fieldParameters}
        island={island}
        materialParameters={materialParameters}
        showDepthReference={showDepthReference}
      />
    </Canvas>
  )
}

function CameraTarget({ target }: { target: [number, number, number] }) {
  const { camera, invalidate } = useThree()

  useEffect(() => {
    camera.lookAt(new Vector3(...target))
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, invalidate, target])

  return null
}

function WaterMeshes({
  debugLayer,
  fieldParameters,
  island,
  materialParameters,
  showDepthReference,
}: {
  debugLayer: 'shoreline' | null
  fieldParameters: WaterFieldParameters
  island: LandrushIsland
  materialParameters: LandrushWaterSurfaceParameters
  showDepthReference: boolean
}) {
  const renderer = useThree((state) => state.gl)
  const shorelinePoints = useMemo(
    () => createSmoothedWaterPerimeter(island.perimeter.points),
    [island],
  )
  const depthReferencePoints = useMemo(
    () => createDepthReferencePerimeter(shorelinePoints, fieldParameters),
    [fieldParameters, shorelinePoints],
  )
  const islandShape = useMemo(() => shapeFromPoints(shorelinePoints), [shorelinePoints])
  const beachShape = useMemo(() => shapeFromPoints(depthReferencePoints), [depthReferencePoints])
  const depthReferenceGeometry = useMemo(
    () => lineLoopGeometryFromPoints(depthReferencePoints),
    [depthReferencePoints],
  )
  const depthReferenceLine = useMemo(() => {
    const line = new ThreeLine(
      depthReferenceGeometry,
      new LineBasicMaterial({
        color: '#ff4fd8',
        depthTest: false,
        opacity: 0.95,
        transparent: true,
      }),
    )
    line.renderOrder = 30
    return line
  }, [depthReferenceGeometry])
  const waterField = useMemo(
    () =>
      createWaterFieldTexture({
        parameters: fieldParameters,
        perimeter: shorelinePoints,
        planeSize: WATER_PLANE_SIZE,
      }),
    [fieldParameters, shorelinePoints],
  )
  const waterBounds = useMemo(() => createWaterBounds(WATER_PLANE_SIZE), [])
  const effectiveMaterialParameters = useMemo(
    () =>
      debugLayer === 'shoreline'
        ? {
            ...materialParameters,
            iceRatio: 0,
            ripplesRatio: 0,
            splashesRatio: 0,
          }
        : materialParameters,
    [debugLayer, materialParameters],
  )
  const material = useMemo(
    () =>
      createLandrushWaterMaterial(
        renderer as unknown as THREE.WebGPURenderer,
        waterField,
        waterBounds,
        effectiveMaterialParameters,
      ),
    [effectiveMaterialParameters, renderer, waterBounds, waterField],
  )
  const materialRef = useRef<LandrushWaterSurfaceMaterial>(material)

  useEffect(() => {
    materialRef.current = material
    return () => material.dispose()
  }, [material])

  useEffect(() => () => waterField.dispose(), [waterField])
  useEffect(() => () => depthReferenceGeometry.dispose(), [depthReferenceGeometry])
  useEffect(() => () => depthReferenceLine.material.dispose(), [depthReferenceLine])

  useFrame((_, delta) => {
    materialRef.current.userData.landrushWater.update(delta)
  })

  return (
    <group>
      <mesh
        position={[0, LANDRUSH_WATER_SURFACE_ELEVATION, 0]}
        renderOrder={1}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[WATER_PLANE_SIZE, WATER_PLANE_SIZE, 1, 1]} />
        <primitive attach="material" object={material} />
      </mesh>

      <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[beachShape]} />
        <meshBasicMaterial color="#d8cb90" side={DoubleSide} />
      </mesh>

      <mesh position={[0, -0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[islandShape]} />
        <meshStandardMaterial color="#6f9844" roughness={0.9} side={DoubleSide} />
      </mesh>

      {showDepthReference ? <primitive object={depthReferenceLine} /> : null}

      {island.trees.slice(0, 26).map((tree) => (
        <group
          key={tree.id}
          position={[tree.position.x, 0.02, tree.position.z]}
          rotation={[0, tree.rotation, 0]}
        >
          <mesh position={[0, 0.3, 0]}>
            <cylinderGeometry args={[0.09, 0.13, 0.6, 5]} />
            <meshStandardMaterial color="#60462d" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.88, 0]}>
            <coneGeometry args={[tree.canopyRadius * 0.58, tree.canopyRadius * 1.45, 7]} />
            <meshStandardMaterial color="#2f743d" roughness={0.86} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function shapeFromPoints(points: readonly LandrushPoint2[]) {
  const shape = new Shape()
  const first = points[0]
  if (!first) return shape
  shape.moveTo(first.x, -first.z)
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]
    if (point) shape.lineTo(point.x, -point.z)
  }
  shape.closePath()
  return shape
}

function lineLoopGeometryFromPoints(points: readonly LandrushPoint2[]) {
  const geometry = new BufferGeometry()
  const closedPointCount = points.length + 1
  const positions = new Float32Array(closedPointCount * 3)
  for (let index = 0; index < closedPointCount; index += 1) {
    const point = points[index % points.length]
    if (!point) continue
    positions[index * 3] = point.x
    positions[index * 3 + 1] = 0.16
    positions[index * 3 + 2] = point.z
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  return geometry
}

function createWaterBounds(size: number) {
  const half = size / 2
  return {
    depth: size,
    maxX: half,
    maxZ: half,
    minX: -half,
    minZ: -half,
    width: size,
  }
}
