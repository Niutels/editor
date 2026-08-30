import type { LandrushPoint2, LandrushRoadSegment } from '@/components/landrush/types'
import { LANDRUSH_ROBOT_SHOULDER_TORCH_OUTSIDE_ZOMBIE_VISIBILITY } from './landrush-robot-shoulder-torch'

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
  id: string
  phase: number
  position: readonly [number, number, number]
}>

export const LANDRUSH_ZOMBIE_NIGHT_BASE_EXPOSURE = 0.78
export const LANDRUSH_ZOMBIE_NIGHT_SHIPPING_OUTSIDE_TORCH_VISIBILITY = 0.8
export const LANDRUSH_ZOMBIE_NIGHT_WORLD_EXPOSURE_SCALE = 0.5
export const LANDRUSH_ZOMBIE_NIGHT_SEED = 0x4c61_6e64
export const LANDRUSH_ZOMBIE_NIGHT_RESPONSE_PER_SECOND = 1.55

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
    'beacon point lights remain subordinate to the moon key',
  ],
  materialSeparation: ['cool world lighting', 'warm/cyan emissive beacon cores'],
  motion: ['one monotonic day/night envelope', 'subtle deterministic beacon pulse'],
  silhouette: ['player and zombie silhouettes separate from roads and grass'],
  subject: 'Landrush zombie-escape island at night',
})

export const LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS: Readonly<
  Record<LandrushZombieNightQuality, number>
> = {
  balanced: 6,
  high: 8,
  low: 3,
}

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
  groundY,
  quality,
  roads,
  seed = LANDRUSH_ZOMBIE_NIGHT_SEED,
}: {
  groundY: number
  quality: LandrushZombieNightQuality
  roads: readonly LandrushRoadSegment[]
  seed?: number
}): readonly LandrushZombieNightBeaconPlacement[] {
  const roadPoints = roads.flatMap((road) => road.points)
  const center = averagePoint(roadPoints)
  const candidates = roads.flatMap((road) => {
    const progressSamples = road.kind === 'spine' ? [0.2, 0.5, 0.8] : [0.5]
    return progressSamples.flatMap((progress) => {
      const sample = samplePolyline(road.points, progress)
      if (!sample) return []
      const id = `${road.id}:${String(progress)}`
      const hash = mixHash(seed, hashString(id))
      const side = (hash & 1) === 0 ? -1 : 1
      const offset = road.width * 0.5 + 0.72
      return [
        {
          color: (hash % 5 === 0 ? '#69ccff' : '#ffc36e') as '#69ccff' | '#ffc36e',
          id,
          phase: ((hash >>> 0) / 0x1_0000_0000) * Math.PI * 2,
          position: [
            sample.point.x - sample.tangent.z * side * offset,
            groundY,
            sample.point.z + sample.tangent.x * side * offset,
          ] as const,
        },
      ]
    })
  })
  if (candidates.length === 0) return []

  const targetCount = Math.min(candidates.length, LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS[quality])
  const remaining = [...candidates]
  if (remaining.length > targetCount) {
    let centerIndex = 0
    let centerDistance = distanceSquared(remaining[centerIndex]!.position, center)
    for (let index = 1; index < remaining.length; index += 1) {
      const candidate = remaining[index]!
      const candidateDistance = distanceSquared(candidate.position, center)
      if (
        candidateDistance < centerDistance ||
        (candidateDistance === centerDistance && candidate.id < remaining[centerIndex]!.id)
      ) {
        centerIndex = index
        centerDistance = candidateDistance
      }
    }
    remaining.splice(centerIndex, 1)
  }
  const selected: typeof candidates = []
  while (remaining.length > 0 && selected.length < targetCount) {
    let bestIndex = 0
    let bestScore = Number.NEGATIVE_INFINITY
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]!
      const centerDistance = distanceSquared(candidate.position, center)
      const separation =
        selected.length === 0
          ? -centerDistance
          : Math.min(
              ...selected.map((placed) => distanceSquared(candidate.position, placed.position)),
            ) -
            centerDistance * 0.035
      if (
        separation > bestScore ||
        (separation === bestScore && candidate.id < remaining[bestIndex]!.id)
      ) {
        bestIndex = index
        bestScore = separation
      }
    }
    selected.push(remaining.splice(bestIndex, 1)[0]!)
  }
  return selected
}

function samplePolyline(points: readonly LandrushPoint2[], progress: number) {
  const segments = []
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
  const targetLength = clamp01(progress) * totalLength
  let traversed = 0
  for (const segment of segments) {
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
  const last = segments.at(-1)!
  return {
    point: { ...last.end },
    tangent: { x: last.dx / last.length, z: last.dz / last.length },
  }
}

function averagePoint(points: readonly LandrushPoint2[]) {
  if (points.length === 0) return { x: 0, z: 0 }
  const total = points.reduce((sum, point) => ({ x: sum.x + point.x, z: sum.z + point.z }), {
    x: 0,
    z: 0,
  })
  return { x: total.x / points.length, z: total.z / points.length }
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
