'use client'

import { createWorldPolygonSurfaceGeometry } from '@landrush/runtime'
import type { MultiPolygon } from 'polygon-clipping'
import { memo, useEffect, useMemo } from 'react'
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from 'three'
import type { LandrushRoadSegment } from '@/components/landrush/types'
import { createRoundedWorldPolygonBoundaryWallsGeometry } from './natural-road-curb-geometry'
import {
  NATURAL_ROAD_STYLE,
  type NaturalRoadPlan,
  type NaturalRoadQuality,
  type NaturalRoadSeed,
} from './natural-road-plan'
import {
  STYLIZED_PATH_OUTER_CURB_COLOR,
  STYLIZED_PATH_SIDEWALK_COLOR,
} from './stylized-path-network-layer'

export type {
  NaturalRoadGeometryAudit,
  NaturalRoadPlan,
  NaturalRoadQuality,
  NaturalRoadSeed,
  NaturalRoadWidthProbe,
} from './natural-road-plan'
export {
  auditNaturalRoadGeometry,
  createNaturalRoadMaskSegments,
  createNaturalRoadPlan,
  NATURAL_ROAD_STYLE,
} from './natural-road-plan'

export type NaturalRoadDebugMode = 'clearance' | 'final' | 'structure' | 'topology' | 'width-audit'
export type NaturalRoadSidewalkStyle = 'multiplayer-island' | 'natural'

type NaturalRoadGeometryBundle = {
  asphalt: BufferGeometry
  centerDashes: BufferGeometry
  clearance: BufferGeometry
  curbWalls: BufferGeometry
  edgeLines: BufferGeometry
  perimeterTopology: BufferGeometry
  roadAuditFailures: BufferGeometry
  roadAuditJunctions: BufferGeometry
  roadAuditNominal: BufferGeometry
  sidewalks: BufferGeometry
  topology: BufferGeometry
}

export const NATURAL_ROAD_FINAL_DRAW_GROUPS = 5
export const NATURAL_ROAD_FRAME_BUDGET_MS = 3

export const NATURAL_ROAD_VISUAL_CONTRACT = {
  subject: 'A natural animated-style Mediterranean road network following the parcel path graph',
  identity: [
    'soft gray asphalt following the original path centerlines',
    'recessed carriageways that leave a readable curb riser above the road bed',
    'quarter-round warm-stone curb lips with continuous grazing highlights',
    'a slight raised crown on the sidewalk edge facing the road',
    'radius curb returns instead of hard inside corners at intersections',
    'ordinary low warm-stone sidewalks instead of retaining or race walls',
    'a full-width warm-stone promenade around the closed island perimeter',
    'unbroken open mouths at T and four-way intersections',
    'restrained ivory edge lines and dashed centers',
  ],
  invariants: [
    'road node IDs and centerline coordinates match the original parcel-path graph',
    'asphalt is one boolean-unioned footprint, so junctions have a single surface owner',
    'connecting-road sidewalks stop at the promenade inner edge instead of widening its profile',
    'island-perimeter spans contain sidewalk only, with no asphalt or road paint',
    'the perimeter sidewalk extends a constant 1.55 meters inward from the island edge',
    'road sidewalks remain constant-width offsets through every curb return',
    'every sampled carriageway cross-section retains at least the declared road width',
    'straight road boundaries remain parallel and equidistant from their centerline',
    'road, sidewalk, paint, and clearance returns use concentric tangent circular arcs',
    'road-graph classification cannot clip or taper the closed perimeter profile',
    'center markings stop before intersections',
    'final rendering stays at five compiled road draw groups',
  ],
  frameBudgetMs: NATURAL_ROAD_FRAME_BUDGET_MS,
} as const

const NATURAL_ROAD_PALETTES: Record<
  NaturalRoadSeed,
  { asphalt: string; curb: string; paint: string; promenade: string; sidewalk: string }
> = {
  cala: {
    asphalt: '#6b706e',
    curb: '#9f8c70',
    paint: '#ece5d2',
    promenade: '#d8c7aa',
    sidewalk: '#c5ab87',
  },
  capri: {
    asphalt: '#656b6b',
    curb: '#9b886d',
    paint: '#eee6d0',
    promenade: '#d3c1a2',
    sidewalk: '#c1a682',
  },
  corsica: {
    asphalt: '#70716d',
    curb: '#a18d71',
    paint: '#e9e2d1',
    promenade: '#dac9ac',
    sidewalk: '#c8ae8b',
  },
}

export function resolveNaturalRoadDebugMode(
  searchParams: Pick<URLSearchParams, 'get'>,
  fallback: NaturalRoadDebugMode,
): NaturalRoadDebugMode {
  return searchParams.get('naturalRoadDebug') === 'width' ? 'width-audit' : fallback
}

export const NaturalRoadNetworkLayer = memo(function NaturalRoadNetworkLayer({
  debugMode,
  plan,
  renderOrder = 30,
  sidewalkStyle = 'natural',
  visible = true,
}: {
  debugMode: NaturalRoadDebugMode
  plan: NaturalRoadPlan
  renderOrder?: number
  sidewalkStyle?: NaturalRoadSidewalkStyle
  visible?: boolean
}) {
  const geometries = useMemo(
    () => createNaturalRoadGeometryBundle(plan, sidewalkStyle),
    [plan, sidewalkStyle],
  )
  const palette = NATURAL_ROAD_PALETTES[plan.seed]
  const multiplayerSidewalkStyle = sidewalkStyle === 'multiplayer-island'

  useEffect(
    () => () => {
      for (const geometry of Object.values(geometries)) geometry.dispose()
    },
    [geometries],
  )

  if (debugMode === 'clearance') {
    return (
      <group name="natural-road-clearance-debug" visible={visible}>
        <mesh geometry={geometries.clearance} renderOrder={renderOrder}>
          <meshBasicMaterial
            color="#22d3ee"
            depthWrite={false}
            opacity={0.42}
            side={DoubleSide}
            toneMapped={false}
            transparent
          />
        </mesh>
        <lineSegments geometry={geometries.topology} renderOrder={renderOrder + 1}>
          <lineBasicMaterial color="#ecfeff" depthTest={false} toneMapped={false} />
        </lineSegments>
        <lineSegments geometry={geometries.perimeterTopology} renderOrder={renderOrder + 2}>
          <lineBasicMaterial color="#fbbf24" depthTest={false} toneMapped={false} />
        </lineSegments>
      </group>
    )
  }

  if (debugMode === 'structure') {
    return (
      <group name="natural-road-structure-debug" visible={visible}>
        <mesh geometry={geometries.curbWalls} renderOrder={renderOrder}>
          <meshBasicMaterial color="#f59e0b" side={DoubleSide} toneMapped={false} wireframe />
        </mesh>
        <mesh geometry={geometries.sidewalks} renderOrder={renderOrder + 1}>
          <meshBasicMaterial color="#fbbf24" side={DoubleSide} toneMapped={false} wireframe />
        </mesh>
        <mesh geometry={geometries.asphalt} renderOrder={renderOrder + 2}>
          <meshBasicMaterial color="#f8fafc" side={DoubleSide} toneMapped={false} wireframe />
        </mesh>
        <lineSegments geometry={geometries.topology} renderOrder={renderOrder + 3}>
          <lineBasicMaterial color="#38bdf8" depthTest={false} toneMapped={false} />
        </lineSegments>
        <lineSegments geometry={geometries.perimeterTopology} renderOrder={renderOrder + 4}>
          <lineBasicMaterial color="#fbbf24" depthTest={false} toneMapped={false} />
        </lineSegments>
      </group>
    )
  }

  if (debugMode === 'topology') {
    return (
      <group name="natural-road-topology-debug" visible={visible}>
        <mesh geometry={geometries.asphalt} renderOrder={renderOrder}>
          <meshBasicMaterial
            color="#64748b"
            depthWrite={false}
            opacity={0.34}
            side={DoubleSide}
            toneMapped={false}
            transparent
          />
        </mesh>
        <lineSegments geometry={geometries.topology} renderOrder={renderOrder + 1}>
          <lineBasicMaterial color="#f8fafc" depthTest={false} toneMapped={false} />
        </lineSegments>
        <lineSegments geometry={geometries.perimeterTopology} renderOrder={renderOrder + 2}>
          <lineBasicMaterial color="#fbbf24" depthTest={false} toneMapped={false} />
        </lineSegments>
        {plan.nodes
          .filter((node) => node.degree !== 2)
          .map((node) => (
            <mesh
              key={node.id}
              position={[node.position.x, asphaltY(plan) + 0.18, node.position.z]}
              renderOrder={renderOrder + 3}
            >
              <sphereGeometry args={[node.degree >= 3 ? 0.3 : 0.19, 10, 6]} />
              <meshBasicMaterial
                color={node.degree >= 3 ? '#fb7185' : '#a3e635'}
                depthTest={false}
                toneMapped={false}
              />
            </mesh>
          ))}
      </group>
    )
  }

  if (debugMode === 'width-audit') {
    return (
      <group
        name="natural-road-width-audit"
        userData={{ naturalRoadGeometryAudit: plan.roadGeometryAudit }}
        visible={visible}
      >
        <mesh geometry={geometries.asphalt} renderOrder={renderOrder}>
          <meshBasicMaterial
            color="#334155"
            depthWrite={false}
            opacity={0.56}
            side={DoubleSide}
            toneMapped={false}
            transparent
          />
        </mesh>
        <lineSegments geometry={geometries.roadAuditNominal} renderOrder={renderOrder + 1}>
          <lineBasicMaterial color="#22c55e" depthTest={false} toneMapped={false} />
        </lineSegments>
        <lineSegments geometry={geometries.roadAuditJunctions} renderOrder={renderOrder + 2}>
          <lineBasicMaterial color="#38bdf8" depthTest={false} toneMapped={false} />
        </lineSegments>
        <lineSegments geometry={geometries.roadAuditFailures} renderOrder={renderOrder + 3}>
          <lineBasicMaterial color="#ef4444" depthTest={false} toneMapped={false} />
        </lineSegments>
      </group>
    )
  }

  return (
    <group name="natural-road-network" visible={visible}>
      <mesh
        geometry={geometries.curbWalls}
        name="natural-road-curb-walls"
        renderOrder={renderOrder}
      >
        {multiplayerSidewalkStyle ? (
          <meshStandardMaterial
            color={STYLIZED_PATH_OUTER_CURB_COLOR}
            metalness={0}
            roughness={0.82}
            side={DoubleSide}
          />
        ) : (
          <meshStandardMaterial
            color={palette.curb}
            metalness={0}
            roughness={0.96}
            side={DoubleSide}
          />
        )}
      </mesh>
      <mesh
        geometry={geometries.sidewalks}
        name="natural-road-sidewalks"
        renderOrder={renderOrder + 1}
      >
        {multiplayerSidewalkStyle ? (
          <meshBasicMaterial color="#ffffff" side={DoubleSide} toneMapped={false} vertexColors />
        ) : (
          <meshStandardMaterial
            color="#ffffff"
            metalness={0}
            roughness={0.93}
            side={DoubleSide}
            vertexColors
          />
        )}
      </mesh>
      <mesh geometry={geometries.asphalt} name="natural-road-asphalt" renderOrder={renderOrder + 2}>
        <meshStandardMaterial
          color={palette.asphalt}
          metalness={0}
          roughness={0.94}
          side={DoubleSide}
        />
      </mesh>
      <mesh
        geometry={geometries.edgeLines}
        name="natural-road-edge-lines"
        renderOrder={renderOrder + 3}
      >
        <meshStandardMaterial
          color={palette.paint}
          metalness={0}
          roughness={0.96}
          side={DoubleSide}
        />
      </mesh>
      <mesh
        geometry={geometries.centerDashes}
        name="natural-road-center-dashes"
        renderOrder={renderOrder + 4}
      >
        <meshStandardMaterial
          color={palette.paint}
          metalness={0}
          roughness={0.96}
          side={DoubleSide}
        />
      </mesh>
    </group>
  )
})

function createNaturalRoadGeometryBundle(
  plan: NaturalRoadPlan,
  sidewalkStyle: NaturalRoadSidewalkStyle,
): NaturalRoadGeometryBundle {
  const asphaltSurfaceY = asphaltY(plan)
  const sidewalkSurfaceY = sidewalkY(plan)
  const paintY = asphaltSurfaceY + 0.012
  const palette = NATURAL_ROAD_PALETTES[plan.seed]
  const sidewalkColor =
    sidewalkStyle === 'multiplayer-island' ? STYLIZED_PATH_SIDEWALK_COLOR : palette.sidewalk
  const promenadeColor =
    sidewalkStyle === 'multiplayer-island' ? STYLIZED_PATH_SIDEWALK_COLOR : palette.promenade
  const perimeterSidewalkRoadIds = new Set(plan.perimeterSidewalkRoadIds)
  return {
    asphalt: surfaceGeometry(plan.footprints.asphalt, asphaltSurfaceY, 'asphalt'),
    centerDashes: surfaceGeometry(plan.footprints.centerDashes, paintY, 'center-dashes'),
    clearance: surfaceGeometry(
      plan.footprints.clearance,
      plan.groundElevation + 0.025,
      'clearance',
    ),
    curbWalls: roundedBoundaryWallsGeometry(
      [
        {
          area: plan.footprints.outerSidewalk,
          bottomY: plan.groundElevation + 0.018,
          roundoverRadius: NATURAL_ROAD_STYLE.sidewalk.curbRoundoverRadiusMeters,
          topY: sidewalkSurfaceY,
        },
        {
          area: plan.footprints.asphalt,
          bottomY: asphaltSurfaceY,
          roundoverRadius: NATURAL_ROAD_STYLE.sidewalk.curbRoundoverRadiusMeters,
          roadEdgeBumpHeight: NATURAL_ROAD_STYLE.sidewalk.roadEdgeBumpHeightMeters,
          roadEdgeBumpWidth: NATURAL_ROAD_STYLE.sidewalk.roadEdgeBumpWidthMeters,
          topY: sidewalkSurfaceY,
        },
      ],
      'curb-walls',
      plan.quality,
    ),
    edgeLines: surfaceGeometry(plan.footprints.edgeLines, paintY, 'edge-lines'),
    perimeterTopology: topologyGeometry(
      plan,
      plan.roads.filter((road) => perimeterSidewalkRoadIds.has(road.id)),
      'perimeter-topology',
    ),
    roadAuditFailures: roadAuditGeometry(plan, 'failures'),
    roadAuditJunctions: roadAuditGeometry(plan, 'junctions'),
    roadAuditNominal: roadAuditGeometry(plan, 'nominal'),
    sidewalks: layeredSurfaceGeometry(
      [
        { area: plan.footprints.roadSidewalks, color: sidewalkColor },
        { area: plan.footprints.perimeterSidewalk, color: promenadeColor },
      ],
      sidewalkSurfaceY,
      'sidewalks',
    ),
    topology: topologyGeometry(plan, plan.roads, 'topology'),
  }
}

function surfaceGeometry(area: MultiPolygon, y: number, role: string) {
  return layeredSurfaceGeometry([{ area }], y, role)
}

function layeredSurfaceGeometry(
  layers: readonly { area: MultiPolygon; color?: string }[],
  y: number,
  role: string,
) {
  return createWorldPolygonSurfaceGeometry(layers, y, {
    key: 'naturalRoadRole',
    value: role,
  })
}

function roundedBoundaryWallsGeometry(
  bands: readonly {
    area: MultiPolygon
    bottomY: number
    roundoverRadius: number
    roadEdgeBumpHeight?: number
    roadEdgeBumpWidth?: number
    topY: number
  }[],
  role: string,
  quality: NaturalRoadQuality,
) {
  return createRoundedWorldPolygonBoundaryWallsGeometry(bands, {
    profileSegments: quality === 'high' ? 6 : 4,
    role: { key: 'naturalRoadRole', value: role },
  })
}

function roadAuditGeometry(plan: NaturalRoadPlan, layer: 'failures' | 'junctions' | 'nominal') {
  const geometry = new BufferGeometry()
  const positions: number[] = []
  const y = asphaltY(plan) + 0.16
  for (const probe of plan.roadGeometryAudit.probes) {
    const included =
      layer === 'failures'
        ? probe.status === 'non-parallel' || probe.status === 'under-width'
        : layer === 'junctions'
          ? probe.status === 'junction'
          : probe.status === 'nominal'
    if (!included) continue
    positions.push(
      probe.negativeBoundary.x,
      y,
      probe.negativeBoundary.z,
      probe.positiveBoundary.x,
      y,
      probe.positiveBoundary.z,
    )
  }
  if (layer === 'failures') {
    const markerRadius = 0.22
    for (const failure of plan.roadGeometryAudit.boundaryFailures) {
      positions.push(
        failure.point.x - markerRadius,
        y,
        failure.point.z,
        failure.point.x + markerRadius,
        y,
        failure.point.z,
        failure.point.x,
        y,
        failure.point.z - markerRadius,
        failure.point.x,
        y,
        failure.point.z + markerRadius,
      )
    }
  }
  geometry.userData.naturalRoadRole = `road-audit-${layer}`
  if (positions.length > 0) {
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
  }
  return geometry
}

function topologyGeometry(
  plan: NaturalRoadPlan,
  roads: readonly LandrushRoadSegment[],
  role: string,
) {
  const geometry = new BufferGeometry()
  const positions: number[] = []
  const y = asphaltY(plan) + 0.1
  for (const road of roads) {
    for (let index = 0; index < road.points.length - 1; index += 1) {
      const start = road.points[index]
      const end = road.points[index + 1]
      if (!(start && end)) continue
      positions.push(start.x, y, start.z, end.x, y, end.z)
    }
  }
  geometry.userData.naturalRoadRole = role
  if (positions.length > 0) {
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
  }
  return geometry
}

function asphaltY(plan: NaturalRoadPlan) {
  return plan.groundElevation + NATURAL_ROAD_STYLE.carriageway.surfaceOffsetMeters
}

function sidewalkY(plan: NaturalRoadPlan) {
  return asphaltY(plan) + NATURAL_ROAD_STYLE.sidewalk.curbHeightMeters
}
