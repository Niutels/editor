'use client'

import { type PascalWaterNode, useRegistry } from '@pascal-app/core'
import { renderScheduler } from '@pascal-app/viewer'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  createLandrushWaterMaterial,
  LANDRUSH_WATER_SURFACE_ELEVATION,
  LANDRUSH_WATER_SURFACE_PARAMETERS,
  type LandrushWaterSurfaceMaterial,
  type LandrushWaterSurfaceParameters,
} from '../landrush-world/water-surface'
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
  PASCAL_WATER_FIELD_DEPTH_REFERENCE_REACH,
} from './water-field'

const PASCAL_WATER_FALLBACK_MATERIAL = new MeshBasicMaterial({
  color: '#39a8cb',
  opacity: 0.86,
  transparent: true,
})
PASCAL_WATER_FALLBACK_MATERIAL.userData.__pascalSkipMaterialHighlight = true

function PascalWaterRenderer({ node }: { node: PascalWaterNode }) {
  const ref = useRef<Group>(null!)
  const renderer = useThree((state) => state.gl)
  const [materialReady, setMaterialReady] = useState(false)

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
  const waterFieldTextureParameters = useMemo(
    () => ({
      depthContourCollapseMeters: node.fieldParameters.depthContourCollapseMeters,
      depthContourCollapseScale: node.fieldParameters.depthContourCollapseScale,
      depthContourNoiseFrequency: node.fieldParameters.depthContourNoiseFrequency,
      depthContourOffsetMeters: node.fieldParameters.depthContourOffsetMeters,
      depthContourVariationMeters: node.fieldParameters.depthContourVariationMeters,
      shoreBandMeters: node.fieldParameters.shoreBandMeters,
      shoreFeatherMeters: node.fieldParameters.shoreFeatherMeters,
      shoreNoiseFrequency: node.fieldParameters.shoreNoiseFrequency,
      shoreVariationMeters: node.fieldParameters.shoreVariationMeters,
    }),
    [
      node.fieldParameters.depthContourCollapseMeters,
      node.fieldParameters.depthContourCollapseScale,
      node.fieldParameters.depthContourNoiseFrequency,
      node.fieldParameters.depthContourOffsetMeters,
      node.fieldParameters.depthContourVariationMeters,
      node.fieldParameters.shoreBandMeters,
      node.fieldParameters.shoreFeatherMeters,
      node.fieldParameters.shoreNoiseFrequency,
      node.fieldParameters.shoreVariationMeters,
    ],
  )
  const waterField = useMemo(
    () =>
      createPascalWaterFieldTexture({
        parameters: waterFieldTextureParameters,
        perimeter: shorelinePoints,
        planeSize: node.planeSize,
        resolution: node.terrainFieldResolution,
      }),
    [node.planeSize, node.terrainFieldResolution, shorelinePoints, waterFieldTextureParameters],
  )
  const waterBounds = useMemo(() => createPascalWaterBounds(node.planeSize), [node.planeSize])
  const materialParameters = useMemo(
    () =>
      ({
        ...LANDRUSH_WATER_SURFACE_PARAMETERS,
        ...node.materialParameters,
        depthExponent: node.fieldParameters.depthExponent,
        depthNoiseFrequency: node.fieldParameters.depthNoiseFrequency,
        depthNoiseStrength: node.fieldParameters.depthNoiseStrength,
        depthReach: node.fieldParameters.depthReach,
        depthReferenceReach: PASCAL_WATER_FIELD_DEPTH_REFERENCE_REACH,
        edgeFadeDistance: node.fieldParameters.edgeFadeDistance,
      }) as LandrushWaterSurfaceParameters,
    [node.fieldParameters, node.materialParameters],
  )
  const materialParametersRef = useRef(materialParameters)
  materialParametersRef.current = materialParameters
  const preservedWindTimeRef = useRef(0)
  const waterMaterial = useMemo<Material>(() => {
    const isWebGpu = renderer.constructor.name === 'WebGPURenderer'
    if (!isWebGpu || !materialReady) return PASCAL_WATER_FALLBACK_MATERIAL

    const material = createLandrushWaterMaterial(
      renderer as unknown as WebGPURenderer,
      waterField,
      waterBounds,
      materialParametersRef.current,
    )
    material.userData.__pascalSkipMaterialHighlight = true
    material.userData.landrushWater.wind.localTime.value = preservedWindTimeRef.current
    return material
  }, [materialReady, renderer, waterBounds, waterField])
  const appliedMaterialRef = useRef<LandrushWaterSurfaceMaterial | null>(null)
  const appliedMaterialParametersRef = useRef<LandrushWaterSurfaceParameters | null>(null)

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
  const useSmoothCliffMaterial =
    Math.max(
      node.elevationParameters.cliffBlockDepthMinMeters,
      node.elevationParameters.cliffBlockDepthMaxMeters,
    ) <= 0.001
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
  useEffect(() => {
    if (waterMaterial === PASCAL_WATER_FALLBACK_MATERIAL) return
    return () => waterMaterial.dispose()
  }, [waterMaterial])
  useEffect(() => {
    // TSL/WebGPU water binds generated noise render targets more reliably after mount.
    setMaterialReady(true)
    renderScheduler.requestFrame('geometry:changed')
  }, [])
  useEffect(() => {
    if (waterMaterial === PASCAL_WATER_FALLBACK_MATERIAL) return
    const waterControls = (waterMaterial as LandrushWaterSurfaceMaterial).userData?.landrushWater
    if (!waterControls) return

    const previousParameters = appliedMaterialParametersRef.current
    if (appliedMaterialRef.current !== waterMaterial || !previousParameters) {
      appliedMaterialRef.current = waterMaterial as LandrushWaterSurfaceMaterial
      appliedMaterialParametersRef.current = materialParameters
      return
    }

    const patch = diffPascalWaterMaterialParameters(previousParameters, materialParameters)
    if (Object.keys(patch).length > 0) {
      waterControls.setParameters(patch)
    }
    appliedMaterialRef.current = waterMaterial as LandrushWaterSurfaceMaterial
    appliedMaterialParametersRef.current = materialParameters
  }, [materialParameters, waterMaterial])
  useEffect(() => () => cliffGeometry.dispose(), [cliffGeometry])
  useEffect(() => () => depthReferenceGeometry.dispose(), [depthReferenceGeometry])
  useEffect(() => () => depthReferenceMaterial.dispose(), [depthReferenceMaterial])
  useEffect(() => {
    renderScheduler.requestFrame('geometry:changed')
  }, [])

  useFrame((_, delta) => {
    const water = (waterMaterial as LandrushWaterSurfaceMaterial).userData?.landrushWater
    const safeDelta = Math.min(Math.max(delta, 0), 0.08)
    if (!water) return

    water.update(safeDelta)
    preservedWindTimeRef.current = water.wind.localTime.value
  })

  return (
    <group position={node.position} ref={ref} visible={node.visible !== false}>
      <mesh
        position={[0, LANDRUSH_WATER_SURFACE_ELEVATION, 0]}
        renderOrder={1}
        rotation={[-Math.PI / 2, 0, 0]}
        userData={{ __pascalSkipMaterialHighlight: true }}
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
            {useSmoothCliffMaterial ? (
              <meshBasicMaterial color="#8f8774" side={DoubleSide} />
            ) : (
              <meshStandardMaterial
                color="#ffffff"
                roughness={0.98}
                side={DoubleSide}
                vertexColors
              />
            )}
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

function diffPascalWaterMaterialParameters(
  previousParameters: LandrushWaterSurfaceParameters,
  nextParameters: LandrushWaterSurfaceParameters,
) {
  const patch: Partial<LandrushWaterSurfaceParameters> = {}
  const keys = Object.keys(nextParameters) as Array<keyof LandrushWaterSurfaceParameters>
  for (const key of keys) {
    if (previousParameters[key] !== nextParameters[key]) {
      patch[key] = nextParameters[key] as never
    }
  }
  return patch
}

export default PascalWaterRenderer
