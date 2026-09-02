export const ZOMBIE_SHOULDER_TORCH_DEBUG_CAMERA_DISTANCES = ['near', 'design', 'far'] as const

export type ZombieShoulderTorchDebugCameraDistance =
  (typeof ZOMBIE_SHOULDER_TORCH_DEBUG_CAMERA_DISTANCES)[number]

export const ZOMBIE_SHOULDER_TORCH_DEBUG_ANGLES = ['front', 'side', 'top', 'rear'] as const

export type ZombieShoulderTorchDebugAngle = (typeof ZOMBIE_SHOULDER_TORCH_DEBUG_ANGLES)[number]

export const ZOMBIE_SHOULDER_TORCH_DEBUG_MODES = ['final', 'no-post', 'volume', 'surface'] as const

export type ZombieShoulderTorchDebugMode = (typeof ZOMBIE_SHOULDER_TORCH_DEBUG_MODES)[number]

export const ZOMBIE_SHOULDER_TORCH_DEBUG_DEFAULT_CAMERA_DISTANCE =
  'design' satisfies ZombieShoulderTorchDebugCameraDistance
export const ZOMBIE_SHOULDER_TORCH_DEBUG_DEFAULT_ANGLE =
  'top' satisfies ZombieShoulderTorchDebugAngle
export const ZOMBIE_SHOULDER_TORCH_DEBUG_DEFAULT_MODE =
  'final' satisfies ZombieShoulderTorchDebugMode

export const ZOMBIE_SHOULDER_TORCH_DEBUG_BEAM_REACH_METERS = 5.4

type ZombieShoulderTorchDebugVector3 = readonly [number, number, number]

export type ZombieShoulderTorchDebugCameraPose = Readonly<{
  far: number
  fov: number
  near: number
  position: ZombieShoulderTorchDebugVector3
  target: ZombieShoulderTorchDebugVector3
  up: ZombieShoulderTorchDebugVector3
}>

export type ZombieShoulderTorchDebugState = Readonly<{
  angle: ZombieShoulderTorchDebugAngle
  cameraDistance: ZombieShoulderTorchDebugCameraDistance
  mode: ZombieShoulderTorchDebugMode
}>

export type ZombieShoulderTorchDebugQuery = Readonly<Record<string, string | string[] | undefined>>

const CAMERA_DISTANCE_METERS = {
  design: ZOMBIE_SHOULDER_TORCH_DEBUG_BEAM_REACH_METERS * 1.16,
  far: ZOMBIE_SHOULDER_TORCH_DEBUG_BEAM_REACH_METERS * 1.8,
  near: ZOMBIE_SHOULDER_TORCH_DEBUG_BEAM_REACH_METERS * 0.44,
} as const satisfies Record<ZombieShoulderTorchDebugCameraDistance, number>

const CAMERA_FOV_DEGREES = {
  design: 42,
  far: 36,
  near: 48,
} as const satisfies Record<ZombieShoulderTorchDebugCameraDistance, number>

const BEAM_TARGET = [
  0,
  0.88,
  ZOMBIE_SHOULDER_TORCH_DEBUG_BEAM_REACH_METERS / 2,
] as const satisfies ZombieShoulderTorchDebugVector3
const ORIGIN_TARGET = [0, 1.05, 0.65] as const satisfies ZombieShoulderTorchDebugVector3
const HORIZONTAL_DIRECTION = 0.96
const ELEVATION_DIRECTION = 0.28

function createZombieShoulderTorchDebugCameraPose(
  cameraDistance: ZombieShoulderTorchDebugCameraDistance,
  angle: ZombieShoulderTorchDebugAngle,
): ZombieShoulderTorchDebugCameraPose {
  const distance = CAMERA_DISTANCE_METERS[cameraDistance]
  const target = cameraDistance === 'near' ? ORIGIN_TARGET : BEAM_TARGET
  const position: ZombieShoulderTorchDebugVector3 =
    angle === 'top'
      ? [target[0], target[1] + distance, target[2]]
      : angle === 'front'
        ? [
            target[0],
            target[1] + distance * ELEVATION_DIRECTION,
            target[2] + distance * HORIZONTAL_DIRECTION,
          ]
        : angle === 'side'
          ? [
              target[0] + distance * HORIZONTAL_DIRECTION,
              target[1] + distance * ELEVATION_DIRECTION,
              target[2],
            ]
          : [
              target[0],
              target[1] + distance * ELEVATION_DIRECTION,
              target[2] - distance * HORIZONTAL_DIRECTION,
            ]

  return {
    far: 40,
    fov: CAMERA_FOV_DEGREES[cameraDistance],
    near: 0.02,
    position,
    target,
    up: angle === 'top' ? [0, 0, -1] : [0, 1, 0],
  }
}

type ZombieShoulderTorchDebugCameraPoseManifest = Readonly<
  Record<
    ZombieShoulderTorchDebugCameraDistance,
    Readonly<Record<ZombieShoulderTorchDebugAngle, ZombieShoulderTorchDebugCameraPose>>
  >
>

export const ZOMBIE_SHOULDER_TORCH_DEBUG_CAMERA_POSES = {
  design: {
    front: createZombieShoulderTorchDebugCameraPose('design', 'front'),
    rear: createZombieShoulderTorchDebugCameraPose('design', 'rear'),
    side: createZombieShoulderTorchDebugCameraPose('design', 'side'),
    top: createZombieShoulderTorchDebugCameraPose('design', 'top'),
  },
  far: {
    front: createZombieShoulderTorchDebugCameraPose('far', 'front'),
    rear: createZombieShoulderTorchDebugCameraPose('far', 'rear'),
    side: createZombieShoulderTorchDebugCameraPose('far', 'side'),
    top: createZombieShoulderTorchDebugCameraPose('far', 'top'),
  },
  near: {
    front: createZombieShoulderTorchDebugCameraPose('near', 'front'),
    rear: createZombieShoulderTorchDebugCameraPose('near', 'rear'),
    side: createZombieShoulderTorchDebugCameraPose('near', 'side'),
    top: createZombieShoulderTorchDebugCameraPose('near', 'top'),
  },
} satisfies ZombieShoulderTorchDebugCameraPoseManifest

export function resolveZombieShoulderTorchDebugCameraPose(
  cameraDistance: ZombieShoulderTorchDebugCameraDistance,
  angle: ZombieShoulderTorchDebugAngle,
) {
  return ZOMBIE_SHOULDER_TORCH_DEBUG_CAMERA_POSES[cameraDistance][angle]
}

export const ZOMBIE_SHOULDER_TORCH_DEBUG_MODE_PRESENTATION = {
  final: {
    emitSpotLights: true,
    isolateContribution: false,
    showBeams: true,
    showFixtures: true,
    toneMapping: 'aces',
  },
  'no-post': {
    emitSpotLights: true,
    isolateContribution: false,
    showBeams: true,
    showFixtures: true,
    toneMapping: 'none',
  },
  surface: {
    emitSpotLights: true,
    isolateContribution: true,
    showBeams: false,
    showFixtures: false,
    toneMapping: 'aces',
  },
  volume: {
    emitSpotLights: false,
    isolateContribution: true,
    showBeams: true,
    showFixtures: true,
    toneMapping: 'aces',
  },
} as const satisfies Record<
  ZombieShoulderTorchDebugMode,
  Readonly<{
    emitSpotLights: boolean
    isolateContribution: boolean
    showBeams: boolean
    showFixtures: boolean
    toneMapping: 'aces' | 'none'
  }>
>

export const ZOMBIE_SHOULDER_TORCH_DEBUG_VISUAL_CONTRACT = {
  cameraEnvelope: CAMERA_DISTANCE_METERS,
  frameBudgetMs: 16.67,
  identity: [
    'paired Sentinel Mk II shoulder fixtures feed one authored torch system',
    'a 5.4 meter beam connects the robot to one stable ground footprint',
  ],
  invariants: [
    'two origins remain visibly distinct at the shoulder fixtures',
    'filled pre-merge light connects each origin to the authored merge distance',
    'a single merged lobe continues from the merge distance to the target',
    'the monotonic diffuse edge falls continuously from the bright interior to zero without a bright contour',
    'the production surface footprint is identical in final and surface modes; volume suppresses it only to isolate the ribbon',
  ],
  subject: 'Landrush robot plus its 5.4 meter shoulder-torch beam',
} as const

export function parseZombieShoulderTorchDebugCameraDistance(
  value: string | string[] | undefined,
): ZombieShoulderTorchDebugCameraDistance {
  if (value === 'near' || value === 'design' || value === 'far') return value
  return ZOMBIE_SHOULDER_TORCH_DEBUG_DEFAULT_CAMERA_DISTANCE
}

export function parseZombieShoulderTorchDebugAngle(
  value: string | string[] | undefined,
): ZombieShoulderTorchDebugAngle {
  if (value === 'front' || value === 'side' || value === 'top' || value === 'rear') return value
  return ZOMBIE_SHOULDER_TORCH_DEBUG_DEFAULT_ANGLE
}

export function parseZombieShoulderTorchDebugMode(
  value: string | string[] | undefined,
): ZombieShoulderTorchDebugMode {
  if (value === 'final' || value === 'no-post' || value === 'volume' || value === 'surface') {
    return value
  }
  return ZOMBIE_SHOULDER_TORCH_DEBUG_DEFAULT_MODE
}

export function parseZombieShoulderTorchDebugQuery(
  query: ZombieShoulderTorchDebugQuery,
): ZombieShoulderTorchDebugState {
  return {
    angle: parseZombieShoulderTorchDebugAngle(query.angle),
    cameraDistance: parseZombieShoulderTorchDebugCameraDistance(query.camera),
    mode: parseZombieShoulderTorchDebugMode(query.mode),
  }
}

export function createZombieShoulderTorchDebugScreenshotFilename({
  angle,
  cameraDistance,
  mode,
}: ZombieShoulderTorchDebugState) {
  return `landrush-torch-${cameraDistance}-${angle}-${mode}.png`
}
