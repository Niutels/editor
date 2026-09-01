import type { LandrushPoint2 } from '@/components/landrush/types'
import { LANDRUSH_ROBOT_SHOULDER_TORCH_OUTSIDE_ZOMBIE_VISIBILITY } from './landrush-robot-shoulder-torch'
import {
  createLandrushZombieNightStreetLightpostBaseFootprint,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_BASE_ALONG_ROAD_HALF_WIDTH_METERS,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_BASE_CROSS_ROAD_HALF_WIDTH_METERS,
  resolveLandrushZombieNightStreetLightpostYaw,
} from './landrush-zombie-night-street-lightpost'
import {
  NATURAL_ROAD_STYLE,
  type NaturalRoadPlan,
  naturalRoadSidewalkContainsFootprint,
} from './natural-road-plan'

export type LandrushZombieNightDebugMode = 'final' | 'light-contribution' | 'no-post'
export type LandrushZombieNightQuality = 'balanced' | 'high' | 'low'
export type LandrushZombieNightSurfaceRole = 'curbside' | 'grass-blades' | 'grass-ground'
export type LandrushZombieNightVisibility = 'normal' | 'world50' | 'zombies50'

export type LandrushZombieNightDebugSettings = Readonly<{
  fixedAmount: number | null
  mode: LandrushZombieNightDebugMode
  quality: LandrushZombieNightQuality
  visibility: LandrushZombieNightVisibility
}>

export type LandrushZombieNightBeaconPlacement = Readonly<{
  color: '#69ccff' | '#ffc36e'
  distanceAlongRoadMeters: number
  id: string
  phase: number
  position: readonly [number, number, number]
  roadId: string
  roadOffsetMeters: number
  rotationY: number
  side: -1 | 1
}>

export const LANDRUSH_ZOMBIE_NIGHT_BASE_EXPOSURE = 0.78
export const LANDRUSH_ZOMBIE_NIGHT_SHIPPING_OUTSIDE_TORCH_VISIBILITY = 0.8
export const LANDRUSH_ZOMBIE_NIGHT_WORLD_EXPOSURE_SCALE = 0.5
export const LANDRUSH_ZOMBIE_NIGHT_SEED = 0x4c61_6e64
export const LANDRUSH_ZOMBIE_NIGHT_RESPONSE_PER_SECOND = 1.55
export const LANDRUSH_ZOMBIE_NIGHT_CPU_PRESENTATION_INTERVAL_SECONDS = 1 / 24
export const LANDRUSH_ZOMBIE_NIGHT_TRANSITION_DURATION_SECONDS = 90
export const LANDRUSH_ZOMBIE_NIGHT_SUNSET_RISE_SECONDS = 18
export const LANDRUSH_ZOMBIE_NIGHT_SUNSET_HOLD_END_SECONDS = 28
export const LANDRUSH_ZOMBIE_NIGHT_SUNSET_END_SECONDS = 60

const LANDRUSH_ZOMBIE_NIGHT_VISIBILITY_TREATMENTS = Object.freeze({
  normal: Object.freeze({
    outsideTorchVisibility: LANDRUSH_ZOMBIE_NIGHT_SHIPPING_OUTSIDE_TORCH_VISIBILITY,
    worldExposureScale: LANDRUSH_ZOMBIE_NIGHT_WORLD_EXPOSURE_SCALE,
  }),
  world50: Object.freeze({
    outsideTorchVisibility: 1,
    worldExposureScale: LANDRUSH_ZOMBIE_NIGHT_WORLD_EXPOSURE_SCALE,
  }),
  zombies50: Object.freeze({
    outsideTorchVisibility: LANDRUSH_ROBOT_SHOULDER_TORCH_OUTSIDE_ZOMBIE_VISIBILITY,
    worldExposureScale: 1,
  }),
} satisfies Record<
  LandrushZombieNightVisibility,
  Readonly<{ outsideTorchVisibility: number; worldExposureScale: number }>
>)

export const LANDRUSH_ZOMBIE_NIGHT_VISUAL_CONTRACT = Object.freeze({
  allowedDivergences: [
    'The top-down gameplay camera favors readable pools of light over a visible moon disc.',
    'The island keeps its authored materials instead of rebuilding them for a shared viewer theme.',
  ],
  cameraEnvelope: { design: 24, far: 42, near: 12 },
  frameBudgetMs: 16.7,
  identity: ['cool moon key', 'warm and cyan road beacons', 'deep blue distance haze'],
  invariants: [
    'Zombies, roads, and the player remain readable with additive halos disabled.',
    'Day and night use the same geometry and material instances.',
    'Ground grass, grass blades, and curbsides share the same monotonic night envelope.',
    'Every beacon pulse is deterministic for a fixed time and seed.',
    'The day-to-night envelope is frame-rate independent.',
  ],
  lightingEnvelope: [
    'day remains unchanged at amount zero',
    'moonlight owns silhouettes at amount one',
    'wide downward street-light spots remain subordinate to the moon key',
  ],
  materialSeparation: ['cool world lighting', 'warm/cyan emissive beacon cores'],
  motion: ['one monotonic day/night envelope', 'subtle deterministic beacon pulse'],
  silhouette: ['player and zombie silhouettes separate from roads and grass'],
  subject: 'Landrush zombie-escape island at night',
})

export const LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS: Readonly<
  Record<LandrushZombieNightQuality, number>
> = {
  balanced: 12,
  high: 16,
  low: 8,
}

export const LANDRUSH_ZOMBIE_NIGHT_ACTIVE_LIGHT_COUNTS: Readonly<
  Record<LandrushZombieNightQuality, number>
> = {
  balanced: 4,
  high: 6,
  low: 3,
}

export const LANDRUSH_ZOMBIE_NIGHT_GLOW_DRAW_CALL_BUDGET = 3

export const LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAYOUT = Object.freeze({
  baseAlongRoadHalfWidthMeters:
    LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_BASE_ALONG_ROAD_HALF_WIDTH_METERS,
  baseCrossRoadHalfWidthMeters:
    LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_BASE_CROSS_ROAD_HALF_WIDTH_METERS,
  carriagewayHalfWidthMeters: NATURAL_ROAD_STYLE.carriageway.widthMeters / 2,
  curbOuterClearanceMeters: 0.04,
  endpointMarginMeters: 3,
  longitudinalSpacingMeters: Object.freeze({
    balanced: 6,
    high: 5,
    low: 8,
  } satisfies Record<LandrushZombieNightQuality, number>),
  maximumCount: LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS,
  minimumRoadLengthMeters: 10,
  minimumSpacingMeters: 4.75,
  sidewalkSurfaceOffsetMeters:
    NATURAL_ROAD_STYLE.carriageway.surfaceOffsetMeters +
    NATURAL_ROAD_STYLE.sidewalk.curbHeightMeters,
  sidewalkWidthMeters: NATURAL_ROAD_STYLE.sidewalk.widthMeters,
})

const CURBSIDE_OBJECT_NAMES = new Set([
  'natural-road-curb-walls',
  'natural-road-sidewalks',
  'stylized-path-outer-curb-walls',
  'stylized-path-roadbed-walls',
  'stylized-path-seams',
  'stylized-path-sidewalks',
])

export function resolveLandrushZombieNightSurfaceRole({
  geometryAttributes = [],
  materialName = '',
  objectName = '',
  textureName = '',
}: {
  geometryAttributes?: readonly string[]
  materialName?: string
  objectName?: string
  textureName?: string
}): LandrushZombieNightSurfaceRole | null {
  if (
    objectName === 'landrush-grass-ground' ||
    materialName === 'procedural-stylized-grass-ground' ||
    textureName.startsWith('procedural-stylized-grass-')
  ) {
    return 'grass-ground'
  }
  if (
    objectName === 'landrush-grass-blades' ||
    (geometryAttributes.includes('aFade') &&
      geometryAttributes.includes('aStreamFade') &&
      geometryAttributes.includes('aVariation'))
  ) {
    return 'grass-blades'
  }
  return CURBSIDE_OBJECT_NAMES.has(objectName) ? 'curbside' : null
}

export function parseLandrushZombieNightDebugQuery(
  params: URLSearchParams,
): LandrushZombieNightDebugSettings {
  const modeValue = params.get('zombieNightView')
  const qualityValue = params.get('zombieNightQuality')
  const visibilityValue = params.get('zombieNightVisibility')
  const amountValue = Number(params.get('zombieNightAmount'))
  return {
    fixedAmount:
      params.has('zombieNightAmount') && Number.isFinite(amountValue) ? clamp01(amountValue) : null,
    mode: modeValue === 'light-contribution' || modeValue === 'no-post' ? modeValue : 'final',
    quality: qualityValue === 'high' || qualityValue === 'low' ? qualityValue : 'balanced',
    visibility:
      visibilityValue === 'world50' || visibilityValue === 'zombies50' ? visibilityValue : 'normal',
  }
}

export function shouldPublishLandrushZombieNightDebugSnapshot(params: URLSearchParams) {
  return (
    params.get('bench') === '1' ||
    params.get('zombieNightDebug') === '1' ||
    params.has('zombieNightView') ||
    params.has('zombieNightQuality') ||
    params.has('zombieNightAmount') ||
    params.has('zombieNightVisibility')
  )
}

export function resolveLandrushZombieNightTargetExposure({
  mode,
  nightExposure,
  visibility,
}: {
  mode: LandrushZombieNightDebugMode
  nightExposure: number
  visibility: LandrushZombieNightVisibility
}) {
  if (mode === 'no-post') {
    return visibility === 'world50' ? LANDRUSH_ZOMBIE_NIGHT_WORLD_EXPOSURE_SCALE : 1
  }
  return (
    nightExposure * resolveLandrushZombieNightVisibilityTreatment(visibility).worldExposureScale
  )
}

export function resolveLandrushZombieNightVisibilityTreatment(
  visibility: LandrushZombieNightVisibility,
) {
  return LANDRUSH_ZOMBIE_NIGHT_VISIBILITY_TREATMENTS[visibility]
}

export function advanceLandrushZombieNightAmount(
  current: number,
  target: number,
  deltaSeconds: number,
  responsePerSecond = LANDRUSH_ZOMBIE_NIGHT_RESPONSE_PER_SECOND,
) {
  const delta = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0)
  const response = Math.max(0, Number.isFinite(responsePerSecond) ? responsePerSecond : 0)
  return clamp01(target + (clamp01(current) - clamp01(target)) * Math.exp(-response * delta))
}

export function resolveLandrushZombieNightTimelineAmount(elapsedSeconds: number) {
  const elapsed = normalizeLandrushZombieNightElapsedSeconds(elapsedSeconds)
  return smootherstep01(elapsed / LANDRUSH_ZOMBIE_NIGHT_TRANSITION_DURATION_SECONDS)
}

export function resolveLandrushZombieNightSunsetAmount(elapsedSeconds: number) {
  const elapsed = normalizeLandrushZombieNightElapsedSeconds(elapsedSeconds)
  return (
    smoothstepBetween(0, LANDRUSH_ZOMBIE_NIGHT_SUNSET_RISE_SECONDS, elapsed) *
    (1 -
      smoothstepBetween(
        LANDRUSH_ZOMBIE_NIGHT_SUNSET_HOLD_END_SECONDS,
        LANDRUSH_ZOMBIE_NIGHT_SUNSET_END_SECONDS,
        elapsed,
      ))
  )
}

export function resolveLandrushZombieNightVisualAmount(amount: number, sunsetAmount: number) {
  return Math.max(clamp01(amount), clamp01(sunsetAmount))
}

export function shouldApplyLandrushZombieNightCpuPresentation(
  appliedAmount: number,
  amount: number,
  target: number,
  elapsedSeconds: number,
  nextUpdateAtSeconds: number,
  invalidated: boolean,
) {
  if (invalidated || !Number.isFinite(appliedAmount)) return true
  if (appliedAmount === amount) return false
  return amount === target || elapsedSeconds >= nextUpdateAtSeconds
}

export function resolveLandrushZombieNightBeaconPulse(timeSeconds: number, phase: number) {
  const time = Number.isFinite(timeSeconds) ? timeSeconds : 0
  const offset = Number.isFinite(phase) ? phase : 0
  return 1 + Math.sin(time * 1.93 + offset) * 0.026 + Math.sin(time * 0.47 + offset * 1.71) * 0.014
}

export function resolveLandrushZombieNightBeaconFrameMode(
  previouslyActive: boolean,
  amount: number,
): 'animate' | 'idle' | 'settle' {
  if (clamp01(amount) > 0.001) return 'animate'
  return previouslyActive ? 'settle' : 'idle'
}

export function createLandrushZombieNightBeaconPlacements({
  quality,
  roadPlan,
  seed = LANDRUSH_ZOMBIE_NIGHT_SEED,
}: {
  quality: LandrushZombieNightQuality
  roadPlan: NaturalRoadPlan
  seed?: number
}): readonly LandrushZombieNightBeaconPlacement[] {
  const perimeterRoadIds = new Set(roadPlan.perimeterSidewalkRoadIds)
  const interiorRoads = roadPlan.roads.filter((road) => !perimeterRoadIds.has(road.id))
  const candidates = interiorRoads.flatMap((road) => {
    const measurement = measurePolyline(road.points)
    if (!measurement) return []
    if (
      measurement.totalLength <
      LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAYOUT.minimumRoadLengthMeters
    ) {
      return []
    }
    const endpointMargin = Math.min(
      LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAYOUT.endpointMarginMeters,
      measurement.totalLength * 0.25,
    )
    const usableLength = Math.max(0, measurement.totalLength - endpointMargin * 2)
    const targetSpacing =
      LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAYOUT.longitudinalSpacingMeters[quality]
    const sampleCount = Math.max(1, Math.floor(usableLength / targetSpacing) + 1)
    const actualSpacing = sampleCount > 1 ? usableLength / (sampleCount - 1) : 0
    const startingSide = (mixHash(seed, hashString(road.id)) & 1) === 0 ? -1 : 1

    return Array.from({ length: sampleCount }).flatMap((_, index) => {
      const distanceAlongRoadMeters =
        sampleCount === 1 ? measurement.totalLength * 0.5 : endpointMargin + actualSpacing * index
      const sample = samplePolylineAtDistance(measurement, distanceAlongRoadMeters)
      const id = `${road.id}:${distanceAlongRoadMeters.toFixed(3)}`
      const hash = mixHash(seed, hashString(id))
      const side = (startingSide * (index % 2 === 0 ? 1 : -1)) as -1 | 1
      const roadOffsetMeters =
        LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAYOUT.carriagewayHalfWidthMeters +
        LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAYOUT.sidewalkWidthMeters -
        LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAYOUT.baseCrossRoadHalfWidthMeters -
        LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAYOUT.curbOuterClearanceMeters
      const position = [
        sample.point.x - sample.tangent.z * side * roadOffsetMeters,
        (Number.isFinite(roadPlan.groundElevation) ? roadPlan.groundElevation : 0) +
          LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAYOUT.sidewalkSurfaceOffsetMeters,
        sample.point.z + sample.tangent.x * side * roadOffsetMeters,
      ] as const
      const rotationY = resolveLandrushZombieNightStreetLightpostYaw(
        sample.tangent.x,
        sample.tangent.z,
        side,
      )
      if (
        !naturalRoadSidewalkContainsFootprint(
          roadPlan,
          createLandrushZombieNightStreetLightpostBaseFootprint(position, rotationY),
        )
      ) {
        return []
      }
      return [
        {
          color: (hash % 5 === 0 ? '#69ccff' : '#ffc36e') as '#69ccff' | '#ffc36e',
          distanceAlongRoadMeters,
          id,
          phase: ((hash >>> 0) / 0x1_0000_0000) * Math.PI * 2,
          position,
          roadId: road.id,
          roadOffsetMeters,
          rotationY,
          side,
        },
      ]
    })
  })
  if (candidates.length === 0) return []

  const minimumSpacingSquared =
    LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAYOUT.minimumSpacingMeters ** 2
  const maximumCount = LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS[quality]
  const selected: LandrushZombieNightBeaconPlacement[] = []
  const center = averagePlacementPosition(candidates)
  const remaining = [...candidates]
  while (selected.length < maximumCount && remaining.length > 0) {
    let bestIndex = -1
    let bestScore = Number.NEGATIVE_INFINITY
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]!
      const score =
        selected.length === 0
          ? -distanceSquared(candidate.position, center)
          : Math.min(
              ...selected.map((placement) =>
                distanceSquared(candidate.position, placement.position),
              ),
            )
      if (selected.length > 0 && score < minimumSpacingSquared) continue
      if (
        score > bestScore ||
        (score === bestScore &&
          (bestIndex < 0 ||
            mixHash(seed, hashString(candidate.id)) >
              mixHash(seed, hashString(remaining[bestIndex]!.id))))
      ) {
        bestIndex = index
        bestScore = score
      }
    }
    if (bestIndex < 0) break
    selected.push(remaining.splice(bestIndex, 1)[0]!)
  }
  return selected.sort(
    (left, right) =>
      left.roadId.localeCompare(right.roadId) ||
      left.distanceAlongRoadMeters - right.distanceAlongRoadMeters,
  )
}

export function selectLandrushZombieNightActiveLightPlacements({
  placements,
  quality,
  seed = LANDRUSH_ZOMBIE_NIGHT_SEED,
}: {
  placements: readonly LandrushZombieNightBeaconPlacement[]
  quality: LandrushZombieNightQuality
  seed?: number
}): readonly LandrushZombieNightBeaconPlacement[] {
  const maximumCount = LANDRUSH_ZOMBIE_NIGHT_ACTIVE_LIGHT_COUNTS[quality]
  if (placements.length <= maximumCount) return placements

  const selected: LandrushZombieNightBeaconPlacement[] = []
  const center = averagePlacementPosition(placements)
  const remaining = [...placements]
  while (selected.length < maximumCount) {
    let bestIndex = 0
    let bestScore = Number.NEGATIVE_INFINITY
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]!
      const score =
        selected.length === 0
          ? -distanceSquared(candidate.position, center)
          : minimumPlacementDistanceSquared(candidate, selected)
      if (
        score > bestScore ||
        (score === bestScore &&
          mixHash(seed, hashString(candidate.id)) >
            mixHash(seed, hashString(remaining[bestIndex]!.id)))
      ) {
        bestIndex = index
        bestScore = score
      }
    }
    selected.push(remaining.splice(bestIndex, 1)[0]!)
  }

  return selected.sort(
    (left, right) =>
      left.roadId.localeCompare(right.roadId) ||
      left.distanceAlongRoadMeters - right.distanceAlongRoadMeters,
  )
}

function averagePlacementPosition(placements: readonly LandrushZombieNightBeaconPlacement[]) {
  const total = placements.reduce(
    (sum, placement) => ({
      x: sum.x + placement.position[0],
      z: sum.z + placement.position[2],
    }),
    { x: 0, z: 0 },
  )
  return { x: total.x / placements.length, z: total.z / placements.length }
}

function minimumPlacementDistanceSquared(
  candidate: LandrushZombieNightBeaconPlacement,
  placements: readonly LandrushZombieNightBeaconPlacement[],
) {
  let minimum = Number.POSITIVE_INFINITY
  for (const placement of placements) {
    minimum = Math.min(minimum, distanceSquared(candidate.position, placement.position))
  }
  return minimum
}

type MeasuredPolyline = Readonly<{
  segments: readonly Readonly<{
    dx: number
    dz: number
    end: LandrushPoint2
    length: number
    start: LandrushPoint2
  }>[]
  totalLength: number
}>

function measurePolyline(points: readonly LandrushPoint2[]): MeasuredPolyline | null {
  const segments: MeasuredPolyline['segments'][number][] = []
  let totalLength = 0
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!
    const end = points[index]!
    const dx = end.x - start.x
    const dz = end.z - start.z
    const length = Math.hypot(dx, dz)
    if (length <= 0.000_1) continue
    segments.push({ dx, dz, end, length, start })
    totalLength += length
  }
  if (segments.length === 0) return null
  return { segments, totalLength }
}

function samplePolylineAtDistance(measurement: MeasuredPolyline, distanceMeters: number) {
  const targetLength = Math.max(0, Math.min(measurement.totalLength, distanceMeters))
  let traversed = 0
  for (const segment of measurement.segments) {
    if (traversed + segment.length < targetLength) {
      traversed += segment.length
      continue
    }
    const amount = clamp01((targetLength - traversed) / segment.length)
    return {
      point: {
        x: segment.start.x + segment.dx * amount,
        z: segment.start.z + segment.dz * amount,
      },
      tangent: { x: segment.dx / segment.length, z: segment.dz / segment.length },
    }
  }
  const last = measurement.segments.at(-1)!
  return {
    point: { ...last.end },
    tangent: { x: last.dx / last.length, z: last.dz / last.length },
  }
}

function distanceSquared(
  left: Pick<LandrushPoint2, 'x' | 'z'> | readonly [number, number, number],
  right: Pick<LandrushPoint2, 'x' | 'z'> | readonly [number, number, number],
) {
  const leftX = 'x' in left ? left.x : left[0]
  const leftZ = 'z' in left ? left.z : left[2]
  const rightX = 'x' in right ? right.x : right[0]
  const rightZ = 'z' in right ? right.z : right[2]
  return (leftX - rightX) ** 2 + (leftZ - rightZ) ** 2
}

function hashString(value: string) {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function mixHash(seed: number, value: number) {
  let hash = (seed ^ value) >>> 0
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb_352d)
  hash = Math.imul(hash ^ (hash >>> 15), 0x846c_a68b)
  return (hash ^ (hash >>> 16)) >>> 0
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}

function normalizeLandrushZombieNightElapsedSeconds(value: number) {
  if (value === Number.POSITIVE_INFINITY) return LANDRUSH_ZOMBIE_NIGHT_TRANSITION_DURATION_SECONDS
  return Math.max(0, Number.isFinite(value) ? value : 0)
}

function smoothstepBetween(minimum: number, maximum: number, value: number) {
  const amount = clamp01((value - minimum) / (maximum - minimum))
  return amount * amount * (3 - 2 * amount)
}

function smootherstep01(value: number) {
  const amount = clamp01(value)
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10)
}
