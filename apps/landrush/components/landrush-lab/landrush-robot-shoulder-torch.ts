export const LANDRUSH_ROBOT_SHOULDER_TORCH_DESIGNS = ['scout', 'sentinel', 'breacher'] as const

export type LandrushRobotShoulderTorchDesign =
  (typeof LANDRUSH_ROBOT_SHOULDER_TORCH_DESIGNS)[number]

export const LANDRUSH_ROBOT_SHOULDER_TORCH_SELECTED_DESIGN =
  'sentinel' satisfies LandrushRobotShoulderTorchDesign
export const LANDRUSH_ROBOT_SHOULDER_TORCH_TEXTURE_RESOLUTION = 8
export const LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_ALPHA_TEXTURE_RESOLUTION = 128
export const LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_FEED_COUNT = 2
export const LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_BODY_COUNT = 1
export const LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_SURFACE_TRIANGLE_COUNT = 4
export const LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_MERGE_DISTANCE = 0.8
export const LANDRUSH_ROBOT_SHOULDER_TORCH_SPOT_INTENSITY = 148
export const LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_OPACITY = 0.04
export const LANDRUSH_ROBOT_SHOULDER_TORCH_LENS_EMISSIVE_INTENSITY = 5.4
export const LANDRUSH_ROBOT_SHOULDER_TORCH_CONE_ANGLE = 0.34
export const LANDRUSH_ROBOT_SHOULDER_TORCH_PENUMBRA = 0.9
export const LANDRUSH_ROBOT_SHOULDER_TORCH_DISTANCE = 8.4
export const LANDRUSH_ROBOT_SHOULDER_TORCH_OUTSIDE_ZOMBIE_VISIBILITY = 0.5

export type LandrushRobotShoulderTorchLightingState = {
  active: boolean
  originX: number
  originY: number
  originZ: number
  targetX: number
  targetY: number
  targetZ: number
}

export type LandrushRobotShoulderTorchContribution = Readonly<{
  beamOpacity: number
  fixtureOpacity: number
  lensEmissiveIntensity: number
  lightIntensity: number
}>

const FIXTURE_TRIANGLES = {
  breacher: 92,
  scout: 116,
  sentinel: 132,
} as const satisfies Record<LandrushRobotShoulderTorchDesign, number>

export function createLandrushRobotShoulderTorchLightingState(): LandrushRobotShoulderTorchLightingState {
  return {
    active: false,
    originX: 0,
    originY: 0,
    originZ: 0,
    targetX: 0,
    targetY: 0,
    targetZ: 1,
  }
}

export function updateLandrushRobotShoulderTorchLightingState(
  state: LandrushRobotShoulderTorchLightingState,
  active: boolean,
  origin: Readonly<{ x: number; y: number; z: number }>,
  target: Readonly<{ x: number; y: number; z: number }>,
) {
  state.active = active
  state.originX = origin.x
  state.originY = origin.y
  state.originZ = origin.z
  state.targetX = target.x
  state.targetY = target.y
  state.targetZ = target.z
  return state
}

export const LANDRUSH_ROBOT_SHOULDER_TORCH_DESIGN_LABELS = {
  breacher: {
    name: 'Breacher bar',
    summary: 'Low-profile twin lens · widest spill',
  },
  scout: {
    name: 'Scout gimbal',
    summary: 'Round pod · lightest silhouette',
  },
  sentinel: {
    name: 'Sentinel Mk II',
    summary: 'Armored hex bezel · selected',
  },
} as const satisfies Record<LandrushRobotShoulderTorchDesign, { name: string; summary: string }>

export function resolveLandrushRobotShoulderTorchContribution({
  active,
  emitSpotLights,
  showBeams,
  showFixtures,
}: {
  active: boolean
  emitSpotLights: boolean
  showBeams: boolean
  showFixtures: boolean
}): LandrushRobotShoulderTorchContribution {
  return {
    beamOpacity: active && showBeams ? LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_OPACITY : 0,
    fixtureOpacity: active && showFixtures ? 1 : 0,
    lensEmissiveIntensity:
      active && showFixtures ? LANDRUSH_ROBOT_SHOULDER_TORCH_LENS_EMISSIVE_INTENSITY : 0,
    lightIntensity: active && emitSpotLights ? LANDRUSH_ROBOT_SHOULDER_TORCH_SPOT_INTENSITY : 0,
  }
}

export function resolveLandrushRobotShoulderTorchGeometryBudget(
  design: LandrushRobotShoulderTorchDesign = LANDRUSH_ROBOT_SHOULDER_TORCH_SELECTED_DESIGN,
) {
  const fixtureTriangles = FIXTURE_TRIANGLES[design]
  const pairFixtureTriangles = fixtureTriangles * 2
  const beamTriangles = LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_SURFACE_TRIANGLE_COUNT
  const fixtureTextureBytes = LANDRUSH_ROBOT_SHOULDER_TORCH_TEXTURE_RESOLUTION ** 2 * 4
  const beamAlphaTextureBytes = resolveLandrushRobotShoulderTorchRgbaMipChainBytes(
    LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_ALPHA_TEXTURE_RESOLUTION,
  )
  return {
    beamAlphaTextureBytes,
    beamTriangles,
    fixtureTextureBytes,
    fixtureTriangles,
    pairFixtureTriangles,
    textureBytes: fixtureTextureBytes + beamAlphaTextureBytes,
    totalEffectTriangles: pairFixtureTriangles + beamTriangles,
  }
}

function resolveLandrushRobotShoulderTorchRgbaMipChainBytes(resolution: number) {
  let bytes = 0
  for (let size = resolution; size >= 1; size = Math.floor(size / 2)) bytes += size * size * 4
  return bytes
}

export function updateLandrushRobotShoulderTorchGroundTarget(
  target: { x: number; y: number; z: number },
  aimAngle: number,
  groundY: number,
  reachMeters: number,
  robotX: number,
  robotZ: number,
) {
  const reach = Math.max(0, Number.isFinite(reachMeters) ? reachMeters : 0)
  const angle = Number.isFinite(aimAngle) ? aimAngle : 0
  target.x = robotX + Math.sin(angle) * reach
  target.y = groundY + 0.035
  target.z = robotZ + Math.cos(angle) * reach
  return target
}

export function updateLandrushRobotShoulderTorchMergeTarget(
  mergeTarget: { x: number; y: number; z: number },
  beamOrigin: Readonly<{ x: number; y: number; z: number }>,
  beamTarget: Readonly<{ x: number; y: number; z: number }>,
  mergeDistanceMeters: number,
) {
  const deltaX = beamTarget.x - beamOrigin.x
  const deltaY = beamTarget.y - beamOrigin.y
  const deltaZ = beamTarget.z - beamOrigin.z
  const beamLength = Math.hypot(deltaX, deltaY, deltaZ)
  if (beamLength <= 0.000_001) {
    mergeTarget.x = beamOrigin.x
    mergeTarget.y = beamOrigin.y
    mergeTarget.z = beamOrigin.z
    return mergeTarget
  }
  const requestedDistance = Math.max(
    0,
    Number.isFinite(mergeDistanceMeters) ? mergeDistanceMeters : 0,
  )
  const progress = Math.min(1, requestedDistance / beamLength)
  mergeTarget.x = beamOrigin.x + deltaX * progress
  mergeTarget.y = beamOrigin.y + deltaY * progress
  mergeTarget.z = beamOrigin.z + deltaZ * progress
  return mergeTarget
}
