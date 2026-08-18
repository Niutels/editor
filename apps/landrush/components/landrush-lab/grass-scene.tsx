'use client'

import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { DoubleSide, type ShaderMaterial, Shape, Vector3 } from 'three'
import type { LandrushIsland, LandrushPoint2 } from '@/components/landrush/types'
import { createGrassBladeGeometry } from './grass-blade-geometry'
import { createGrassFieldTexture, GRASS_FIELD_PLANE_SIZE } from './grass-field-texture'
import {
  applyGrassBladeTuning,
  createIslandGrassBladeMaterial,
  type GrassBladeTuning,
} from './grass-material'
import type { GrassViewPreset } from './grass-view-presets'

type GrassSceneProps = {
  island: LandrushIsland
  preset: GrassViewPreset
  tuning: GrassBladeTuning
}

export function GrassScene({ island, preset, tuning }: GrassSceneProps) {
  const controlsTarget = useMemo(() => new Vector3(...preset.camera.target), [preset])

  return (
    <Canvas
      className="h-full w-full"
      dpr={[1, 1.5]}
      frameloop="always"
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      shadows={false}
    >
      <color args={['#77bed0']} attach="background" />
      <PerspectiveCamera
        fov={preset.camera.fov}
        far={900}
        makeDefault
        near={0.1}
        position={preset.camera.position}
      />
      <CameraTarget target={preset.camera.target} />
      <OrbitControls
        dampingFactor={0.08}
        enableDamping
        enablePan
        enableRotate
        enableZoom
        key={preset.id}
        makeDefault
        maxDistance={150}
        minDistance={4}
        target={controlsTarget}
      />
      <GrassMeshes island={island} tuning={tuning} />
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

function GrassMeshes({ island, tuning }: { island: LandrushIsland; tuning: GrassBladeTuning }) {
  const islandShape = useMemo(() => shapeFromPoints(island.perimeter.points), [island])
  const grassField = useMemo(
    () =>
      createGrassFieldTexture({
        density: tuning.density,
        patchSize: tuning.patchSize,
        patchSoftness: tuning.patchSoftness,
        perimeter: island.perimeter.points,
        planeSize: GRASS_FIELD_PLANE_SIZE,
        roads: [],
      }),
    [island, tuning.density, tuning.patchSize, tuning.patchSoftness],
  )
  const bladeGeometry = useMemo(
    () =>
      createGrassBladeGeometry({
        planeSize: GRASS_FIELD_PLANE_SIZE,
      }),
    [],
  )
  const bladeMaterial = useMemo(
    () => createIslandGrassBladeMaterial(grassField.texture, GRASS_FIELD_PLANE_SIZE),
    [grassField.texture],
  )
  const bladeMaterialRef = useRef<ShaderMaterial>(bladeMaterial)
  const { camera } = useThree()

  useEffect(() => {
    bladeMaterialRef.current = bladeMaterial
    return () => bladeMaterial.dispose()
  }, [bladeMaterial])

  useEffect(() => () => grassField.texture.dispose(), [grassField.texture])
  useEffect(() => () => bladeGeometry.dispose(), [bladeGeometry])

  useEffect(() => {
    applyGrassBladeTuning(bladeMaterial, tuning)
  }, [bladeMaterial, tuning])

  useFrame((state) => {
    const material = bladeMaterialRef.current
    const timeUniform = material.uniforms.uTime
    const cameraUniform = material.uniforms.uCameraPosition
    if (timeUniform) timeUniform.value = state.clock.elapsedTime
    if (cameraUniform?.value instanceof Vector3) cameraUniform.value.copy(camera.position)
  })

  return (
    <group>
      <mesh position={[0, -0.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[280, 280]} />
        <meshBasicMaterial color="#77bed0" />
      </mesh>
      <mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[islandShape]} />
        <meshBasicMaterial color="#d9cc92" side={DoubleSide} />
      </mesh>
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[GRASS_FIELD_PLANE_SIZE, GRASS_FIELD_PLANE_SIZE, 1, 1]} />
        <meshBasicMaterial
          depthWrite={false}
          map={grassField.texture}
          side={DoubleSide}
          transparent
        />
      </mesh>
      <mesh frustumCulled={false} geometry={bladeGeometry}>
        <primitive attach="material" object={bladeMaterial} />
      </mesh>
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
