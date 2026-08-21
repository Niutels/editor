import catalogData from './zombie-escape-audio-catalog.json'
import {
  ZOMBIE_ESCAPE_AUDIO_EVENT_KIND,
  type ZombieEscapeAudioEventKind,
} from './zombie-escape-audio-events'
import provenanceData from './zombie-escape-audio-provenance.json'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'

type ZombieEscapeAudioCatalogEventKind =
  | 'enemy-hit'
  | 'enemy-killed'
  | 'environment-impact'
  | 'melee-swing'
  | 'player-hurt'
  | 'player-killed'
  | 'purchase-denied'
  | 'shot-fired'
  | 'weapon-purchased'

export type ZombieEscapeAudioCue = Readonly<{
  durationSeconds: number
  eventKind: ZombieEscapeAudioCatalogEventKind
  files: readonly string[]
  id: string
  kind: ZombieEscapeAudioEventKind
  playback: Readonly<{
    maxDistance?: number
    maxVoices: number
    minIntervalMs: number
    rateRange: readonly [number, number]
    referenceDistance?: number
    spatial: boolean
    volume: number
  }>
  prompt: string
  promptInfluence: number
  weaponId?: string
  weaponIndex: number
}>

export type ZombieEscapeAudioArtifactProvenance = Readonly<{
  bitRateBps: number | null
  byteLength: number
  channels: number
  codecName: 'mp3'
  cueId: string
  durationSeconds: number
  generatedAt: string
  path: string
  requestId: string | null
  requestedDurationSeconds: number
  sampleRateHz: number
  sha256: string
  source: 'elevenlabs-api' | 'elevenlabs-web'
  traceId: string | null
  variantIndex: number
}>

type ZombieEscapeAudioCatalogState = Readonly<{
  assetsReady: boolean
  catalogVersion: string
  cues: readonly ZombieEscapeAudioCue[]
  modelId: string
  outputFormat: string
}>

const EVENT_KIND_BY_NAME = {
  'enemy-hit': ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.enemyHit,
  'enemy-killed': ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.enemyKilled,
  'environment-impact': ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.environmentImpact,
  'melee-swing': ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.meleeSwing,
  'player-hurt': ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.playerHurt,
  'player-killed': ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.playerKilled,
  'purchase-denied': ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.purchaseDenied,
  'shot-fired': ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.shotFired,
  'weapon-purchased': ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.weaponPurchased,
} as const satisfies Record<ZombieEscapeAudioCatalogEventKind, ZombieEscapeAudioEventKind>
const SINGLETON_EVENT_KINDS = [
  'enemy-hit',
  'enemy-killed',
  'environment-impact',
  'melee-swing',
  'player-hurt',
  'player-killed',
  'purchase-denied',
  'weapon-purchased',
] as const satisfies readonly Exclude<ZombieEscapeAudioCatalogEventKind, 'shot-fired'>[]

const AUDIO_PATH_PREFIX = '/audios/sfx/zombie-escape/'
const SHA256_PATTERN = /^[a-f0-9]{64}$/

export const ZOMBIE_ESCAPE_AUDIO_CATALOG = createZombieEscapeAudioCatalogState(
  catalogData,
  provenanceData,
)

export const ZOMBIE_ESCAPE_AUDIO_ASSETS_READY = ZOMBIE_ESCAPE_AUDIO_CATALOG.assetsReady
export const ZOMBIE_ESCAPE_AUDIO_CUES = ZOMBIE_ESCAPE_AUDIO_CATALOG.cues

export function createZombieEscapeAudioCatalogState(
  rawCatalog: unknown,
  rawProvenance: unknown,
): ZombieEscapeAudioCatalogState {
  const catalog = requireRecord(rawCatalog, 'audio catalog')
  if (catalog.schemaVersion !== 1) throw new Error('Zombie Escape audio catalog schema must be 1')
  const catalogVersion = requireString(catalog.catalogVersion, 'catalogVersion')
  const modelId = requireString(catalog.modelId, 'modelId')
  const outputFormat = requireString(catalog.outputFormat, 'outputFormat')
  if (!Array.isArray(catalog.cues) || catalog.cues.length === 0) {
    throw new Error('Zombie Escape audio catalog requires cues')
  }

  const ids = new Set<string>()
  const paths = new Set<string>()
  const shotWeapons = new Set<string>()
  const singletonEventKinds = new Set<ZombieEscapeAudioCatalogEventKind>()
  const cues = catalog.cues.map((value, cueIndex) => {
    const cue = requireRecord(value, `cues[${String(cueIndex)}]`)
    const id = requireString(cue.id, `cues[${String(cueIndex)}].id`)
    if (ids.has(id)) throw new Error(`Duplicate Zombie Escape audio cue: ${id}`)
    ids.add(id)
    const eventKind = requireEventKind(cue.eventKind, id)
    const files = requireFiles(cue.files, id, paths)
    const durationSeconds = requireFiniteNumber(cue.durationSeconds, `${id}.durationSeconds`)
    const promptInfluence = requireFiniteNumber(cue.promptInfluence, `${id}.promptInfluence`)
    if (durationSeconds < 0.5 || durationSeconds > 30) {
      throw new Error(`${id}.durationSeconds must be between 0.5 and 30`)
    }
    if (promptInfluence < 0 || promptInfluence > 1) {
      throw new Error(`${id}.promptInfluence must be between 0 and 1`)
    }
    const prompt = requireString(cue.prompt, `${id}.prompt`)
    const playback = requirePlayback(cue.playback, id)
    const weaponId = cue.weaponId === undefined ? undefined : requireString(cue.weaponId, id)
    let weaponIndex = -1
    if (eventKind === 'shot-fired') {
      if (!weaponId) throw new Error(`${id} requires weaponId`)
      weaponIndex = ZOMBIE_ESCAPE_WEAPON_CATALOG.findIndex((weapon) => weapon.id === weaponId)
      if (weaponIndex < 0) throw new Error(`${id} references unknown weapon ${weaponId}`)
      if (shotWeapons.has(weaponId)) throw new Error(`Duplicate shot cue for ${weaponId}`)
      shotWeapons.add(weaponId)
    } else if (weaponId) {
      throw new Error(`${id} may only set weaponId for shot-fired`)
    } else {
      if (singletonEventKinds.has(eventKind)) {
        throw new Error(`Duplicate Zombie Escape audio event kind: ${eventKind}`)
      }
      singletonEventKinds.add(eventKind)
    }

    return {
      durationSeconds,
      eventKind,
      files,
      id,
      kind: EVENT_KIND_BY_NAME[eventKind],
      playback,
      prompt,
      promptInfluence,
      ...(weaponId ? { weaponId } : {}),
      weaponIndex,
    } satisfies ZombieEscapeAudioCue
  })

  if (shotWeapons.size !== ZOMBIE_ESCAPE_WEAPON_CATALOG.length) {
    throw new Error('Zombie Escape audio catalog requires exactly one shot cue per weapon')
  }
  if (singletonEventKinds.size !== SINGLETON_EVENT_KINDS.length) {
    throw new Error('Zombie Escape audio catalog requires exactly one cue per non-shot event kind')
  }

  return {
    assetsReady: provenanceCoversCatalog(rawProvenance, catalogVersion, cues),
    catalogVersion,
    cues,
    modelId,
    outputFormat,
  }
}

function provenanceCoversCatalog(
  rawProvenance: unknown,
  catalogVersion: string,
  cues: readonly ZombieEscapeAudioCue[],
) {
  if (!isRecord(rawProvenance)) return false
  if (rawProvenance.schemaVersion !== 1 || rawProvenance.catalogVersion !== catalogVersion) {
    return false
  }
  if (
    typeof rawProvenance.catalogSha256 !== 'string' ||
    !SHA256_PATTERN.test(rawProvenance.catalogSha256) ||
    !isIsoTimestamp(rawProvenance.generatedAt) ||
    (rawProvenance.source !== 'elevenlabs-api' &&
      rawProvenance.source !== 'elevenlabs-web' &&
      rawProvenance.source !== 'mixed') ||
    !isRecord(rawProvenance.generationSettings) ||
    rawProvenance.generationSettings.promptImprovement !== false ||
    rawProvenance.generationSettings.sharedWithExplore !== false
  ) {
    return false
  }
  if (!isRecord(rawProvenance.artifacts)) return false
  const expectedArtifactCount = cues.reduce((sum, cue) => sum + cue.files.length, 0)
  if (Object.keys(rawProvenance.artifacts).length !== expectedArtifactCount) return false
  const sources = new Set<string>()
  for (const cue of cues) {
    for (let variantIndex = 0; variantIndex < cue.files.length; variantIndex += 1) {
      const path = cue.files[variantIndex]!
      const artifact = rawProvenance.artifacts[path]
      if (!isRecord(artifact)) return false
      if (
        artifact.path !== path ||
        artifact.cueId !== cue.id ||
        artifact.variantIndex !== variantIndex ||
        (artifact.source !== 'elevenlabs-api' && artifact.source !== 'elevenlabs-web') ||
        !Number.isInteger(artifact.byteLength) ||
        (artifact.byteLength as number) <= 0 ||
        typeof artifact.durationSeconds !== 'number' ||
        artifact.durationSeconds <= 0 ||
        artifact.requestedDurationSeconds !== cue.durationSeconds ||
        artifact.codecName !== 'mp3' ||
        !Number.isInteger(artifact.sampleRateHz) ||
        (artifact.sampleRateHz as number) <= 0 ||
        !Number.isInteger(artifact.channels) ||
        (artifact.channels as number) <= 0 ||
        (artifact.bitRateBps !== null && !Number.isInteger(artifact.bitRateBps)) ||
        !isIsoTimestamp(artifact.generatedAt) ||
        (artifact.requestId !== null && typeof artifact.requestId !== 'string') ||
        (artifact.traceId !== null && typeof artifact.traceId !== 'string') ||
        typeof artifact.sha256 !== 'string' ||
        !SHA256_PATTERN.test(artifact.sha256)
      ) {
        return false
      }
      sources.add(artifact.source)
    }
  }
  const aggregateSource =
    sources.size === 1 ? sources.values().next().value : sources.size > 1 ? 'mixed' : null
  return rawProvenance.source === aggregateSource
}

function isIsoTimestamp(value: unknown) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return false
  return new Date(value).toISOString() === value
}

function requireEventKind(value: unknown, cueId: string): ZombieEscapeAudioCatalogEventKind {
  if (typeof value === 'string' && value in EVENT_KIND_BY_NAME) {
    return value as ZombieEscapeAudioCatalogEventKind
  }
  throw new Error(`${cueId}.eventKind is invalid`)
}

function requireFiles(value: unknown, cueId: string, paths: Set<string>) {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${cueId}.files is empty`)
  return value.map((file, index) => {
    const path = requireString(file, `${cueId}.files[${String(index)}]`)
    if (!path.startsWith(AUDIO_PATH_PREFIX) || !path.endsWith('.mp3') || path.includes('..')) {
      throw new Error(`${cueId} has an invalid public audio path: ${path}`)
    }
    if (paths.has(path)) throw new Error(`Duplicate Zombie Escape audio path: ${path}`)
    paths.add(path)
    return path
  })
}

function requirePlayback(value: unknown, cueId: string): ZombieEscapeAudioCue['playback'] {
  const playback = requireRecord(value, `${cueId}.playback`)
  if (!Array.isArray(playback.rateRange) || playback.rateRange.length !== 2) {
    throw new Error(`${cueId}.playback.rateRange must have two values`)
  }
  const minimumRate = requireFiniteNumber(playback.rateRange[0], `${cueId}.minimumRate`)
  const maximumRate = requireFiniteNumber(playback.rateRange[1], `${cueId}.maximumRate`)
  const maxVoices = requireFiniteNumber(playback.maxVoices, `${cueId}.maxVoices`)
  const minIntervalMs = requireFiniteNumber(playback.minIntervalMs, `${cueId}.minIntervalMs`)
  const volume = requireFiniteNumber(playback.volume, `${cueId}.volume`)
  if (
    minimumRate <= 0 ||
    maximumRate < minimumRate ||
    !Number.isInteger(maxVoices) ||
    maxVoices < 1 ||
    minIntervalMs < 0 ||
    volume < 0 ||
    volume > 2 ||
    typeof playback.spatial !== 'boolean'
  ) {
    throw new Error(`${cueId}.playback is invalid`)
  }

  const maxDistance = optionalPositiveNumber(playback.maxDistance, `${cueId}.maxDistance`)
  const referenceDistance = optionalPositiveNumber(
    playback.referenceDistance,
    `${cueId}.referenceDistance`,
  )
  if (
    playback.spatial &&
    (!(maxDistance && referenceDistance) || maxDistance <= referenceDistance)
  ) {
    throw new Error(`${cueId}.playback spatial distances are invalid`)
  }

  return {
    ...(maxDistance === undefined ? {} : { maxDistance }),
    maxVoices,
    minIntervalMs,
    rateRange: [minimumRate, maximumRate],
    ...(referenceDistance === undefined ? {} : { referenceDistance }),
    spatial: playback.spatial,
    volume,
  }
}

function optionalPositiveNumber(value: unknown, label: string) {
  if (value === undefined) return undefined
  const result = requireFiniteNumber(value, label)
  if (result <= 0) throw new Error(`${label} must be positive`)
  return result
}

function requireFiniteNumber(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`)
  }
  return value
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a string`)
  return value
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
