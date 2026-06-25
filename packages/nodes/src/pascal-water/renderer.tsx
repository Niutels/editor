'use client'

import { type PascalWaterNode, useRegistry } from '@pascal-app/core'
import { renderScheduler, useNodeEvents } from '@pascal-app/viewer'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  DoubleSide,
  type Group,
  LineBasicMaterial,
  type Material,
  MeshBasicMaterial,
  Line as ThreeLine,
} from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import {
  createLandrushWaterBodyMaterial,
  LANDRUSH_WATER_BODY_SURFACE_PARAMETERS,
  type LandrushWaterBodySurfaceMaterial,
  type LandrushWaterBodySurfaceParameters,
} from '../landrush-world/water-body-surface'
import { LANDRUSH_WATER_SURFACE_ELEVATION } from '../landrush-world/water-surface'
import {
  createPascalWaterBounds,
  createPascalWaterCliffRingGeometry,
  createPascalWaterLandSurface,
  lineLoopGeometryFromPoints,
  PASCAL_WATER_LOW_ELEVATION,
  PASCAL_WATER_SAND_ELEVATION,
  shapeFromPoints,
  waterShapeWithHole,
} from './surface-geometry'
import {
  createPascalWaterDepthReferencePerimeter,
  createPascalWaterFieldTexture,
  createPascalWaterSmoothedPerimeter,
  createPascalWaveDepthFieldTexture,
  PASCAL_WATER_FIELD_DEPTH_REFERENCE_REACH,
} from './water-field'

const PASCAL_WATER_FALLBACK_MATERIAL = new MeshBasicMaterial({
  color: '#39a8cb',
  opacity: 0.86,
  transparent: true,
})

function PascalWaterRenderer({ node }: { node: PascalWaterNode }) {
  const ref = useRef<Group>(null!)
  const renderer = useThree((state) => state.gl)
  const handlers = useNodeEvents(node, 'pascal-water')

  useRegistry(node.id, 'pascal-water', ref)

  const shorelinePoints = useMemo(
    () => createPascalWaterSmoothedPerimeter(node.perimeter.points),
    [node.perimeter.points],
  )
  const depthReferencePoints = useMemo(
    () => createPascalWaterDepthReferencePerimeter(shorelinePoints, node.fieldParameters),
    [node.fieldParameters, shorelinePoints],
  )
  const landSurface = useMemo(
    () =>
      createPascalWaterLandSurface({
        elevationParameters: node.elevationParameters,
        shorelinePoints,
        waterPlaneSize: node.planeSize,
      }),
    [node.elevationParameters, node.planeSize, shorelinePoints],
  )
  const waterField = useMemo(
    () =>
      createPascalWaterFieldTexture({
        parameters: node.fieldParameters,
        perimeter: shorelinePoints,
        planeSize: node.planeSize,
        resolution: node.terrainFieldResolution,
      }),
    [node.fieldParameters, node.planeSize, node.terrainFieldResolution, shorelinePoints],
  )
  const waveDepthField = useMemo(
    () =>
      createPascalWaveDepthFieldTexture(
        waterField,
        {
          depthExponent: node.fieldParameters.depthExponent,
          depthReach: node.fieldParameters.depthReach,
          edgeFadeDistance: node.fieldParameters.edgeFadeDistance,
        },
        node.materialParameters.waveDepthSmooth === false
          ? 0
          : Number(node.materialParameters.waveDepthSmooth ?? 1),
        node.planeSize,
      ),
    [
      node.fieldParameters.depthExponent,
      node.fieldParameters.depthReach,
      node.fieldParameters.edgeFadeDistance,
      node.materialParameters.waveDepthSmooth,
      node.planeSize,
      waterField,
    ],
  )
  const waterBounds = useMemo(() => createPascalWaterBounds(node.planeSize), [node.planeSize])
  const materialParameters = useMemo(
    () =>
      ({
        ...LANDRUSH_WATER_BODY_SURFACE_PARAMETERS,
        ...node.materialParameters,
        depthExponent: node.fieldParameters.depthExponent,
        depthNoiseFrequency: node.fieldParameters.depthNoiseFrequency,
        depthNoiseStrength: node.fieldParameters.depthNoiseStrength,
        depthReach: node.fieldParameters.depthReach,
        depthReferenceReach: PASCAL_WATER_FIELD_DEPTH_REFERENCE_REACH,
        edgeFadeDistance: node.fieldParameters.edgeFadeDistance,
      }) as Partial<LandrushWaterBodySurfaceParameters>,
    [node.fieldParameters, node.materialParameters],
  )
  const waterMaterial = useMemo<Material>(() => {
    const isWebGpu = renderer.constructor.name === 'WebGPURenderer'
    if (!isWebGpu) return PASCAL_WATER_FALLBACK_MATERIAL

    const material = createLandrushWaterBodyMaterial(
      renderer as unknown as WebGPURenderer,
      waterField,
      waterBounds,
      materialParameters,
      waveDepthField,
    )
    return material
  }, [materialParameters, renderer, waterBounds, waterField, waveDepthField])

  const islandShape = useMemo(() => shapeFromPoints(shorelinePoints), [shorelinePoints])
  const beachShape = useMemo(() => shapeFromPoints(depthReferencePoints), [depthReferencePoints])
  const maskedWaterShape = useMemo(
    () => waterShapeWithHole(depthReferencePoints, node.planeSize),
    [depthReferencePoints, node.planeSize],
  )
  const plateauShape = useMemo(
    () => shapeFromPoints(landSurface.plateauPoints),
    [landSurface.plateauPoints],
  )
  const cliffGeometry = useMemo(
    () =>
      createPascalWaterCliffRingGeometry(
        landSurface.slopeStartPoints,
        landSurface.plateauPoints,
        PASCAL_WATER_LOW_ELEVATION,
        landSurface.plateauElevation,
        node.elevationParameters,
      ),
    [
      landSurface.plateauElevation,
      landSurface.plateauPoints,
      landSurface.slopeStartPoints,
      node.elevationParameters,
    ],
  )
  const depthReferenceGeometry = useMemo(
    () => lineLoopGeometryFromPoints(depthReferencePoints),
    [depthReferencePoints],
  )
  const depthReferenceMaterial = useMemo(
    () =>
      new LineBasicMaterial({
        color: '#ff4fd8',
        depthTest: false,
        opacity: 0.95,
        transparent: true,
      }),
    [],
  )
  const depthReferenceLine = useMemo(() => {
    const line = new ThreeLine(depthReferenceGeometry, depthReferenceMaterial)
    line.frustumCulled = false
    line.renderOrder = 30
    return line
  }, [depthReferenceGeometry, depthReferenceMaterial])

  useEffect(() => () => waterField.dispose(), [waterField])
  useEffect(() => () => waveDepthField.dispose(), [waveDepthField])
  useEffect(() => {
    if (waterMaterial === PASCAL_WATER_FALLBACK_MATERIAL) return
    return () => waterMaterial.dispose()
  }, [waterMaterial])
  useEffect(() => () => cliffGeometry.dispose(), [cliffGeometry])
  useEffect(() => () => depthReferenceGeometry.dispose(), [depthReferenceGeometry])
  useEffect(() => () => depthReferenceMaterial.dispose(), [depthReferenceMaterial])
  useEffect(() => {
    renderScheduler.requestFrame('geometry:changed')
  }, [])

  useFrame((_, delta) => {
    const water = (waterMaterial as LandrushWaterBodySurfaceMaterial).userData?.landrushWater
    if (!water) return

    water.update(Math.min(Math.max(delta, 0), 0.08))
  })

  return (
    <group position={node.position} ref={ref} visible={node.visible !== false} {...handlers}>
      <mesh
        position={[0, LANDRUSH_WATER_SURFACE_ELEVATION, 0]}
        renderOrder={1}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        {node.maskLandWater ? (
          <shapeGeometry args={[maskedWaterShape]} />
        ) : (
          <planeGeometry args={[node.planeSize, node.planeSize, 1, 1]} />
        )}
        <primitive attach="material" object={waterMaterial} />
      </mesh>

      <mesh position={[0, -0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[beachShape]} />
        <meshBasicMaterial color="#d8cb90" side={DoubleSide} />
      </mesh>

      <mesh position={[0, PASCAL_WATER_SAND_ELEVATION, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[islandShape]} />
        <meshBasicMaterial color="#d8cb90" side={DoubleSide} />
      </mesh>

      {landSurface.hasElevation ? (
        <>
          <mesh geometry={cliffGeometry}>
            <meshStandardMaterial color="#ffffff" roughness={0.98} side={DoubleSide} vertexColors />
          </mesh>
          <mesh position={[0, landSurface.plateauElevation, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <shapeGeometry args={[plateauShape]} />
            <meshStandardMaterial color="#6f9844" roughness={0.9} side={DoubleSide} />
          </mesh>
        </>
      ) : (
        <mesh position={[0, PASCAL_WATER_LOW_ELEVATION, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <shapeGeometry args={[islandShape]} />
          <meshStandardMaterial color="#6f9844" roughness={0.9} side={DoubleSide} />
        </mesh>
      )}

      {node.showDepthReference ? <primitive object={depthReferenceLine} /> : null}
    </group>
  )
}

export default PascalWaterRenderer
