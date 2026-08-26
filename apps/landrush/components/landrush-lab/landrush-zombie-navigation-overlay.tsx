'use client'

import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type BufferGeometry, DoubleSide, DynamicDrawUsage, type Group, Vector3 } from 'three'
import {
  assertZombieEscapeNavigationDebugColoredGeometryCardinality,
  classifyZombieEscapeNavigationDebugAgents,
  countZombieEscapeNavigationDebugDraws,
  countZombieEscapeNavigationDebugTerminalSegments,
  createZombieEscapeNavigationDebugLiveBuffers,
  createZombieEscapeNavigationDebugRouteSnapshot,
  createZombieEscapeNavigationDebugStaticSnapshot,
  resolveZombieEscapeNavigationDebugPlayerLayer,
  updateZombieEscapeNavigationDebugLiveGeometry,
  updateZombieEscapeNavigationDebugTerminalLinks,
  ZOMBIE_ESCAPE_NAVIGATION_DEBUG_FLOOR,
  type ZombieEscapeNavigationDebugLayerGeometry,
  type ZombieEscapeNavigationDebugRouteLayerGeometry,
  type ZombieEscapeNavigationDebugRouteSnapshot,
  zombieEscapeNavigationDebugClassificationIsCurrent,
} from './zombie-escape-navigation-debug-data'
import type { ZombieEscapeSimulation } from './zombie-escape-simulation'

const CLASSIFICATION_INTERVAL_SECONDS = 0.1
const HUD_INTERVAL_SECONDS = 0.22
const HUD_ROWS_PER_PAGE = 16
const SAMPLE_HISTORY_CAPACITY = 64
const EMPTY_FLOAT32 = new Float32Array(0)

export type LandrushZombieNavigationOverlayProps = {
  framePriority: number
  originX: number
  originY: number
  originZ: number
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}

export type LandrushZombieNavigationOverlayDiagnostics = Readonly<{
  activeAgentCount: number
  anomalyCount: number
  collisionWorldGeneration: number
  drawCount: number
  enabled: true
  floorSelection: number
  lastRebuildMs: number
  lastSampleCpuMs: number
  p95RebuildMs: number
  p95SampleCpuMs: number
  routeGeneration: number
  routeStaleReason: string | null
  routeStatus: 'current' | 'stale'
  staticBytes: number
  visibleAgentCount: number
  visibleLayerCount: number
}>

declare global {
  interface Window {
    __LANDRUSH_ZOMBIE_NAV_OVERLAY__?: LandrushZombieNavigationOverlayDiagnostics
  }
}

type SampleHistory = {
  count: number
  cursor: number
  scratch: Float32Array
  values: Float32Array
}

type RouteSnapshotState = Readonly<{
  collisionWorldGeneration: number
  durationMs: number
  snapshot: ZombieEscapeNavigationDebugRouteSnapshot
  staleReason: string | null
  targetLayerIndex: number
  worldRevision: string
}>

type StaticSnapshotState = Readonly<{
  collisionWorldGeneration: number
  durationMs: number
  snapshot: ReturnType<typeof createZombieEscapeNavigationDebugStaticSnapshot>
}>

export default function LandrushZombieNavigationOverlay({
  framePriority,
  originX,
  originY,
  originZ,
  simulationRef,
}: LandrushZombieNavigationOverlayProps) {
  const { camera, size } = useThree()
  const simulation = simulationRef.current
  const [staticSnapshot, setStaticSnapshot] = useState(() => {
    const startedAt = performance.now()
    const snapshot = createZombieEscapeNavigationDebugStaticSnapshot(simulation.collisionWorld)
    return {
      collisionWorldGeneration: simulation.collisionWorldGeneration,
      durationMs: performance.now() - startedAt,
      snapshot,
    } satisfies StaticSnapshotState
  })
  const [routeSnapshot, setRouteSnapshot] = useState(() =>
    tryCreateNavigationDebugRouteSnapshot(simulation),
  )
  const [floorSelection, setFloorSelection] = useState<number>(
    ZOMBIE_ESCAPE_NAVIGATION_DEBUG_FLOOR.auto,
  )
  const [showFallbackRegions, setShowFallbackRegions] = useState(true)
  const [tablePage, setTablePage] = useState(0)
  const [effectiveFloor, setEffectiveFloor] = useState(() =>
    Math.max(0, resolveZombieEscapeNavigationDebugPlayerLayer(simulation)),
  )
  const [hudVisibleCount, setHudVisibleCount] = useState(0)
  const effectiveFloorRef = useRef(effectiveFloor)
  const floorSelectionRef = useRef(floorSelection)
  const showFallbackRegionsRef = useRef(showFallbackRegions)
  const tablePageRef = useRef(tablePage)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nextClassificationAtRef = useRef(Number.NEGATIVE_INFINITY)
  const nextHudAtRef = useRef(Number.NEGATIVE_INFINITY)
  const nextRouteRetryAtRef = useRef(Number.NEGATIVE_INFINITY)
  const worldGenerationRef = useRef(simulation.collisionWorldGeneration)
  const activationRevisionRef = useRef(simulation.collisionWorld.activationRevision)
  const routeGenerationRef = useRef(simulation.navigationTargetCommittedRouteGeneration)
  const routeTargetLayerRef = useRef(simulation.navigationField.targetLayerIndex)
  const routeWorldRevisionRef = useRef(simulation.navigationField.world.revision)
  const liveBuffers = useMemo(
    () =>
      createZombieEscapeNavigationDebugLiveBuffers(
        simulation.zombies.pool.capacity,
        countZombieEscapeNavigationDebugTerminalSegments(routeSnapshot.snapshot),
      ),
    [routeSnapshot.snapshot, simulation],
  )
  const agentGeometryRef = useRef<BufferGeometry>(null)
  const anomalyGeometryRef = useRef<BufferGeometry>(null)
  const geometryRootRef = useRef<Group>(null)
  const linkGeometryRef = useRef<BufferGeometry>(null)
  const projectionScratch = useMemo(() => new Vector3(), [])
  const [sampleHistory] = useState(createSampleHistory)
  const [rebuildHistory] = useState(() => {
    const history = createSampleHistory()
    pushSampleHistory(history, Math.max(staticSnapshot.durationMs, routeSnapshot.durationMs))
    return history
  })
  const lastSampleCpuMsRef = useRef(0)
  const lastRebuildMsRef = useRef(Math.max(staticSnapshot.durationMs, routeSnapshot.durationMs))
  const visibleCountRef = useRef(0)
  const anomalyCountRef = useRef(0)
  const routeStaleReasonRef = useRef(
    resolveNavigationDebugSnapshotStaleReason(simulation, staticSnapshot, routeSnapshot),
  )
  const snapshotsCurrentRef = useRef(routeStaleReasonRef.current === null)

  floorSelectionRef.current = floorSelection
  showFallbackRegionsRef.current = showFallbackRegions
  tablePageRef.current = tablePage

  const publishDiagnostics = useCallback(() => {
    const selectedFloor = resolveSelectedFloor(floorSelectionRef.current, effectiveFloorRef.current)
    const visibleLayers = snapshotsCurrentRef.current
      ? countVisibleLayers(staticSnapshot.snapshot.layers.length, selectedFloor)
      : 0
    window.__LANDRUSH_ZOMBIE_NAV_OVERLAY__ = Object.freeze({
      activeAgentCount: liveBuffers.activeCount,
      anomalyCount: anomalyCountRef.current,
      collisionWorldGeneration: simulation.collisionWorldGeneration,
      drawCount: snapshotsCurrentRef.current
        ? countZombieEscapeNavigationDebugDraws(
            staticSnapshot.snapshot.layers,
            routeSnapshot.snapshot.layers,
            selectedFloor,
            showFallbackRegionsRef.current,
            visibleCountRef.current,
            liveBuffers.linkCount,
            anomalyCountRef.current,
          )
        : 0,
      enabled: true,
      floorSelection: selectedFloor,
      lastRebuildMs: lastRebuildMsRef.current,
      lastSampleCpuMs: lastSampleCpuMsRef.current,
      p95RebuildMs: sampleHistoryPercentile(rebuildHistory, 0.95),
      p95SampleCpuMs: sampleHistoryPercentile(sampleHistory, 0.95),
      routeGeneration: routeSnapshot.snapshot.generation,
      routeStaleReason: routeStaleReasonRef.current,
      routeStatus: routeStaleReasonRef.current === null ? 'current' : 'stale',
      staticBytes: staticSnapshot.snapshot.staticBytes + routeSnapshot.snapshot.routeBytes,
      visibleAgentCount: visibleCountRef.current,
      visibleLayerCount: visibleLayers,
    })
  }, [liveBuffers, rebuildHistory, routeSnapshot, sampleHistory, simulation, staticSnapshot])

  useEffect(() => {
    publishDiagnostics()
    return () => {
      delete window.__LANDRUSH_ZOMBIE_NAV_OVERLAY__
    }
  }, [publishDiagnostics])

  useFrame((state) => {
    const currentSimulation = simulationRef.current
    const now = state.clock.elapsedTime
    let rebuildDurationMs = 0
    let rebuiltStaticWorld = false
    if (
      currentSimulation.collisionWorldGeneration !== worldGenerationRef.current ||
      currentSimulation.collisionWorld.activationRevision !== activationRevisionRef.current
    ) {
      const rebuildStartedAt = performance.now()
      worldGenerationRef.current = currentSimulation.collisionWorldGeneration
      activationRevisionRef.current = currentSimulation.collisionWorld.activationRevision
      const snapshot = createZombieEscapeNavigationDebugStaticSnapshot(
        currentSimulation.collisionWorld,
      )
      const durationMs = performance.now() - rebuildStartedAt
      setStaticSnapshot({
        collisionWorldGeneration: currentSimulation.collisionWorldGeneration,
        durationMs,
        snapshot,
      })
      rebuildDurationMs += durationMs
      rebuiltStaticWorld = true
    }
    const routeWorldRevision = currentSimulation.navigationField.world.revision
    const routeTargetLayer = currentSimulation.navigationField.targetLayerIndex
    const routeNeedsRetry =
      resolveNavigationDebugRouteSnapshotStaleReason(currentSimulation, routeSnapshot) !== null &&
      now >= nextRouteRetryAtRef.current
    if (
      rebuiltStaticWorld ||
      routeNeedsRetry ||
      currentSimulation.navigationTargetCommittedRouteGeneration !== routeGenerationRef.current ||
      routeWorldRevision !== routeWorldRevisionRef.current ||
      routeTargetLayer !== routeTargetLayerRef.current
    ) {
      routeGenerationRef.current = currentSimulation.navigationTargetCommittedRouteGeneration
      routeWorldRevisionRef.current = routeWorldRevision
      routeTargetLayerRef.current = routeTargetLayer
      const nextRouteSnapshot = tryCreateNavigationDebugRouteSnapshot(currentSimulation)
      setRouteSnapshot(nextRouteSnapshot)
      rebuildDurationMs += nextRouteSnapshot.durationMs
      nextRouteRetryAtRef.current =
        nextRouteSnapshot.staleReason === null
          ? Number.POSITIVE_INFINITY
          : now + CLASSIFICATION_INTERVAL_SECONDS
    }
    if (rebuildDurationMs > 0) {
      lastRebuildMsRef.current = rebuildDurationMs
      pushSampleHistory(rebuildHistory, rebuildDurationMs)
    }

    const routeStaleReason = resolveNavigationDebugSnapshotStaleReason(
      currentSimulation,
      staticSnapshot,
      routeSnapshot,
    )
    routeStaleReasonRef.current = routeStaleReason
    snapshotsCurrentRef.current = routeStaleReason === null
    if (geometryRootRef.current) geometryRootRef.current.visible = routeStaleReason === null

    const sampleStartedAt = performance.now()
    let selectedFloor = resolveSelectedFloor(floorSelectionRef.current, effectiveFloorRef.current)
    if (
      now >= nextClassificationAtRef.current ||
      !zombieEscapeNavigationDebugClassificationIsCurrent(currentSimulation, liveBuffers)
    ) {
      classifyZombieEscapeNavigationDebugAgents(currentSimulation, liveBuffers)
      const nextAutoFloor = Math.max(
        0,
        resolveZombieEscapeNavigationDebugPlayerLayer(currentSimulation),
      )
      if (nextAutoFloor !== effectiveFloorRef.current) {
        effectiveFloorRef.current = nextAutoFloor
        setEffectiveFloor(nextAutoFloor)
      }
      selectedFloor = resolveSelectedFloor(floorSelectionRef.current, effectiveFloorRef.current)
      updateZombieEscapeNavigationDebugTerminalLinks(
        currentSimulation.navigationField,
        routeSnapshot.snapshot,
        liveBuffers,
        selectedFloor,
      )
      nextClassificationAtRef.current = now + CLASSIFICATION_INTERVAL_SECONDS
    }

    const live = updateZombieEscapeNavigationDebugLiveGeometry(
      currentSimulation,
      liveBuffers,
      selectedFloor,
    )
    visibleCountRef.current = live.visibleCount
    anomalyCountRef.current = live.visibleAnomalyCount
    updateLiveGeometryDrawRanges(
      agentGeometryRef.current,
      anomalyGeometryRef.current,
      linkGeometryRef.current,
      live,
    )

    const updateHud = now >= nextHudAtRef.current
    if (updateHud) {
      if (live.visibleCount !== hudVisibleCount) setHudVisibleCount(live.visibleCount)
      const nextPageCount = Math.max(1, Math.ceil(live.visibleCount / HUD_ROWS_PER_PAGE))
      if (tablePageRef.current >= nextPageCount) {
        const nextPage = nextPageCount - 1
        tablePageRef.current = nextPage
        setTablePage(nextPage)
      }
      drawNavigationOverlayCanvas({
        camera,
        canvas: canvasRef.current,
        floorSelection: selectedFloor,
        liveBuffers,
        originX,
        originY,
        originZ,
        page: tablePageRef.current,
        projectionScratch,
        routeStaleReason,
        simulation: currentSimulation,
        size,
      })
    }
    const sampleMs = performance.now() - sampleStartedAt
    lastSampleCpuMsRef.current = sampleMs
    pushSampleHistory(sampleHistory, sampleMs)
    if (updateHud) {
      publishDiagnostics()
      nextHudAtRef.current = now + HUD_INTERVAL_SECONDS
    }
  }, framePriority)

  const selectedFloor = resolveSelectedFloor(floorSelection, effectiveFloor)
  const pageCount = Math.max(1, Math.ceil(hudVisibleCount / HUD_ROWS_PER_PAGE))
  const routeStaleReason = resolveNavigationDebugSnapshotStaleReason(
    simulationRef.current,
    staticSnapshot,
    routeSnapshot,
  )
  return (
    <>
      <group
        position={[originX, originY, originZ]}
        ref={geometryRootRef}
        renderOrder={10_000}
        visible={routeStaleReason === null}
      >
        {staticSnapshot.snapshot.layers.map((layer, layerIndex) => (
          <NavigationOverlayLayer
            key={`${staticSnapshot.snapshot.semanticKey}:${String(staticSnapshot.snapshot.activationRevision)}:${String(layerIndex)}`}
            layer={layer}
            route={routeSnapshot.snapshot.layers[layerIndex]}
            showFallbackRegions={showFallbackRegions}
            visible={
              selectedFloor === ZOMBIE_ESCAPE_NAVIGATION_DEBUG_FLOOR.all ||
              selectedFloor === layerIndex
            }
          />
        ))}
        <lineSegments frustumCulled={false} renderOrder={10_001}>
          <bufferGeometry ref={linkGeometryRef}>
            <bufferAttribute
              args={[liveBuffers.linkPositions, 3]}
              attach="attributes-position"
              usage={DynamicDrawUsage}
            />
            <bufferAttribute
              args={[liveBuffers.linkColors, 3]}
              attach="attributes-color"
              usage={DynamicDrawUsage}
            />
          </bufferGeometry>
          <lineBasicMaterial depthTest={false} depthWrite={false} vertexColors />
        </lineSegments>
        <points frustumCulled={false} renderOrder={10_002}>
          <bufferGeometry ref={agentGeometryRef}>
            <bufferAttribute
              args={[liveBuffers.agentPositions, 3]}
              attach="attributes-position"
              usage={DynamicDrawUsage}
            />
            <bufferAttribute
              args={[liveBuffers.agentColors, 3]}
              attach="attributes-color"
              usage={DynamicDrawUsage}
            />
          </bufferGeometry>
          <pointsMaterial
            depthTest={false}
            depthWrite={false}
            size={0.22}
            sizeAttenuation
            vertexColors
          />
        </points>
        <points frustumCulled={false} renderOrder={10_003}>
          <bufferGeometry ref={anomalyGeometryRef}>
            <bufferAttribute
              args={[liveBuffers.anomalyPositions, 3]}
              attach="attributes-position"
              usage={DynamicDrawUsage}
            />
          </bufferGeometry>
          <pointsMaterial color="#ff1744" depthTest={false} depthWrite={false} size={0.38} />
        </points>
      </group>
      <Html fullscreen prepend zIndexRange={[119, 0]}>
        <div
          data-testid="landrush-zombie-navigation-overlay"
          style={{ inset: 0, pointerEvents: 'none', position: 'fixed' }}
        >
          <canvas
            data-testid="landrush-zombie-navigation-status-table"
            ref={canvasRef}
            style={{
              height: '100%',
              inset: 0,
              pointerEvents: 'none',
              position: 'absolute',
              width: '100%',
            }}
          />
          <section
            data-landrush-zombie-navigation-overlay-controls="true"
            onClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onKeyUp={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerMove={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
            style={{
              alignItems: 'center',
              background: 'rgba(2, 6, 23, 0.9)',
              border: '1px solid rgba(103, 232, 249, 0.35)',
              borderRadius: 8,
              color: '#e2e8f0',
              display: 'flex',
              font: '600 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace',
              gap: 8,
              left: 12,
              padding: '7px 9px',
              pointerEvents: 'auto',
              position: 'fixed',
              top: 54,
            }}
          >
            <label htmlFor="landrush-zombie-navigation-floor">Nav floor</label>
            <strong
              data-testid="landrush-zombie-navigation-route-status"
              style={{ color: routeStaleReason === null ? '#86efac' : '#fb7185' }}
              title={routeStaleReason ?? 'Current authenticated route bank'}
            >
              {routeStaleReason === null ? 'route current' : 'route stale'}
            </strong>
            <select
              data-testid="landrush-zombie-navigation-floor-selector"
              id="landrush-zombie-navigation-floor"
              onChange={(event) => setFloorSelection(Number(event.currentTarget.value))}
              value={floorSelection}
            >
              <option value={ZOMBIE_ESCAPE_NAVIGATION_DEBUG_FLOOR.auto}>
                Auto / player ({effectiveFloor + 1})
              </option>
              <option value={ZOMBIE_ESCAPE_NAVIGATION_DEBUG_FLOOR.all}>All</option>
              {staticSnapshot.snapshot.layers.map((layer, index) => (
                <option key={layer.elevation} value={index}>
                  Floor {index + 1} · y {layer.elevation.toFixed(2)}
                </option>
              ))}
            </select>
            <label>
              <input
                checked={showFallbackRegions}
                onChange={(event) => setShowFallbackRegions(event.currentTarget.checked)}
                type="checkbox"
              />{' '}
              fallback regions
            </label>
            <button
              disabled={tablePage <= 0}
              onClick={() => setTablePage((current) => Math.max(0, current - 1))}
              type="button"
            >
              ‹
            </button>
            <span>
              {Math.min(tablePage + 1, pageCount)}/{pageCount}
            </span>
            <button
              disabled={tablePage + 1 >= pageCount}
              onClick={() => setTablePage((current) => Math.min(pageCount - 1, current + 1))}
              type="button"
            >
              ›
            </button>
          </section>
        </div>
      </Html>
    </>
  )
}

function NavigationOverlayLayer({
  layer,
  route,
  showFallbackRegions,
  visible,
}: {
  layer: ZombieEscapeNavigationDebugLayerGeometry
  route: ZombieEscapeNavigationDebugRouteLayerGeometry | undefined
  showFallbackRegions: boolean
  visible: boolean
}) {
  return (
    <group visible={visible}>
      <mesh frustumCulled={false} renderOrder={9_990}>
        <PackedGeometry
          colors={layer.regionTriangleColors}
          drawVertexCount={showFallbackRegions ? undefined : layer.strictRegionVertexCount}
          positions={layer.regionTrianglePositions}
        />
        <meshBasicMaterial
          depthTest={false}
          depthWrite={false}
          opacity={0.16}
          side={DoubleSide}
          transparent
          vertexColors
        />
      </mesh>
      <mesh frustumCulled={false} renderOrder={9_992}>
        <PackedGeometry
          colors={layer.boundaryTriangleColors}
          drawVertexCount={showFallbackRegions ? undefined : layer.strictBoundaryVertexCount}
          positions={layer.boundaryTrianglePositions}
        />
        <meshBasicMaterial
          depthTest={false}
          depthWrite={false}
          opacity={0.95}
          side={DoubleSide}
          transparent
          vertexColors
        />
      </mesh>
      <lineSegments frustumCulled={false} renderOrder={9_994}>
        <PackedGeometry colors={layer.featureLineColors} positions={layer.featureLinePositions} />
        <lineBasicMaterial depthTest={false} depthWrite={false} vertexColors />
      </lineSegments>
      <lineSegments frustumCulled={false} renderOrder={9_996}>
        <PackedGeometry
          colors={route?.lineColors ?? EMPTY_FLOAT32}
          positions={route?.linePositions ?? EMPTY_FLOAT32}
        />
        <lineBasicMaterial depthTest={false} depthWrite={false} vertexColors />
      </lineSegments>
      <points frustumCulled={false} renderOrder={9_998}>
        <PackedGeometry
          drawVertexCount={showFallbackRegions ? undefined : layer.strictRegionOverlapMarkerCount}
          positions={layer.regionOverlapMarkerPositions}
        />
        <pointsMaterial color="#ff1744" depthTest={false} depthWrite={false} size={0.34} />
      </points>
    </group>
  )
}

function PackedGeometry({
  colors,
  drawVertexCount,
  positions,
}: {
  colors?: Float32Array
  drawVertexCount?: number
  positions: Float32Array
}) {
  if (positions.length % 3 !== 0) {
    throw new Error('Zombie Escape navigation debug position geometry is malformed')
  }
  if (colors) assertZombieEscapeNavigationDebugColoredGeometryCardinality(positions, colors)
  return (
    <bufferGeometry
      ref={(geometry) => {
        geometry?.setDrawRange(0, drawVertexCount ?? positions.length / 3)
      }}
    >
      <bufferAttribute args={[positions, 3]} attach="attributes-position" />
      {colors ? <bufferAttribute args={[colors, 3]} attach="attributes-color" /> : null}
    </bufferGeometry>
  )
}

function updateLiveGeometryDrawRanges(
  agents: BufferGeometry | null,
  anomalies: BufferGeometry | null,
  links: BufferGeometry | null,
  counts: ReturnType<typeof createZombieEscapeNavigationDebugLiveBuffers>,
) {
  if (!agents || !links || !anomalies) return
  agents.setDrawRange(0, counts.visibleCount)
  links.setDrawRange(0, counts.linkCount * 2)
  anomalies.setDrawRange(0, counts.visibleAnomalyCount)
  agents.getAttribute('position').needsUpdate = true
  agents.getAttribute('color').needsUpdate = true
  links.getAttribute('position').needsUpdate = true
  links.getAttribute('color').needsUpdate = true
  anomalies.getAttribute('position').needsUpdate = true
}

function drawNavigationOverlayCanvas({
  camera,
  canvas,
  floorSelection,
  liveBuffers,
  originX,
  originY,
  originZ,
  page,
  projectionScratch,
  routeStaleReason,
  simulation,
  size,
}: {
  camera: Parameters<Vector3['project']>[0]
  canvas: HTMLCanvasElement | null
  floorSelection: number
  liveBuffers: ReturnType<typeof createZombieEscapeNavigationDebugLiveBuffers>
  originX: number
  originY: number
  originZ: number
  page: number
  projectionScratch: Vector3
  routeStaleReason: string | null
  simulation: ZombieEscapeSimulation
  size: Readonly<{ height: number; width: number }>
}) {
  if (!canvas || size.width <= 0 || size.height <= 0) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const pixelWidth = Math.max(1, Math.round(size.width * dpr))
  const pixelHeight = Math.max(1, Math.round(size.height * dpr))
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
  const context = canvas.getContext('2d')
  if (!context) return
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, size.width, size.height)
  context.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace'
  context.textBaseline = 'middle'

  let visibleCount = 0
  for (let index = 0; index < liveBuffers.activeCount; index += 1) {
    if (
      floorSelection !== ZOMBIE_ESCAPE_NAVIGATION_DEBUG_FLOOR.all &&
      liveBuffers.classifications[index]!.layerIndex !== floorSelection
    ) {
      continue
    }
    liveBuffers.visibleIndices[visibleCount++] = index
  }
  const pageCount = Math.max(1, Math.ceil(visibleCount / HUD_ROWS_PER_PAGE))
  const safePage = Math.max(0, Math.min(pageCount - 1, page))
  const start = safePage * HUD_ROWS_PER_PAGE
  const end = Math.min(visibleCount, start + HUD_ROWS_PER_PAGE)
  const tableWidth = Math.min(640, Math.max(420, size.width - 24))
  const tableTop = 94
  const rowHeight = 17
  const tableHeight = 34 + (end - start) * rowHeight
  context.fillStyle = 'rgba(2, 6, 23, 0.88)'
  context.fillRect(12, tableTop, tableWidth, tableHeight)
  context.strokeStyle = 'rgba(103, 232, 249, 0.4)'
  context.strokeRect(12.5, tableTop + 0.5, tableWidth - 1, tableHeight - 1)
  context.fillStyle = '#a5f3fc'
  context.fillText(
    `live ${String(liveBuffers.activeCount)} · visible ${String(visibleCount)} · page ${String(safePage + 1)}/${String(pageCount)} · route ${routeStaleReason === null ? 'current' : `STALE ${routeStaleReason}`} · slot:id floor region → next action generations/reasons`,
    22,
    tableTop + 17,
  )

  for (let row = start; row < end; row += 1) {
    const classificationIndex = liveBuffers.visibleIndices[row]!
    const inspection = liveBuffers.classifications[classificationIndex]!
    const slot = inspection.slot
    const y = tableTop + 34 + (row - start) * rowHeight
    context.fillStyle = inspection.anomalyMask === 0 ? '#e2e8f0' : '#ff6b81'
    const next = inspection.nextTargetValid
      ? `${inspection.nextTargetX.toFixed(1)},${inspection.nextTargetY.toFixed(1)},${inspection.nextTargetZ.toFixed(1)}`
      : '—'
    context.fillText(
      `#${String(slot)}:${String(inspection.poolGeneration)} F${String(inspection.layerIndex)} R${String(inspection.regionIndex)} → ${next} ${inspection.action} G[w${String(inspection.worldGeneration)}/r${String(inspection.routeGeneration)}/t${String(inspection.targetRevision)}] pending=${inspection.pending ? '1' : '0'} reasons=0x${inspection.deferredReasonMask.toString(16)} anomaly=0x${inspection.anomalyMask.toString(16)}`,
      22,
      y,
    )

    projectionScratch
      .set(
        simulation.zombies.x[slot]! + originX,
        simulation.zombies.y[slot]! + originY + 0.45,
        simulation.zombies.z[slot]! + originZ,
      )
      .project(camera)
    if (
      projectionScratch.z < -1 ||
      projectionScratch.z > 1 ||
      Math.abs(projectionScratch.x) > 1.15 ||
      Math.abs(projectionScratch.y) > 1.15
    ) {
      continue
    }
    const screenX = (projectionScratch.x * 0.5 + 0.5) * size.width
    const screenY = (-projectionScratch.y * 0.5 + 0.5) * size.height
    const label = `#${String(slot)} F${String(inspection.layerIndex)} R${String(inspection.regionIndex)} ${inspection.action}`
    const labelWidth = context.measureText(label).width + 8
    context.fillStyle = inspection.anomalyMask === 0 ? 'rgba(2,6,23,0.78)' : 'rgba(127,0,24,0.9)'
    context.fillRect(screenX - 3, screenY - 9, labelWidth, 15)
    context.fillStyle = inspection.anomalyMask === 0 ? '#d9f99d' : '#ffffff'
    context.fillText(label, screenX + 1, screenY - 1)
  }
}

function tryCreateNavigationDebugRouteSnapshot(
  simulation: ZombieEscapeSimulation,
): RouteSnapshotState {
  const startedAt = performance.now()
  try {
    const snapshot = createZombieEscapeNavigationDebugRouteSnapshot(simulation.navigationField)
    return {
      collisionWorldGeneration: simulation.collisionWorldGeneration,
      durationMs: performance.now() - startedAt,
      snapshot,
      staleReason: null,
      targetLayerIndex: simulation.navigationField.targetLayerIndex,
      worldRevision: simulation.navigationField.world.revision,
    }
  } catch (error) {
    const world = simulation.navigationField.world
    return {
      collisionWorldGeneration: simulation.collisionWorldGeneration,
      durationMs: performance.now() - startedAt,
      snapshot: {
        generation: simulation.navigationTargetCommittedRouteGeneration,
        layers: world.navigationLayers.map(() => ({
          lineColors: EMPTY_FLOAT32,
          linePositions: EMPTY_FLOAT32,
          terminalAnchorColors: EMPTY_FLOAT32,
          terminalAnchorPositions: EMPTY_FLOAT32,
        })),
        routeBytes: 0,
        targetLayerIndex: simulation.navigationField.targetLayerIndex,
        worldRevision: world.revision,
      },
      staleReason: error instanceof Error ? error.message : 'Unknown route authentication failure',
      targetLayerIndex: simulation.navigationField.targetLayerIndex,
      worldRevision: world.revision,
    }
  }
}

function resolveNavigationDebugRouteSnapshotStaleReason(
  simulation: ZombieEscapeSimulation,
  state: RouteSnapshotState,
) {
  if (state.staleReason !== null) return state.staleReason
  if (state.collisionWorldGeneration !== simulation.collisionWorldGeneration) {
    return 'Zombie Escape navigation debug route collision world changed'
  }
  if (state.snapshot.generation !== simulation.navigationTargetCommittedRouteGeneration) {
    return 'Zombie Escape navigation debug route generation changed'
  }
  if (state.targetLayerIndex !== simulation.navigationField.targetLayerIndex) {
    return 'Zombie Escape navigation debug target layer changed'
  }
  if (state.worldRevision !== simulation.navigationField.world.revision) {
    return 'Zombie Escape navigation debug route world changed'
  }
  return null
}

function resolveNavigationDebugSnapshotStaleReason(
  simulation: ZombieEscapeSimulation,
  staticState: StaticSnapshotState,
  routeState: RouteSnapshotState,
) {
  const world = simulation.collisionWorld
  if (
    staticState.collisionWorldGeneration !== simulation.collisionWorldGeneration ||
    staticState.snapshot.activationRevision !== world.activationRevision ||
    staticState.snapshot.semanticKey !== world.semanticKey ||
    staticState.snapshot.worldRevision !== world.revision
  ) {
    return 'Zombie Escape navigation debug collision snapshot changed'
  }
  return resolveNavigationDebugRouteSnapshotStaleReason(simulation, routeState)
}

function resolveSelectedFloor(floorSelection: number, effectiveFloor: number) {
  return floorSelection === ZOMBIE_ESCAPE_NAVIGATION_DEBUG_FLOOR.auto
    ? effectiveFloor
    : floorSelection
}

function countVisibleLayers(layerCount: number, selectedFloor: number) {
  return selectedFloor === ZOMBIE_ESCAPE_NAVIGATION_DEBUG_FLOOR.all
    ? layerCount
    : selectedFloor >= 0 && selectedFloor < layerCount
      ? 1
      : 0
}

function createSampleHistory(): SampleHistory {
  return {
    count: 0,
    cursor: 0,
    scratch: new Float32Array(SAMPLE_HISTORY_CAPACITY),
    values: new Float32Array(SAMPLE_HISTORY_CAPACITY),
  }
}

function pushSampleHistory(history: SampleHistory, value: number) {
  history.values[history.cursor] = value
  history.cursor = (history.cursor + 1) % history.values.length
  history.count = Math.min(history.values.length, history.count + 1)
}

function sampleHistoryPercentile(history: SampleHistory, percentile: number) {
  if (history.count === 0) return 0
  for (let index = 0; index < history.count; index += 1) {
    history.scratch[index] = history.values[index]!
  }
  const samples = history.scratch.subarray(0, history.count)
  samples.sort()
  return samples[Math.min(samples.length - 1, Math.floor((samples.length - 1) * percentile))]!
}
