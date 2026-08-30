export const LANDRUSH_ROBOT_SHOULDER_TORCH_DESIGNS = ['scout', 'sentinel', 'breacher'] as const

export type LandrushRobotShoulderTorchDesign =
  (typeof LANDRUSH_ROBOT_SHOULDER_TORCH_DESIGNS)[number]

export const LANDRUSH_ROBOT_SHOULDER_TORCH_SELECTED_DESIGN =
  'sentinel' satisfies LandrushRobotShoulderTorchDesign
export const LANDRUSH_ROBOT_SHOULDER_TORCH_TEXTURE_RESOLUTION = 8
export const LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_FIN_COUNT = 3
export const LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_LOBE_COUNT = 2
export const LANDRUSH_ROBOT_SHOULDER_TORCH_SPOT_INTENSITY = 148
export const LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_OPACITY = 0.04
export const LANDRUSH_ROBOT_SHOULDER_TORCH_LENS_EMISSIVE_INTENSITY = 5.4
export const LANDRUSH_ROBOT_SHOULDER_TORCH_CONE_ANGLE = 0.34
export const LANDRUSH_ROBOT_SHOULDER_TORCH_PENUMBRA = 0.9
export const LANDRUSH_ROBOT_SHOULDER_TORCH_LOBE_DIVERGENCE_ANGLE = 0.045
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
  const beamTriangles =
    LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_FIN_COUNT * LANDRUSH_ROBOT_SHOULDER_TORCH_BEAM_LOBE_COUNT * 2
  return {
    beamTriangles,
    fixtureTriangles,
    pairFixtureTriangles,
    textureBytes: LANDRUSH_ROBOT_SHOULDER_TORCH_TEXTURE_RESOLUTION ** 2 * 4,
    totalEffectTriangles: pairFixtureTriangles + beamTriangles,
  }
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

export function updateLandrushRobotShoulderTorchLobeTargets(
  leftTarget: { x: number; y: number; z: number },
  rightTarget: { x: number; y: number; z: number },
  centerTarget: Readonly<{ x: number; y: number; z: number }>,
  leftOrigin: Readonly<{ x: number; z: number }>,
  rightOrigin: Readonly<{ x: number; z: number }>,
  aimAngle: number,
  reachMeters: number,
) {
  const angle = Number.isFinite(aimAngle) ? aimAngle : 0
  const reach = Math.max(0, Number.isFinite(reachMeters) ? reachMeters : 0)
  const rightX = Math.cos(angle)
  const rightZ = -Math.sin(angle)
  const sourceSeparation =
    (rightOrigin.x - leftOrigin.x) * rightX + (rightOrigin.z - leftOrigin.z) * rightZ
  const lateralOffset =
    Math.abs(sourceSeparation) * 0.5 +
    Math.tan(LANDRUSH_ROBOT_SHOULDER_TORCH_LOBE_DIVERGENCE_ANGLE) * reach
  leftTarget.x = centerTarget.x - rightX * lateralOffset
  leftTarget.y = centerTarget.y
  leftTarget.z = centerTarget.z - rightZ * lateralOffset
  rightTarget.x = centerTarget.x + rightX * lateralOffset
  rightTarget.y = centerTarget.y
  rightTarget.z = centerTarget.z + rightZ * lateralOffset
  return lateralOffset
}
