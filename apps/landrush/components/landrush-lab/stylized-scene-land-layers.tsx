'use client'

import { getMaterialRendererBackend, renderScheduler } from '@landrush/runtime'
import { useGpuResourceLifetime } from '@pascal-app/viewer'
import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Frustum,
  type Group,
  InstancedBufferAttribute,
  type InstancedMesh,
  type Material,
  Matrix4,
  type Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  type Texture,
  Vector3,
  Vector4,
} from 'three'
import {
  attribute,
  cameraPosition,
  cos,
  exp,
  float,
  hash,
  mix,
  positionLocal,
  positionWorld,
  pow,
  sin,
  clamp as tslClamp,
  color as tslColor,
  texture as tslTexture,
  uniform,
  vec2,
  vec3,
} from 'three/tsl'
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial, type Node as TSLNode } from 'three/webgpu'
import type { LandrushPoint2, LandrushRoadSegment } from '@/components/landrush/types'
import type { GrassBladeTuning } from './grass-material'
import { createLandrushRobotScreenRevealOpacityNode } from './robot-screen-reveal-mask'
import { STYLIZED_PATH_WIDTH_SCALE } from './stylized-path-network-layer'

type StylizedSceneLandLayerProps = {
  elevation: number
  grassBlockers?: readonly StylizedGrassBlocker[]
  grassDebugState?: StylizedGrassDebugState
  grassFadeBlockers?: readonly StylizedGrassBlocker[]
  grassInteractionRef?: StylizedGrassInteractionRef
  grassRenderOrder?: number
  grassVisibilityRef?: StylizedGrassVisibilityRef
  bladesVisible?: boolean
  groundColorTexture?: Texture | null
  groundTintCap?: number
  profileMeasure?: StylizedSceneProfileMeasure
  roads?: readonly LandrushRoadSegment[]
  showBlades?: boolean
  showTrees?: boolean
  streamingPaused?: boolean
  surfacePoints?: readonly LandrushPoint2[]
  treeBlockers?: readonly StylizedGrassBlocker[]
  tuning?: GrassBladeTuning
}

type StylizedSceneProfileMeasure = <T>(id: string, callback: () => T) => T

type StylizedSceneTreeProps = {
  elevation: number
  position: [number, number, number]
  rotationY: number
  scale: number
}

type StylizedTreeLayoutEntry = Omit<StylizedSceneTreeProps, 'elevation'>

type BushInstance = {
  pos: [number, number, number]
  scale: number
  yaw: number
}

type StylizedGrassBounds = {
  maxX: number
  maxZ: number
  minX: number
  minZ: number
}

type StylizedGrassSegmentSpan = {
  dx: number
  dz: number
  end: { x: number; z: number }
  lengthSquared: number
  maxX: number
  maxZ: number
  minX: number
  minZ: number
  start: { x: number; z: number }
}

type StylizedGrassRoadSpan = StylizedGrassSegmentSpan & {
  halfWidth: number
}

type StylizedGrassRoadGrid = {
  cells: StylizedGrassRoadSpan[][]
  cellsPerAxis: number
  clearanceMeters: number
  edgeFillClearanceMeters: number
  fieldSize: number
}

export type StylizedGrassBlocker = {
  clearanceMeters?: number
  initialVisibility?: number
  points: readonly LandrushPoint2[]
}

type StylizedSceneResolvedGrassTuning = {
  colorPatchScale: number
  colorVariation: number
  density: number
  flutter: number
  greenTint: number
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

export type StylizedGrassInstance = {
  heightFactor: number
  id: string
  macroVariation: number
  patchVariation: number
  scaleFactor: number
  seed: number
  x: number
  yaw: number
  z: number
}

type StylizedGrassCompiledPolygon = {
  bounds: StylizedGrassBounds
  crossingSpansByCellZ: ReadonlyMap<number, readonly StylizedGrassSegmentSpan[]>
  ring: readonly LandrushPoint2[]
  spans: readonly StylizedGrassSegmentSpan[]
}

type StylizedGrassCompiledBlocker = StylizedGrassCompiledPolygon & {
  clearanceMeters: number
  points: readonly LandrushPoint2[]
}

type StylizedGrassFadeZone = StylizedGrassCompiledBlocker & {
  id: string
  targetVisibility: number
  visibility: number
}

type StylizedGrassCellCache = Map<string, readonly StylizedGrassInstance[]>

type StylizedGrassResidentInstanceState = {
  arrivalState: StylizedGrassArrivalState
  cacheRevision: number
  cellInstancesByKey: Map<string, readonly StylizedGrassInstance[]>
  contentRevision: number
  coverageRevision: number
  instanceCount: number
}

type StylizedGrassResidentCellChanges = {
  added: readonly StylizedGrassStreamCell[]
  removed: readonly StylizedGrassStreamCell[]
  revision: number
}

export type StylizedGrassStreamCell = {
  cellX: number
  cellZ: number
  index: number
  key: string
}

type StylizedGrassStreamChunk = StylizedGrassBounds & {
  cellIndices: readonly number[]
}

type StylizedGrassStreamGrid = {
  cells: readonly StylizedGrassStreamCell[]
  chunks: readonly StylizedGrassStreamChunk[]
}

type StylizedGrassResidentCellScan = {
  cells: readonly StylizedGrassStreamCell[]
}

export type StylizedGrassDrawEnvelope = {
  horizontalMargin: number
  maxHeight: number
  minHeight: number
}

export type StylizedGrassCellCoverage = {
  residentCells: readonly StylizedGrassStreamCell[]
  residentRevision: number
}

export type StylizedGrassExactDrawMembership = {
  addedKeys: string[]
  changedAtMs: number
  exact: Set<string>
  removedKeys: string[]
  revision: number
  scanRevision: number
  seenAtByKey: Map<string, number>
  stagedAddedKeys: string[]
  stagedRemovedKeys: string[]
}

export type StylizedGrassDrawMembershipApplyDecision = 'canonical' | 'delta' | 'none' | 'wait'

type StylizedGrassCommittedResidentDrawSources = {
  contentGeneration: number
  instancesByCell: ReadonlyMap<string, readonly StylizedGrassInstance[]>
  residentCells: readonly StylizedGrassStreamCell[]
  revision: number
}

export type StylizedGrassArrivalState = {
  initialized: boolean
  residentCellKeys: Set<string>
  startedAtByCell: Map<string, number>
}

export type StylizedGrassDenseDrawState = {
  eligibleTotal: number
  instances: StylizedGrassInstance[]
  saturated: boolean
  slotById: Map<string, number>
}

type StylizedGrassDrawState = StylizedGrassDenseDrawState & {
  fadeStateById: Map<string, StylizedGrassFadeSlotState>
  geometry: BufferGeometry | null
  lastStreamFadeTraceAt: number
  streamFadeById: Map<string, number>
  tuning: StylizedSceneResolvedGrassTuning | null
}

type StylizedGrassFadeSlotState = {
  insideHiddenZone: boolean
  value: number
}

type StylizedGrassCacheStats = {
  clears: number
  hits: number
  misses: number
  rebuilds: number
}

type StylizedGrassDebugState = {
  buildMode?: boolean
  fadeBlockerSignature?: string
  source?: string
  structuralBlockerSignature?: string
}

type StylizedGrassFadeSummary = {
  blockedFullCount: number
  blockedInstanceCount: number
  blockedVisibleCount: number
  fadeMax: number
  fadeMin: number
}

type StylizedGrassRuntimeProbe = {
  grassEvents?: Record<string, unknown>[]
  grassSamples?: Record<string, unknown>[]
  lastStylizedGrassProbeAt?: number
  startedAt?: number
}

type StylizedGrassStreamRuntimeTrace = {
  activeFadeMax: number
  coverageChanges: number
  eventCount: number
  events: Record<string, unknown>[]
  lateVisibleAddedCells: number
  lodChanges: number
  residentResets: number
  residentUpdates: number
  search: string
  startedAt: number
  visibleRemovedCells: number
}

export type StylizedGrassInteraction = {
  radius: number
  speed: number
  strength?: number
  x: number
  z: number
}

export type StylizedGrassInteractionRef = {
  current: StylizedGrassInteraction | null
}

export type StylizedGrassVisibilityRef = {
  current: number
}

export type StylizedGrassPerfKind = 'attributes' | 'build' | 'fade' | 'matrix' | 'stream'

export type StylizedGrassPerfSample = {
  centerX?: number
  centerZ?: number
  count?: number
  durationMs: number
  kind: StylizedGrassPerfKind
  moving?: boolean
  time: number
}

export type StylizedGrassPerfProbe = {
  enabled: boolean
  samples: StylizedGrassPerfSample[]
}

declare global {
  interface Window {
    __LANDRUSH_STYLIZED_GRASS_PERF__?: StylizedGrassPerfProbe
  }
}

const STYLIZED_SCENE_BASE = '/landrush-lab/stylized-scene'
const STYLIZED_SCENE_FIELD_SIZE = 132
const STYLIZED_SCENE_STREAM_SIZE = 44
const STYLIZED_SCENE_BASE_STREAM_RADIUS = STYLIZED_SCENE_STREAM_SIZE / 2
const STYLIZED_SCENE_STREAM_CELL_SIZE = 1
const STYLIZED_SCENE_MAX_GRASS_INSTANCES = 60_000
const STYLIZED_SCENE_MAX_GRASS_CACHE_CELLS = Math.ceil(
  (STYLIZED_SCENE_FIELD_SIZE / STYLIZED_SCENE_STREAM_CELL_SIZE + 1) ** 2,
)
const STYLIZED_SCENE_GRASS_DENSITY = 5000
const STYLIZED_SCENE_GRASS_FIELD_DENSITY_SCALE = 0.5
const STYLIZED_SCENE_GRASS_SCALE = 1.3
const STYLIZED_SCENE_GRASS_HEIGHT_SCALE = 0.5
const STYLIZED_SCENE_GRASS_SEED = 15_173
const STYLIZED_SCENE_INTERACTION_FULL_SPEED = 5.8
const STYLIZED_SCENE_INTERACTION_MAX_BEND = 1.55
const STYLIZED_SCENE_GRASS_FADE_SECONDS = 1.375
const STYLIZED_SCENE_GRASS_FADE_MAX_DELTA_SECONDS = 0.25
const STYLIZED_SCENE_GRASS_EDGE_FILL_DENSITY_MULTIPLIER = 5
const STYLIZED_SCENE_GRASS_EDGE_FILL_ROOT_WIDTH_MULTIPLIER = 1.8
const STYLIZED_SCENE_GRASS_EDGE_FILL_SCALE = 0.5
const STYLIZED_SCENE_GRASS_TRANSFORM_QUANTIZATION = 4095
const STYLIZED_SCENE_GRASS_MIN_HEIGHT_FACTOR = 0.2
const STYLIZED_SCENE_GRASS_MAX_HEIGHT_FACTOR = 1.8
const STYLIZED_SCENE_GRASS_EDGE_SAFETY_METERS = 0.04
const STYLIZED_SCENE_PATH_EDGE_JITTER_METERS = 0.06
const STYLIZED_SCENE_STREAM_CAPACITY_HEADROOM = 1.2
const STYLIZED_SCENE_STREAM_CAPACITY_PADDING = 64
const STYLIZED_SCENE_STREAM_CAMERA_MOVE_METERS = 2
const STYLIZED_SCENE_STREAM_CAMERA_ROTATION_RADIANS = Math.PI / 180
const STYLIZED_SCENE_STREAM_DRAW_ENTER_GUARD_METERS = STYLIZED_SCENE_STREAM_CELL_SIZE * 1.5
const STYLIZED_SCENE_STREAM_DRAW_EXIT_GUARD_METERS = STYLIZED_SCENE_STREAM_CELL_SIZE * 3
const STYLIZED_SCENE_STREAM_PREFETCH_MARGIN_METERS = 9
const STYLIZED_SCENE_STREAM_RETENTION_MARGIN_METERS = 15
const STYLIZED_SCENE_STREAM_INTERACTION_RADIUS_METERS = 8
const STYLIZED_SCENE_STREAM_INTERACTION_CELL_METERS = 2
const STYLIZED_SCENE_STREAM_MIN_UPDATE_SECONDS = 0.15
const STYLIZED_SCENE_STREAM_ARRIVAL_FADE_SECONDS = 0.28
const STYLIZED_SCENE_STREAM_UPDATE_RANGE_GAP = 4
const STYLIZED_SCENE_STREAM_SCAN_CHUNK_CELLS = 8
const STYLIZED_TREE_BLOCKER_CLEARANCE_METERS = 2.35
const STYLIZED_TREE_TRUNK_SCALE = 12
const STYLIZED_GRASS_RENDER_ORDER = 14
export const DEFAULT_STYLIZED_GRASS_GROUND_TINT_CAP = 0.55

type StylizedGrassLod = 'culled' | 'far' | 'mid' | 'near'

const STYLIZED_GRASS_LOD_DENSITY: Record<StylizedGrassLod, number> = {
  culled: 0,
  far: 0.45,
  mid: 0.82,
  near: 1,
}

const STYLIZED_SCENE_DEFAULT_TUNING: StylizedSceneResolvedGrassTuning = {
  colorPatchScale: 0.7,
  colorVariation: 0.5,
  density: STYLIZED_SCENE_GRASS_DENSITY,
  flutter: 0.28,
  greenTint: 0,
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
  leavesAlpha: `${STYLIZED_SCENE_BASE}/leaves-alpha-map.png`,
  pathMask: `${STYLIZED_SCENE_BASE}/path.webp`,
  treeLeaves: `${STYLIZED_SCENE_BASE}/tree-leaves-mesh.glb`,
  treeTrunk: `${STYLIZED_SCENE_BASE}/tree-tronk-transformed.glb`,
} as const

// Resume in-progress fades if the land-layer subtree remounts while build chrome settles.
const stylizedGrassZoneVisibilityById = new Map<string, number>()

const EMPTY_STYLIZED_GRASS_FADE_SUMMARY: StylizedGrassFadeSummary = {
  blockedFullCount: 0,
  blockedInstanceCount: 0,
  blockedVisibleCount: 0,
  fadeMax: 1,
  fadeMin: 1,
}

type StylizedGrassRenderCenter = {
  x: number
  z: number
}

const STYLIZED_TREE_LAYOUT: readonly StylizedTreeLayoutEntry[] = [
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
  grassBlockers = [],
  grassDebugState,
  grassFadeBlockers = [],
  grassInteractionRef,
  grassRenderOrder = STYLIZED_GRASS_RENDER_ORDER,
  grassVisibilityRef,
  bladesVisible = true,
  groundColorTexture = null,
  groundTintCap = DEFAULT_STYLIZED_GRASS_GROUND_TINT_CAP,
  profileMeasure,
  roads = [],
  showBlades = true,
  showTrees = true,
  streamingPaused = false,
  surfacePoints = [],
  treeBlockers = [],
  tuning,
}: StylizedSceneLandLayerProps) {
  const compiledTreeBlockers = useMemo(
    () =>
      showTrees && treeBlockers.length > 0
        ? measureStylizedScene(profileMeasure, 'setup.stylized-tree.blocker-geometry', () =>
            createStylizedTreeCompiledBlockers(treeBlockers),
          )
        : [],
    [profileMeasure, showTrees, treeBlockers],
  )

  return (
    <>
      {showBlades ? (
        <StylizedSceneGrassLayer
          elevation={elevation}
          bladesVisible={bladesVisible}
          grassFadeBlockers={grassFadeBlockers}
          grassDebugState={grassDebugState}
          grassBlockers={grassBlockers}
          groundColorTexture={groundColorTexture}
          groundTintCap={groundTintCap}
          interactionRef={grassInteractionRef}
          profileMeasure={profileMeasure}
          renderOrder={grassRenderOrder}
          roads={roads}
          streamingPaused={streamingPaused}
          surfacePoints={surfacePoints}
          tuning={tuning}
          visibilityRef={grassVisibilityRef}
        />
      ) : null}
      {showTrees
        ? STYLIZED_TREE_LAYOUT.map((tree, index) =>
            isStylizedTreeBlocked(tree, compiledTreeBlockers) ? null : (
              <StylizedSceneTree
                elevation={elevation}
                key={`${tree.position.join(':')}:${index}`}
                position={tree.position}
                profileMeasure={profileMeasure}
                rotationY={tree.rotationY}
                scale={tree.scale}
                tuning={tuning}
              />
            ),
          )
        : null}
    </>
  )
}

function StylizedSceneGrassLayer({
  bladesVisible,
  elevation,
  grassBlockers,
  grassDebugState,
  grassFadeBlockers,
  groundColorTexture,
  groundTintCap,
  interactionRef,
  profileMeasure,
  renderOrder,
  roads,
  streamingPaused,
  surfacePoints,
  tuning,
  visibilityRef,
}: {
  bladesVisible: boolean
  elevation: number
  grassBlockers: readonly StylizedGrassBlocker[]
  grassDebugState?: StylizedGrassDebugState
  grassFadeBlockers: readonly StylizedGrassBlocker[]
  groundColorTexture: Texture | null
  groundTintCap: number
  interactionRef?: StylizedGrassInteractionRef
  profileMeasure?: StylizedSceneProfileMeasure
  renderOrder: number
  roads: readonly LandrushRoadSegment[]
  streamingPaused: boolean
  surfacePoints: readonly LandrushPoint2[]
  tuning?: GrassBladeTuning
  visibilityRef?: StylizedGrassVisibilityRef
}) {
  const shaderTransformsGrassInstances = getMaterialRendererBackend() !== 'webgl'
  const { scene } = useGLTF(STYLIZED_SCENE_PATHS.grassBlades)
  const pathMask = useTexture(STYLIZED_SCENE_PATHS.pathMask) as Texture
  const resolvedTuning = useMemo(
    () =>
      measureStylizedScene(profileMeasure, 'setup.stylized-grass.resolve-tuning', () =>
        resolveStylizedSceneTuning(tuning),
      ),
    [profileMeasure, tuning],
  )
  const sourceGeometry = useMemo(() => {
    return measureStylizedScene(profileMeasure, 'setup.stylized-grass.instance-geometry', () => {
      const geometry = extractFirstMeshGeometry(scene)
      return geometry ? withStylizedGrassBladeRootUv(geometry) : null
    })
  }, [profileMeasure, scene])
  const lodGeometries = useMemo(
    () =>
      sourceGeometry
        ? {
            far: createReducedStylizedGrassGeometry(sourceGeometry, [0.4]),
            mid: createReducedStylizedGrassGeometry(sourceGeometry, [0.2, 0.72]),
            near: sourceGeometry,
          }
        : null,
    [sourceGeometry],
  )
  const lodAnchor = useMemo(() => centroidForStylizedGrassPoints(surfacePoints), [surfacePoints])
  const sourceBladeHeight = useMemo(() => {
    sourceGeometry?.computeBoundingBox()
    const bounds = sourceGeometry?.boundingBox
    return Math.max(0.1, (bounds?.max.y ?? 1.9) - (bounds?.min.y ?? 0))
  }, [sourceGeometry])
  const grassRootRadius = useMemo(
    () => measureStylizedGrassRootRadius(sourceGeometry),
    [sourceGeometry],
  )
  const grassWorkPaused = streamingPaused || !bladesVisible
  const lod = useStylizedGrassLod({
    anchor: lodAnchor,
    bladeHeight: sourceBladeHeight * resolvedTuning.scale * STYLIZED_SCENE_GRASS_HEIGHT_SCALE,
    elevation,
    interactionRef,
    streamingPaused: grassWorkPaused,
  })
  const bladeWorldHeight =
    sourceBladeHeight * resolvedTuning.scale * STYLIZED_SCENE_GRASS_HEIGHT_SCALE
  const grassClusterRadius = grassRootRadius * resolvedTuning.scale
  const grassDrawEnvelope = useMemo(
    () =>
      resolveStylizedGrassDrawEnvelope({
        bladeHeight: bladeWorldHeight,
        flutter: resolvedTuning.flutter,
        horizontalRadius: grassClusterRadius,
        scale: resolvedTuning.scale,
        turbulence: resolvedTuning.turbulence,
        windStrength: resolvedTuning.windStrength,
      }),
    [
      bladeWorldHeight,
      grassClusterRadius,
      resolvedTuning.flutter,
      resolvedTuning.scale,
      resolvedTuning.turbulence,
      resolvedTuning.windStrength,
    ],
  )
  const surfaceBounds = useMemo(
    () => stylizedGrassSurfaceBounds(openRing(surfacePoints)),
    [surfacePoints],
  )
  const surfacePolygon = useMemo(
    () =>
      measureStylizedScene(profileMeasure, 'setup.stylized-grass.surface-polygon', () =>
        createStylizedGrassCompiledPolygon(surfacePoints),
      ),
    [profileMeasure, surfacePoints],
  )
  const arrivalStateRef = useRef(createStylizedGrassArrivalState())
  const {
    changesRef: residentCellChangesRef,
    coverage,
    exactDrawMembershipRef,
  } = useStylizedGrassCellCoverage({
    arrivalState: arrivalStateRef.current,
    drawEnvelope: grassDrawEnvelope,
    elevation,
    interactionRef,
    streamingPaused: grassWorkPaused,
    surfaceBounds,
  })
  const residentCells = coverage.residentCells
  const grassClusterClearance = grassClusterRadius + STYLIZED_SCENE_GRASS_EDGE_SAFETY_METERS
  const grassEdgeFillClearance =
    grassClusterRadius * STYLIZED_SCENE_GRASS_EDGE_FILL_SCALE +
    STYLIZED_SCENE_GRASS_EDGE_SAFETY_METERS
  const baseGeometry = lod === 'culled' ? null : (lodGeometries?.[lod] ?? null)
  const roadGrid = useMemo(
    () =>
      measureStylizedScene(profileMeasure, 'setup.stylized-grass.road-grid', () =>
        createStylizedGrassRoadGrid(
          roads,
          STYLIZED_SCENE_FIELD_SIZE,
          grassClusterClearance,
          grassEdgeFillClearance,
        ),
      ),
    [grassClusterClearance, grassEdgeFillClearance, profileMeasure, roads],
  )
  const pathMaskData = useMemo(
    () =>
      measureStylizedScene(profileMeasure, 'setup.stylized-grass.path-mask-data', () =>
        roadGrid ? null : extractImageData(pathMask),
      ),
    [pathMask, profileMeasure, roadGrid],
  )
  const grassBlockerSignature = useMemo(
    () => stylizedGrassBlockersSignature(grassBlockers),
    [grassBlockers],
  )
  const stableGrassBlockersRef = useRef({
    blockers: grassBlockers,
    signature: grassBlockerSignature,
  })
  if (stableGrassBlockersRef.current.signature !== grassBlockerSignature) {
    stableGrassBlockersRef.current = {
      blockers: grassBlockers,
      signature: grassBlockerSignature,
    }
  }
  const stableGrassBlockers = stableGrassBlockersRef.current.blockers
  const compiledGrassBlockers = useMemo(
    () =>
      measureStylizedScene(profileMeasure, 'setup.stylized-grass.blocker-geometry', () =>
        createStylizedGrassCompiledBlockers(stableGrassBlockers),
      ),
    [profileMeasure, stableGrassBlockers],
  )
  const cellCacheRef = useRef<StylizedGrassCellCache>(new Map())
  const cellCacheRevisionRef = useRef(0)
  const residentInstanceStateRef = useRef<StylizedGrassResidentInstanceState>({
    arrivalState: arrivalStateRef.current,
    cacheRevision: 0,
    cellInstancesByKey: new Map(),
    contentRevision: 0,
    coverageRevision: 0,
    instanceCount: 0,
  })
  const cacheStatsRef = useRef<StylizedGrassCacheStats>({
    clears: 0,
    hits: 0,
    misses: 0,
    rebuilds: 0,
  })
  const cellCacheSignatureRef = useRef({
    grassBlockerSignature,
    pathMaskData,
    compiledGrassBlockers,
    resolvedTuning,
    roadGrid,
    surfacePoints,
  })
  const cellCacheSignature = cellCacheSignatureRef.current
  if (
    cellCacheSignature.grassBlockerSignature !== grassBlockerSignature ||
    cellCacheSignature.compiledGrassBlockers !== compiledGrassBlockers ||
    cellCacheSignature.pathMaskData !== pathMaskData ||
    cellCacheSignature.roadGrid !== roadGrid ||
    cellCacheSignature.resolvedTuning !== resolvedTuning ||
    cellCacheSignature.surfacePoints !== surfacePoints
  ) {
    // Blocker-only changes invalidate just the cells the changed blockers can reach.
    const onlyBlockersChanged =
      cellCacheSignature.pathMaskData === pathMaskData &&
      cellCacheSignature.roadGrid === roadGrid &&
      cellCacheSignature.resolvedTuning === resolvedTuning &&
      cellCacheSignature.surfacePoints === surfacePoints
    if (onlyBlockersChanged) {
      invalidateChangedStylizedGrassBlockerCells(
        cellCacheRef.current,
        cellCacheSignature.compiledGrassBlockers,
        compiledGrassBlockers,
      )
    } else {
      cellCacheRef.current = new Map()
    }
    cellCacheRevisionRef.current += 1
    cacheStatsRef.current.clears += 1
    cellCacheSignatureRef.current = {
      grassBlockerSignature,
      pathMaskData,
      compiledGrassBlockers,
      resolvedTuning,
      roadGrid,
      surfacePoints,
    }
  }
  const residentContentGeneration = cellCacheRevisionRef.current
  const grassFadeBlockerSignature = useMemo(
    () => stylizedGrassBlockersSignature(grassFadeBlockers),
    [grassFadeBlockers],
  )
  const residentInstanceSnapshot = useMemo(
    () =>
      measureStylizedScene(profileMeasure, 'setup.stylized-grass.instances', () => {
        let revision: number
        if (lod === 'culled') {
          revision = residentInstanceStateRef.current.contentRevision
        } else {
          revision = updateStylizedGrassResidentInstances({
            cacheRevision: residentContentGeneration,
            cellCache: cellCacheRef.current,
            cacheStats: cacheStatsRef.current,
            grassBlockers: compiledGrassBlockers,
            pathMaskData,
            roadGrid,
            surfacePolygon,
            state: residentInstanceStateRef.current,
            tuning: resolvedTuning,
            residentCellChanges: residentCellChangesRef.current,
            residentCells,
          })
        }
        return {
          instancesByCell: new Map(residentInstanceStateRef.current.cellInstancesByKey),
          revision,
        }
      }),
    [
      pathMaskData,
      lod,
      profileMeasure,
      residentContentGeneration,
      roadGrid,
      resolvedTuning,
      compiledGrassBlockers,
      surfacePolygon,
      residentCellChangesRef,
      residentCells,
    ],
  )
  const residentInstancesByCell = residentInstanceSnapshot.instancesByCell
  const residentInstanceRevision = residentInstanceSnapshot.revision
  const committedResidentDrawSourcesRef = useRef<StylizedGrassCommittedResidentDrawSources | null>(
    null,
  )
  const instanceCapacity = useMemo(
    () => stylizedGrassInstanceCapacity(resolvedTuning.density, surfaceBounds, lod),
    [lod, resolvedTuning.density, surfaceBounds],
  )
  const geometry = useMemo(
    () =>
      baseGeometry ? withStylizedGrassInstanceAttributes(baseGeometry, instanceCapacity) : null,
    [baseGeometry, instanceCapacity],
  )
  const materialBundle = useMemo(
    () =>
      measureStylizedScene(profileMeasure, 'setup.stylized-grass.node-material', () =>
        createStylizedGrassNodeMaterial(sourceGeometry, resolvedTuning, groundColorTexture),
      ),
    [groundColorTexture, profileMeasure, resolvedTuning, sourceGeometry],
  )
  const material = materialBundle?.material ?? null
  const meshRef = useRef<InstancedMesh>(null!)
  const layoutMeshRef = useRef<InstancedMesh | null>(null)
  const dummyRef = useRef(new Object3D())
  const drawStateRef = useRef<StylizedGrassDrawState>({
    eligibleTotal: 0,
    fadeStateById: new Map(),
    geometry: null,
    instances: [],
    lastStreamFadeTraceAt: 0,
    saturated: false,
    slotById: new Map(),
    streamFadeById: new Map(),
    tuning: null,
  })
  const drawInstancesRef = useRef<readonly StylizedGrassInstance[]>([])
  const appliedDrawRevisionRef = useRef(-1)
  const appliedResidentContentGenerationRef = useRef(-1)
  const appliedResidentInstanceRevisionRef = useRef(-1)
  const fadeZonesRef = useRef<StylizedGrassFadeZone[]>([])
  const lastFadeFrameAtRef = useRef<number | null>(null)
  const lastFadeSummaryRef = useRef<StylizedGrassFadeSummary>(EMPTY_STYLIZED_GRASS_FADE_SUMMARY)
  const smoothedInteractionRef = useRef(new Vector4())
  const profiledStartupFramesRef = useRef(0)
  const profileMeasureRef = useRef(profileMeasure)
  profileMeasureRef.current = profileMeasure

  const applyExactDrawMembership = useCallback(
    (nowMs: number) => {
      const membership = exactDrawMembershipRef.current
      const mesh = meshRef.current
      if (!mesh) return false
      mesh.visible = bladesVisible
      if (!bladesVisible) {
        mesh.count = 0
        return true
      }
      if (!geometry || !material) return false

      const residentSources = committedResidentDrawSourcesRef.current
      if (!residentSources || residentSources.contentGeneration !== residentContentGeneration) {
        return false
      }
      const meshReplaced = layoutMeshRef.current !== mesh
      const state = drawStateRef.current
      const density = STYLIZED_GRASS_LOD_DENSITY[lod]
      const residentContentChanged =
        appliedResidentContentGenerationRef.current !== residentSources.contentGeneration
      const forceCanonical =
        meshReplaced ||
        residentContentChanged ||
        state.geometry !== geometry ||
        state.tuning !== resolvedTuning
      const decision = resolveStylizedGrassDrawMembershipApplyDecision({
        appliedRevision: appliedDrawRevisionRef.current,
        forceCanonical,
        membership,
        residentInstancesByCell: residentSources.instancesByCell,
      })
      if (decision === 'wait') return false
      if (decision === 'none') {
        mesh.count = state.instances.length
        appliedResidentContentGenerationRef.current = residentSources.contentGeneration
        appliedResidentInstanceRevisionRef.current = residentSources.revision
        return true
      }

      let completed = true
      measureStylizedScene(profileMeasureRef.current, 'setup.stylized-grass.apply-layout', () => {
        layoutMeshRef.current = mesh
        let fullRebuild = decision === 'canonical'
        const rebuildCanonical = () => {
          const selection = selectStylizedGrassDrawInstances({
            capacity: instanceCapacity,
            density,
            exactDrawCellKeys: membership.exact,
            residentCells: residentSources.residentCells,
            residentInstancesByCell: residentSources.instancesByCell,
          })
          return reconcileStylizedGrassDrawInstances({
            arrivalState: residentInstanceStateRef.current.arrivalState,
            capacity: instanceCapacity,
            eligibleTotal: selection.eligibleTotal,
            geometry,
            nextInstances: selection.instances,
            nowMs,
            state,
            tuning: resolvedTuning,
          })
        }
        let drawUpdate: ReturnType<typeof reconcileStylizedGrassDenseDrawInstances>
        if (fullRebuild) {
          drawUpdate = rebuildCanonical()
        } else {
          const delta = reconcileStylizedGrassDenseDrawCellDelta({
            addedCellKeys: membership.addedKeys,
            capacity: instanceCapacity,
            density,
            removedCellKeys: membership.removedKeys,
            residentInstancesByCell: residentSources.instancesByCell,
            state,
            streamFadeById: state.streamFadeById,
          })
          fullRebuild = delta.requiresFullRebuild
          if (fullRebuild) {
            const fallbackDecision = resolveStylizedGrassDrawMembershipApplyDecision({
              appliedRevision: appliedDrawRevisionRef.current,
              forceCanonical: true,
              membership,
              residentInstancesByCell: residentSources.instancesByCell,
            })
            if (fallbackDecision === 'wait') {
              completed = false
              return
            }
            drawUpdate = rebuildCanonical()
          } else {
            for (const id of delta.removedIds) state.fadeStateById.delete(id)
            for (const instance of delta.addedInstances) {
              const fade = resolveStylizedGrassArrivalFade(
                instance,
                residentInstanceStateRef.current.arrivalState,
                nowMs,
              )
              if (fade < 1) state.streamFadeById.set(instance.id, fade)
              else state.streamFadeById.delete(instance.id)
            }
            drawUpdate = delta
          }
        }
        drawInstancesRef.current = drawUpdate.instances
        // R3F replaces the InstancedMesh when args change, so its new matrix buffer
        // and every static instance attribute need one authoritative initialization set.
        const structuralUploadSlots = resolveStylizedGrassStructuralUploadSlots({
          changedSlots: drawUpdate.changedSlots,
          instanceCount: drawUpdate.instances.length,
          resourceReallocated: meshReplaced,
        })
        if (shaderTransformsGrassInstances) {
          if (meshReplaced) initializeStylizedGrassIdentityMatrices(mesh)
        } else {
          mesh.instanceMatrix.setUsage(DynamicDrawUsage)
          applyStylizedGrassStaticMatrices(
            mesh,
            drawUpdate.instances,
            structuralUploadSlots,
            resolvedTuning,
            dummyRef.current,
          )
        }
        applyStylizedGrassInstanceAttributes(geometry, drawUpdate.instances, structuralUploadSlots)
        applyStylizedGrassStreamFadeAttributes(
          geometry,
          drawUpdate.instances,
          structuralUploadSlots,
          drawStateRef.current,
        )
        const fadeSlots = resolveStylizedGrassFadeUploadSlots({
          changedSlots: structuralUploadSlots,
          fadeZonesActive: fadeZonesRef.current.length > 0,
          fadeZonesChanged: false,
          instanceCount: drawUpdate.instances.length,
        })
        applyStylizedGrassFadeAttributeSlots(
          geometry,
          drawUpdate.instances,
          fadeZonesRef.current,
          fadeSlots,
          state.fadeStateById,
        )
        if (stylizedGrassRuntimeProbeIsEnabled()) {
          lastFadeSummaryRef.current = summarizeStylizedGrassFadeSlotStates(state.fadeStateById)
        }
        mesh.count = drawUpdate.instances.length
      })
      if (!completed) return false
      appliedDrawRevisionRef.current = membership.revision
      appliedResidentContentGenerationRef.current = residentSources.contentGeneration
      appliedResidentInstanceRevisionRef.current = residentSources.revision
      return true
    },
    [
      bladesVisible,
      exactDrawMembershipRef,
      geometry,
      instanceCapacity,
      lod,
      material,
      residentContentGeneration,
      resolvedTuning,
      shaderTransformsGrassInstances,
    ],
  )

  useEffect(() => {
    if (!materialBundle) return
    materialBundle.uniforms.groundTintCap.value = clamp(groundTintCap, 0, 1)
  }, [groundTintCap, materialBundle])

  useLayoutEffect(() => {
    committedResidentDrawSourcesRef.current = {
      contentGeneration: residentContentGeneration,
      instancesByCell: residentInstancesByCell,
      residentCells,
      revision: residentInstanceRevision,
    }
  }, [residentCells, residentContentGeneration, residentInstanceRevision, residentInstancesByCell])

  useLayoutEffect(() => {
    applyExactDrawMembership(performance.now())
  }, [applyExactDrawMembership])

  useLayoutEffect(() => {
    const residentSources = committedResidentDrawSourcesRef.current
    if (!residentSources || residentSources.revision !== residentInstanceRevision) return
    if (
      appliedDrawRevisionRef.current === exactDrawMembershipRef.current.revision &&
      appliedResidentInstanceRevisionRef.current === residentSources.revision
    ) {
      return
    }
    applyExactDrawMembership(performance.now())
  }, [applyExactDrawMembership, exactDrawMembershipRef, residentInstanceRevision])

  useFrame(() => {
    const residentRevision = committedResidentDrawSourcesRef.current?.revision ?? -1
    if (
      appliedDrawRevisionRef.current === exactDrawMembershipRef.current.revision &&
      appliedResidentInstanceRevisionRef.current === residentRevision
    ) {
      return
    }
    applyExactDrawMembership(performance.now())
  }, 1)

  useLayoutEffect(() => {
    if (!bladesVisible) return
    const hadFadeZones = fadeZonesRef.current.length > 0
    updateStylizedGrassFadeZones(fadeZonesRef.current, grassFadeBlockers)
    if (geometry && (hadFadeZones || fadeZonesRef.current.length > 0)) {
      lastFadeSummaryRef.current = applyStylizedGrassFadeAttributes(
        geometry,
        drawInstancesRef.current,
        fadeZonesRef.current,
        hadFadeZones,
        drawStateRef.current.fadeStateById,
      )
    }
    renderScheduler.requestFrame('animation')
  }, [bladesVisible, geometry, grassFadeBlockers])

  useFrame(({ clock }, delta) => {
    const mesh = meshRef.current
    const visibility = clamp01(visibilityRef?.current ?? 1)
    if (materialBundle) materialBundle.uniforms.visibility.value = visibility
    if (material instanceof MeshStandardMaterial) material.opacity = visibility
    const renderBlades = bladesVisible && visibility > 0.002
    if (mesh) mesh.visible = renderBlades
    if (!renderBlades) {
      lastFadeFrameAtRef.current = performance.now()
      return
    }

    const runFrame = () => {
      const fadeFrameAt = performance.now()
      const previousFadeFrameAt = lastFadeFrameAtRef.current
      lastFadeFrameAtRef.current = fadeFrameAt
      // The viewer advances R3F with a synthetic clock, so wall time keeps fades at their authored duration.
      const fadeDelta =
        previousFadeFrameAt === null
          ? Math.max(0, delta)
          : Math.max(0, (fadeFrameAt - previousFadeFrameAt) / 1000)
      const mesh = meshRef.current
      const activeDrawInstances = drawInstancesRef.current
      const drawInstanceCount = drawStateRef.current.slotById.size
      const hadFadeZones = fadeZonesRef.current.length > 0
      // Fade zones must remain visual-only. Converting a converged fade zone into a
      // structural blocker rebuilds the instanced grass buffers at fade-end, which
      // can flash the old buffer contents for a frame across the whole field.
      const fadeChanged = advanceStylizedGrassFadeZones(fadeZonesRef.current, fadeDelta)
      if (!mesh || !geometry || !materialBundle || drawInstanceCount === 0) {
        if (fadeChanged) renderScheduler.requestFrame('animation')
        recordStylizedGrassFadeRuntimeProbe({
          cacheStats: takeStylizedGrassCacheStats(cacheStatsRef.current),
          debugState: grassDebugState,
          fadeBlockerSignature: grassFadeBlockerSignature,
          fadeSummary: lastFadeSummaryRef.current,
          fadeZoneCount: fadeZonesRef.current.length,
          instanceCount: drawInstanceCount,
          structuralBlockerSignature: grassBlockerSignature,
        })
        return
      }
      materialBundle.uniforms.time.value = clock.elapsedTime
      const interaction = interactionRef?.current
      const smoothedInteraction = smoothedInteractionRef.current
      const targetStrength =
        interaction && interaction.radius > 0
          ? clamp01(
              interaction.strength ?? interaction.speed / STYLIZED_SCENE_INTERACTION_FULL_SPEED,
            )
          : 0
      const targetX = interaction && targetStrength > 0 ? interaction.x : smoothedInteraction.x
      const targetZ = interaction && targetStrength > 0 ? interaction.z : smoothedInteraction.y
      const targetRadius =
        interaction && interaction.radius > 0
          ? interaction.radius
          : Math.max(0, smoothedInteraction.z)
      const interactionAmount = 1 - Math.exp(-18 * Math.max(0.001, Math.min(delta, 0.05)))
      smoothedInteraction.x = targetX
      smoothedInteraction.y = targetZ
      smoothedInteraction.z += (targetRadius - smoothedInteraction.z) * interactionAmount
      smoothedInteraction.w += (targetStrength - smoothedInteraction.w) * interactionAmount
      if (interaction && targetStrength > 0 && interaction.radius > 0) {
        materialBundle.uniforms.interaction.value.copy(smoothedInteraction)
      } else if (smoothedInteraction.w > 0.001) {
        materialBundle.uniforms.interaction.value.copy(smoothedInteraction)
      } else {
        smoothedInteraction.set(0, 0, 0, 0)
        materialBundle.uniforms.interaction.value.copy(smoothedInteraction)
      }
      recordStylizedGrassRuntimeProbe(interaction, smoothedInteraction)
      advanceStylizedGrassStreamFades(
        geometry,
        drawStateRef.current,
        residentInstanceStateRef.current.arrivalState,
        fadeFrameAt,
      )
      if (fadeChanged || (!hadFadeZones && fadeZonesRef.current.length > 0)) {
        lastFadeSummaryRef.current = applyStylizedGrassFadeAttributes(
          geometry,
          activeDrawInstances,
          fadeZonesRef.current,
          hadFadeZones,
          drawStateRef.current.fadeStateById,
        )
      }
      if (fadeChanged) renderScheduler.requestFrame('animation')
      recordStylizedGrassFadeRuntimeProbe({
        cacheStats: takeStylizedGrassCacheStats(cacheStatsRef.current),
        debugState: grassDebugState,
        fadeBlockerSignature: grassFadeBlockerSignature,
        fadeSummary: lastFadeSummaryRef.current,
        fadeZoneCount: fadeZonesRef.current.length,
        instanceCount: drawInstanceCount,
        structuralBlockerSignature: grassBlockerSignature,
      })
    }
    if (profileMeasure && profiledStartupFramesRef.current < 6) {
      const frameIndex = profiledStartupFramesRef.current
      profiledStartupFramesRef.current += 1
      measureStylizedScene(profileMeasure, `setup.stylized-grass.frame-${frameIndex}`, runFrame)
      return
    }
    runFrame()
  }, 2)

  useGpuResourceLifetime(geometry)
  useGpuResourceLifetime(material)
  useGpuResourceLifetime(lodGeometries?.far)
  useGpuResourceLifetime(lodGeometries?.mid)
  useGpuResourceLifetime(sourceGeometry)

  if (!geometry || !material) return null

  return (
    <instancedMesh
      args={[geometry, material, instanceCapacity]}
      frustumCulled={false}
      position={[0, elevation + 0.03, 0]}
      ref={meshRef}
      renderOrder={renderOrder}
      visible={bladesVisible}
    />
  )
}

function StylizedSceneTree({
  elevation,
  position,
  profileMeasure,
  rotationY,
  scale,
  tuning,
}: StylizedSceneTreeProps & {
  profileMeasure?: StylizedSceneProfileMeasure
  tuning?: GrassBladeTuning
}) {
  const treeRef = useRef<Group>(null)
  const { scene: leavesScene } = useGLTF(STYLIZED_SCENE_PATHS.treeLeaves)
  const { scene: trunkScene } = useGLTF(STYLIZED_SCENE_PATHS.treeTrunk)
  const alphaMap = useTexture(STYLIZED_SCENE_PATHS.leavesAlpha) as Texture
  const leavesGeometry = useMemo(
    () =>
      measureStylizedScene(
        profileMeasure,
        'setup.stylized-tree.leaves-geometry',
        () => extractFirstMeshGeometry(leavesScene)?.clone() ?? null,
      ),
    [leavesScene, profileMeasure],
  )
  const trunk = useMemo(() => {
    return measureStylizedScene(profileMeasure, 'setup.stylized-tree.trunk-clone', () => {
      const clone = trunkScene.clone(true)
      clone.traverse((child) => {
        const mesh = child as Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.material = createStylizedTreeSoftRevealMaterial(mesh.material, '#6a4931')
      })
      return clone
    })
  }, [profileMeasure, trunkScene])
  const leavesMaterial = useMemo(() => {
    return measureStylizedScene(profileMeasure, 'setup.stylized-tree.leaves-material', () => {
      alphaMap.flipY = false
      alphaMap.needsUpdate = true
      return createStylizedTreeLeavesMaterial(alphaMap)
    })
  }, [alphaMap, profileMeasure])
  const bushesRef = useRef<InstancedMesh>(null!)
  const resolvedTuning = useMemo(
    () =>
      measureStylizedScene(profileMeasure, 'setup.stylized-tree.resolve-tuning', () =>
        resolveStylizedSceneTuning(tuning),
      ),
    [profileMeasure, tuning],
  )

  useMemo(() => {
    measureStylizedScene(profileMeasure, 'setup.stylized-tree.bush-attributes', () => {
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
    })
  }, [leavesGeometry, position, profileMeasure])

  useLayoutEffect(() => {
    const mesh = bushesRef.current
    if (!mesh || !leavesGeometry) return

    measureStylizedScene(profileMeasure, 'setup.stylized-tree.apply-bush-layout', () => {
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
    })
  }, [leavesGeometry, profileMeasure])

  useFrame(({ clock }) => {
    const mesh = bushesRef.current
    if (!mesh || resolvedTuning.treeSway <= 0) return
    const phase =
      clock.elapsedTime * resolvedTuning.windSpeed + position[0] * 0.17 + position[2] * 0.13
    const sway = Math.sin(phase) * resolvedTuning.treeSway * resolvedTuning.windStrength * 0.035
    mesh.rotation.set(sway * 0.65, 0, sway)
  })

  useGpuResourceLifetime(leavesGeometry)
  useGpuResourceLifetime(leavesMaterial)

  if (!leavesGeometry) return null

  return (
    <group
      position={[position[0], elevation + 0.03, position[2]]}
      ref={treeRef}
      rotation={[0, rotationY, 0]}
      scale={scale}
      userData={{ landrushRobotOccluder: true }}
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

function createStylizedTreeLeavesMaterial(alphaMap: Texture) {
  const params = {
    alphaMap,
    alphaTest: 0.1,
    color: '#4a6b27',
    metalness: 0,
    roughness: 0.8,
    side: DoubleSide,
    transparent: true,
  }
  if (getMaterialRendererBackend() === 'webgl') {
    return new MeshStandardMaterial(params)
  }
  const material = new MeshStandardNodeMaterial(params)
  material.opacityNode = createLandrushRobotScreenRevealOpacityNode()
  material.userData.landrushRobotScreenRevealSoftMask = true
  return material
}

function createStylizedTreeSoftRevealMaterial(
  material: Material | Material[],
  fallbackColor: string,
) {
  const source = Array.isArray(material) ? material[0] : material
  const standardSource = source as MeshStandardMaterial | undefined
  const params = {
    alphaMap: standardSource?.alphaMap ?? null,
    alphaTest: standardSource?.alphaTest ?? 0,
    color: standardSource?.color?.clone() ?? fallbackColor,
    map: standardSource?.map ?? null,
    metalness: standardSource?.metalness ?? 0,
    opacity: standardSource?.opacity ?? 1,
    roughness: standardSource?.roughness ?? 0.85,
    side: standardSource?.side ?? DoubleSide,
    transparent: true,
  }
  if (getMaterialRendererBackend() === 'webgl') {
    return new MeshStandardMaterial(params)
  }
  const { opacity, ...nodeParams } = params
  const nextMaterial = new MeshStandardNodeMaterial(nodeParams)
  nextMaterial.opacityNode = createLandrushRobotScreenRevealOpacityNode(float(opacity))
  nextMaterial.userData.landrushRobotScreenRevealSoftMask = true
  return nextMaterial
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

function measureStylizedGrassRootRadius(geometry: BufferGeometry | null) {
  const positions = geometry?.getAttribute('position')
  if (!geometry || !positions || positions.count === 0) return 0

  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox
  if (!bounds) return 0

  const rootMaxY = bounds.min.y + (bounds.max.y - bounds.min.y) * 0.025
  let rootRadius = 0
  for (let index = 0; index < positions.count; index += 1) {
    if (positions.getY(index) > rootMaxY) continue
    rootRadius = Math.max(rootRadius, Math.hypot(positions.getX(index), positions.getZ(index)))
  }
  return rootRadius
}

function withStylizedGrassBladeRootUv(geometry: BufferGeometry) {
  const positions = geometry.getAttribute('position')
  const index = geometry.getIndex()
  if (!positions || !index) return geometry

  const roots = new Float32Array(positions.count * 2)
  const components = connectedStylizedGrassVertexComponents(positions.count, index.array)
  for (const component of components) {
    let rootVertex = component[0]
    if (rootVertex === undefined) continue
    for (const vertex of component) {
      if (positions.getY(vertex) < positions.getY(rootVertex)) rootVertex = vertex
    }
    const rootX = positions.getX(rootVertex)
    const rootZ = positions.getZ(rootVertex)
    for (const vertex of component) {
      roots[vertex * 2] = rootX
      roots[vertex * 2 + 1] = rootZ
    }
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(roots, 2))
  return geometry
}

function createReducedStylizedGrassGeometry(
  source: BufferGeometry,
  sectionTargets: readonly number[],
) {
  const sourcePositions = source.getAttribute('position')
  const sourceIndex = source.getIndex()
  if (!sourcePositions || !sourceIndex) return source.clone()

  const components = connectedStylizedGrassVertexComponents(
    sourcePositions.count,
    sourceIndex.array,
  )
  const positions: number[] = []
  const indices: number[] = []

  for (const component of components) {
    const sorted = [...component].sort(
      (first, second) => sourcePositions.getY(first) - sourcePositions.getY(second),
    )
    const baseVertex = sorted[0]
    const tipVertex = sorted.at(-1)
    if (baseVertex === undefined || tipVertex === undefined) continue
    const minY = sourcePositions.getY(baseVertex)
    const maxY = sourcePositions.getY(tipVertex)
    const height = Math.max(0.0001, maxY - minY)
    const levels = stylizedGrassBladeLevels(component, sourcePositions, height)
    const selectedLevels = sectionTargets
      .map((target) => closestStylizedGrassBladeLevel(levels, minY + target * height))
      .filter((level, index, all) => level && all.indexOf(level) === index)
    if (selectedLevels.length === 0) continue

    const baseIndex = pushStylizedGrassSourceVertex(positions, sourcePositions, baseVertex)
    const sectionPairs: [number, number][] = []
    for (const level of selectedLevels) {
      if (!level) continue
      const pair = farthestStylizedGrassVertexPair(level.vertices, sourcePositions)
      if (!pair) continue
      sectionPairs.push([
        pushStylizedGrassSourceVertex(positions, sourcePositions, pair[0]),
        pushStylizedGrassSourceVertex(positions, sourcePositions, pair[1]),
      ])
    }
    if (sectionPairs.length === 0) continue
    const tipIndex = pushStylizedGrassSourceVertex(positions, sourcePositions, tipVertex)
    const firstPair = sectionPairs[0]!
    indices.push(baseIndex, firstPair[0], firstPair[1])
    for (let index = 0; index < sectionPairs.length - 1; index += 1) {
      const current = sectionPairs[index]!
      const next = sectionPairs[index + 1]!
      indices.push(current[0], next[0], current[1], current[1], next[0], next[1])
    }
    const lastPair = sectionPairs.at(-1)!
    indices.push(lastPair[0], tipIndex, lastPair[1])
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return withStylizedGrassBladeRootUv(geometry)
}

function connectedStylizedGrassVertexComponents(
  vertexCount: number,
  indexArray: ArrayLike<number>,
) {
  const adjacency = Array.from({ length: vertexCount }, () => new Set<number>())
  for (let index = 0; index < indexArray.length; index += 3) {
    const a = indexArray[index]
    const b = indexArray[index + 1]
    const c = indexArray[index + 2]
    if (a === undefined || b === undefined || c === undefined) continue
    adjacency[a]?.add(b)
    adjacency[a]?.add(c)
    adjacency[b]?.add(a)
    adjacency[b]?.add(c)
    adjacency[c]?.add(a)
    adjacency[c]?.add(b)
  }

  const components: number[][] = []
  const visited = new Set<number>()
  for (let start = 0; start < vertexCount; start += 1) {
    if (visited.has(start)) continue
    const component: number[] = []
    const stack = [start]
    visited.add(start)
    while (stack.length > 0) {
      const vertex = stack.pop()
      if (vertex === undefined) continue
      component.push(vertex)
      for (const neighbor of adjacency[vertex] ?? []) {
        if (visited.has(neighbor)) continue
        visited.add(neighbor)
        stack.push(neighbor)
      }
    }
    components.push(component)
  }
  return components
}

function stylizedGrassBladeLevels(
  vertices: readonly number[],
  positions: ReturnType<BufferGeometry['getAttribute']>,
  bladeHeight: number,
) {
  const tolerance = Math.max(0.004, bladeHeight * 0.025)
  const levels: { averageY: number; vertices: number[] }[] = []
  const sorted = [...vertices].sort(
    (first, second) => positions.getY(first) - positions.getY(second),
  )
  for (const vertex of sorted) {
    const y = positions.getY(vertex)
    const level = levels.at(-1)
    if (!level || Math.abs(y - level.averageY) > tolerance) {
      levels.push({ averageY: y, vertices: [vertex] })
      continue
    }
    level.vertices.push(vertex)
    level.averageY =
      level.vertices.reduce((sum, entry) => sum + positions.getY(entry), 0) / level.vertices.length
  }
  return levels.filter((level) => level.vertices.length >= 2)
}

function closestStylizedGrassBladeLevel(
  levels: readonly { averageY: number; vertices: number[] }[],
  targetY: number,
) {
  let closest = levels[0]
  for (const level of levels.slice(1)) {
    if (!closest || Math.abs(level.averageY - targetY) < Math.abs(closest.averageY - targetY)) {
      closest = level
    }
  }
  return closest
}

function farthestStylizedGrassVertexPair(
  vertices: readonly number[],
  positions: ReturnType<BufferGeometry['getAttribute']>,
): [number, number] | null {
  let result: [number, number] | null = null
  let bestDistance = -1
  for (let firstIndex = 0; firstIndex < vertices.length; firstIndex += 1) {
    const first = vertices[firstIndex]
    if (first === undefined) continue
    for (let secondIndex = firstIndex + 1; secondIndex < vertices.length; secondIndex += 1) {
      const second = vertices[secondIndex]
      if (second === undefined) continue
      const dx = positions.getX(first) - positions.getX(second)
      const dz = positions.getZ(first) - positions.getZ(second)
      const distance = dx * dx + dz * dz
      if (distance <= bestDistance) continue
      bestDistance = distance
      result = [first, second]
    }
  }
  return result
}

function pushStylizedGrassSourceVertex(
  target: number[],
  source: ReturnType<BufferGeometry['getAttribute']>,
  index: number,
) {
  const nextIndex = target.length / 3
  target.push(source.getX(index), source.getY(index), source.getZ(index))
  return nextIndex
}

function useStylizedGrassLod({
  anchor,
  bladeHeight,
  elevation,
  interactionRef,
  streamingPaused,
}: {
  anchor: StylizedGrassRenderCenter
  bladeHeight: number
  elevation: number
  interactionRef?: StylizedGrassInteractionRef
  streamingPaused: boolean
}): StylizedGrassLod {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const [lod, setLod] = useState<StylizedGrassLod>('mid')
  const lodRef = useRef(lod)
  const base = useRef(new Vector3())
  const tip = useRef(new Vector3())

  useFrame(() => {
    if (streamingPaused) return
    const interaction = interactionRef?.current
    const anchorX = interaction?.x ?? anchor.x
    const anchorZ = interaction?.z ?? anchor.z
    base.current.set(anchorX, elevation, anchorZ).project(camera)
    tip.current.set(anchorX, elevation + bladeHeight, anchorZ).project(camera)
    const projectedPixels = Math.hypot(
      (tip.current.x - base.current.x) * size.width * 0.5,
      (tip.current.y - base.current.y) * size.height * 0.5,
    )
    const next = resolveStylizedGrassLod(projectedPixels, lodRef.current)
    if (next === lodRef.current) return
    recordStylizedGrassStreamRuntimeEvent({
      event: 'lod-change',
      from: lodRef.current,
      projectedPixels: Math.round(projectedPixels * 1000) / 1000,
      to: next,
    })
    lodRef.current = next
    startTransition(() => setLod(next))
  }, -90)

  return lod
}

function resolveStylizedGrassLod(projectedPixels: number, current: StylizedGrassLod) {
  if (current === 'near' && projectedPixels >= 10) return 'near'
  if (current === 'mid' && projectedPixels >= 3.5 && projectedPixels <= 12) return 'mid'
  if (current === 'far' && projectedPixels >= 1 && projectedPixels <= 4.5) return 'far'
  if (current === 'culled' && projectedPixels <= 1.5) return 'culled'
  if (projectedPixels > 12) return 'near'
  if (projectedPixels > 4.5) return 'mid'
  if (projectedPixels > 1.5) return 'far'
  return 'culled'
}

function useStylizedGrassCellCoverage({
  arrivalState,
  drawEnvelope,
  elevation,
  interactionRef,
  streamingPaused,
  surfaceBounds,
}: {
  arrivalState: StylizedGrassArrivalState
  drawEnvelope: StylizedGrassDrawEnvelope
  elevation: number
  interactionRef?: StylizedGrassInteractionRef
  streamingPaused: boolean
  surfaceBounds: StylizedGrassBounds
}) {
  const camera = useThree((state) => state.camera)
  const [coverage, setCoverage] = useState<StylizedGrassCellCoverage>(() =>
    createInitialStylizedGrassCellCoverage(),
  )
  const coverageRef = useRef(coverage)
  const exactDrawMembershipRef = useRef(createInitialStylizedGrassExactDrawMembership())
  const initializedRef = useRef(false)
  const lastResidentCameraPositionRef = useRef(new Vector3())
  const lastResidentCameraQuaternionRef = useRef(new Quaternion())
  const lastResidentProjectionMatrixRef = useRef(new Matrix4())
  const lastDrawProjectionViewMatrixRef = useRef(new Matrix4())
  const currentCameraPositionRef = useRef(new Vector3())
  const currentCameraQuaternionRef = useRef(new Quaternion())
  const projectionViewMatrixRef = useRef(new Matrix4())
  const frustumRef = useRef(new Frustum())
  const streamGrid = useMemo(() => createStylizedGrassStreamGrid(surfaceBounds), [surfaceBounds])
  const changesRef = useRef<StylizedGrassResidentCellChanges>({
    added: [],
    removed: [],
    revision: 0,
  })
  const lastInteractionCellRef = useRef('')
  const lastResidentUpdateTimeRef = useRef(-Infinity)
  const coverageSignature = `${surfaceBounds.minX}:${surfaceBounds.minZ}:${surfaceBounds.maxX}:${surfaceBounds.maxZ}:${elevation}:${drawEnvelope.horizontalMargin}:${drawEnvelope.minHeight}:${drawEnvelope.maxHeight}`
  const lastCoverageSignatureRef = useRef('')

  useFrame(({ clock }) => {
    if (streamingPaused) return

    camera.updateMatrixWorld()
    camera.getWorldPosition(currentCameraPositionRef.current)
    camera.getWorldQuaternion(currentCameraQuaternionRef.current)
    const interaction = interactionRef?.current
    const interactionCell = interaction
      ? `${Math.floor(interaction.x / STYLIZED_SCENE_STREAM_INTERACTION_CELL_METERS)}:${Math.floor(
          interaction.z / STYLIZED_SCENE_STREAM_INTERACTION_CELL_METERS,
        )}`
      : ''
    projectionViewMatrixRef.current.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    )
    const drawViewChanged =
      !initializedRef.current ||
      stylizedGrassMatrixChanged(
        lastDrawProjectionViewMatrixRef.current,
        projectionViewMatrixRef.current,
      )
    const residentCameraMoved =
      !initializedRef.current ||
      lastResidentCameraPositionRef.current.distanceToSquared(currentCameraPositionRef.current) >=
        STYLIZED_SCENE_STREAM_CAMERA_MOVE_METERS ** 2
    const residentCameraRotated =
      !initializedRef.current ||
      lastResidentCameraQuaternionRef.current.angleTo(currentCameraQuaternionRef.current) >=
        STYLIZED_SCENE_STREAM_CAMERA_ROTATION_RADIANS
    const residentProjectionChanged =
      !initializedRef.current ||
      stylizedGrassMatrixChanged(lastResidentProjectionMatrixRef.current, camera.projectionMatrix)
    const interactionChanged = lastInteractionCellRef.current !== interactionCell
    const coverageChanged = lastCoverageSignatureRef.current !== coverageSignature
    const residentUpdateDue =
      !initializedRef.current ||
      coverageChanged ||
      interactionChanged ||
      (clock.elapsedTime - lastResidentUpdateTimeRef.current >=
        STYLIZED_SCENE_STREAM_MIN_UPDATE_SECONDS &&
        (residentCameraMoved || residentCameraRotated || residentProjectionChanged))
    if (!residentUpdateDue && !drawViewChanged) return

    frustumRef.current.setFromProjectionMatrix(
      projectionViewMatrixRef.current,
      camera.coordinateSystem,
    )
    const profile = getStylizedGrassPerfProbe()
    const streamStartedAt = profile ? performance.now() : 0
    const previousCoverage = coverageRef.current
    const nextResidentCells = residentUpdateDue
      ? createStylizedGrassResidentCells({
          drawEnvelope,
          elevation,
          frustum: frustumRef.current,
          grid: streamGrid,
          interaction,
          previousCells: previousCoverage.residentCells,
        }).cells
      : previousCoverage.residentCells
    const changedAtMs = performance.now()
    const hadArrivalBaseline = arrivalState.initialized
    const drawMembershipChanged = reconcileStylizedGrassExactDrawMembership({
      cells: nextResidentCells,
      changedAtMs,
      drawEnvelope,
      elevation,
      frustum: frustumRef.current,
      membership: exactDrawMembershipRef.current,
    })
    const nextCoverage = reconcileStylizedGrassCellCoverage(previousCoverage, nextResidentCells)
    if (nextCoverage !== previousCoverage) {
      reconcileStylizedGrassArrivalState(arrivalState, nextResidentCells, changedAtMs)
    }
    if (drawMembershipChanged && hadArrivalBaseline) {
      markStylizedGrassDrawArrivals(
        arrivalState,
        exactDrawMembershipRef.current.addedKeys,
        changedAtMs,
      )
    }
    if (profile) {
      recordStylizedGrassPerfSample(profile, {
        centerX: currentCameraPositionRef.current.x,
        centerZ: currentCameraPositionRef.current.z,
        count: nextResidentCells.length,
        durationMs: performance.now() - streamStartedAt,
        kind: 'stream',
      })
    }
    if (residentUpdateDue) {
      initializedRef.current = true
      lastResidentCameraPositionRef.current.copy(currentCameraPositionRef.current)
      lastResidentCameraQuaternionRef.current.copy(currentCameraQuaternionRef.current)
      lastResidentProjectionMatrixRef.current.copy(camera.projectionMatrix)
      lastInteractionCellRef.current = interactionCell
      lastCoverageSignatureRef.current = coverageSignature
      lastResidentUpdateTimeRef.current = clock.elapsedTime
    }
    lastDrawProjectionViewMatrixRef.current.copy(projectionViewMatrixRef.current)
    if (nextCoverage === previousCoverage) return

    if (nextCoverage.residentRevision !== previousCoverage.residentRevision) {
      const streamChanges = summarizeStylizedGrassStreamChanges({
        nextCells: nextResidentCells,
        previousCells: previousCoverage.residentCells,
      })
      changesRef.current = {
        added: streamChanges.added,
        removed: streamChanges.removed,
        revision: changesRef.current.revision + 1,
      }
      if (stylizedGrassRuntimeProbeIsEnabled()) {
        const nextExactDrawCellKeys = exactDrawMembershipRef.current.exact
        const visibleAdded = streamChanges.added
          .filter((cell) => nextExactDrawCellKeys.has(cell.key))
          .map(stylizedGrassStreamCellKey)
        const visibleRemoved = streamChanges.removed
          .filter((cell) =>
            stylizedGrassStreamCellIntersectsFrustum(
              cell,
              frustumRef.current,
              elevation,
              drawEnvelope,
            ),
          )
          .map(stylizedGrassStreamCellKey)
        recordStylizedGrassStreamRuntimeEvent({
          addedCells: streamChanges.added.length,
          cameraPosition: currentCameraPositionRef.current
            .toArray()
            .map((value) => Math.round(value * 1000) / 1000),
          cameraQuaternion: currentCameraQuaternionRef.current
            .toArray()
            .map((value) => Math.round(value * 10_000) / 10_000),
          event: 'coverage-change',
          lateVisibleAddedCellKeys: visibleAdded.slice(0, 24),
          lateVisibleAddedCells: visibleAdded.length,
          nextCells: nextResidentCells.length,
          previousCells: previousCoverage.residentCells.length,
          removedCells: streamChanges.removed.length,
          visibleRemovedCellKeys: visibleRemoved.slice(0, 24),
          visibleRemovedCells: visibleRemoved.length,
        })
      }
    }
    coverageRef.current = nextCoverage
    setCoverage(nextCoverage)
  })

  return { changesRef, coverage, exactDrawMembershipRef }
}

export function createInitialStylizedGrassCellCoverage(): StylizedGrassCellCoverage {
  return {
    residentCells: [],
    residentRevision: 0,
  }
}

export function createInitialStylizedGrassExactDrawMembership(): StylizedGrassExactDrawMembership {
  return {
    addedKeys: [],
    changedAtMs: 0,
    exact: new Set(),
    removedKeys: [],
    revision: 0,
    scanRevision: 0,
    seenAtByKey: new Map(),
    stagedAddedKeys: [],
    stagedRemovedKeys: [],
  }
}

export function reconcileStylizedGrassCellCoverage(
  current: StylizedGrassCellCoverage,
  residentCells: readonly StylizedGrassStreamCell[],
): StylizedGrassCellCoverage {
  const residentChanged = !sameStylizedGrassStreamCells(current.residentCells, residentCells)
  if (!residentChanged) return current
  return {
    residentCells,
    residentRevision: current.residentRevision + 1,
  }
}

export function resolveStylizedGrassDrawEnvelope({
  bladeHeight,
  flutter,
  horizontalRadius,
  scale,
  turbulence,
  windStrength,
}: {
  bladeHeight: number
  flutter: number
  horizontalRadius: number
  scale: number
  turbulence: number
  windStrength: number
}): StylizedGrassDrawEnvelope {
  const gustAmplitude = 1 + Math.abs(turbulence) * 0.42 + Math.abs(flutter) * 0.35
  const windDisplacement = gustAmplitude * Math.max(0, windStrength) * 0.18
  const deformationDisplacement =
    (STYLIZED_SCENE_INTERACTION_MAX_BEND + windDisplacement) *
    STYLIZED_SCENE_GRASS_HEIGHT_SCALE *
    Math.max(0.001, scale)
  return {
    horizontalMargin:
      Math.max(0, horizontalRadius) * STYLIZED_SCENE_GRASS_EDGE_FILL_ROOT_WIDTH_MULTIPLIER +
      deformationDisplacement +
      STYLIZED_SCENE_GRASS_EDGE_SAFETY_METERS,
    maxHeight: Math.max(0.1, bladeHeight) * 1.8 * 1.12 + 0.1,
    minHeight: -0.1,
  }
}

export function createStylizedGrassResidentCells({
  drawEnvelope,
  elevation,
  frustum,
  grid,
  interaction,
  previousCells,
}: {
  drawEnvelope: StylizedGrassDrawEnvelope
  elevation: number
  frustum: Frustum
  grid: StylizedGrassStreamGrid
  interaction: StylizedGrassInteraction | null | undefined
  previousCells: readonly StylizedGrassStreamCell[]
}): StylizedGrassResidentCellScan {
  const cellSize = STYLIZED_SCENE_STREAM_CELL_SIZE
  const interactionRadius = interaction
    ? Math.max(
        STYLIZED_SCENE_STREAM_INTERACTION_RADIUS_METERS,
        interaction.radius + STYLIZED_SCENE_STREAM_PREFETCH_MARGIN_METERS,
      )
    : 0
  const interactionRadiusSquared = interactionRadius * interactionRadius
  const previousCellIndices = new Set(previousCells.map((cell) => cell.index))
  const cells: StylizedGrassStreamCell[] = []
  const minBladeY = elevation + drawEnvelope.minHeight
  const maxBladeY = elevation + drawEnvelope.maxHeight

  for (const chunk of grid.chunks) {
    const chunkNearInteraction = interaction
      ? squaredDistanceToStylizedGrassBounds(interaction.x, interaction.z, chunk) <=
        interactionRadiusSquared
      : false
    if (
      !chunkNearInteraction &&
      !stylizedGrassFrustumIntersectsBounds(
        frustum,
        chunk.minX - STYLIZED_SCENE_STREAM_RETENTION_MARGIN_METERS - drawEnvelope.horizontalMargin,
        minBladeY,
        chunk.minZ - STYLIZED_SCENE_STREAM_RETENTION_MARGIN_METERS - drawEnvelope.horizontalMargin,
        chunk.maxX + STYLIZED_SCENE_STREAM_RETENTION_MARGIN_METERS + drawEnvelope.horizontalMargin,
        maxBladeY,
        chunk.maxZ + STYLIZED_SCENE_STREAM_RETENTION_MARGIN_METERS + drawEnvelope.horizontalMargin,
      )
    ) {
      continue
    }

    for (const cellIndex of chunk.cellIndices) {
      const cell = grid.cells[cellIndex]
      if (!cell) continue
      const { cellX, cellZ } = cell
      const minX = cellX * cellSize
      const minZ = cellZ * cellSize
      const interactionDeltaX = interaction ? minX + cellSize * 0.5 - interaction.x : 0
      const interactionDeltaZ = interaction ? minZ + cellSize * 0.5 - interaction.z : 0
      const nearInteraction =
        interaction !== null &&
        interaction !== undefined &&
        interactionDeltaX * interactionDeltaX + interactionDeltaZ * interactionDeltaZ <=
          interactionRadiusSquared
      const wasVisible = previousCellIndices.has(cell.index)
      const margin = wasVisible
        ? STYLIZED_SCENE_STREAM_RETENTION_MARGIN_METERS
        : STYLIZED_SCENE_STREAM_PREFETCH_MARGIN_METERS
      if (
        !nearInteraction &&
        !stylizedGrassFrustumIntersectsBounds(
          frustum,
          minX - margin - drawEnvelope.horizontalMargin,
          minBladeY,
          minZ - margin - drawEnvelope.horizontalMargin,
          minX + cellSize + margin + drawEnvelope.horizontalMargin,
          maxBladeY,
          minZ + cellSize + margin + drawEnvelope.horizontalMargin,
        )
      ) {
        continue
      }
      cells.push(cell)
    }
  }

  return { cells }
}

export function createStylizedGrassExactDrawCellKeys({
  cells,
  drawEnvelope,
  elevation,
  frustum,
}: {
  cells: readonly StylizedGrassStreamCell[]
  drawEnvelope: StylizedGrassDrawEnvelope
  elevation: number
  frustum: Frustum
}) {
  const membership = createInitialStylizedGrassExactDrawMembership()
  reconcileStylizedGrassExactDrawMembership({
    cells,
    changedAtMs: 0,
    drawEnvelope,
    elevation,
    frustum,
    membership,
  })
  return new Set(membership.exact)
}

export function reconcileStylizedGrassExactDrawMembership({
  cells,
  changedAtMs,
  drawEnvelope,
  elevation,
  frustum,
  membership,
}: {
  cells: readonly StylizedGrassStreamCell[]
  changedAtMs: number
  drawEnvelope: StylizedGrassDrawEnvelope
  elevation: number
  frustum: Frustum
  membership: StylizedGrassExactDrawMembership
}) {
  membership.stagedAddedKeys.length = 0
  membership.stagedRemovedKeys.length = 0
  const scanRevision = membership.scanRevision + 1
  membership.scanRevision = scanRevision

  for (const cell of cells) {
    const guardMeters = membership.exact.has(cell.key)
      ? STYLIZED_SCENE_STREAM_DRAW_EXIT_GUARD_METERS
      : STYLIZED_SCENE_STREAM_DRAW_ENTER_GUARD_METERS
    if (
      !stylizedGrassStreamCellIntersectsFrustum(cell, frustum, elevation, drawEnvelope, guardMeters)
    ) {
      continue
    }
    membership.seenAtByKey.set(cell.key, scanRevision)
    if (membership.exact.has(cell.key)) continue
    membership.exact.add(cell.key)
    membership.stagedAddedKeys.push(cell.key)
  }
  for (const key of membership.exact) {
    if (membership.seenAtByKey.get(key) === scanRevision) continue
    membership.exact.delete(key)
    membership.seenAtByKey.delete(key)
    membership.stagedRemovedKeys.push(key)
  }

  if (membership.stagedAddedKeys.length === 0 && membership.stagedRemovedKeys.length === 0) {
    return false
  }
  membership.addedKeys.length = 0
  membership.addedKeys.push(...membership.stagedAddedKeys)
  membership.removedKeys.length = 0
  membership.removedKeys.push(...membership.stagedRemovedKeys)
  membership.changedAtMs = changedAtMs
  membership.revision += 1
  return true
}

export function resolveStylizedGrassDrawMembershipApplyDecision({
  appliedRevision,
  forceCanonical,
  membership,
  residentInstancesByCell,
}: {
  appliedRevision: number
  forceCanonical: boolean
  membership: Pick<StylizedGrassExactDrawMembership, 'addedKeys' | 'exact' | 'revision'>
  residentInstancesByCell: ReadonlyMap<string, readonly StylizedGrassInstance[]>
}): StylizedGrassDrawMembershipApplyDecision {
  if (!forceCanonical && appliedRevision === membership.revision) return 'none'
  const canonical = forceCanonical || membership.revision !== appliedRevision + 1
  const requiredKeys = canonical ? membership.exact : membership.addedKeys
  for (const key of requiredKeys) {
    if (!residentInstancesByCell.has(key)) return 'wait'
  }
  return canonical ? 'canonical' : 'delta'
}

export function createStylizedGrassStreamGrid(
  surfaceBounds: StylizedGrassBounds,
): StylizedGrassStreamGrid {
  const cellSize = STYLIZED_SCENE_STREAM_CELL_SIZE
  const minCellX = Math.floor(surfaceBounds.minX / cellSize)
  const maxCellX = Math.floor(surfaceBounds.maxX / cellSize)
  const minCellZ = Math.floor(surfaceBounds.minZ / cellSize)
  const maxCellZ = Math.floor(surfaceBounds.maxZ / cellSize)
  const cellCountX = maxCellX - minCellX + 1
  const cells: StylizedGrassStreamCell[] = []

  for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      const index = cells.length
      cells.push({ cellX, cellZ, index, key: `${cellX}:${cellZ}` })
    }
  }

  const chunks: StylizedGrassStreamChunk[] = []
  for (
    let chunkMinCellZ = minCellZ;
    chunkMinCellZ <= maxCellZ;
    chunkMinCellZ += STYLIZED_SCENE_STREAM_SCAN_CHUNK_CELLS
  ) {
    const chunkMaxCellZ = Math.min(
      maxCellZ,
      chunkMinCellZ + STYLIZED_SCENE_STREAM_SCAN_CHUNK_CELLS - 1,
    )
    for (
      let chunkMinCellX = minCellX;
      chunkMinCellX <= maxCellX;
      chunkMinCellX += STYLIZED_SCENE_STREAM_SCAN_CHUNK_CELLS
    ) {
      const chunkMaxCellX = Math.min(
        maxCellX,
        chunkMinCellX + STYLIZED_SCENE_STREAM_SCAN_CHUNK_CELLS - 1,
      )
      const cellIndices: number[] = []
      for (let cellZ = chunkMinCellZ; cellZ <= chunkMaxCellZ; cellZ += 1) {
        for (let cellX = chunkMinCellX; cellX <= chunkMaxCellX; cellX += 1) {
          cellIndices.push((cellZ - minCellZ) * cellCountX + cellX - minCellX)
        }
      }
      chunks.push({
        cellIndices,
        maxX: (chunkMaxCellX + 1) * cellSize,
        maxZ: (chunkMaxCellZ + 1) * cellSize,
        minX: chunkMinCellX * cellSize,
        minZ: chunkMinCellZ * cellSize,
      })
    }
  }

  return { cells, chunks }
}

function squaredDistanceToStylizedGrassBounds(x: number, z: number, bounds: StylizedGrassBounds) {
  const closestX = clamp(x, bounds.minX, bounds.maxX)
  const closestZ = clamp(z, bounds.minZ, bounds.maxZ)
  const deltaX = x - closestX
  const deltaZ = z - closestZ
  return deltaX * deltaX + deltaZ * deltaZ
}

function stylizedGrassFrustumIntersectsBounds(
  frustum: Frustum,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
) {
  const centerX = (minX + maxX) * 0.5
  const centerY = (minY + maxY) * 0.5
  const centerZ = (minZ + maxZ) * 0.5
  const extentX = (maxX - minX) * 0.5
  const extentY = (maxY - minY) * 0.5
  const extentZ = (maxZ - minZ) * 0.5
  for (const plane of frustum.planes) {
    const normal = plane.normal
    const distance = normal.x * centerX + normal.y * centerY + normal.z * centerZ + plane.constant
    const radius =
      Math.abs(normal.x) * extentX + Math.abs(normal.y) * extentY + Math.abs(normal.z) * extentZ
    if (distance + radius < 0) return false
  }
  return true
}

function sameStylizedGrassStreamCells(
  first: readonly StylizedGrassStreamCell[],
  second: readonly StylizedGrassStreamCell[],
) {
  if (first.length !== second.length) return false
  for (let index = 0; index < first.length; index += 1) {
    const firstCell = first[index]
    const secondCell = second[index]
    if (firstCell?.cellX !== secondCell?.cellX || firstCell?.cellZ !== secondCell?.cellZ) {
      return false
    }
  }
  return true
}

function summarizeStylizedGrassStreamChanges({
  nextCells,
  previousCells,
}: {
  nextCells: readonly StylizedGrassStreamCell[]
  previousCells: readonly StylizedGrassStreamCell[]
}) {
  const previousIndices = new Set(previousCells.map((cell) => cell.index))
  const nextIndices = new Set(nextCells.map((cell) => cell.index))
  const added = nextCells.filter((cell) => !previousIndices.has(cell.index))
  const removed = previousCells.filter((cell) => !nextIndices.has(cell.index))
  return { added, removed }
}

export function stylizedGrassStreamCellIntersectsFrustum(
  cell: StylizedGrassStreamCell,
  frustum: Frustum,
  elevation: number,
  drawEnvelope: StylizedGrassDrawEnvelope,
  guardMeters = 0,
) {
  const minX = cell.cellX * STYLIZED_SCENE_STREAM_CELL_SIZE
  const minZ = cell.cellZ * STYLIZED_SCENE_STREAM_CELL_SIZE
  const guard = Math.max(0, guardMeters)
  return stylizedGrassFrustumIntersectsBounds(
    frustum,
    minX - drawEnvelope.horizontalMargin - guard,
    elevation + drawEnvelope.minHeight - guard,
    minZ - drawEnvelope.horizontalMargin - guard,
    minX + STYLIZED_SCENE_STREAM_CELL_SIZE + drawEnvelope.horizontalMargin + guard,
    elevation + drawEnvelope.maxHeight + guard,
    minZ + STYLIZED_SCENE_STREAM_CELL_SIZE + drawEnvelope.horizontalMargin + guard,
  )
}

function stylizedGrassStreamCellKey(cell: StylizedGrassStreamCell) {
  return cell.key
}

function stylizedGrassMatrixChanged(first: Matrix4, second: Matrix4) {
  for (let index = 0; index < first.elements.length; index += 1) {
    if (Math.abs((first.elements[index] ?? 0) - (second.elements[index] ?? 0)) > 0.00001) {
      return true
    }
  }
  return false
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
    greenTint: finiteNumber(tuning.greenTint, STYLIZED_SCENE_DEFAULT_TUNING.greenTint),
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

export function createStylizedGrassArrivalState(): StylizedGrassArrivalState {
  return {
    initialized: false,
    residentCellKeys: new Set(),
    startedAtByCell: new Map(),
  }
}

export function reconcileStylizedGrassArrivalState(
  state: StylizedGrassArrivalState,
  residentCells: readonly StylizedGrassStreamCell[],
  changedAtMs: number,
) {
  const nextKeys = new Set(residentCells.map((cell) => cell.key))
  if (!state.initialized) {
    if (nextKeys.size === 0) return
    state.initialized = true
    state.residentCellKeys = nextKeys
    return
  }

  for (const key of state.residentCellKeys) {
    if (!nextKeys.has(key)) state.startedAtByCell.delete(key)
  }
  for (const key of nextKeys) {
    if (!state.residentCellKeys.has(key)) state.startedAtByCell.set(key, changedAtMs)
  }
  state.residentCellKeys = nextKeys
}

export function markStylizedGrassDrawArrivals(
  state: StylizedGrassArrivalState,
  addedCellKeys: readonly string[],
  changedAtMs: number,
) {
  if (!state.initialized) return
  for (const key of addedCellKeys) {
    if (state.residentCellKeys.has(key)) state.startedAtByCell.set(key, changedAtMs)
  }
}

export function resolveStylizedGrassArrivalFade(
  instance: StylizedGrassInstance,
  state: StylizedGrassArrivalState,
  nowMs: number,
) {
  const startedAt = state.startedAtByCell.get(stylizedGrassInstanceCellKey(instance.id))
  if (startedAt === undefined) return 1
  const durationVariation = 0.72 + ((instance.seed * 997) % 1000) / 1_800
  const durationMs = STYLIZED_SCENE_STREAM_ARRIVAL_FADE_SECONDS * 1000 * durationVariation
  return clamp01((nowMs - startedAt) / Math.max(1, durationMs))
}

export function selectStylizedGrassDrawInstances({
  capacity,
  density,
  exactDrawCellKeys,
  residentCells,
  residentInstancesByCell,
}: {
  capacity: number
  density: number
  exactDrawCellKeys: ReadonlySet<string>
  residentCells: readonly StylizedGrassStreamCell[]
  residentInstancesByCell: ReadonlyMap<string, readonly StylizedGrassInstance[]>
}) {
  const limit = Math.max(0, Math.floor(capacity))
  const instances: StylizedGrassInstance[] = []
  let eligibleTotal = 0
  if (density <= 0 || exactDrawCellKeys.size === 0) {
    return { eligibleTotal, instances, saturated: false }
  }
  for (const cell of residentCells) {
    if (!exactDrawCellKeys.has(cell.key)) continue
    const cellInstances = residentInstancesByCell.get(cell.key) ?? []
    for (const instance of cellInstances) {
      if (!stylizedGrassInstanceIsEligible(instance, density)) continue
      eligibleTotal += 1
      if (instances.length < limit) instances.push(instance)
    }
  }
  return { eligibleTotal, instances, saturated: eligibleTotal > limit }
}

export function createStylizedGrassDenseDrawState(): StylizedGrassDenseDrawState {
  return { eligibleTotal: 0, instances: [], saturated: false, slotById: new Map() }
}

function stylizedGrassInstanceIsEligible(instance: StylizedGrassInstance, density: number) {
  return density >= 1 || instance.seed / 10_000 <= density
}

export function reconcileStylizedGrassDenseDrawInstances({
  capacity,
  nextInstances,
  eligibleTotal = nextInstances.length,
  state,
}: {
  capacity: number
  eligibleTotal?: number
  nextInstances: readonly StylizedGrassInstance[]
  state: StylizedGrassDenseDrawState
}) {
  const desiredInstances = nextInstances.slice(0, Math.max(0, Math.floor(capacity)))
  const desiredIds = new Set(desiredInstances.map((instance) => instance.id))
  const changedSlots = new Set<number>()
  const removedIds: string[] = []

  for (let index = state.instances.length - 1; index >= 0; index -= 1) {
    const instance = state.instances[index]
    if (!instance || desiredIds.has(instance.id)) continue
    const lastIndex = state.instances.length - 1
    const lastInstance = state.instances[lastIndex]
    state.slotById.delete(instance.id)
    removedIds.push(instance.id)
    if (index !== lastIndex && lastInstance) {
      state.instances[index] = lastInstance
      state.slotById.set(lastInstance.id, index)
      changedSlots.add(index)
    }
    state.instances.pop()
  }

  const addedInstances: StylizedGrassInstance[] = []
  for (const instance of desiredInstances) {
    const existingSlot = state.slotById.get(instance.id)
    if (existingSlot !== undefined) {
      const previousInstance = state.instances[existingSlot]
      if (!previousInstance || !sameStylizedGrassInstancePayload(previousInstance, instance)) {
        state.instances[existingSlot] = instance
        changedSlots.add(existingSlot)
      }
      continue
    }
    const slot = state.instances.length
    state.instances.push(instance)
    state.slotById.set(instance.id, slot)
    changedSlots.add(slot)
    addedInstances.push(instance)
  }
  state.eligibleTotal = Math.max(desiredInstances.length, Math.floor(eligibleTotal))
  state.saturated = state.eligibleTotal > Math.max(0, Math.floor(capacity))

  return {
    addedInstances,
    changedSlots: [...changedSlots]
      .filter((slot) => slot < state.instances.length)
      .sort((first, second) => first - second),
    instances: state.instances,
    removedIds,
  }
}

function sameStylizedGrassInstancePayload(
  first: StylizedGrassInstance,
  second: StylizedGrassInstance,
) {
  return (
    first.id === second.id &&
    first.heightFactor === second.heightFactor &&
    first.macroVariation === second.macroVariation &&
    first.patchVariation === second.patchVariation &&
    first.scaleFactor === second.scaleFactor &&
    first.seed === second.seed &&
    first.x === second.x &&
    first.yaw === second.yaw &&
    first.z === second.z
  )
}

export function reconcileStylizedGrassDenseDrawCellDelta({
  addedCellKeys,
  capacity,
  density,
  removedCellKeys,
  residentInstancesByCell,
  state,
  streamFadeById,
}: {
  addedCellKeys: readonly string[]
  capacity: number
  density: number
  removedCellKeys: readonly string[]
  residentInstancesByCell: ReadonlyMap<string, readonly StylizedGrassInstance[]>
  state: StylizedGrassDenseDrawState
  streamFadeById?: Map<string, number>
}) {
  const fallback = () => ({
    addedInstances: [] as StylizedGrassInstance[],
    changedSlots: [] as number[],
    eligibleTotal: state.eligibleTotal,
    instances: state.instances,
    removedIds: [] as string[],
    requiresFullRebuild: true,
    saturated: state.saturated,
  })
  if (state.saturated || state.instances.length !== state.eligibleTotal) return fallback()

  let removedEligibleTotal = 0
  for (const key of removedCellKeys) {
    const cellInstances = residentInstancesByCell.get(key)
    if (!cellInstances) return fallback()
    for (const instance of cellInstances) {
      if (!stylizedGrassInstanceIsEligible(instance, density)) continue
      if (!state.slotById.has(instance.id)) return fallback()
      removedEligibleTotal += 1
    }
  }

  let addedEligibleTotal = 0
  for (const key of addedCellKeys) {
    const cellInstances = residentInstancesByCell.get(key)
    if (!cellInstances) return fallback()
    for (const instance of cellInstances) {
      if (!stylizedGrassInstanceIsEligible(instance, density)) continue
      if (state.slotById.has(instance.id)) return fallback()
      addedEligibleTotal += 1
    }
  }

  const limit = Math.max(0, Math.floor(capacity))
  const eligibleTotal = state.eligibleTotal - removedEligibleTotal + addedEligibleTotal
  if (eligibleTotal < 0 || eligibleTotal > limit) return fallback()

  const changedSlots = new Set<number>()
  const removedIds: string[] = []
  for (const key of removedCellKeys) {
    for (const instance of residentInstancesByCell.get(key)!) {
      if (!stylizedGrassInstanceIsEligible(instance, density)) continue
      const slot = state.slotById.get(instance.id)
      if (slot === undefined) return fallback()
      const lastSlot = state.instances.length - 1
      const lastInstance = state.instances[lastSlot]
      state.slotById.delete(instance.id)
      streamFadeById?.delete(instance.id)
      removedIds.push(instance.id)
      if (slot !== lastSlot && lastInstance) {
        state.instances[slot] = lastInstance
        state.slotById.set(lastInstance.id, slot)
        changedSlots.add(slot)
      }
      state.instances.pop()
    }
  }

  const addedInstances: StylizedGrassInstance[] = []
  for (const key of addedCellKeys) {
    for (const instance of residentInstancesByCell.get(key)!) {
      if (!stylizedGrassInstanceIsEligible(instance, density)) continue
      const slot = state.instances.length
      state.instances.push(instance)
      state.slotById.set(instance.id, slot)
      changedSlots.add(slot)
      addedInstances.push(instance)
    }
  }

  state.eligibleTotal = eligibleTotal
  state.saturated = false
  return {
    addedInstances,
    changedSlots: [...changedSlots]
      .filter((slot) => slot < state.instances.length)
      .sort((first, second) => first - second),
    eligibleTotal,
    instances: state.instances,
    removedIds,
    requiresFullRebuild: false,
    saturated: false,
  }
}

function updateStylizedGrassResidentInstances({
  cacheRevision,
  cellCache,
  cacheStats,
  grassBlockers,
  pathMaskData,
  roadGrid,
  surfacePolygon,
  state,
  tuning,
  residentCellChanges,
  residentCells,
}: {
  cacheRevision: number
  cellCache: StylizedGrassCellCache
  cacheStats?: StylizedGrassCacheStats
  grassBlockers: readonly StylizedGrassCompiledBlocker[]
  pathMaskData: ImageData | null
  roadGrid: StylizedGrassRoadGrid | null
  surfacePolygon: StylizedGrassCompiledPolygon
  state: StylizedGrassResidentInstanceState
  tuning: StylizedSceneResolvedGrassTuning
  residentCellChanges: StylizedGrassResidentCellChanges
  residentCells: readonly StylizedGrassStreamCell[]
}): number {
  const profile = getStylizedGrassPerfProbe()
  const startedAt = profile ? performance.now() : 0
  if (cacheStats) cacheStats.rebuilds += 1
  const finish = () => {
    if (profile) {
      recordStylizedGrassPerfSample(profile, {
        count: state.instanceCount,
        durationMs: performance.now() - startedAt,
        kind: 'build',
      })
    }
    return state.contentRevision
  }
  const baseDensity =
    Math.max(0, finiteNumber(tuning.density, 0)) * STYLIZED_SCENE_GRASS_FIELD_DENSITY_SCALE
  const coverageChanged = state.coverageRevision !== residentCellChanges.revision
  const rebuildAll =
    state.cacheRevision !== cacheRevision ||
    (coverageChanged && state.coverageRevision + 1 !== residentCellChanges.revision)
  let changed = false
  if (rebuildAll || baseDensity === 0) {
    state.cellInstancesByKey.clear()
    state.cacheRevision = cacheRevision
    state.coverageRevision = residentCellChanges.revision
    state.instanceCount = 0
    changed = true
  }
  if (baseDensity === 0) {
    if (changed) state.contentRevision += 1
    return finish()
  }

  const cellSize = STYLIZED_SCENE_STREAM_CELL_SIZE
  const densityPerSquareMeter = baseDensity / (Math.PI * STYLIZED_SCENE_BASE_STREAM_RADIUS ** 2)
  const cellArea = cellSize * cellSize
  const slotsPerCell = Math.max(
    1,
    Math.ceil(
      densityPerSquareMeter * cellArea * 1.35 * STYLIZED_SCENE_GRASS_EDGE_FILL_DENSITY_MULTIPLIER,
    ),
  )
  const candidateAcceptance = clamp01((densityPerSquareMeter * cellArea) / slotsPerCell)
  const removedCells = rebuildAll ? [] : coverageChanged ? residentCellChanges.removed : []
  const addedCells = rebuildAll ? residentCells : coverageChanged ? residentCellChanges.added : []

  for (const cell of removedCells) {
    const key = stylizedGrassStreamCellKey(cell)
    const cellInstances = state.cellInstancesByKey.get(key)
    if (!cellInstances) continue
    state.cellInstancesByKey.delete(key)
    state.instanceCount -= cellInstances.length
    changed = true
  }

  for (const cell of addedCells) {
    const key = stylizedGrassStreamCellKey(cell)
    if (state.cellInstancesByKey.has(key)) continue
    const cellInstances = getStylizedGrassCellInstances(cellCache, {
      cacheStats,
      candidateAcceptance,
      cellSize,
      cellX: cell.cellX,
      cellZ: cell.cellZ,
      grassBlockers,
      pathMaskData,
      roadGrid,
      slotsPerCell,
      surfacePolygon,
      tuning,
    })
    state.cellInstancesByKey.set(key, cellInstances)
    state.instanceCount += cellInstances.length
    changed = true
  }
  if (coverageChanged) state.coverageRevision = residentCellChanges.revision
  if (changed) state.contentRevision += 1
  return finish()
}

function getStylizedGrassCellInstances(
  cellCache: StylizedGrassCellCache,
  options: {
    cacheStats?: StylizedGrassCacheStats
    candidateAcceptance: number
    cellSize: number
    cellX: number
    cellZ: number
    grassBlockers: readonly StylizedGrassCompiledBlocker[]
    pathMaskData: ImageData | null
    roadGrid: StylizedGrassRoadGrid | null
    slotsPerCell: number
    surfacePolygon: StylizedGrassCompiledPolygon
    tuning: StylizedSceneResolvedGrassTuning
  },
) {
  const key = `${options.cellX}:${options.cellZ}`
  const cached = cellCache.get(key)
  if (cached) {
    if (options.cacheStats) options.cacheStats.hits += 1
    cellCache.delete(key)
    cellCache.set(key, cached)
    return cached
  }
  if (options.cacheStats) options.cacheStats.misses += 1

  const instances = createStylizedGrassCellInstances(options)
  cellCache.set(key, instances)
  trimStylizedGrassCellCache(cellCache)
  return instances
}

function trimStylizedGrassCellCache(cellCache: StylizedGrassCellCache) {
  while (cellCache.size > STYLIZED_SCENE_MAX_GRASS_CACHE_CELLS) {
    const oldestKey = cellCache.keys().next().value
    if (typeof oldestKey !== 'string') return
    cellCache.delete(oldestKey)
  }
}

function invalidateChangedStylizedGrassBlockerCells(
  cellCache: StylizedGrassCellCache,
  previousBlockers: readonly StylizedGrassCompiledBlocker[],
  nextBlockers: readonly StylizedGrassCompiledBlocker[],
) {
  const previousKeys = new Set(previousBlockers.map(stylizedGrassCompiledBlockerKey))
  const nextKeys = new Set(nextBlockers.map(stylizedGrassCompiledBlockerKey))
  for (const blocker of previousBlockers) {
    if (!nextKeys.has(stylizedGrassCompiledBlockerKey(blocker))) {
      invalidateStylizedGrassCellsInBounds(cellCache, blocker.bounds)
    }
  }
  for (const blocker of nextBlockers) {
    if (!previousKeys.has(stylizedGrassCompiledBlockerKey(blocker))) {
      invalidateStylizedGrassCellsInBounds(cellCache, blocker.bounds)
    }
  }
}

function invalidateStylizedGrassCellsInBounds(
  cellCache: StylizedGrassCellCache,
  bounds: StylizedGrassBounds,
) {
  const cellSize = STYLIZED_SCENE_STREAM_CELL_SIZE
  const minCellX = Math.floor(bounds.minX / cellSize)
  const maxCellX = Math.floor(bounds.maxX / cellSize)
  const minCellZ = Math.floor(bounds.minZ / cellSize)
  const maxCellZ = Math.floor(bounds.maxZ / cellSize)
  for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      cellCache.delete(`${cellX}:${cellZ}`)
    }
  }
}

function stylizedGrassCompiledBlockerKey(blocker: StylizedGrassCompiledBlocker) {
  return `${blocker.clearanceMeters.toFixed(3)}:${blocker.points
    .map((point) => `${point.x.toFixed(3)}:${point.z.toFixed(3)}`)
    .join('|')}`
}

function createStylizedGrassCellInstances({
  candidateAcceptance,
  cellSize,
  cellX,
  cellZ,
  grassBlockers,
  pathMaskData,
  roadGrid,
  slotsPerCell,
  surfacePolygon,
  tuning,
}: {
  candidateAcceptance: number
  cellSize: number
  cellX: number
  cellZ: number
  grassBlockers: readonly StylizedGrassCompiledBlocker[]
  pathMaskData: ImageData | null
  roadGrid: StylizedGrassRoadGrid | null
  slotsPerCell: number
  surfacePolygon: StylizedGrassCompiledPolygon
  tuning: StylizedSceneResolvedGrassTuning
}) {
  const instances: StylizedGrassInstance[] = []

  for (let slot = 0; slot < slotsPerCell; slot += 1) {
    const densitySample = stableGrassHash(cellX, cellZ, slot, 0)
    const x = (cellX + stableGrassHash(cellX, cellZ, slot, 11.17)) * cellSize
    const z = (cellZ + stableGrassHash(cellX, cellZ, slot, 23.41)) * cellSize
    const edgeJitter = stableGrassHash(cellX, cellZ, slot, 37.73)
    const scaleFactor = stylizedGrassRoadScaleFactor(x, z, roadGrid, edgeJitter)
    if (scaleFactor <= 0) continue
    const densityMultiplier =
      scaleFactor < 1 ? STYLIZED_SCENE_GRASS_EDGE_FILL_DENSITY_MULTIPLIER : 1
    if (densitySample > clamp01(candidateAcceptance * densityMultiplier)) continue
    if (surfacePolygon.ring.length >= 3 && !pointInPolygon({ x, z }, surfacePolygon)) {
      continue
    }
    if (isPointInStylizedGrassBlocker({ x, z }, grassBlockers)) continue
    if (
      surfacePolygon.ring.length < 3 &&
      isPointOnReferencePathMask(x, z, pathMaskData, roadGrid, edgeJitter)
    ) {
      continue
    }

    const seed = stableGrassHash(cellX, cellZ, slot, 71.09) * 10_000
    instances.push({
      heightFactor: stylizedGrassHeightFactor(x, z, tuning),
      id: `${cellX}:${cellZ}:${slot}`,
      macroVariation: stylizedGrassNoise(
        (x + 137) * tuning.macroScale,
        (z + 91) * tuning.macroScale,
      ),
      patchVariation: stylizedGrassNoise(
        (x + 17) * tuning.colorPatchScale,
        (z - 8) * tuning.colorPatchScale,
      ),
      scaleFactor,
      seed,
      x,
      yaw: stableGrassHash(cellX, cellZ, slot, 53.29) * Math.PI * 2,
      z,
    })
  }

  return instances
}

function applyStylizedGrassStaticMatrices(
  mesh: InstancedMesh,
  instances: readonly StylizedGrassInstance[],
  slots: readonly number[],
  tuning: StylizedSceneResolvedGrassTuning,
  dummy: Object3D,
) {
  if (slots.length === 0) return
  const profile = getStylizedGrassPerfProbe()
  const startedAt = profile ? performance.now() : 0
  const scale = Math.max(0.001, finiteNumber(tuning.scale, STYLIZED_SCENE_GRASS_SCALE))
  for (const index of slots) {
    const instance = instances[index]!
    const instanceScale =
      scale * clamp(instance.scaleFactor, STYLIZED_SCENE_GRASS_EDGE_FILL_SCALE, 1)
    dummy.position.set(instance.x, 0, instance.z)
    dummy.rotation.set(0, instance.yaw, 0)
    dummy.scale.set(
      instanceScale,
      instanceScale * STYLIZED_SCENE_GRASS_HEIGHT_SCALE * instance.heightFactor,
      instanceScale,
    )
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
  }
  markStylizedGrassInstanceSlotsUpdated(mesh.instanceMatrix, slots)
  if (profile) {
    recordStylizedGrassPerfSample(profile, {
      count: slots.length,
      durationMs: performance.now() - startedAt,
      kind: 'matrix',
      moving: false,
    })
  }
}

function initializeStylizedGrassIdentityMatrices(mesh: InstancedMesh) {
  const matrixArray = mesh.instanceMatrix.array
  matrixArray.fill(0)
  for (let offset = 0; offset < matrixArray.length; offset += 16) {
    matrixArray[offset] = 1
    matrixArray[offset + 5] = 1
    matrixArray[offset + 10] = 1
    matrixArray[offset + 15] = 1
  }
  mesh.instanceMatrix.clearUpdateRanges()
  mesh.instanceMatrix.needsUpdate = true
}

function applyStylizedGrassFadeAttributes(
  geometry: BufferGeometry,
  instances: readonly StylizedGrassInstance[],
  fadeZones: readonly StylizedGrassFadeZone[] = [],
  forceNoZoneUpdate = false,
  fadeStateById?: Map<string, StylizedGrassFadeSlotState>,
) {
  const fade = geometry.getAttribute('aFade') as InstancedBufferAttribute | undefined
  if (!fade) return EMPTY_STYLIZED_GRASS_FADE_SUMMARY

  const hasFadeZones = fadeZones.length > 0
  fadeStateById?.clear()
  if (!hasFadeZones && !forceNoZoneUpdate) return EMPTY_STYLIZED_GRASS_FADE_SUMMARY

  const fadeState = { heightVisibility: 1, insideHiddenZone: false, opacity: 1 }
  let blockedFullCount = 0
  let blockedInstanceCount = 0
  let blockedVisibleCount = 0
  let fadeMin = instances.length > 0 ? Number.POSITIVE_INFINITY : 1
  let fadeMax = instances.length > 0 ? Number.NEGATIVE_INFINITY : 1
  for (let index = 0; index < instances.length; index += 1) {
    const instance = instances[index]!
    resolveStylizedGrassFadeState(instance, fadeZones, fadeState)
    const fadeValue = hasFadeZones ? Math.min(fadeState.heightVisibility, fadeState.opacity) : 1
    fade.setX(index, fadeValue)
    if (hasFadeZones) {
      fadeStateById?.set(instance.id, {
        insideHiddenZone: fadeState.insideHiddenZone,
        value: fadeValue,
      })
    }
    fadeMin = Math.min(fadeMin, fadeValue)
    fadeMax = Math.max(fadeMax, fadeValue)
    if (hasFadeZones && fadeState.insideHiddenZone) {
      blockedInstanceCount += 1
      if (fadeValue > 0.95) blockedFullCount += 1
      if (fadeValue > 0.05) blockedVisibleCount += 1
    }
  }
  markStylizedGrassInstanceSlotsUpdated(
    fade,
    Array.from({ length: instances.length }, (_, index) => index),
  )
  return {
    blockedFullCount,
    blockedInstanceCount,
    blockedVisibleCount,
    fadeMax: instances.length > 0 ? fadeMax : 1,
    fadeMin: instances.length > 0 ? fadeMin : 1,
  }
}

export function resolveStylizedGrassFadeUploadSlots({
  changedSlots,
  fadeZonesActive,
  fadeZonesChanged,
  instanceCount,
}: {
  changedSlots: readonly number[]
  fadeZonesActive: boolean
  fadeZonesChanged: boolean
  instanceCount: number
}) {
  if (instanceCount <= 0) return []
  if (fadeZonesChanged) return Array.from({ length: instanceCount }, (_, index) => index)
  if (!fadeZonesActive) return []
  return changedSlots.filter((slot) => slot >= 0 && slot < instanceCount)
}

export function resolveStylizedGrassStructuralUploadSlots({
  changedSlots,
  instanceCount,
  resourceReallocated,
}: {
  changedSlots: readonly number[]
  instanceCount: number
  resourceReallocated: boolean
}) {
  if (instanceCount <= 0) return []
  return resourceReallocated
    ? Array.from({ length: instanceCount }, (_, index) => index)
    : changedSlots
}

function applyStylizedGrassFadeAttributeSlots(
  geometry: BufferGeometry,
  instances: readonly StylizedGrassInstance[],
  fadeZones: readonly StylizedGrassFadeZone[],
  slots: readonly number[],
  fadeStateById: Map<string, StylizedGrassFadeSlotState>,
) {
  if (fadeZones.length === 0 || slots.length === 0) return
  const fade = geometry.getAttribute('aFade') as InstancedBufferAttribute | undefined
  if (!fade) return
  const fadeState = { heightVisibility: 1, insideHiddenZone: false, opacity: 1 }
  for (const slot of slots) {
    const instance = instances[slot]
    if (!instance) continue
    resolveStylizedGrassFadeState(instance, fadeZones, fadeState)
    const value = Math.min(fadeState.heightVisibility, fadeState.opacity)
    fade.setX(slot, value)
    fadeStateById.set(instance.id, {
      insideHiddenZone: fadeState.insideHiddenZone,
      value,
    })
  }
  markStylizedGrassInstanceSlotsUpdated(fade, slots)
}

function summarizeStylizedGrassFadeSlotStates(
  fadeStateById: ReadonlyMap<string, StylizedGrassFadeSlotState>,
) {
  if (fadeStateById.size === 0) return EMPTY_STYLIZED_GRASS_FADE_SUMMARY
  let blockedFullCount = 0
  let blockedInstanceCount = 0
  let blockedVisibleCount = 0
  let fadeMax = Number.NEGATIVE_INFINITY
  let fadeMin = Number.POSITIVE_INFINITY
  for (const state of fadeStateById.values()) {
    fadeMax = Math.max(fadeMax, state.value)
    fadeMin = Math.min(fadeMin, state.value)
    if (!state.insideHiddenZone) continue
    blockedInstanceCount += 1
    if (state.value > 0.95) blockedFullCount += 1
    if (state.value > 0.05) blockedVisibleCount += 1
  }
  return { blockedFullCount, blockedInstanceCount, blockedVisibleCount, fadeMax, fadeMin }
}

function updateStylizedGrassFadeZones(
  zones: StylizedGrassFadeZone[],
  blockers: readonly StylizedGrassBlocker[],
) {
  const previousZones = zones.slice()
  const activeIds = new Set<string>()
  for (const blocker of blockers) {
    const id = stylizedGrassFadeZoneId(blocker)
    activeIds.add(id)
    const existing = zones.find((zone) => zone.id === id)
    if (existing) {
      const compiled = createStylizedGrassCompiledBlocker(blocker)
      existing.bounds = compiled.bounds
      existing.clearanceMeters = compiled.clearanceMeters
      existing.points = compiled.points
      existing.ring = compiled.ring
      existing.spans = compiled.spans
      existing.targetVisibility = 0
    } else {
      const compiled = createStylizedGrassCompiledBlocker(blocker)
      zones.push({
        ...compiled,
        id,
        targetVisibility: 0,
        visibility: clamp01(
          stylizedGrassZoneVisibilityById.get(id) ??
            blocker.initialVisibility ??
            initialStylizedGrassFadeZoneVisibility(previousZones, {
              ...compiled,
              id,
              targetVisibility: 0,
              visibility: 1,
            }),
        ),
      })
    }
  }

  for (const zone of zones) {
    if (!activeIds.has(zone.id)) zone.targetVisibility = 1
  }
}

function advanceStylizedGrassFadeZones(zones: StylizedGrassFadeZone[], delta: number): boolean {
  if (zones.length === 0) return false

  const step =
    Math.max(0, Math.min(delta, STYLIZED_SCENE_GRASS_FADE_MAX_DELTA_SECONDS)) /
    STYLIZED_SCENE_GRASS_FADE_SECONDS
  let changed = false
  for (const zone of zones) {
    const previousVisibility = zone.visibility
    zone.visibility = approach(zone.visibility, zone.targetVisibility, step)
    if (zone.visibility !== previousVisibility) {
      changed = true
      stylizedGrassZoneVisibilityById.set(zone.id, zone.visibility)
    }
  }

  for (let index = zones.length - 1; index >= 0; index -= 1) {
    const zone = zones[index]
    if (zone && zone.targetVisibility >= 1 && zone.visibility >= 0.999) {
      zones.splice(index, 1)
      stylizedGrassZoneVisibilityById.delete(zone.id)
      changed = true
    }
  }

  return changed
}

function resolveStylizedGrassFadeState(
  instance: StylizedGrassInstance,
  zones: readonly StylizedGrassFadeZone[],
  state: { heightVisibility: number; insideHiddenZone: boolean; opacity: number },
) {
  state.heightVisibility = 1
  state.insideHiddenZone = false
  state.opacity = 1
  for (const zone of zones) {
    if (pointWithinStylizedGrassBlocker({ x: instance.x, z: instance.z }, zone)) {
      state.heightVisibility = Math.min(state.heightVisibility, zone.visibility)
      if (zone.targetVisibility <= 0.001) state.insideHiddenZone = true
      if (zone.targetVisibility < zone.visibility) {
        state.opacity = Math.min(state.opacity, zone.visibility)
      }
    }
  }
}

function initialStylizedGrassFadeZoneVisibility(
  existingZones: readonly StylizedGrassFadeZone[],
  blocker: StylizedGrassFadeZone,
) {
  let visibility = 1
  for (const zone of existingZones) {
    if (zone.visibility >= 0.999) continue
    if (!stylizedGrassFadeZonesOverlap(zone, blocker)) continue
    visibility = Math.min(visibility, zone.visibility)
  }
  return visibility
}

function stylizedGrassFadeZonesOverlap(
  first: StylizedGrassFadeZone,
  second: StylizedGrassFadeZone,
) {
  if (!stylizedGrassFadeZoneBoundsOverlap(first, second)) return false
  const firstCenter = centroidForStylizedGrassPoints(first.ring)
  const secondCenter = centroidForStylizedGrassPoints(second.ring)
  if (pointWithinStylizedGrassBlocker(firstCenter, second)) return true
  if (pointWithinStylizedGrassBlocker(secondCenter, first)) return true
  for (const point of first.ring) {
    if (pointWithinStylizedGrassBlocker(point, second)) return true
  }
  for (const point of second.ring) {
    if (pointWithinStylizedGrassBlocker(point, first)) return true
  }
  return false
}

function stylizedGrassFadeZoneBoundsOverlap(
  first: StylizedGrassFadeZone,
  second: StylizedGrassFadeZone,
) {
  const firstBounds = first.bounds
  const secondBounds = second.bounds
  return !(
    firstBounds.maxX < secondBounds.minX ||
    firstBounds.minX > secondBounds.maxX ||
    firstBounds.maxZ < secondBounds.minZ ||
    firstBounds.minZ > secondBounds.maxZ
  )
}

function centroidForStylizedGrassPoints(points: readonly LandrushPoint2[]) {
  if (points.length === 0) return { x: 0, z: 0 }
  let x = 0
  let z = 0
  for (const point of points) {
    x += point.x
    z += point.z
  }
  return { x: x / points.length, z: z / points.length }
}

function stylizedGrassFadeZoneId(blocker: StylizedGrassBlocker) {
  return `${Math.max(0, blocker.clearanceMeters ?? 0).toFixed(2)}:${blocker.points
    .map((point) => `${point.x.toFixed(2)}:${point.z.toFixed(2)}`)
    .join('|')}`
}

function stylizedGrassBlockersSignature(blockers: readonly StylizedGrassBlocker[]) {
  return blockers
    .map(
      (blocker) =>
        `${(blocker.clearanceMeters ?? 0).toFixed(3)}:${blocker.points
          .map((point) => `${point.x.toFixed(3)}:${point.z.toFixed(3)}`)
          .join('|')}:${(blocker.initialVisibility ?? 1).toFixed(3)}`,
    )
    .join('||')
}

function approach(value: number, target: number, step: number) {
  if (value < target) return Math.min(target, value + step)
  return Math.max(target, value - step)
}

function nextStylizedGrassInstanceCapacity(count: number) {
  if (count <= 1) return 1
  return Math.min(STYLIZED_SCENE_MAX_GRASS_INSTANCES, 2 ** Math.ceil(Math.log2(count)))
}

function stylizedGrassInstanceCapacity(
  density: number,
  surfaceBounds: StylizedGrassBounds,
  lod: StylizedGrassLod,
) {
  const surfaceArea =
    Math.max(STYLIZED_SCENE_STREAM_CELL_SIZE, surfaceBounds.maxX - surfaceBounds.minX) *
    Math.max(STYLIZED_SCENE_STREAM_CELL_SIZE, surfaceBounds.maxZ - surfaceBounds.minZ)
  const densityPerSquareMeter =
    Math.max(0, finiteNumber(density, 0)) / (Math.PI * STYLIZED_SCENE_BASE_STREAM_RADIUS ** 2)
  const rawTargetCount = Math.min(
    STYLIZED_SCENE_MAX_GRASS_INSTANCES,
    densityPerSquareMeter * surfaceArea,
  )
  const lodTargetCount = rawTargetCount * STYLIZED_GRASS_LOD_DENSITY[lod]
  const budget = Math.ceil(
    lodTargetCount * STYLIZED_SCENE_STREAM_CAPACITY_HEADROOM +
      STYLIZED_SCENE_STREAM_CAPACITY_PADDING,
  )
  return nextStylizedGrassInstanceCapacity(budget)
}

export function withStylizedGrassInstanceAttributes(geometry: BufferGeometry, capacity: number) {
  const instancedGeometry = geometry.clone()
  instancedGeometry.computeBoundingBox()
  instancedGeometry.setAttribute(
    'aTransform',
    new InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(DynamicDrawUsage),
  )
  instancedGeometry.setAttribute(
    'aVariation',
    new InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage),
  )
  const fade = new Float32Array(capacity)
  fade.fill(1)
  instancedGeometry.setAttribute(
    'aFade',
    new InstancedBufferAttribute(fade, 1).setUsage(DynamicDrawUsage),
  )
  const streamFade = new Float32Array(capacity)
  streamFade.fill(1)
  instancedGeometry.setAttribute(
    'aStreamFade',
    new InstancedBufferAttribute(streamFade, 1).setUsage(DynamicDrawUsage),
  )
  return instancedGeometry
}

function createStylizedGrassNodeMaterial(
  geometry: BufferGeometry | null,
  tuning: StylizedSceneResolvedGrassTuning,
  groundColorTexture: Texture | null,
) {
  if (!geometry) return null

  if (getMaterialRendererBackend() === 'webgl') {
    const color = new Color('#7fb13f').lerp(new Color('#5f9a3a'), clamp(tuning.greenTint, 0, 1))
    const material = new MeshStandardMaterial({
      alphaHash: true,
      color,
      roughness: 0.85,
      side: DoubleSide,
      transparent: false,
    })
    material.depthWrite = true
    return {
      material,
      uniforms: {
        groundTintCap: { value: DEFAULT_STYLIZED_GRASS_GROUND_TINT_CAP },
        interaction: { value: new Vector4() },
        time: { value: 0 },
        visibility: { value: 1 },
      },
    }
  }

  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox
  const bladeMinY = bounds?.min.y ?? 0
  const bladeHeight = Math.max(0.000001, (bounds?.max.y ?? 1) - bladeMinY)
  const heightAlongBlade = tslClamp(positionLocal.y.sub(bladeMinY).div(bladeHeight), 0, 1)
  const gradientT = pow(heightAlongBlade, 1.4)
  const gradientA = mix(tslColor('#66715a'), tslColor('#899766'), gradientT)
  const gradientB = mix(tslColor('#73745a'), tslColor('#9b9869'), gradientT)
  const instanceTransform: TSLNode<'vec4'> = attribute<'vec4'>('aTransform', 'vec4')
  const instanceVariationPacked: TSLNode<'float'> = attribute<'float'>('aVariation', 'float')
  const macroVariationByte = instanceVariationPacked.div(256).floor()
  const patchVariation = instanceVariationPacked.sub(macroVariationByte.mul(256)).div(255)
  const packedMacroVariation = macroVariationByte.div(255)
  const instanceScaleFactorCode = instanceTransform.w
    .div(STYLIZED_SCENE_GRASS_TRANSFORM_QUANTIZATION + 1)
    .floor()
  const instanceHeightFactorCode = instanceTransform.w.sub(
    instanceScaleFactorCode.mul(STYLIZED_SCENE_GRASS_TRANSFORM_QUANTIZATION + 1),
  )
  const instanceScaleFactor = mix(
    STYLIZED_SCENE_GRASS_EDGE_FILL_SCALE,
    1,
    instanceScaleFactorCode.div(STYLIZED_SCENE_GRASS_TRANSFORM_QUANTIZATION),
  )
  const instanceHeightFactor = mix(
    STYLIZED_SCENE_GRASS_MIN_HEIGHT_FACTOR,
    STYLIZED_SCENE_GRASS_MAX_HEIGHT_FACTOR,
    instanceHeightFactorCode.div(STYLIZED_SCENE_GRASS_TRANSFORM_QUANTIZATION),
  )
  const edgeFillProfile = tslClamp(
    float(1)
      .sub(instanceScaleFactor)
      .div(1 - STYLIZED_SCENE_GRASS_EDGE_FILL_SCALE),
    0,
    1,
  )
  const instanceOrigin = instanceTransform.xy
  const instanceYaw = instanceTransform.z.mul(Math.PI * 2)
  const instanceYawCos = cos(instanceYaw)
  const instanceYawSin = sin(instanceYaw)
  const instanceGeometryScale = float(Math.max(0.001, tuning.scale)).mul(instanceScaleFactor)
  const scaledGeometryXZ = vec2(positionLocal.x, positionLocal.z).mul(instanceGeometryScale)
  const instancePosition = vec3(
    instanceOrigin.x
      .add(scaledGeometryXZ.x.mul(instanceYawCos))
      .add(scaledGeometryXZ.y.mul(instanceYawSin)),
    positionLocal.y
      .mul(instanceGeometryScale)
      .mul(STYLIZED_SCENE_GRASS_HEIGHT_SCALE)
      .mul(instanceHeightFactor),
    instanceOrigin.y
      .add(scaledGeometryXZ.y.mul(instanceYawCos))
      .sub(scaledGeometryXZ.x.mul(instanceYawSin)),
  )
  const instanceFade: TSLNode<'float'> = attribute<'float'>('aFade', 'float')
  const instanceStreamFade: TSLNode<'float'> = attribute<'float'>('aStreamFade', 'float')
  const combinedFade = instanceFade.mul(instanceStreamFade)
  const globalVisibility = uniform(1)
  const combinedOpacity = combinedFade.mul(globalVisibility)
  const grassTime = uniform(0)
  const grassInteraction = uniform(new Vector4())
  const groundTintCap = uniform(DEFAULT_STYLIZED_GRASS_GROUND_TINT_CAP)
  const colorVariation = float(tuning.colorVariation)
  const macroVariation = float(tuning.macroVariation)
  const instanceSeed = hash(instanceOrigin.x.mul(12.9898).add(instanceOrigin.y.mul(78.233)))
  const patchBlend = tslClamp(patchVariation.mul(colorVariation), 0, 1)
  const baseColor = mix(gradientA, gradientB, patchBlend)
  const bladeGroundSample = attribute<'vec2'>('uv', 'vec2')
    .mul(Math.max(0.001, tuning.scale))
    .mul(instanceScaleFactor)
  const bladeRootYawCos = instanceYawCos
  const bladeRootYawSin = instanceYawSin
  const bladeWorldRoot = instanceOrigin.add(
    vec2(
      bladeGroundSample.x.mul(bladeRootYawCos).add(bladeGroundSample.y.mul(bladeRootYawSin)),
      bladeGroundSample.y.mul(bladeRootYawCos).sub(bladeGroundSample.x.mul(bladeRootYawSin)),
    ),
  )
  const groundUv = vec2(
    bladeWorldRoot.x.div(STYLIZED_SCENE_FIELD_SIZE).add(0.5),
    float(0.5).sub(bladeWorldRoot.y.div(STYLIZED_SCENE_FIELD_SIZE)),
  ).clamp(0.001, 0.999)
  const groundColorSample = groundColorTexture ? tslTexture(groundColorTexture, groundUv).rgb : null
  const luminanceWeights = vec3(0.2126, 0.7152, 0.0722)
  const groundTintedBaseColor = groundColorSample
    ? (() => {
        const baseLuminance = baseColor.dot(luminanceWeights)
        const groundLuminance = groundColorSample.dot(luminanceWeights)
        const groundTint = groundColorSample.div(groundLuminance.max(0.04)).mul(baseLuminance)
        const safeGroundTint = mix(baseColor, groundTint, groundLuminance.smoothstep(0.025, 0.075))
        return mix(baseColor, safeGroundTint, tslClamp(groundTintCap, 0, 1))
      })()
    : baseColor
  const greenTintReference = vec3(95 / 255, 154 / 255, 58 / 255)
  const greenTintColor = greenTintReference
    .div(greenTintReference.dot(luminanceWeights).max(0.04))
    .mul(groundTintedBaseColor.dot(luminanceWeights))
  const tintedBaseColor = mix(
    groundTintedBaseColor,
    greenTintColor,
    tslClamp(float(tuning.greenTint), 0, 1),
  )
  const brightness = mix(float(0.85), float(1.15), hash(instanceSeed.add(13.37)))
  const macroFactor = float(1).add(packedMacroVariation.sub(0.5).mul(2).mul(macroVariation))
  const viewDir = cameraPosition.sub(positionWorld).normalize()
  const sunDir = vec3(18, 16, 10).normalize()
  const backLight = viewDir.dot(sunDir.negate()).max(0).pow(3)
  const thicknessMask = pow(heightAlongBlade, 1.5)
  const translucency = tintedBaseColor.mul(1.18).mul(backLight).mul(thicknessMask).mul(0.62)
  const fresnel = float(1)
    .sub(vec3(0, 1, 0).dot(viewDir).max(0))
    .pow(4)
  const fresnelRim = mix(tintedBaseColor, vec3(1), 0.3).mul(fresnel).mul(0.08)
  const windDirection = (tuning.windAngle / 180) * Math.PI
  const windSin = Math.sin(windDirection)
  const windCos = Math.cos(windDirection)
  const wave = grassTime
    .mul(Math.max(0, tuning.windSpeed))
    .add(instanceOrigin.x.mul(windCos).add(instanceOrigin.y.mul(windSin)).mul(tuning.gustScale))
  const turbulence = sin(wave.mul(1.73).add(instanceSeed.mul(Math.PI * 2))).mul(
    tuning.turbulence * 0.42,
  )
  const flutter = sin(wave.mul(3.1).add(instanceSeed.mul(23.37))).mul(tuning.flutter * 0.35)
  const gust = sin(wave).add(turbulence).add(flutter)
  const windLean = gust.mul(Math.max(0, tuning.windStrength) * 0.18)
  const heightPulse = tslClamp(
    float(1).add(gust.abs().mul(Math.max(0, tuning.windStrength) * 0.04)),
    0.9,
    1.12,
  )
  const windWorldOffset = vec2(windCos, windSin).mul(windLean)
  const interactionRadius = grassInteraction.z.max(0.001)
  const interactionDelta = instanceOrigin.sub(vec2(grassInteraction.x, grassInteraction.y))
  const interactionDistance = interactionDelta.length()
  const normalizedInteractionDistance = interactionDistance.div(interactionRadius)
  const interactionEdgeMask = float(1).sub(normalizedInteractionDistance.smoothstep(0.94, 1))
  const interactionFalloff = exp(normalizedInteractionDistance.mul(-4.25)).mul(interactionEdgeMask)
  const interactionDirection = interactionDelta.div(interactionDistance.max(0.001))
  const interactionWorldOffset = interactionDirection.mul(
    interactionFalloff.mul(grassInteraction.w).mul(STYLIZED_SCENE_INTERACTION_MAX_BEND),
  )
  const yawCos = cos(instanceYaw)
  const yawSin = sin(instanceYaw)
  const interactionLocalOffset = vec2(
    interactionWorldOffset.x.mul(yawCos).sub(interactionWorldOffset.y.mul(yawSin)),
    interactionWorldOffset.x.mul(yawSin).add(interactionWorldOffset.y.mul(yawCos)),
  )
  const interactionFold = tslClamp(interactionFalloff.mul(grassInteraction.w).mul(0.96), 0, 0.86)
  const worldOffset = windWorldOffset
    .add(interactionLocalOffset)
    .mul(heightAlongBlade)
    .mul(STYLIZED_SCENE_GRASS_HEIGHT_SCALE)
  const bladeLocalXZ = instancePosition.xz
  const rootWidthProfile = float(1).sub(heightAlongBlade).pow(2)
  const rootWidthFactor = float(1).add(
    edgeFillProfile
      .mul(STYLIZED_SCENE_GRASS_EDGE_FILL_ROOT_WIDTH_MULTIPLIER - 1)
      .mul(rootWidthProfile),
  )
  // Three applies instanceMatrix before positionNode, so this pivot must be in the same space.
  const thickenedBladeObjectXZ = bladeWorldRoot.add(
    bladeLocalXZ.sub(bladeWorldRoot).mul(rootWidthFactor),
  )
  const deformedPosition = vec3(
    thickenedBladeObjectXZ.x.add(worldOffset.x),
    instancePosition.y.mul(heightPulse).mul(float(1).sub(interactionFold)).mul(combinedFade),
    thickenedBladeObjectXZ.y.add(worldOffset.y),
  )

  const material = new MeshBasicNodeMaterial({
    alphaHash: true,
    side: DoubleSide,
    transparent: false,
  })
  material.positionNode = deformedPosition
  material.colorNode = tintedBaseColor
    .mul(brightness)
    .mul(macroFactor)
    .add(translucency)
    .add(fresnelRim)
  material.opacityNode = combinedOpacity
  material.depthWrite = true
  return {
    material,
    uniforms: {
      groundTintCap,
      interaction: grassInteraction,
      time: grassTime,
      visibility: globalVisibility,
    },
  }
}

function applyStylizedGrassInstanceAttributes(
  geometry: BufferGeometry,
  instances: readonly StylizedGrassInstance[],
  slots: readonly number[],
) {
  if (slots.length === 0) return
  const profile = getStylizedGrassPerfProbe()
  const startedAt = profile ? performance.now() : 0
  const transform = geometry.getAttribute('aTransform') as InstancedBufferAttribute | undefined
  const variation = geometry.getAttribute('aVariation') as InstancedBufferAttribute | undefined
  const fade = geometry.getAttribute('aFade') as InstancedBufferAttribute | undefined
  if (!transform || !variation) return

  for (const index of slots) {
    const instance = instances[index]!
    const patchByte = Math.round(clamp01(instance.patchVariation) * 255)
    const macroByte = Math.round(clamp01(instance.macroVariation) * 255)
    transform.setXYZW(
      index,
      instance.x,
      instance.z,
      instance.yaw / (Math.PI * 2),
      packStylizedGrassScaleHeight(instance.scaleFactor, instance.heightFactor),
    )
    variation.setX(index, patchByte + macroByte * 256)
    fade?.setX(index, 1)
  }

  markStylizedGrassInstanceSlotsUpdated(transform, slots)
  markStylizedGrassInstanceSlotsUpdated(variation, slots)
  if (fade) markStylizedGrassInstanceSlotsUpdated(fade, slots)
  if (profile) {
    recordStylizedGrassPerfSample(profile, {
      count: slots.length,
      durationMs: performance.now() - startedAt,
      kind: 'attributes',
    })
  }
}

function applyStylizedGrassStreamFadeAttributes(
  geometry: BufferGeometry,
  instances: readonly StylizedGrassInstance[],
  slots: readonly number[],
  state: StylizedGrassDrawState,
) {
  if (slots.length === 0) return
  const streamFade = geometry.getAttribute('aStreamFade') as InstancedBufferAttribute | undefined
  if (!streamFade) return

  for (const index of slots) {
    const instance = instances[index]
    if (!instance) continue
    streamFade.setX(index, state.streamFadeById.get(instance.id) ?? 1)
  }
  markStylizedGrassInstanceSlotsUpdated(streamFade, slots)
}

function advanceStylizedGrassStreamFades(
  geometry: BufferGeometry,
  state: StylizedGrassDrawState,
  arrivalState: StylizedGrassArrivalState,
  nowMs: number,
) {
  if (state.streamFadeById.size === 0) return
  const streamFade = geometry.getAttribute('aStreamFade') as InstancedBufferAttribute | undefined
  if (!streamFade) return

  const activeBefore = state.streamFadeById.size
  const changedSlots: number[] = []
  let fadeMax = 0
  let fadeMin = 1
  for (const id of state.streamFadeById.keys()) {
    const slot = state.slotById.get(id)
    if (slot === undefined) {
      state.streamFadeById.delete(id)
      continue
    }
    const instance = state.instances[slot]
    if (!instance) continue
    const nextFade = resolveStylizedGrassArrivalFade(instance, arrivalState, nowMs)
    fadeMax = Math.max(fadeMax, nextFade)
    fadeMin = Math.min(fadeMin, nextFade)
    streamFade.setX(slot, nextFade)
    changedSlots.push(slot)
    if (nextFade >= 1) state.streamFadeById.delete(id)
    else state.streamFadeById.set(id, nextFade)
  }

  changedSlots.sort((first, second) => first - second)
  markStylizedGrassInstanceSlotsUpdated(streamFade, changedSlots)
  if (nowMs - state.lastStreamFadeTraceAt >= 100 || state.streamFadeById.size === 0) {
    state.lastStreamFadeTraceAt = nowMs
    recordStylizedGrassStreamRuntimeEvent({
      activeAfter: state.streamFadeById.size,
      activeBefore,
      event: 'arrival-fade',
      fadeMax: Math.round(fadeMax * 1000) / 1000,
      fadeMin: Math.round(fadeMin * 1000) / 1000,
      updatedSlots: changedSlots.length,
    })
  }
}

function reconcileStylizedGrassDrawInstances({
  arrivalState,
  capacity,
  eligibleTotal,
  geometry,
  nextInstances,
  nowMs,
  state,
  tuning,
}: {
  arrivalState: StylizedGrassArrivalState
  capacity: number
  eligibleTotal: number
  geometry: BufferGeometry
  nextInstances: readonly StylizedGrassInstance[]
  nowMs: number
  state: StylizedGrassDrawState
  tuning: StylizedSceneResolvedGrassTuning
}) {
  const reset = state.geometry !== geometry || state.tuning !== tuning
  const previousCount = state.instances.length
  const reason = state.geometry !== geometry ? 'geometry' : 'tuning'
  if (reset) {
    state.geometry = geometry
    state.tuning = tuning
    state.eligibleTotal = 0
    state.instances.length = 0
    state.saturated = false
    state.slotById.clear()
    state.fadeStateById.clear()
    state.streamFadeById.clear()
  }

  const drawUpdate = reconcileStylizedGrassDenseDrawInstances({
    capacity,
    eligibleTotal,
    nextInstances,
    state,
  })
  for (const id of drawUpdate.removedIds) {
    state.fadeStateById.delete(id)
    state.streamFadeById.delete(id)
  }
  for (const instance of drawUpdate.addedInstances) {
    const fade = resolveStylizedGrassArrivalFade(instance, arrivalState, nowMs)
    if (fade < 1) state.streamFadeById.set(instance.id, fade)
    else state.streamFadeById.delete(instance.id)
  }

  if (reset) {
    recordStylizedGrassStreamRuntimeEvent({
      event: 'resident-reset',
      nextInstances: drawUpdate.instances.length,
      previousInstances: previousCount,
      reason,
      visibleInstances: drawUpdate.instances.length,
    })
    return drawUpdate
  }

  if (drawUpdate.changedSlots.length > 0 || drawUpdate.removedIds.length > 0) {
    recordStylizedGrassStreamRuntimeEvent({
      activeArrivalFades: state.streamFadeById.size,
      addedInstances: drawUpdate.addedInstances.length,
      addedVisibleInstances: drawUpdate.addedInstances.length,
      changedSlots: drawUpdate.changedSlots.length,
      event: 'resident-update',
      fadingAddedInstances: drawUpdate.addedInstances.filter((instance) =>
        state.streamFadeById.has(instance.id),
      ).length,
      freeSlots: 0,
      highWatermark: drawUpdate.instances.length,
      movedInstances: Math.max(
        0,
        drawUpdate.changedSlots.length - drawUpdate.addedInstances.length,
      ),
      movedVisibleInstances: Math.max(
        0,
        drawUpdate.changedSlots.length - drawUpdate.addedInstances.length,
      ),
      removedInstances: drawUpdate.removedIds.length,
      removedVisibleInstances: drawUpdate.removedIds.length,
      residentInstances: drawUpdate.instances.length,
      reusedSlots: 0,
    })
  }
  return drawUpdate
}

function stylizedGrassInstanceCellKey(id: string) {
  const separator = id.lastIndexOf(':')
  return separator < 0 ? id : id.slice(0, separator)
}

export function markStylizedGrassInstanceSlotsUpdated(
  attribute: InstancedBufferAttribute,
  slots: readonly number[],
) {
  if (slots.length === 0) return

  const itemSize = attribute.itemSize
  const ranges = attribute.updateRanges.map(({ start, count }) => ({ count, start }))
  for (const slot of slots) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= attribute.count) continue
    ranges.push({ count: itemSize, start: slot * itemSize })
  }
  if (ranges.length === attribute.updateRanges.length) return

  ranges.sort((first, second) => first.start - second.start)
  const mergedRanges: { count: number; start: number }[] = []
  const mergeGap = STYLIZED_SCENE_STREAM_UPDATE_RANGE_GAP * itemSize
  for (const range of ranges) {
    const previous = mergedRanges.at(-1)
    if (!previous) {
      mergedRanges.push({ ...range })
      continue
    }
    const previousEnd = previous.start + previous.count
    const rangeEnd = range.start + range.count
    if (range.start <= previousEnd + mergeGap) {
      previous.count = Math.max(previousEnd, rangeEnd) - previous.start
      continue
    }
    mergedRanges.push({ ...range })
  }

  attribute.clearUpdateRanges()
  for (const range of mergedRanges) attribute.addUpdateRange(range.start, range.count)
  attribute.needsUpdate = true
}

export function packStylizedGrassScaleHeight(scaleFactor: number, heightFactor: number) {
  const scaleCode = Math.round(
    ((clamp(scaleFactor, STYLIZED_SCENE_GRASS_EDGE_FILL_SCALE, 1) -
      STYLIZED_SCENE_GRASS_EDGE_FILL_SCALE) /
      (1 - STYLIZED_SCENE_GRASS_EDGE_FILL_SCALE)) *
      STYLIZED_SCENE_GRASS_TRANSFORM_QUANTIZATION,
  )
  const heightCode = Math.round(
    ((clamp(
      heightFactor,
      STYLIZED_SCENE_GRASS_MIN_HEIGHT_FACTOR,
      STYLIZED_SCENE_GRASS_MAX_HEIGHT_FACTOR,
    ) -
      STYLIZED_SCENE_GRASS_MIN_HEIGHT_FACTOR) /
      (STYLIZED_SCENE_GRASS_MAX_HEIGHT_FACTOR - STYLIZED_SCENE_GRASS_MIN_HEIGHT_FACTOR)) *
      STYLIZED_SCENE_GRASS_TRANSFORM_QUANTIZATION,
  )
  return heightCode + scaleCode * (STYLIZED_SCENE_GRASS_TRANSFORM_QUANTIZATION + 1)
}

function stylizedGrassHeightFactor(x: number, z: number, tuning: StylizedSceneResolvedGrassTuning) {
  const heightNoise = stylizedGrassNoise(
    (x + 53) * tuning.heightNoiseScale,
    (z + 17) * tuning.heightNoiseScale,
  )
  return clamp(1 + (heightNoise - 0.5) * 2 * tuning.heightVariation, 0.2, 1.8)
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

function stylizedGrassRoadScaleFactor(
  x: number,
  z: number,
  roadGrid: StylizedGrassRoadGrid | null,
  edgeJitter: number,
) {
  if (!roadGrid) return 1

  const spans = stylizedGrassRoadSpansNearPoint({ x, z }, roadGrid)
  if (spans.length === 0) return 1

  const signedDistance = signedDistanceToStylizedGrassRoadSpans({ x, z }, spans)
  if (!Number.isFinite(signedDistance)) return 1

  const jitter = (clamp01(edgeJitter) - 0.5) * STYLIZED_SCENE_PATH_EDGE_JITTER_METERS
  const clearance = roadGrid.clearanceMeters + jitter
  const edgeFillClearance = Math.min(clearance, roadGrid.edgeFillClearanceMeters + jitter)
  if (signedDistance <= edgeFillClearance) return 0
  if (signedDistance >= clearance) return 1

  const transition = clamp01(
    (signedDistance - edgeFillClearance) / Math.max(0.001, clearance - edgeFillClearance),
  )
  const easedTransition = transition * transition * (3 - 2 * transition)
  return (
    STYLIZED_SCENE_GRASS_EDGE_FILL_SCALE +
    easedTransition * (1 - STYLIZED_SCENE_GRASS_EDGE_FILL_SCALE)
  )
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

function isPointInStylizedGrassBlocker(
  point: LandrushPoint2,
  blockers: readonly StylizedGrassCompiledBlocker[],
) {
  for (const blocker of blockers) {
    if (pointWithinStylizedGrassBlocker(point, blocker)) return true
  }
  return false
}

function pointWithinStylizedGrassBlocker(
  point: LandrushPoint2,
  blocker: StylizedGrassCompiledBlocker,
) {
  if (blocker.ring.length < 3) return false
  if (!pointWithinStylizedGrassBounds(point, blocker.bounds)) return false
  const boundaryDistance = distanceToClosedPolyline(point, blocker.spans)
  const signedDistance = pointInPolygon(point, blocker) ? -boundaryDistance : boundaryDistance
  return signedDistance <= blocker.clearanceMeters
}

function createStylizedGrassRoadGrid(
  roads: readonly LandrushRoadSegment[],
  fieldSize: number,
  clearanceMeters: number,
  edgeFillClearanceMeters: number,
): StylizedGrassRoadGrid | null {
  const fieldHalf = fieldSize / 2
  const spans: StylizedGrassRoadSpan[] = []

  for (const road of roads) {
    const halfWidth = (Math.max(0.1, road.width) * STYLIZED_PATH_WIDTH_SCALE) / 2
    const padding = halfWidth + clearanceMeters + STYLIZED_SCENE_PATH_EDGE_JITTER_METERS

    for (let index = 0; index < road.points.length - 1; index += 1) {
      const start = road.points[index]
      const end = road.points[index + 1]
      if (!(start && end)) continue

      const span = createStylizedGrassSegmentSpan(start, end, padding)
      if (
        span.maxX < -fieldHalf ||
        span.minX > fieldHalf ||
        span.maxZ < -fieldHalf ||
        span.minZ > fieldHalf
      ) {
        continue
      }

      spans.push({ ...span, halfWidth })
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

  return { cells, cellsPerAxis, clearanceMeters, edgeFillClearanceMeters, fieldSize }
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
      distanceToStylizedGrassSegmentSpan(point, span) - span.halfWidth,
    )
  }
  return signedDistance
}

function createStylizedTreeCompiledBlockers(blockers: readonly StylizedGrassBlocker[]) {
  return blockers.map((blocker) =>
    createStylizedGrassCompiledBlocker({
      ...blocker,
      clearanceMeters: (blocker.clearanceMeters ?? 0) + STYLIZED_TREE_BLOCKER_CLEARANCE_METERS,
    }),
  )
}

function isStylizedTreeBlocked(
  tree: StylizedTreeLayoutEntry,
  blockers: readonly StylizedGrassCompiledBlocker[],
) {
  if (blockers.length === 0) return false
  for (const point of stylizedTreeOccupancyPoints(tree)) {
    if (isPointInStylizedGrassBlocker(point, blockers)) return true
  }
  return false
}

function stylizedTreeOccupancyPoints(tree: StylizedTreeLayoutEntry) {
  const points: LandrushPoint2[] = [{ x: tree.position[0], z: tree.position[2] }]
  for (const bush of STYLIZED_TREE_BUSHES) {
    points.push(stylizedTreeLocalPointToWorld(tree, { x: bush.pos[0], z: bush.pos[2] }))
  }
  return points
}

function stylizedTreeLocalPointToWorld(
  tree: StylizedTreeLayoutEntry,
  point: LandrushPoint2,
): LandrushPoint2 {
  const localX = point.x * tree.scale
  const localZ = point.z * tree.scale
  const cosY = Math.cos(tree.rotationY)
  const sinY = Math.sin(tree.rotationY)
  return {
    x: tree.position[0] + localX * cosY - localZ * sinY,
    z: tree.position[2] + localX * sinY + localZ * cosY,
  }
}

function createStylizedGrassCompiledBlockers(blockers: readonly StylizedGrassBlocker[]) {
  return blockers.map(createStylizedGrassCompiledBlocker)
}

function createStylizedGrassCompiledBlocker(
  blocker: StylizedGrassBlocker,
): StylizedGrassCompiledBlocker {
  const clearanceMeters = Math.max(0, blocker.clearanceMeters ?? 0)
  const polygon = createStylizedGrassCompiledPolygon(blocker.points, clearanceMeters)
  return {
    ...polygon,
    clearanceMeters,
    points: blocker.points,
  }
}

function createStylizedGrassCompiledPolygon(
  points: readonly LandrushPoint2[],
  clearanceMeters = 0,
): StylizedGrassCompiledPolygon {
  const ring = openRing(points)
  const spans = createStylizedGrassClosedPolylineSpans(ring)
  return {
    bounds: stylizedGrassPointsBounds(ring, Math.max(0, clearanceMeters)),
    crossingSpansByCellZ: createStylizedGrassCrossingSpanRows(spans),
    ring,
    spans,
  }
}

function createStylizedGrassCrossingSpanRows(spans: readonly StylizedGrassSegmentSpan[]) {
  const rows = new Map<number, StylizedGrassSegmentSpan[]>()
  for (const span of spans) {
    const minCellZ = Math.floor(Math.min(span.start.z, span.end.z))
    const maxCellZ = Math.floor(Math.max(span.start.z, span.end.z))
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      const row = rows.get(cellZ)
      if (row) row.push(span)
      else rows.set(cellZ, [span])
    }
  }
  return rows
}

function createStylizedGrassClosedPolylineSpans(points: readonly LandrushPoint2[]) {
  const spans: StylizedGrassSegmentSpan[] = []
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    if (start && end) spans.push(createStylizedGrassSegmentSpan(start, end, 0))
  }
  return spans
}

function createStylizedGrassSegmentSpan(
  start: { x: number; z: number },
  end: { x: number; z: number },
  padding: number,
): StylizedGrassSegmentSpan {
  const dx = end.x - start.x
  const dz = end.z - start.z
  return {
    dx,
    dz,
    end,
    lengthSquared: dx * dx + dz * dz,
    maxX: Math.max(start.x, end.x) + padding,
    maxZ: Math.max(start.z, end.z) + padding,
    minX: Math.min(start.x, end.x) - padding,
    minZ: Math.min(start.z, end.z) - padding,
    start,
  }
}

function distanceToStylizedGrassSegmentSpan(
  point: { x: number; z: number },
  span: StylizedGrassSegmentSpan,
) {
  if (span.lengthSquared <= 0.000001) {
    return Math.hypot(point.x - span.start.x, point.z - span.start.z)
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - span.start.x) * span.dx + (point.z - span.start.z) * span.dz) /
        span.lengthSquared,
    ),
  )
  return Math.hypot(point.x - (span.start.x + span.dx * t), point.z - (span.start.z + span.dz * t))
}

function distanceToClosedPolyline(
  point: LandrushPoint2,
  spans: readonly StylizedGrassSegmentSpan[],
) {
  let best = Number.POSITIVE_INFINITY
  for (const span of spans) {
    best = Math.min(best, distanceToStylizedGrassSegmentSpan(point, span))
  }
  return best
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

function pointInPolygon(point: LandrushPoint2, polygon: StylizedGrassCompiledPolygon) {
  const crossingSpans = polygon.crossingSpansByCellZ.get(Math.floor(point.z))
  if (!crossingSpans) return false
  let inside = false
  for (const span of crossingSpans) {
    const crosses = span.start.z > point.z !== span.end.z > point.z
    const boundaryX =
      ((span.end.x - span.start.x) * (point.z - span.start.z)) /
        (span.end.z - span.start.z || 0.000001) +
      span.start.x
    if (crosses && point.x < boundaryX) inside = !inside
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

function stylizedGrassSurfaceBounds(points: readonly LandrushPoint2[]) {
  const fieldHalf = STYLIZED_SCENE_FIELD_SIZE / 2
  if (points.length === 0) {
    return { maxX: fieldHalf, maxZ: fieldHalf, minX: -fieldHalf, minZ: -fieldHalf }
  }

  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minZ = Math.min(minZ, point.z)
    maxX = Math.max(maxX, point.x)
    maxZ = Math.max(maxZ, point.z)
  }

  return { maxX, maxZ, minX, minZ }
}

function stylizedGrassPointsBounds(points: readonly LandrushPoint2[], clearance = 0) {
  const bounds = stylizedGrassSurfaceBounds(points)
  return {
    maxX: bounds.maxX + clearance,
    maxZ: bounds.maxZ + clearance,
    minX: bounds.minX - clearance,
    minZ: bounds.minZ - clearance,
  }
}

function pointWithinStylizedGrassBounds(point: LandrushPoint2, bounds: StylizedGrassBounds) {
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.z >= bounds.minZ &&
    point.z <= bounds.maxZ
  )
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function finiteNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback
}

function measureStylizedScene<T>(
  profileMeasure: StylizedSceneProfileMeasure | undefined,
  id: string,
  callback: () => T,
) {
  return profileMeasure ? profileMeasure(id, callback) : callback()
}

function lerp(start: number, end: number, t: number) {
  return start + (end - start) * t
}

function getStylizedGrassPerfProbe() {
  if (typeof window === 'undefined') return null
  const probe = window.__LANDRUSH_STYLIZED_GRASS_PERF__
  return probe?.enabled ? probe : null
}

let cachedStylizedGrassRuntimeProbeSearch: string | null = null
let cachedStylizedGrassRuntimeProbeEnabled = false
let stylizedGrassStreamRuntimeTrace: StylizedGrassStreamRuntimeTrace | null = null

function stylizedGrassRuntimeProbeIsEnabled() {
  if (typeof window === 'undefined') return false
  if (window.location.search === cachedStylizedGrassRuntimeProbeSearch) {
    return cachedStylizedGrassRuntimeProbeEnabled
  }
  cachedStylizedGrassRuntimeProbeSearch = window.location.search
  cachedStylizedGrassRuntimeProbeEnabled = new URLSearchParams(window.location.search).has(
    'landrushProbe',
  )
  return cachedStylizedGrassRuntimeProbeEnabled
}

function takeStylizedGrassCacheStats(stats: StylizedGrassCacheStats) {
  const snapshot = {
    clears: stats.clears,
    hits: stats.hits,
    misses: stats.misses,
    rebuilds: stats.rebuilds,
  }
  stats.clears = 0
  stats.hits = 0
  stats.misses = 0
  stats.rebuilds = 0
  return snapshot
}

function recordStylizedGrassRuntimeProbe(
  interaction: StylizedGrassInteraction | null | undefined,
  smoothedInteraction: Vector4,
) {
  if (!interaction || typeof window === 'undefined') return
  const probe = getStylizedGrassRuntimeProbe()
  if (!probe?.grassSamples) return

  const now = performance.now()
  if (probe.lastStylizedGrassProbeAt && now - probe.lastStylizedGrassProbeAt < 250) return
  probe.lastStylizedGrassProbeAt = now
  probe.grassSamples.push({
    centerLagMeters:
      Math.round(
        Math.hypot(smoothedInteraction.x - interaction.x, smoothedInteraction.y - interaction.z) *
          1000,
      ) / 1000,
    moving: (interaction.speed ?? 0) > 0.05,
    physicsLagMeters: 0,
    position: [
      Math.round(smoothedInteraction.x * 1000) / 1000,
      Math.round(smoothedInteraction.y * 1000) / 1000,
    ],
    radius: Math.round(smoothedInteraction.z * 1000) / 1000,
    source: 'stylized-grass-uniform',
    speed: Math.round((interaction.speed ?? 0) * 1000) / 1000,
    strength: Math.round(smoothedInteraction.w * 1000) / 1000,
    timeMs: Math.round((now - (probe.startedAt ?? now)) * 1000) / 1000,
  })
  if (probe.grassSamples.length > 800) {
    probe.grassSamples.splice(0, probe.grassSamples.length - 800)
  }
}

function recordStylizedGrassFadeRuntimeProbe({
  cacheStats,
  debugState,
  fadeBlockerSignature,
  fadeSummary,
  fadeZoneCount,
  instanceCount,
  structuralBlockerSignature,
}: {
  cacheStats: StylizedGrassCacheStats
  debugState?: StylizedGrassDebugState
  fadeBlockerSignature: string
  fadeSummary: StylizedGrassFadeSummary
  fadeZoneCount: number
  instanceCount: number
  structuralBlockerSignature: string
}) {
  if (typeof window === 'undefined') return
  const probe = ensureStylizedGrassRuntimeProbe()
  if (!probe) return

  const now = performance.now()
  probe.grassSamples.push({
    blockedFullCount: fadeSummary.blockedFullCount,
    blockedInstanceCount: fadeSummary.blockedInstanceCount,
    blockedVisibleCount: fadeSummary.blockedVisibleCount,
    buildMode: debugState?.buildMode ?? null,
    cacheClears: cacheStats.clears,
    cacheHits: cacheStats.hits,
    cacheMisses: cacheStats.misses,
    cacheRebuilds: cacheStats.rebuilds,
    fadeBlockerSignature: debugState?.fadeBlockerSignature ?? fadeBlockerSignature,
    fadeMax: Math.round(fadeSummary.fadeMax * 1000) / 1000,
    fadeMin: Math.round(fadeSummary.fadeMin * 1000) / 1000,
    fadeZoneCount,
    instanceCount,
    source: debugState?.source ?? 'stylized-grass-fade',
    structuralBlockerSignature:
      debugState?.structuralBlockerSignature ?? structuralBlockerSignature,
    timeMs: Math.round((now - (probe.startedAt ?? now)) * 1000) / 1000,
  })
  if (probe.grassSamples.length > 800) {
    probe.grassSamples.splice(0, probe.grassSamples.length - 800)
  }
}

function ensureStylizedGrassRuntimeProbe() {
  if (typeof window === 'undefined') return null
  if (!stylizedGrassRuntimeProbeIsEnabled()) return null
  const scopedWindow = window as unknown as {
    __LANDRUSH_ISLAND_RUNTIME_PROBE__?: StylizedGrassRuntimeProbe & {
      cameraJumps?: unknown[]
      cameraSamples?: unknown[]
      grassEvents?: Record<string, unknown>[]
      gridSamples?: unknown[]
      inputEvents?: unknown[]
      lastCameraSamplesBySource?: Record<string, unknown>
      navigationEvents?: unknown[]
      revealSamples?: unknown[]
      robotAnimationSamples?: unknown[]
      robotHoverSamples?: unknown[]
    }
  }
  const probe = scopedWindow.__LANDRUSH_ISLAND_RUNTIME_PROBE__ ?? {
    cameraJumps: [],
    cameraSamples: [],
    grassEvents: [],
    grassSamples: [],
    gridSamples: [],
    inputEvents: [],
    lastCameraSamplesBySource: {},
    navigationEvents: [],
    revealSamples: [],
    robotAnimationSamples: [],
    robotHoverSamples: [],
    startedAt: performance.now(),
  }
  scopedWindow.__LANDRUSH_ISLAND_RUNTIME_PROBE__ = probe
  probe.grassEvents ??= []
  probe.grassSamples ??= []
  probe.startedAt ??= performance.now()
  return probe as StylizedGrassRuntimeProbe & {
    grassEvents: Record<string, unknown>[]
    grassSamples: Record<string, unknown>[]
    startedAt: number
  }
}

function recordStylizedGrassStreamRuntimeEvent(event: Record<string, unknown>) {
  if (typeof window === 'undefined' || !window.location.search.includes('landrushProbe')) return
  const trace = getStylizedGrassStreamRuntimeTrace()
  const enrichedEvent = {
    ...event,
    source: 'stylized-grass-stream',
    timeMs: Math.round((performance.now() - trace.startedAt) * 1000) / 1000,
  }
  trace.eventCount += 1
  trace.events.push(enrichedEvent)
  if (trace.events.length > 80) trace.events.splice(0, trace.events.length - 80)
  if (event.event === 'coverage-change') {
    trace.coverageChanges += 1
    trace.lateVisibleAddedCells += Number(event.lateVisibleAddedCells ?? 0)
    trace.visibleRemovedCells += Number(event.visibleRemovedCells ?? 0)
  } else if (event.event === 'lod-change') {
    trace.lodChanges += 1
  } else if (event.event === 'resident-reset') {
    trace.residentResets += 1
  } else if (event.event === 'resident-update') {
    trace.residentUpdates += 1
  } else if (event.event === 'arrival-fade') {
    trace.activeFadeMax = Math.max(trace.activeFadeMax, Number(event.activeBefore ?? 0))
  }
  document.documentElement.dataset.landrushGrassStreamTrace = JSON.stringify(trace)

  const probe = ensureStylizedGrassRuntimeProbe()
  if (!probe) return
  probe.grassEvents.push(enrichedEvent)
  if (probe.grassEvents.length > 1600) probe.grassEvents.splice(0, probe.grassEvents.length - 1600)
}

function getStylizedGrassStreamRuntimeTrace() {
  const search = window.location.search
  if (!stylizedGrassStreamRuntimeTrace || stylizedGrassStreamRuntimeTrace.search !== search) {
    stylizedGrassStreamRuntimeTrace = {
      activeFadeMax: 0,
      coverageChanges: 0,
      eventCount: 0,
      events: [],
      lateVisibleAddedCells: 0,
      lodChanges: 0,
      residentResets: 0,
      residentUpdates: 0,
      search,
      startedAt: performance.now(),
      visibleRemovedCells: 0,
    }
  }
  return stylizedGrassStreamRuntimeTrace
}

function getStylizedGrassRuntimeProbe() {
  const scopedWindow = window as unknown as {
    __LANDRUSH_ISLAND_RUNTIME_PROBE__?: StylizedGrassRuntimeProbe
  }
  return scopedWindow.__LANDRUSH_ISLAND_RUNTIME_PROBE__ ?? null
}

function recordStylizedGrassPerfSample(
  probe: StylizedGrassPerfProbe,
  sample: Omit<StylizedGrassPerfSample, 'time'>,
) {
  const maxSamples = 1800
  if (probe.samples.length >= maxSamples)
    probe.samples.splice(0, probe.samples.length - maxSamples + 1)
  probe.samples.push({ ...sample, time: performance.now() })
}

useGLTF.preload(STYLIZED_SCENE_PATHS.grassBlades)
