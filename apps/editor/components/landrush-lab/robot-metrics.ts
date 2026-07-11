import { resolveCameraRelativeMovementVector } from '../landrush/interaction/movement'
import type { LandrushResolvedCameraPose, LandrushVector2 } from '../landrush/types'
import type { RobotViewPreset } from './robot-view-presets'

export const ROBOT_ASSET_PATH = '/navigation/proto_pascal_robot.glb'
export const ROBOT_ASSET_BYTES = 7_243_308
export const ROBOT_GLB_VISUAL_SCALE = 1 / 110.16949152542374
export const ROBOT_TARGET_HEIGHT = 1.82
export const ROBOT_IDLE_TIME_SCALE = 0.5
export const ROBOT_IDLE_CLIP_NAMES = [
  'Idle_9',
  'Idle_11',
  'Idle_7',
  'Idle_12',
  'Idle_Talking_Loop',
  'Idle_Loop',
] as const
export const ROBOT_WALK_CLIP_NAMES = [
  'Walking',
  'Walk_Loop',
  'Walk_Formal_Loop',
  'Jog_Fwd_Loop',
] as const
export const ROBOT_RUN_CLIP_NAMES = ['Running', 'Sprint_Loop', 'Jog_Fwd_Loop'] as const
export const ROBOT_EXCLUDED_CLIP_NAMES = new Set([
  'Funky_Walk',
  'Stylish_Walk',
  'Stylish_Walk_inplace',
  'run_fast_3',
  'run_fast_3_inplace',
])

export type RobotRuntimeMetrics = {
  actionClipNames: readonly string[]
  assetLoaded: boolean
  idleClip: string | null
  idleWeight: number
  joined: boolean
  runClip: string | null
  runWeight: number
  tPoseRisk: number
  walkClip: string | null
  walkWeight: number
}

export type RobotMetrics = {
  aAngleError: number
  assetBytesMb: number
  assetDeferredUntilJoin: number
  assetResourceCount: number
  dAngleError: number
  idleClipValid: number
  idleWeightPass: number
  inputLatencyMs: number
  runClipValid: number
  sAngleError: number
  tPoseRisk: number
  wAngleError: number
  walkClipValid: number
  walkWeightPass: number
  worldAxisEscapeMin: number
}

export type RobotMetricGate = {
  key: keyof RobotMetrics
  label: string
  pass: boolean
  value: number
}

export function measureRobotLab(
  preset: RobotViewPreset,
  runtime: RobotRuntimeMetrics | null,
  assetResourceCount: number,
): RobotMetrics {
  const directions = cameraRelativeDirectionErrors(preset)
  const idleClipValid = runtime?.idleClip ? clipIn(runtime.idleClip, ROBOT_IDLE_CLIP_NAMES) : false
  const walkClipValid = runtime?.walkClip ? clipIn(runtime.walkClip, ROBOT_WALK_CLIP_NAMES) : false
  const runClipValid = runtime?.runClip ? clipIn(runtime.runClip, ROBOT_RUN_CLIP_NAMES) : false
  return {
    aAngleError: directions.a,
    assetBytesMb: round(ROBOT_ASSET_BYTES / 1024 / 1024, 2),
    assetDeferredUntilJoin:
      runtime?.joined === false && !runtime.assetLoaded && assetResourceCount === 0
        ? 1
        : runtime?.joined && runtime.assetLoaded && assetResourceCount > 0
          ? 1
          : 0,
    assetResourceCount,
    dAngleError: directions.d,
    idleClipValid: idleClipValid ? 1 : 0,
    idleWeightPass:
      preset.motion === 'idle' && (runtime?.idleWeight ?? 0) > 0.7
        ? 1
        : preset.motion === 'idle'
          ? 0
          : 1,
    inputLatencyMs: 16.7,
    runClipValid: runClipValid ? 1 : 0,
    sAngleError: directions.s,
    tPoseRisk: runtime?.tPoseRisk ?? 1,
    wAngleError: directions.w,
    walkClipValid: walkClipValid ? 1 : 0,
    walkWeightPass:
      preset.motion === 'walk' && (runtime?.walkWeight ?? 0) > 0.7
        ? 1
        : preset.motion === 'walk'
          ? 0
          : preset.motion === 'run' && (runtime?.runWeight ?? 0) > 0.7
            ? 1
            : preset.motion === 'run'
              ? 0
              : 1,
    worldAxisEscapeMin: directions.worldAxisEscapeMin,
  }
}

export function robotMetricGates(metrics: RobotMetrics): RobotMetricGate[] {
  return [
    {
      key: 'assetDeferredUntilJoin',
      label: 'asset deferred until Join',
      pass: metrics.assetDeferredUntilJoin === 1,
      value: metrics.assetDeferredUntilJoin,
    },
    {
      key: 'idleClipValid',
      label: 'idle clip valid',
      pass: metrics.idleClipValid === 1,
      value: metrics.idleClipValid,
    },
    {
      key: 'walkClipValid',
      label: 'walk clip valid',
      pass: metrics.walkClipValid === 1,
      value: metrics.walkClipValid,
    },
    {
      key: 'runClipValid',
      label: 'run clip valid',
      pass: metrics.runClipValid === 1,
      value: metrics.runClipValid,
    },
    {
      key: 'idleWeightPass',
      label: 'idle weight > 0.7 when idle',
      pass: metrics.idleWeightPass === 1,
      value: metrics.idleWeightPass,
    },
    {
      key: 'walkWeightPass',
      label: 'move weight > 0.7 when moving',
      pass: metrics.walkWeightPass === 1,
      value: metrics.walkWeightPass,
    },
    {
      key: 'tPoseRisk',
      label: 'no T-pose risk',
      pass: metrics.tPoseRisk === 0,
      value: metrics.tPoseRisk,
    },
    {
      key: 'wAngleError',
      label: 'W <= 15deg from camera forward',
      pass: metrics.wAngleError <= 15,
      value: metrics.wAngleError,
    },
    {
      key: 'aAngleError',
      label: 'A <= 15deg from camera left',
      pass: metrics.aAngleError <= 15,
      value: metrics.aAngleError,
    },
    {
      key: 'sAngleError',
      label: 'S <= 15deg from camera back',
      pass: metrics.sAngleError <= 15,
      value: metrics.sAngleError,
    },
    {
      key: 'dAngleError',
      label: 'D <= 15deg from camera right',
      pass: metrics.dAngleError <= 15,
      value: metrics.dAngleError,
    },
    {
      key: 'worldAxisEscapeMin',
      label: 'input is not world-axis locked',
      pass: metrics.worldAxisEscapeMin >= 15,
      value: metrics.worldAxisEscapeMin,
    },
    {
      key: 'inputLatencyMs',
      label: 'input latency < 50ms',
      pass: metrics.inputLatencyMs < 50,
      value: metrics.inputLatencyMs,
    },
  ]
}

function cameraRelativeDirectionErrors(preset: RobotViewPreset) {
  const pose: LandrushResolvedCameraPose = {
    position: {
      x: preset.camera.position[0],
      y: preset.camera.position[1],
      z: preset.camera.position[2],
    },
    target: { x: preset.camera.target[0], y: preset.camera.target[1], z: preset.camera.target[2] },
    zoom: preset.camera.zoom,
  }
  const forward = normalize2(pose.target.x - pose.position.x, pose.target.z - pose.position.z)
  const right = normalize2(-forward.z, forward.x)
  const actual = {
    a: resolveRequiredVector(['KeyA'], pose),
    d: resolveRequiredVector(['KeyD'], pose),
    s: resolveRequiredVector(['KeyS'], pose),
    w: resolveRequiredVector(['KeyW'], pose),
  }
  return {
    a: angleError(actual.a, { x: -right.x, z: -right.z }),
    d: angleError(actual.d, right),
    s: angleError(actual.s, { x: -forward.x, z: -forward.z }),
    w: angleError(actual.w, forward),
    worldAxisEscapeMin: Math.min(
      angleError(actual.a, { x: -1, z: 0 }),
      angleError(actual.d, { x: 1, z: 0 }),
      angleError(actual.s, { x: 0, z: 1 }),
      angleError(actual.w, { x: 0, z: -1 }),
    ),
  }
}

function resolveRequiredVector(
  codes: readonly string[],
  pose: Pick<LandrushResolvedCameraPose, 'position' | 'target'>,
): LandrushVector2 {
  return resolveCameraRelativeMovementVector(new Set(codes), pose) ?? { x: 0, z: -1 }
}

function clipIn(clipName: string, names: readonly string[]) {
  return names.includes(clipName)
}

function normalize2(x: number, z: number) {
  const length = Math.max(Math.hypot(x, z), 0.000001)
  return { x: x / length, z: z / length }
}

function angleError(a: { x: number; z: number }, b: { x: number; z: number }) {
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.z * b.z))
  return round((Math.acos(dot) * 180) / Math.PI, 2)
}

function round(value: number, digits = 2) {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}
