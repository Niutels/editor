'use client'

import { OrthographicCamera } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { DoubleSide, Shape, Vector3 } from 'three'
import type { LandrushIsland, LandrushPoint2 } from '@/components/landrush/types'
import type { IslandViewPreset } from '@/components/landrush-lab/island-view-presets'

type IslandSceneProps = {
  island: LandrushIsland
  preset: IslandViewPreset
}

const GRASS_COLORS = ['#5f8f42', '#80a84e', '#3f7a3d', '#a9bd63'] as const

export function IslandScene({ island, preset }: IslandSceneProps) {
  return (
    <Canvas
      className="h-full w-full"
      dpr={[1, 1.5]}
      frameloop="demand"
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      shadows={false}
    >
      <color args={['#087fa4']} attach="background" />
      <OrthographicCamera
        far={800}
        makeDefault
        near={0.1}
        position={preset.camera.position}
        zoom={preset.camera.zoom}
      />
      <CameraTarget target={preset.camera.target} />
      <ambientLight intensity={1.5} />
      <directionalLight intensity={1.8} position={[40, 80, 30]} />
      <IslandMeshes island={island} />
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

function IslandMeshes({ island }: { island: LandrushIsland }) {
  const baseShape = useMemo(() => shapeFromPoints(island.perimeter.points), [island])
  const grassPatches = useMemo(() => createGrassPatches(island.perimeter.points), [island])
  const frameRef = useRef(0)
  const { invalidate } = useThree()

  useFrame(() => {
    if (frameRef.current > 2) return
    frameRef.current += 1
    invalidate()
  })

  return (
    <group>
      <mesh position={[0, -0.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[320, 320]} />
        <meshBasicMaterial color="#087fa4" />
      </mesh>

      <mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[baseShape]} />
        <meshBasicMaterial color="#d5c486" side={DoubleSide} />
      </mesh>

      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[baseShape]} />
        <meshStandardMaterial color="#638f40" roughness={0.88} side={DoubleSide} />
      </mesh>

      {grassPatches.map((patch, index) => (
        <mesh
          key={patch.id}
          position={[0, 0.035 + index * 0.002, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <shapeGeometry args={[shapeFromPoints(patch.points)]} />
          <meshStandardMaterial
            color={GRASS_COLORS[patch.colorIndex]}
            opacity={0.54}
            roughness={0.92}
            side={DoubleSide}
            transparent
          />
        </mesh>
      ))}

      {island.trees.slice(0, 54).map((tree) => (
        <group
          key={tree.id}
          position={[tree.position.x, 0.04, tree.position.z]}
          rotation={[0, tree.rotation, 0]}
        >
          <mesh position={[0, 0.34, 0]}>
            <cylinderGeometry args={[0.11, 0.16, 0.68, 5]} />
            <meshStandardMaterial color="#5b432b" roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.03, 0]}>
            {tree.kind === 'pine' ? (
              <coneGeometry args={[tree.canopyRadius * 0.72, tree.canopyRadius * 1.9, 7]} />
            ) : (
              <dodecahedronGeometry args={[tree.canopyRadius * 0.78, 0]} />
            )}
            <meshStandardMaterial
              color={tree.kind === 'flowering' ? '#79a94f' : '#2f743d'}
              roughness={0.86}
            />
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

function createGrassPatches(perimeter: readonly LandrushPoint2[]) {
  const centers = [
    { x: -22, z: -8, rx: 24, rz: 15, colorIndex: 1 },
    { x: 13, z: 14, rx: 28, rz: 18, colorIndex: 2 },
    { x: 24, z: -18, rx: 18, rz: 22, colorIndex: 3 },
    { x: -7, z: 27, rx: 22, rz: 12, colorIndex: 0 },
  ]

  return centers.map((center, index) => ({
    colorIndex: center.colorIndex,
    id: `grass-region-${index}`,
    points: Array.from({ length: 22 }, (_, step) => {
      const angle = (step / 21) * Math.PI * 2
      let radius = 0.74 + Math.sin(angle * 3 + index) * 0.1 + Math.cos(angle * 5) * 0.06
      let point = {
        x: center.x + Math.cos(angle) * center.rx * radius,
        z: center.z + Math.sin(angle) * center.rz * radius,
      }
      for (let shrink = 0; shrink < 8 && !pointInPolygon(point, perimeter); shrink += 1) {
        radius *= 0.82
        point = {
          x: center.x + Math.cos(angle) * center.rx * radius,
          z: center.z + Math.sin(angle) * center.rz * radius,
        }
      }
      return point
    }),
  }))
}

function pointInPolygon(point: LandrushPoint2, polygon: readonly LandrushPoint2[]) {
  let inside = false
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; index += 1) {
    const current = polygon[index]
    const previous = polygon[previousIndex]
    if (!(current && previous)) continue
    const intersects =
      current.z > point.z !== previous.z > point.z &&
      point.x <
        ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z || 0.000001) +
          current.x
    if (intersects) inside = !inside
    previousIndex = index
  }
  return inside
}
