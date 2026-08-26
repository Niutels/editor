import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export const LANDRUSH_SOURCE_REPLAY_SCHEMA_VERSION = 1

const SOURCE_REPLAY_KEYS = ['capturedAt', 'report', 'schemaVersion']
const REPORT_KEYS = ['camera', 'mode', 'player', 'save']
const CAMERA_KEYS = ['position', 'quaternion', 'target']
const MODE_KEYS = ['buildParcelId', 'fpv', 'view']
const PLAYER_KEYS = ['heading', 'position', 'profile']
const PROFILE_KEYS = ['color', 'id', 'name']
const SAVE_KEYS = ['builds', 'ownerships', 'tvMediaStates', 'worldId']
const SHA_256_PATTERN = /^[0-9a-f]{64}$/
const SOURCE_REPLAY_FIXTURE_NAMES = new Set(['outside', 'zombie-navigation-real-island'])

export function parseLandrushSourceReplay(
  value,
  { sourcePath = '<Landrush source replay>' } = {},
) {
  const replay = requireRecord(value, 'source replay', sourcePath)
  requireExactKeys(replay, SOURCE_REPLAY_KEYS, 'source replay', sourcePath)
  if (replay.schemaVersion !== LANDRUSH_SOURCE_REPLAY_SCHEMA_VERSION) {
    throw invalidReplay(
      sourcePath,
      `unsupported schema version ${String(replay.schemaVersion)}`,
    )
  }

  const capturedAt = requireTimestamp(replay.capturedAt, 'capturedAt', sourcePath)
  const report = requireRecord(replay.report, 'report', sourcePath)
  requireExactKeys(report, REPORT_KEYS, 'report', sourcePath)

  const camera = requireRecord(report.camera, 'report.camera', sourcePath)
  requireExactKeys(camera, CAMERA_KEYS, 'report.camera', sourcePath, { optional: ['target'] })
  const cameraPosition = requireFiniteTuple(
    camera.position,
    3,
    'report.camera.position',
    sourcePath,
  )
  const cameraQuaternion = requireFiniteTuple(
    camera.quaternion,
    4,
    'report.camera.quaternion',
    sourcePath,
  )
  const cameraTarget =
    camera.target === undefined
      ? undefined
      : requireFiniteTuple(camera.target, 3, 'report.camera.target', sourcePath)

  const mode = requireRecord(report.mode, 'report.mode', sourcePath)
  requireExactKeys(mode, MODE_KEYS, 'report.mode', sourcePath)
  if (mode.buildParcelId !== null && !isNonEmptyString(mode.buildParcelId)) {
    throw invalidReplay(sourcePath, 'report.mode.buildParcelId must be a string or null')
  }
  if (typeof mode.fpv !== 'boolean') {
    throw invalidReplay(sourcePath, 'report.mode.fpv must be a boolean')
  }
  const view = requireNonEmptyString(mode.view, 'report.mode.view', sourcePath)

  const player = requireRecord(report.player, 'report.player', sourcePath)
  requireExactKeys(player, PLAYER_KEYS, 'report.player', sourcePath)
  const heading = requireFiniteNumber(player.heading, 'report.player.heading', sourcePath)
  const playerPosition = requireFiniteTuple(
    player.position,
    3,
    'report.player.position',
    sourcePath,
  )
  const profile = requireRecord(report.player.profile, 'report.player.profile', sourcePath)
  requireExactKeys(profile, PROFILE_KEYS, 'report.player.profile', sourcePath)

  const save = requireRecord(report.save, 'report.save', sourcePath)
  requireExactKeys(save, SAVE_KEYS, 'report.save', sourcePath)
  const worldId = requireNonEmptyString(save.worldId, 'report.save.worldId', sourcePath)
  const builds = requireArray(save.builds, 'report.save.builds', sourcePath)
  const ownerships = requireArray(save.ownerships, 'report.save.ownerships', sourcePath)
  const tvMediaStates = requireArray(
    save.tvMediaStates,
    'report.save.tvMediaStates',
    sourcePath,
  )

  return {
    capturedAt,
    report: {
      camera: {
        position: cameraPosition,
        quaternion: cameraQuaternion,
        ...(cameraTarget ? { target: cameraTarget } : {}),
      },
      mode: {
        buildParcelId: mode.buildParcelId,
        fpv: mode.fpv,
        view,
      },
      player: {
        heading,
        position: playerPosition,
        profile: {
          color: requireNonEmptyString(
            profile.color,
            'report.player.profile.color',
            sourcePath,
          ),
          id: requireNonEmptyString(profile.id, 'report.player.profile.id', sourcePath),
          name: requireNonEmptyString(profile.name, 'report.player.profile.name', sourcePath),
        },
      },
      save: {
        builds: structuredClone(builds),
        ownerships: structuredClone(ownerships),
        tvMediaStates: structuredClone(tvMediaStates),
        worldId,
      },
    },
    schemaVersion: LANDRUSH_SOURCE_REPLAY_SCHEMA_VERSION,
  }
}

export function sha256LandrushSourceReplayBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export async function loadLandrushSourceReplayWithIntegrity(
  sourcePath,
  { expectedSha256 } = {},
) {
  const bytes = await readFile(sourcePath)
  const sha256 = sha256LandrushSourceReplayBytes(bytes)
  if (expectedSha256 !== undefined) {
    if (typeof expectedSha256 !== 'string' || !SHA_256_PATTERN.test(expectedSha256)) {
      throw new Error(`invalid Landrush source replay SHA-256: ${String(expectedSha256)}`)
    }
    if (sha256 !== expectedSha256) {
      throw new Error(`Landrush source replay SHA-256 mismatch: ${sourcePath}`)
    }
  }
  let value
  try {
    value = JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    throw new Error(`invalid Landrush source replay JSON: ${sourcePath}`, { cause: error })
  }
  return {
    replay: parseLandrushSourceReplay(value, { sourcePath }),
    sha256,
    sourcePath,
  }
}

export async function loadLandrushSourceReplay(sourcePath, options) {
  return (await loadLandrushSourceReplayWithIntegrity(sourcePath, options)).replay
}

export function createLandrushBenchmarkFixtureFromSourceReplay(
  replay,
  { name = 'outside', sourcePath = '<Landrush source replay>' } = {},
) {
  if (!SOURCE_REPLAY_FIXTURE_NAMES.has(name)) {
    throw new Error(`unsupported Landrush source replay fixture "${String(name)}"`)
  }
  const parsed = parseLandrushSourceReplay(replay, { sourcePath })
  return {
    capturedAt: parsed.capturedAt,
    name,
    report: parsed.report,
    sourcePath,
  }
}

function requireRecord(value, label, sourcePath) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidReplay(sourcePath, `${label} must be an object`)
  }
  return value
}

function requireExactKeys(value, allowedKeys, label, sourcePath, { optional = [] } = {}) {
  const allowed = new Set(allowedKeys)
  const optionalKeys = new Set(optional)
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key))
  const missing = allowedKeys.filter(
    (key) => !optionalKeys.has(key) && !Object.hasOwn(value, key),
  )
  if (unexpected.length > 0 || missing.length > 0) {
    throw invalidReplay(
      sourcePath,
      `${label} keys differ (missing=${missing.join(',') || 'none'}; ` +
        `unexpected=${unexpected.join(',') || 'none'})`,
    )
  }
}

function requireTimestamp(value, label, sourcePath) {
  const timestamp = requireNonEmptyString(value, label, sourcePath)
  if (!Number.isFinite(Date.parse(timestamp))) {
    throw invalidReplay(sourcePath, `${label} must be a timestamp`)
  }
  return timestamp
}

function requireNonEmptyString(value, label, sourcePath) {
  if (!isNonEmptyString(value)) {
    throw invalidReplay(sourcePath, `${label} must be a non-empty string`)
  }
  return value
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

function requireFiniteNumber(value, label, sourcePath) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidReplay(sourcePath, `${label} must be finite`)
  }
  return value
}

function requireFiniteTuple(value, length, label, sourcePath) {
  if (!Array.isArray(value) || value.length !== length) {
    throw invalidReplay(sourcePath, `${label} must contain ${String(length)} values`)
  }
  return value.map((entry, index) =>
    requireFiniteNumber(entry, `${label}[${String(index)}]`, sourcePath),
  )
}

function requireArray(value, label, sourcePath) {
  if (!Array.isArray(value)) {
    throw invalidReplay(sourcePath, `${label} must be an array`)
  }
  return value
}

function invalidReplay(sourcePath, detail) {
  return new Error(`invalid Landrush source replay: ${sourcePath}: ${detail}`)
}
