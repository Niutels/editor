'use client'

import { OrthographicCamera } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Shape, Vector3 } from 'three'
import type { LandrushIsland, LandrushPoint2 } from '@/components/landrush/types'
import type { ParcelsRoadsViewPreset } from './parcels-roads-view-presets'

type ParcelsRoadsSceneProps = {
  island: LandrushIsland
  preset: ParcelsRoadsViewPreset
}

export function ParcelsRoadsScene({ island, preset }: ParcelsRoadsSceneProps) {
  return (
    <Canvas
      className="h-full w-full"
      dpr={[1, 1.5]}
      frameloop="demand"
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      shadows={false}
    >
      <color args={['#1e8798']} attach="background" />
      <OrthographicCamera
        far={900}
        makeDefault
        near={0.1}
        position={preset.camera.position}
        zoom={preset.camera.zoom}
      />
      <CameraTarget target={preset.camera.target} />
      <ambientLight intensity={1.55} />
      <directionalLight intensity={1.7} position={[50, 80, 42]} />
      <ParcelsRoadsMeshes island={island} />
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

function ParcelsRoadsMeshes({ island }: { island: LandrushIsland }) {
  const islandShape = useMemo(() => shapeFromPoints(island.perimeter.points), [island])
  const roadGeometries = useMemo(
    () => island.roads.segments.map((road) => ribbonGeometry(road.points, road.width, 0.19)),
    [island],
  )
  const sidewalkGeometries = useMemo(
    () =>
      island.roads.sidewalks.map((sidewalk) =>
        ribbonGeometry(sidewalk.points, sidewalk.width, 0.16),
      ),
    [island],
  )
  const frameRef = useRef(0)
  const { invalidate } = useThree()

  useEffect(
    () => () => {
      for (const geometry of roadGeometries) geometry.dispose()
    },
    [roadGeometries],
  )
  useEffect(
    () => () => {
      for (const geometry of sidewalkGeometries) geometry.dispose()
    },
    [sidewalkGeometries],
  )

  useFrame(() => {
    if (frameRef.current >= 2) return
    frameRef.current += 1
    invalidate()
  })

  return (
    <group>
      <mesh position={[0, -0.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[290, 290]} />
        <meshBasicMaterial color="#1e8798" />
      </mesh>
      <mesh position={[0, -0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[islandShape]} />
        <meshBasicMaterial color="#d8cb91" side={DoubleSide} />
      </mesh>
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[islandShape]} />
        <meshStandardMaterial color="#6f9748" roughness={0.92} side={DoubleSide} />
      </mesh>
      {island.parcels.map((parcel) => (
        <mesh key={parcel.id} position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <shapeGeometry args={[shapeFromPoints(parcel.outline)]} />
          <meshBasicMaterial
            color={parcel.kind === 'owner' ? '#f4c430' : parcel.fillColor}
            opacity={parcel.kind === 'owner' ? 0.84 : 0.66}
            side={DoubleSide}
            transparent
          />
        </mesh>
      ))}
      {sidewalkGeometries.map((geometry, index) => (
        <mesh geometry={geometry} key={`sidewalk-${index}`} renderOrder={6}>
          <meshBasicMaterial color="#efe6c8" side={DoubleSide} />
        </mesh>
      ))}
      {roadGeometries.map((geometry, index) => (
        <mesh geometry={geometry} key={`road-${index}`} renderOrder={7}>
          <meshBasicMaterial color="#65737a" side={DoubleSide} />
        </mesh>
      ))}
      {island.parcels.map((parcel) => (
        <group
          key={`entry-${parcel.id}`}
          position={[parcel.entryPoint.x, 0.32, parcel.entryPoint.z]}
        >
          <mesh>
            <cylinderGeometry args={[0.62, 0.62, 0.18, 18]} />
            <meshBasicMaterial color={parcel.kind === 'owner' ? '#fff2a8' : '#eaf3de'} />
          </mesh>
          <mesh position={[0, 0.24, 0]}>
            <sphereGeometry args={[0.34, 12, 8]} />
            <meshBasicMaterial color={parcel.kind === 'owner' ? '#f2a900' : '#497a69'} />
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

function ribbonGeometry(points: readonly LandrushPoint2[], width: number, y: number) {
  const geometry = new BufferGeometry()
  const vertices: number[] = []
  const half = width / 2
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!
    const end = points[index + 1]!
    const normal = normalForSegment(start, end)
    const a = { x: start.x + normal.x * half, z: start.z + normal.z * half }
    const b = { x: start.x - normal.x * half, z: start.z - normal.z * half }
    const c = { x: end.x + normal.x * half, z: end.z + normal.z * half }
    const d = { x: end.x - normal.x * half, z: end.z - normal.z * half }
    vertices.push(a.x, y, a.z, b.x, y, b.z, c.x, y, c.z, b.x, y, b.z, d.x, y, d.z, c.x, y, c.z)
  }
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.computeVertexNormals()
  return geometry
}

function normalForSegment(start: LandrushPoint2, end: LandrushPoint2) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const length = Math.max(Math.hypot(dx, dz), 0.000001)
  return { x: -dz / length, z: dx / length }
}
