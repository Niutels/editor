'use client'

import { useRegistry } from '@pascal-app/core'
import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import type { BufferGeometry, Group, Texture } from 'three'
import type { WebGPURenderer } from 'three/webgpu'
import { LandrushInstancedTrees } from './instanced-trees'
import { LandrushRobot } from './landrush-robot'
import type { LandrushWorldNode } from './schema'
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
import { WorldMultiplayerDirtCopyLayoutLayer } from './world-multiplayer-layout-layer'

declare global {
  interface Window {
    __LANDRUSH_WORLD_WATER_TEST__?: {
      getState: () => LandrushWorldWaterTestState
    }
  }
}

const SOLID_DETAIL_COLORS = [
  '#2e5260',
  '#436776',
  '#594536',
  '#5f7680',
  '#8b6f50',
  '#f3ead0',
] as const

type LandrushWorldWaterTestState = {
  elapsedSeconds: number
  frameCount: number
  materialUuid: string | null
  noiseTextures: LandrushWorldWaterNoiseTextureDiagnostics | null
  ripplesNoiseStrength: number
  ripplesRatio: number
  waterUpdateCount: number
  windTime: number
}

type LandrushWorldWaterNoiseTextureDiagnostics = {
  hash: LandrushWorldWaterTextureDiagnostics
  perlin: LandrushWorldWaterTextureDiagnostics
  voronoi: LandrushWorldWaterTextureDiagnostics
}

type LandrushWorldWaterTextureDiagnostics = {
  imageHeight: number | null
  imageWidth: number | null
  isRenderTargetTexture: boolean
  magFilter: number
  minFilter: number
  name: string
  needsUpdate: boolean
  uuid: string
  version: number
  wrapS: number
  wrapT: number
}

export default function LandrushWorldRenderer({ node }: { node: LandrushWorldNode }) {
  const ref = useRef<Group>(null!)
  const renderer = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)
  const waterDebugEnabledRef = useRef(
    typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('testWater') === '1',
  )
  const waterDebugPublishedAtRef = useRef(-1)
  const waterDebugStateRef = useRef<LandrushWorldWaterTestState>({
    elapsedSeconds: 0,
    frameCount: 0,
    materialUuid: null,
    noiseTextures: null,
    ripplesNoiseStrength: 0,
    ripplesRatio: 0,
    waterUpdateCount: 0,
    windTime: 0,
  })
  useRegistry(node.id, 'landrush-world', ref)

  const renderFlags = node.renderFlags ?? {}
  const showGrassBlades = renderFlags.grassBlades !== false
  const showGrassPatches = renderFlags.grassPatches !== false
  const showGround = renderFlags.ground !== false
  const showParcels = renderFlags.parcels !== false
  const showParcelDetails = renderFlags.parcelDetails !== false
  const showRobot = renderFlags.robot !== false
  const showRoads = renderFlags.roads !== false
  const showShoreDetails = renderFlags.shoreDetails !== false
  const showTrees = renderFlags.trees !== false
  const showWater = renderFlags.water !== false
  const useWorldMultiplayerDirtCopyLayout =
    node.metadata.source === 'world-multiplayer-dirt-copy-layout'
  const terrainTextureSize = showWater ? undefined : 256
  const buildFocus = node.landrushMode === 'build'
  const focusedParcelId = node.focusParcelId ?? node.ownerParcelId
  const remoteRobotNodes = useMemo(() => createRemoteRobotNodes(node), [node])

  const toonRamp = useMemo(() => createTritoneRamp(), [])
  const terrainData = useMemo(
    () =>
      createLandrushTerrainData(
        node.seed,
        node.perimeter.bounds,
        node.perimeter.points,
        node.roads.segments,
        terrainTextureSize,
      ),
    [
      node.perimeter.bounds,
      node.perimeter.points,
      node.roads.segments,
      node.seed,
      terrainTextureSize,
    ],
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
    const requestFrame = () => invalidate()
    requestFrame()
    const frameDelaysMs = [80, 240, 720, 1500] as const
    const timeoutIds = frameDelaysMs.map((delayMs) => window.setTimeout(requestFrame, delayMs))

    return () => {
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [invalidate])
  useEffect(() => {
    if (!waterDebugEnabledRef.current) return

    const api = {
      getState: () => ({ ...waterDebugStateRef.current }),
    }
    window.__LANDRUSH_WORLD_WATER_TEST__ = api

    return () => {
      if (window.__LANDRUSH_WORLD_WATER_TEST__ === api) {
        delete window.__LANDRUSH_WORLD_WATER_TEST__
      }
      delete document.documentElement.dataset.landrushWorldWaterTest
    }
  }, [])

  useFrame((_, delta) => {
    const water = materials.water.userData.landrushWater
    water.update(delta)

    if (!waterDebugEnabledRef.current) return

    const safeDelta = Math.min(Math.max(delta, 0), 0.08)
    waterDebugStateRef.current.elapsedSeconds += safeDelta
    waterDebugStateRef.current.frameCount += 1
    waterDebugStateRef.current.materialUuid = materials.water.uuid
    waterDebugStateRef.current.noiseTextures = describeLandrushWorldWaterNoiseTextures(water.noises)
    waterDebugStateRef.current.ripplesNoiseStrength = water.parameters.ripplesNoiseStrength
    waterDebugStateRef.current.ripplesRatio = water.parameters.ripplesRatio
    waterDebugStateRef.current.waterUpdateCount += 1
    waterDebugStateRef.current.windTime = water.wind.localTime.value

    if (waterDebugStateRef.current.elapsedSeconds - waterDebugPublishedAtRef.current >= 0.25) {
      waterDebugPublishedAtRef.current = waterDebugStateRef.current.elapsedSeconds
      document.documentElement.dataset.landrushWorldWaterTest = JSON.stringify(
        waterDebugStateRef.current,
      )
    }
  })

  return (
    <group position={node.position} ref={ref}>
      {showWater ? (
        <mesh
          position={[waterCenter.x, LANDRUSH_WATER_SURFACE_ELEVATION, waterCenter.z]}
          receiveShadow
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[waterPlaneBounds.width, waterPlaneBounds.depth]} />
          <primitive attach="material" object={materials.water} />
        </mesh>
      ) : null}

      {showGround && !useWorldMultiplayerDirtCopyLayout ? (
        <mesh position={[0, 0, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <shapeGeometry args={[perimeterShape]} />
          <primitive attach="material" object={materials.grassBase} />
        </mesh>
      ) : null}
      {showGrassPatches
        ? grassPatches.map((patch) => (
            <mesh
              key={patch.id}
              position={[0, 0.018, 0]}
              renderOrder={2}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <shapeGeometry args={[shapeFromPoints(patch.points)]} />
              <primitive attach="material" object={grassPatchMaterials.get(patch.id)!} />
            </mesh>
          ))
        : null}
      {showShoreDetails ? (
        <>
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
        </>
      ) : null}

      {showGrassBlades ? (
        <mesh castShadow geometry={grassBladeGeometry} renderOrder={5}>
          <primitive attach="material" object={materials.grassBlade} />
        </mesh>
      ) : null}
      {useWorldMultiplayerDirtCopyLayout ? (
        <Suspense fallback={null}>
          <WorldMultiplayerDirtCopyLayoutLayer
            node={node}
            showGround={showGround}
            showParcels={showParcels}
            showRoads={showRoads}
          />
        </Suspense>
      ) : null}
      {showRoads && !useWorldMultiplayerDirtCopyLayout ? (
        <>
          {hasGeometryPositions(ribbonGeometries.sidewalks) ? (
            <mesh geometry={ribbonGeometries.sidewalks} renderOrder={12}>
              <primitive attach="material" object={materials.sidewalk} />
            </mesh>
          ) : null}
          {hasGeometryPositions(ribbonGeometries.roads) ? (
            <mesh geometry={ribbonGeometries.roads} renderOrder={13}>
              <primitive attach="material" object={materials.road} />
            </mesh>
          ) : null}
        </>
      ) : null}

      {showParcels && !useWorldMultiplayerDirtCopyLayout ? (
        <>
          {node.parcels.map((parcel) => (
            <group key={parcel.id} visible={!(buildFocus && parcel.id !== focusedParcelId)}>
              <mesh position={[0, 0.075, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <shapeGeometry args={[shapeFromPoints(parcel.outline)]} />
                <primitive attach="material" object={parcelFillMaterials.get(parcel.id)!} />
              </mesh>
            </group>
          ))}
          {buildFocus ? (
            hasGeometryPositions(ribbonGeometries.ownerParcelOutlines) ? (
              <mesh geometry={ribbonGeometries.ownerParcelOutlines} renderOrder={11}>
                <primitive attach="material" object={materials.ownerLine} />
              </mesh>
            ) : null
          ) : (
            <>
              {hasGeometryPositions(ribbonGeometries.neighborParcelOutlines) ? (
                <mesh geometry={ribbonGeometries.neighborParcelOutlines} renderOrder={11}>
                  <primitive attach="material" object={materials.parcelLine} />
                </mesh>
              ) : null}
              {hasGeometryPositions(ribbonGeometries.ownerParcelOutlines) ? (
                <mesh geometry={ribbonGeometries.ownerParcelOutlines} renderOrder={11}>
                  <primitive attach="material" object={materials.ownerLine} />
                </mesh>
              ) : null}
            </>
          )}
        </>
      ) : null}
      {showRoads &&
      !useWorldMultiplayerDirtCopyLayout &&
      hasGeometryPositions(ribbonGeometries.roadCrowns) ? (
        <mesh geometry={ribbonGeometries.roadCrowns} renderOrder={18}>
          <primitive attach="material" object={materials.roadCrown} />
        </mesh>
      ) : null}

      {showParcelDetails
        ? parcelYardDetails.map((detail) => (
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
          ))
        : null}

      {showTrees ? <LandrushInstancedTrees materials={materials} trees={node.trees} /> : null}
      {showRobot ? (
        <Suspense fallback={null}>
          {node.landrushMode !== 'intro' ? <LandrushRobot node={node} /> : null}
          {remoteRobotNodes.map((remoteNode) => (
            <LandrushRobot key={remoteNode.id} node={remoteNode} />
          ))}
        </Suspense>
      ) : null}
    </group>
  )
}

function describeLandrushWorldWaterNoiseTextures(
  noises: ReturnType<
    typeof createLandrushMaterials
  >['water']['userData']['landrushWater']['noises'],
): LandrushWorldWaterNoiseTextureDiagnostics {
  return {
    hash: describeLandrushWorldWaterTexture(noises.hash),
    perlin: describeLandrushWorldWaterTexture(noises.perlin),
    voronoi: describeLandrushWorldWaterTexture(noises.voronoi),
  }
}

function describeLandrushWorldWaterTexture(texture: Texture): LandrushWorldWaterTextureDiagnostics {
  const image = texture.image as { height?: number; width?: number } | undefined

  return {
    imageHeight: typeof image?.height === 'number' ? image.height : null,
    imageWidth: typeof image?.width === 'number' ? image.width : null,
    isRenderTargetTexture: Boolean(
      (texture as { isRenderTargetTexture?: boolean }).isRenderTargetTexture,
    ),
    magFilter: texture.magFilter,
    minFilter: texture.minFilter,
    name: texture.name,
    needsUpdate: texture.needsUpdate,
    uuid: texture.uuid,
    version: texture.version,
    wrapS: texture.wrapS,
    wrapT: texture.wrapT,
  }
}

function remoteRobotNodeId(id: string): `landrush-world_${string}` {
  return `landrush-world_remote-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

function createRemoteRobotNodes(node: LandrushWorldNode) {
  return (node.remotePlayers ?? []).map((player) => ({
    ...node,
    focusParcelId: null,
    id: remoteRobotNodeId(player.id),
    landrushMode: 'walk' as const,
    name: player.name ?? 'Remote player',
    playerHeading: player.heading,
    playerMoving: player.moving,
    playerPosition: player.position,
    playerSpeed: player.speed,
    playerStart: player.position,
    remotePlayers: [],
  }))
}

function hasGeometryPositions(geometry: BufferGeometry) {
  const attribute = geometry.getAttribute('position')
  return Boolean(attribute && attribute.count > 0)
}
