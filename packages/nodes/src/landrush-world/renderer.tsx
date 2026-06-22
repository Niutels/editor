'use client'

import { type LandrushWorldNode, useRegistry } from '@pascal-app/core'
import { renderScheduler } from '@pascal-app/viewer'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type { Group } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { LandrushInstancedTrees } from './instanced-trees'
import { LandrushRobot } from './landrush-robot'
import {
  createGrassPatchMaterials,
  createLandrushMaterials,
  createParcelFillMaterials,
  createSolidMaterialMap,
  createTritoneRamp,
  disposeLandrushMaterials,
  disposeMaterialMap,
} from './materials'
import { expandBounds, shapeFromPoints } from './render-utils'
import { createLandrushRibbonGeometries, disposeLandrushRibbonGeometries } from './ribbon-geometry'
import {
  createCoastTower,
  createDocks,
  createParcelYardDetails,
  createShoreRocks,
  createShoreTerraces,
} from './shore-details'
import { LandrushShoreDetails } from './shore-renderer'
import {
  createGrassBladeGeometry,
  createGrassPatchShapes,
  createLandrushTerrainData,
  LANDRUSH_WATER_PLANE_PADDING,
} from './terrain-field'
import { LANDRUSH_WATER_SURFACE_ELEVATION } from './water-surface'

const SOLID_DETAIL_COLORS = [
  '#2e5260',
  '#436776',
  '#594536',
  '#5f7680',
  '#8b6f50',
  '#f3ead0',
] as const

export default function LandrushWorldRenderer({ node }: { node: LandrushWorldNode }) {
  const ref = useRef<Group>(null!)
  const renderer = useThree((state) => state.gl)
  useRegistry(node.id, 'landrush-world', ref)

  const buildFocus = node.landrushMode === 'build'
  const focusedParcelId = node.focusParcelId ?? node.ownerParcelId

  const toonRamp = useMemo(() => createTritoneRamp(), [])
  const terrainData = useMemo(
    () =>
      createLandrushTerrainData(
        node.seed,
        node.perimeter.bounds,
        node.perimeter.points,
        node.roads.segments,
      ),
    [node.perimeter.bounds, node.perimeter.points, node.roads.segments, node.seed],
  )
  const materials = useMemo(
    () =>
      createLandrushMaterials(
        renderer as unknown as WebGPURenderer,
        toonRamp,
        terrainData.grassTexture,
        terrainData.texture,
        terrainData.bounds,
      ),
    [renderer, terrainData, toonRamp],
  )
  const grassPatches = useMemo(
    () =>
      createGrassPatchShapes(
        node.seed,
        node.perimeter.bounds,
        node.perimeter.points,
        terrainData.sample,
      ),
    [node.perimeter.bounds, node.perimeter.points, node.seed, terrainData.sample],
  )
  const parcelYardDetails = useMemo(
    () => createParcelYardDetails(node.seed, node.parcels),
    [node.parcels, node.seed],
  )
  const docks = useMemo(
    () => createDocks(node.seed, node.perimeter.points),
    [node.perimeter.points, node.seed],
  )
  const coastTower = useMemo(() => createCoastTower(node.perimeter.points), [node.perimeter.points])
  const shoreRocks = useMemo(
    () => createShoreRocks(node.seed, node.perimeter.points),
    [node.perimeter.points, node.seed],
  )
  const shoreTerraces = useMemo(
    () => createShoreTerraces(node.seed, node.perimeter.points),
    [node.perimeter.points, node.seed],
  )
  const perimeterShape = useMemo(
    () => shapeFromPoints(node.perimeter.points),
    [node.perimeter.points],
  )
  const waterPlaneBounds = useMemo(
    () => expandBounds(node.perimeter.bounds, LANDRUSH_WATER_PLANE_PADDING),
    [node.perimeter.bounds],
  )
  const waterCenter = useMemo(
    () => ({
      x: (waterPlaneBounds.minX + waterPlaneBounds.maxX) / 2,
      z: (waterPlaneBounds.minZ + waterPlaneBounds.maxZ) / 2,
    }),
    [waterPlaneBounds],
  )
  const grassBladeGeometry = useMemo(
    () =>
      createGrassBladeGeometry(
        node.perimeter.bounds,
        node.perimeter.points,
        node.seed,
        node.roads.segments,
        terrainData.sample,
      ),
    [
      node.perimeter.bounds,
      node.perimeter.points,
      node.roads.segments,
      node.seed,
      terrainData.sample,
    ],
  )
  const grassPatchMaterials = useMemo(() => createGrassPatchMaterials(grassPatches), [grassPatches])
  const parcelFillMaterials = useMemo(() => createParcelFillMaterials(node.parcels), [node.parcels])
  const ribbonGeometries = useMemo(
    () =>
      createLandrushRibbonGeometries(
        node.perimeter.points,
        node.parcels,
        node.roads.segments,
        node.roads.sidewalks,
      ),
    [node.parcels, node.perimeter.points, node.roads.segments, node.roads.sidewalks],
  )
  const solidMaterials = useMemo(
    () =>
      createSolidMaterialMap([
        ...shoreRocks.map((rock) => rock.color),
        ...shoreTerraces.map((terrace) => terrace.color),
        ...parcelYardDetails.map((detail) => detail.color),
        ...SOLID_DETAIL_COLORS,
      ]),
    [parcelYardDetails, shoreRocks, shoreTerraces],
  )

  useEffect(() => () => grassBladeGeometry.dispose(), [grassBladeGeometry])
  useEffect(() => () => disposeLandrushRibbonGeometries(ribbonGeometries), [ribbonGeometries])
  useEffect(() => () => disposeLandrushMaterials(materials), [materials])
  useEffect(() => () => disposeMaterialMap(grassPatchMaterials), [grassPatchMaterials])
  useEffect(() => () => disposeMaterialMap(parcelFillMaterials), [parcelFillMaterials])
  useEffect(() => () => disposeMaterialMap(solidMaterials), [solidMaterials])
  useEffect(
    () => () => {
      terrainData.grassTexture.dispose()
      terrainData.texture.dispose()
    },
    [terrainData],
  )
  useEffect(() => {
    const requestFrame = () => renderScheduler.requestFrame('geometry:changed')
    requestFrame()
    const frameDelaysMs = [80, 240, 720, 1500] as const
    const timeoutIds = frameDelaysMs.map((delayMs) => window.setTimeout(requestFrame, delayMs))

    return () => {
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [node.id])

  useFrame((_, delta) => {
    materials.water.userData.landrushWater.update(delta)
  })

  return (
    <group position={node.position} ref={ref}>
      <mesh
        position={[waterCenter.x, LANDRUSH_WATER_SURFACE_ELEVATION, waterCenter.z]}
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[waterPlaneBounds.width, waterPlaneBounds.depth]} />
        <primitive attach="material" object={materials.water} />
      </mesh>

      <mesh position={[0, 0, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[perimeterShape]} />
        <primitive attach="material" object={materials.grassBase} />
      </mesh>
      {grassPatches.map((patch) => (
        <mesh
          key={patch.id}
          position={[0, 0.018, 0]}
          renderOrder={2}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <shapeGeometry args={[shapeFromPoints(patch.points)]} />
          <primitive attach="material" object={grassPatchMaterials.get(patch.id)!} />
        </mesh>
      ))}
      <mesh geometry={ribbonGeometries.shoreSand} renderOrder={3}>
        <primitive attach="material" object={materials.shoreSand} />
      </mesh>
      <LandrushShoreDetails
        coastTower={coastTower}
        docks={docks}
        shoreRocks={shoreRocks}
        shoreTerraces={shoreTerraces}
        solidMaterials={solidMaterials}
      />

      <mesh castShadow geometry={grassBladeGeometry} renderOrder={5}>
        <primitive attach="material" object={materials.grassBlade} />
      </mesh>
      <mesh geometry={ribbonGeometries.sidewalks} renderOrder={12}>
        <primitive attach="material" object={materials.sidewalk} />
      </mesh>
      <mesh geometry={ribbonGeometries.roads} renderOrder={13}>
        <primitive attach="material" object={materials.road} />
      </mesh>

      {node.parcels.map((parcel) => (
        <group key={parcel.id} visible={!(buildFocus && parcel.id !== focusedParcelId)}>
          <mesh position={[0, 0.075, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <shapeGeometry args={[shapeFromPoints(parcel.outline)]} />
            <primitive attach="material" object={parcelFillMaterials.get(parcel.id)!} />
          </mesh>
        </group>
      ))}
      {buildFocus ? (
        <mesh geometry={ribbonGeometries.ownerParcelOutlines} renderOrder={11}>
          <primitive attach="material" object={materials.ownerLine} />
        </mesh>
      ) : (
        <>
          <mesh geometry={ribbonGeometries.neighborParcelOutlines} renderOrder={11}>
            <primitive attach="material" object={materials.parcelLine} />
          </mesh>
          <mesh geometry={ribbonGeometries.ownerParcelOutlines} renderOrder={11}>
            <primitive attach="material" object={materials.ownerLine} />
          </mesh>
        </>
      )}
      <mesh geometry={ribbonGeometries.roadCrowns} renderOrder={18}>
        <primitive attach="material" object={materials.roadCrown} />
      </mesh>

      {parcelYardDetails.map((detail) => (
        <mesh
          castShadow={detail.type !== 'walk'}
          key={detail.id}
          position={detail.position}
          renderOrder={detail.type === 'walk' ? 17 : 16}
          rotation={[0, detail.rotation, 0]}
          visible={!(buildFocus && detail.parcelId !== focusedParcelId)}
        >
          <boxGeometry args={detail.footprint} />
          <primitive attach="material" object={solidMaterials.get(detail.color)!} />
        </mesh>
      ))}

      <LandrushInstancedTrees materials={materials} trees={node.trees} />
      {node.landrushMode === 'intro' ? null : <LandrushRobot node={node} />}
    </group>
  )
}
