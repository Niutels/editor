import {
  ZOMBIE_ESCAPE_WEAPON_CATALOG,
  type ZombieEscapeWeaponId,
  type ZombieEscapeWeaponSpecification,
} from './zombie-escape-weapon-catalog'

export type WeaponFitCameraBookmark = 'near' | 'design' | 'far'
export type WeaponFitDominantHand = 'left' | 'right'
export type WeaponFitGripMode = 'one-hand' | 'two-hand'

export type WeaponFitTransform = {
  offsetX: number
  offsetY: number
  offsetZ: number
  rotationX: number
  rotationY: number
  rotationZ: number
  scale: number
}

export type WeaponFitTransformKey = keyof WeaponFitTransform

export type WeaponFitDebugSettings = {
  cameraBookmark: WeaponFitCameraBookmark
  dominantHand: WeaponFitDominantHand
  gripMode: WeaponFitGripMode
  showAxes: boolean
  showBounds: boolean
  showSkeleton: boolean
  transform: WeaponFitTransform
  weaponId: ZombieEscapeWeaponId
}

export type WeaponAssetDiagnostic = {
  message: string
  normalizationScale: number | null
  sourceSize: readonly [number, number, number] | null
  status: 'loading' | 'loaded' | 'fallback'
  url: string
}

export type WeaponArmDiagnostic = {
  activeGrip: boolean
  elbowAngleDegrees: number
  fit: 'good' | 'near-limit' | 'overextended'
  maximumReachMeters: number
  reachMeters: number
  reachRatio: number
  side: WeaponFitDominantHand
}

export type WeaponFitDebugDiagnostics = {
  arms: {
    dominant: WeaponArmDiagnostic
    support: WeaponArmDiagnostic
  }
  asset: WeaponAssetDiagnostic
  bounds: {
    center: readonly [number, number, number]
    radius: number
    size: readonly [number, number, number]
  }
  camera: {
    bookmark: WeaponFitCameraBookmark
    distance: number
    far: number
    fov: number
    near: number
  }
  grips: {
    catalogHasSecondary: boolean
    primaryErrorMeters: number
    secondaryErrorMeters: number | null
  }
  rendering: {
    drawCalls: number
    postProcessPasses: 0
    triangles: number
  }
}

export const WEAPON_FIT_DEBUG_WEAPONS = ZOMBIE_ESCAPE_WEAPON_CATALOG

export const WEAPON_FIT_TRANSFORM_LIMITS = {
  offsetX: { label: 'X', maximum: 0.35, minimum: -0.35, step: 0.005, unit: 'm' },
  offsetY: { label: 'Y', maximum: 0.35, minimum: -0.35, step: 0.005, unit: 'm' },
  offsetZ: { label: 'Z', maximum: 0.35, minimum: -0.35, step: 0.005, unit: 'm' },
  rotationX: { label: 'Pitch', maximum: 180, minimum: -180, step: 1, unit: '°' },
  rotationY: { label: 'Yaw', maximum: 180, minimum: -180, step: 1, unit: '°' },
  rotationZ: { label: 'Roll', maximum: 180, minimum: -180, step: 1, unit: '°' },
  scale: { label: 'Scale', maximum: 1.75, minimum: 0.35, step: 0.01, unit: '×' },
} as const satisfies Record<
  WeaponFitTransformKey,
  { label: string; maximum: number; minimum: number; step: number; unit: string }
>

const DEFAULT_WEAPON = WEAPON_FIT_DEBUG_WEAPONS[0]
const VALID_WEAPON_IDS = new Set<string>(WEAPON_FIT_DEBUG_WEAPONS.map(({ id }) => id))

export function createDefaultWeaponFitTransform(): WeaponFitTransform {
  return {
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    scale: 1,
  }
}

export function createDefaultWeaponFitSettings(): WeaponFitDebugSettings {
  return {
    cameraBookmark: 'design',
    dominantHand: 'right',
    gripMode: DEFAULT_WEAPON.wield,
    showAxes: false,
    showBounds: false,
    showSkeleton: false,
    transform: createDefaultWeaponFitTransform(),
    weaponId: DEFAULT_WEAPON.id,
  }
}

export function createDefaultWeaponFitDiagnostics(
  settings = createDefaultWeaponFitSettings(),
): WeaponFitDebugDiagnostics {
  const weapon = getWeaponFitDebugWeapon(settings.weaponId)
  const supportSide = settings.dominantHand === 'right' ? 'left' : 'right'
  const emptyArm = (side: WeaponFitDominantHand, activeGrip: boolean): WeaponArmDiagnostic => ({
    activeGrip,
    elbowAngleDegrees: 0,
    fit: 'good',
    maximumReachMeters: 0.72,
    reachMeters: 0,
    reachRatio: 0,
    side,
  })

  return {
    arms: {
      dominant: emptyArm(settings.dominantHand, true),
      support: emptyArm(supportSide, settings.gripMode === 'two-hand'),
    },
    asset: {
      message: 'Waiting for scene initialization.',
      normalizationScale: null,
      sourceSize: null,
      status: 'loading',
      url: weapon.assetPath,
    },
    bounds: {
      center: [0, 1.35, -0.2],
      radius: 0.8,
      size: [1.1, 1.2, 1.4],
    },
    camera: {
      bookmark: settings.cameraBookmark,
      distance: 2.5,
      far: 30,
      fov: 42,
      near: 0.02,
    },
    grips: {
      catalogHasSecondary: weapon.grip.secondaryAnchorMeters !== null,
      primaryErrorMeters: 0,
      secondaryErrorMeters: weapon.grip.secondaryAnchorMeters ? 0 : null,
    },
    rendering: {
      drawCalls: 0,
      postProcessPasses: 0,
      triangles: 0,
    },
  }
}

export function getWeaponFitDebugWeapon(id: ZombieEscapeWeaponId): ZombieEscapeWeaponSpecification {
  return (WEAPON_FIT_DEBUG_WEAPONS.find((weapon) => weapon.id === id) ??
    DEFAULT_WEAPON) as ZombieEscapeWeaponSpecification
}

export function isWeaponFitDebugWeaponId(value: string | null): value is ZombieEscapeWeaponId {
  return value !== null && VALID_WEAPON_IDS.has(value)
}

export function changeWeaponFitDebugWeapon(
  settings: WeaponFitDebugSettings,
  weaponId: ZombieEscapeWeaponId,
): WeaponFitDebugSettings {
  const weapon = getWeaponFitDebugWeapon(weaponId)
  return {
    ...settings,
    gripMode: weapon.wield,
    transform: createDefaultWeaponFitTransform(),
    weaponId,
  }
}

export function parseWeaponFitDebugParams(
  params: Pick<URLSearchParams, 'get'>,
): WeaponFitDebugSettings {
  const defaults = createDefaultWeaponFitSettings()
  const candidateWeaponId = params.get('weapon')
  const weaponId = isWeaponFitDebugWeaponId(candidateWeaponId)
    ? candidateWeaponId
    : defaults.weaponId
  const weapon = getWeaponFitDebugWeapon(weaponId)

  return {
    cameraBookmark: readChoice(params, 'cam', ['near', 'design', 'far'], 'design'),
    dominantHand: readChoice(params, 'hand', ['left', 'right'], 'right'),
    gripMode: readChoice(params, 'grip', ['one-hand', 'two-hand'], weapon.wield),
    showAxes: readBoolean(params, 'axes', defaults.showAxes),
    showBounds: readBoolean(params, 'bounds', defaults.showBounds),
    showSkeleton: readBoolean(params, 'skeleton', defaults.showSkeleton),
    transform: {
      offsetX: readTransformNumber(params, 'tx', 'offsetX'),
      offsetY: readTransformNumber(params, 'ty', 'offsetY'),
      offsetZ: readTransformNumber(params, 'tz', 'offsetZ'),
      rotationX: readTransformNumber(params, 'rx', 'rotationX'),
      rotationY: readTransformNumber(params, 'ry', 'rotationY'),
      rotationZ: readTransformNumber(params, 'rz', 'rotationZ'),
      scale: readTransformNumber(params, 'scale', 'scale'),
    },
    weaponId,
  }
}

export function serializeWeaponFitDebugParams(settings: WeaponFitDebugSettings): URLSearchParams {
  const params = new URLSearchParams()
  params.set('weapon', settings.weaponId)
  params.set('grip', settings.gripMode)
  params.set('hand', settings.dominantHand)
  params.set('cam', settings.cameraBookmark)
  params.set('skeleton', settings.showSkeleton ? '1' : '0')
  params.set('axes', settings.showAxes ? '1' : '0')
  params.set('bounds', settings.showBounds ? '1' : '0')
  params.set('tx', formatParameterNumber(settings.transform.offsetX))
  params.set('ty', formatParameterNumber(settings.transform.offsetY))
  params.set('tz', formatParameterNumber(settings.transform.offsetZ))
  params.set('rx', formatParameterNumber(settings.transform.rotationX))
  params.set('ry', formatParameterNumber(settings.transform.rotationY))
  params.set('rz', formatParameterNumber(settings.transform.rotationZ))
  params.set('scale', formatParameterNumber(settings.transform.scale))
  return params
}

function readBoolean(
  params: Pick<URLSearchParams, 'get'>,
  key: string,
  fallback: boolean,
): boolean {
  const value = params.get(key)
  if (value === '1') return true
  if (value === '0') return false
  return fallback
}

function readChoice<const T extends string>(
  params: Pick<URLSearchParams, 'get'>,
  key: string,
  choices: readonly T[],
  fallback: T,
): T {
  const value = params.get(key)
  return value !== null && choices.includes(value as T) ? (value as T) : fallback
}

function readTransformNumber(
  params: Pick<URLSearchParams, 'get'>,
  parameter: string,
  key: WeaponFitTransformKey,
): number {
  const limits = WEAPON_FIT_TRANSFORM_LIMITS[key]
  const fallback = key === 'scale' ? 1 : 0
  const rawValue = params.get(parameter)
  if (rawValue === null || rawValue.trim() === '') return fallback
  const parsed = Number(rawValue)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(limits.maximum, Math.max(limits.minimum, parsed))
}

function formatParameterNumber(value: number): string {
  return Number(value.toFixed(4)).toString()
}
