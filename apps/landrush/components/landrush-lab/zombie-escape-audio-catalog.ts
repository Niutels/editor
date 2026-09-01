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
  | 'weapon-impact'
  | 'weapon-purchased'

type ZombieEscapeAudioMasteringProfile = 'one-shot-v1'

export type ZombieEscapeAudioCue = Readonly<{
  durationSeconds: number
  eventKind: ZombieEscapeAudioCatalogEventKind
  files: readonly string[]
  id: string
  kind: ZombieEscapeAudioEventKind
  masteringProfile: ZombieEscapeAudioMasteringProfile | null
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
  variantPrompts?: readonly [string, string, string]
  weaponId?: string
  weaponIndex: number
}>

export type ZombieEscapeMovementAudioCue = Readonly<{
  durationSeconds: number
  files: readonly string[]
  id: string
  masteringProfile: ZombieEscapeAudioMasteringProfile
  movementKind: 'jump'
  playback: ZombieEscapeAudioCue['playback']
  prompt: string
  promptInfluence: number
}>

export type ZombieEscapeAmbientAudioCue = Readonly<{
  ambientKind: 'npc-bump-vocalization'
  durationSeconds: number
  files: readonly [string, string, string, string]
  id: string
  masteringProfile: ZombieEscapeAudioMasteringProfile
  playback: ZombieEscapeAudioCue['playback'] &
    Readonly<{
      maxDistance: number
      referenceDistance: number
      spatial: true
    }>
  prompt: string
  promptInfluence: number
  variantPrompts: readonly [string, string, string, string]
}>

export type ZombieEscapePresenceAudioCue = Readonly<{
  durationSeconds: number
  files: readonly [string, string, string]
  id: string
  masteringProfile: ZombieEscapeAudioMasteringProfile
  playback: ZombieEscapeAudioCue['playback'] &
    Readonly<{
      maxDistance: number
      referenceDistance: number
      spatial: true
    }>
  presenceKind: 'zombie-vocalization'
  prompt: string
  promptInfluence: number
  schedule: Readonly<{
    initialDelaySeconds: readonly [number, number]
    intervalSeconds: readonly [number, number]
    rangeHysteresisMeters: number
  }>
  variantPrompts: readonly [string, string, string]
}>

export type ZombieEscapeAudioArtifactProvenance = Readonly<{
  bitRateBps: number | null
  byteLength: number
  channels: number
  codecName: 'mp3'
  cueId: string
  durationSeconds: number
  generatedAt: string
  mastering: Readonly<{
    algorithm: string
    crestPreconditioner: string
    inputIntegratedLoudnessLufs: number
    inputSha256: string
    inputTruePeakDbfs: number
    normalizationTruePeakDbfs: number
    outputBitRateBps: number
    outputIntegratedLoudnessLufs: number
    outputSampleRateHz: number
    outputTruePeakDbfs: number
    processedAt: string
    profile: ZombieEscapeAudioMasteringProfile
    targetIntegratedLoudnessLufs: number
    targetTruePeakDbfs: number
  }> | null
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
  ambientCues: readonly ZombieEscapeAmbientAudioCue[]
  assetsReady: boolean
  catalogVersion: string
  cues: readonly ZombieEscapeAudioCue[]
  modelId: string
  movementCues: readonly ZombieEscapeMovementAudioCue[]
  outputFormat: string
  presenceCues: readonly ZombieEscapePresenceAudioCue[]
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
  'weapon-impact': ZOMBIE_ESCAPE_AUDIO_EVENT_KIND.weaponImpact,
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
] as const satisfies readonly Exclude<
  ZombieEscapeAudioCatalogEventKind,
  'shot-fired' | 'weapon-impact'
>[]
const WEAPON_IMPACT_WEAPON_IDS = new Set([
  'reef-carbine',
  'driftwood-scattergun',
  'storm-coil-repeater',
  'tidebreak-launcher',
])

const AUDIO_PATH_PREFIX = '/audios/sfx/zombie-escape/'
const SHA256_PATTERN = /^[a-f0-9]{64}$/

export const ZOMBIE_ESCAPE_AUDIO_CATALOG = createZombieEscapeAudioCatalogState(
  catalogData,
  provenanceData,
)

export const ZOMBIE_ESCAPE_AUDIO_ASSETS_READY = ZOMBIE_ESCAPE_AUDIO_CATALOG.assetsReady
export const ZOMBIE_ESCAPE_AMBIENT_AUDIO_CUES = ZOMBIE_ESCAPE_AUDIO_CATALOG.ambientCues
export const ZOMBIE_ESCAPE_AUDIO_CUES = ZOMBIE_ESCAPE_AUDIO_CATALOG.cues
export const ZOMBIE_ESCAPE_MOVEMENT_AUDIO_CUES = ZOMBIE_ESCAPE_AUDIO_CATALOG.movementCues
export const ZOMBIE_ESCAPE_PRESENCE_AUDIO_CUES = ZOMBIE_ESCAPE_AUDIO_CATALOG.presenceCues
export const ZOMBIE_ESCAPE_PLAYER_JUMP_AUDIO_CUE = ZOMBIE_ESCAPE_MOVEMENT_AUDIO_CUES.find(
  (cue) => cue.movementKind === 'jump',
)!
export const ZOMBIE_ESCAPE_ZOMBIE_PRESENCE_AUDIO_CUE = ZOMBIE_ESCAPE_PRESENCE_AUDIO_CUES.find(
  (cue) => cue.presenceKind === 'zombie-vocalization',
)!
export const LANDRUSH_AMBIENT_NPC_BUMP_AUDIO_CUE = ZOMBIE_ESCAPE_AMBIENT_AUDIO_CUES.find(
  (cue) => cue.ambientKind === 'npc-bump-vocalization',
)!

export function createZombieEscapeAudioCatalogState(
  rawCatalog: unknown,
  rawProvenance: unknown,
): ZombieEscapeAudioCatalogState {
  const catalog = requireRecord(rawCatalog, 'audio catalog')
  if (catalog.schemaVersion !== 6) throw new Error('Zombie Escape audio catalog schema must be 6')
  const catalogVersion = requireString(catalog.catalogVersion, 'catalogVersion')
  const modelId = requireString(catalog.modelId, 'modelId')
  const outputFormat = requireString(catalog.outputFormat, 'outputFormat')
  if (!Array.isArray(catalog.cues) || catalog.cues.length === 0) {
    throw new Error('Zombie Escape audio catalog requires cues')
  }

  const ids = new Set<string>()
  const paths = new Set<string>()
  const shotWeapons = new Set<string>()
  const weaponImpactWeapons = new Set<string>()
  const singletonEventKinds = new Set<ZombieEscapeAudioCatalogEventKind>()
  const cues = catalog.cues.map((value, cueIndex) => {
    const cue = requireRecord(value, `cues[${String(cueIndex)}]`)
    const id = requireString(cue.id, `cues[${String(cueIndex)}].id`)
    if (ids.has(id)) throw new Error(`Duplicate Zombie Escape audio cue: ${id}`)
    ids.add(id)
    const eventKind = requireEventKind(cue.eventKind, id)
    const requiresZombieVariants = eventKind === 'enemy-hit' || eventKind === 'enemy-killed'
    const masteringProfile = requireMasteringProfile(
      cue.masteringProfile,
      eventKind === 'shot-fired' || eventKind === 'weapon-impact' || requiresZombieVariants,
      id,
    )
    const files = requireFiles(cue.files, id, paths)
    const variantPrompts = requiresZombieVariants
      ? requireVariantPrompts(cue.variantPrompts, files.length, id)
      : undefined
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
    if (eventKind === 'shot-fired' || eventKind === 'weapon-impact') {
      if (!weaponId) throw new Error(`${id} requires weaponId`)
      weaponIndex = ZOMBIE_ESCAPE_WEAPON_CATALOG.findIndex((weapon) => weapon.id === weaponId)
      if (weaponIndex < 0) throw new Error(`${id} references unknown weapon ${weaponId}`)
      if (eventKind === 'weapon-impact') {
        if (!WEAPON_IMPACT_WEAPON_IDS.has(weaponId)) {
          throw new Error(`${id} may not define impact audio for ${weaponId}`)
        }
        if (weaponImpactWeapons.has(weaponId)) {
          throw new Error(`Duplicate weapon impact cue for ${weaponId}`)
        }
        weaponImpactWeapons.add(weaponId)
      } else {
        if (shotWeapons.has(weaponId)) throw new Error(`Duplicate shot cue for ${weaponId}`)
        shotWeapons.add(weaponId)
      }
    } else if (weaponId) {
      throw new Error(`${id} may only set weaponId for shot-fired or weapon-impact`)
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
      masteringProfile,
      playback,
      prompt,
      promptInfluence,
      ...(variantPrompts ? { variantPrompts } : {}),
      ...(weaponId ? { weaponId } : {}),
      weaponIndex,
    } satisfies ZombieEscapeAudioCue
  })

  if (shotWeapons.size !== ZOMBIE_ESCAPE_WEAPON_CATALOG.length) {
    throw new Error('Zombie Escape audio catalog requires exactly one shot cue per weapon')
  }
  if (weaponImpactWeapons.size !== WEAPON_IMPACT_WEAPON_IDS.size) {
    throw new Error('Zombie Escape audio catalog requires one impact cue per selected weapon')
  }
  if (singletonEventKinds.size !== SINGLETON_EVENT_KINDS.length) {
    throw new Error('Zombie Escape audio catalog requires exactly one cue per non-shot event kind')
  }

  if (!Array.isArray(catalog.movementCues) || catalog.movementCues.length === 0) {
    throw new Error('Zombie Escape audio catalog requires movement cues')
  }
  const movementKinds = new Set<string>()
  const movementCues = catalog.movementCues.map((value, cueIndex) => {
    const cue = requireRecord(value, `movementCues[${String(cueIndex)}]`)
    const id = requireString(cue.id, `movementCues[${String(cueIndex)}].id`)
    if (ids.has(id)) throw new Error(`Duplicate Zombie Escape audio cue: ${id}`)
    ids.add(id)
    if (cue.movementKind !== 'jump') throw new Error(`${id}.movementKind is invalid`)
    const masteringProfile = requireMasteringProfile(cue.masteringProfile, true, id)
    if (movementKinds.has(cue.movementKind)) {
      throw new Error(`Duplicate Zombie Escape movement cue: ${cue.movementKind}`)
    }
    movementKinds.add(cue.movementKind)
    const durationSeconds = requireFiniteNumber(cue.durationSeconds, `${id}.durationSeconds`)
    const promptInfluence = requireFiniteNumber(cue.promptInfluence, `${id}.promptInfluence`)
    if (durationSeconds < 0.5 || durationSeconds > 30) {
      throw new Error(`${id}.durationSeconds must be between 0.5 and 30`)
    }
    if (promptInfluence < 0 || promptInfluence > 1) {
      throw new Error(`${id}.promptInfluence must be between 0 and 1`)
    }
    return {
      durationSeconds,
      files: requireFiles(cue.files, id, paths),
      id,
      masteringProfile,
      movementKind: cue.movementKind,
      playback: requirePlayback(cue.playback, id),
      prompt: requireString(cue.prompt, `${id}.prompt`),
      promptInfluence,
    } satisfies ZombieEscapeMovementAudioCue
  })
  if (movementKinds.size !== 1) {
    throw new Error('Zombie Escape audio catalog requires exactly one cue per movement kind')
  }

  if (!Array.isArray(catalog.presenceCues) || catalog.presenceCues.length === 0) {
    throw new Error('Zombie Escape audio catalog requires presence cues')
  }
  const presenceKinds = new Set<string>()
  const presenceCues = catalog.presenceCues.map((value, cueIndex) => {
    const cue = requireRecord(value, `presenceCues[${String(cueIndex)}]`)
    const id = requireString(cue.id, `presenceCues[${String(cueIndex)}].id`)
    if (ids.has(id)) throw new Error(`Duplicate Zombie Escape audio cue: ${id}`)
    ids.add(id)
    if (cue.presenceKind !== 'zombie-vocalization') {
      throw new Error(`${id}.presenceKind is invalid`)
    }
    if (presenceKinds.has(cue.presenceKind)) {
      throw new Error(`Duplicate Zombie Escape presence cue: ${cue.presenceKind}`)
    }
    presenceKinds.add(cue.presenceKind)
    const durationSeconds = requireFiniteNumber(cue.durationSeconds, `${id}.durationSeconds`)
    const promptInfluence = requireFiniteNumber(cue.promptInfluence, `${id}.promptInfluence`)
    if (durationSeconds < 0.5 || durationSeconds > 30) {
      throw new Error(`${id}.durationSeconds must be between 0.5 and 30`)
    }
    if (promptInfluence < 0 || promptInfluence > 1) {
      throw new Error(`${id}.promptInfluence must be between 0 and 1`)
    }
    const files = requireFiles(cue.files, id, paths)
    if (files.length !== 3) throw new Error(`${id}.files must contain exactly three variants`)
    const variantPrompts = requireVariantPrompts(cue.variantPrompts, files.length, id)
    const playback = requirePlayback(cue.playback, id)
    if (
      !playback.spatial ||
      playback.maxDistance === undefined ||
      playback.referenceDistance === undefined
    ) {
      throw new Error(`${id}.playback must be spatial`)
    }
    const schedule = requirePresenceSchedule(cue.schedule, id)
    return {
      durationSeconds,
      files: files as [string, string, string],
      id,
      masteringProfile: requireMasteringProfile(cue.masteringProfile, true, id),
      playback: {
        ...playback,
        maxDistance: playback.maxDistance,
        referenceDistance: playback.referenceDistance,
        spatial: true,
      },
      presenceKind: cue.presenceKind,
      prompt: requireString(cue.prompt, `${id}.prompt`),
      promptInfluence,
      schedule,
      variantPrompts,
    } satisfies ZombieEscapePresenceAudioCue
  })
  if (presenceKinds.size !== 1) {
    throw new Error('Zombie Escape audio catalog requires exactly one cue per presence kind')
  }

  if (!Array.isArray(catalog.ambientCues) || catalog.ambientCues.length === 0) {
    throw new Error('Zombie Escape audio catalog requires ambient cues')
  }
  const ambientKinds = new Set<string>()
  const ambientCues = catalog.ambientCues.map((value, cueIndex) => {
    const cue = requireRecord(value, `ambientCues[${String(cueIndex)}]`)
    const id = requireString(cue.id, `ambientCues[${String(cueIndex)}].id`)
    if (ids.has(id)) throw new Error(`Duplicate Zombie Escape audio cue: ${id}`)
    ids.add(id)
    if (cue.ambientKind !== 'npc-bump-vocalization') {
      throw new Error(`${id}.ambientKind is invalid`)
    }
    if (ambientKinds.has(cue.ambientKind)) {
      throw new Error(`Duplicate Zombie Escape ambient cue: ${cue.ambientKind}`)
    }
    ambientKinds.add(cue.ambientKind)
    const durationSeconds = requireFiniteNumber(cue.durationSeconds, `${id}.durationSeconds`)
    const promptInfluence = requireFiniteNumber(cue.promptInfluence, `${id}.promptInfluence`)
    if (durationSeconds < 0.5 || durationSeconds > 30) {
      throw new Error(`${id}.durationSeconds must be between 0.5 and 30`)
    }
    if (promptInfluence < 0 || promptInfluence > 1) {
      throw new Error(`${id}.promptInfluence must be between 0 and 1`)
    }
    const files = requireFiles(cue.files, id, paths)
    if (files.length !== 4) throw new Error(`${id}.files must contain exactly four variants`)
    const variantPrompts = requireFourVariantPrompts(cue.variantPrompts, id)
    const playback = requirePlayback(cue.playback, id)
    if (
      !playback.spatial ||
      playback.maxDistance === undefined ||
      playback.referenceDistance === undefined
    ) {
      throw new Error(`${id}.playback must be spatial`)
    }
    return {
      ambientKind: cue.ambientKind,
      durationSeconds,
      files: files as [string, string, string, string],
      id,
      masteringProfile: requireMasteringProfile(cue.masteringProfile, true, id),
      playback: {
        ...playback,
        maxDistance: playback.maxDistance,
        referenceDistance: playback.referenceDistance,
        spatial: true,
      },
      prompt: requireString(cue.prompt, `${id}.prompt`),
      promptInfluence,
      variantPrompts,
    } satisfies ZombieEscapeAmbientAudioCue
  })
  if (ambientKinds.size !== 1) {
    throw new Error('Zombie Escape audio catalog requires exactly one cue per ambient kind')
  }

  return {
    ambientCues,
    assetsReady: provenanceCoversCatalog(rawProvenance, catalogVersion, [
      ...cues,
      ...movementCues,
      ...presenceCues,
      ...ambientCues,
    ]),
    catalogVersion,
    cues,
    modelId,
    movementCues,
    outputFormat,
    presenceCues,
  }
}

function provenanceCoversCatalog(
  rawProvenance: unknown,
  catalogVersion: string,
  cues: readonly (
    | ZombieEscapeAudioCue
    | ZombieEscapeAmbientAudioCue
    | ZombieEscapeMovementAudioCue
    | ZombieEscapePresenceAudioCue
  )[],
) {
  if (!isRecord(rawProvenance)) return false
  if (rawProvenance.schemaVersion !== 2 || rawProvenance.catalogVersion !== catalogVersion) {
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
      const requiresMastering = cue.masteringProfile !== null
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
        (requiresMastering
          ? !isValidOneShotMastering(artifact.mastering, cue.masteringProfile)
          : artifact.mastering !== null) ||
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

function isValidOneShotMastering(
  value: unknown,
  expectedProfile: ZombieEscapeAudioMasteringProfile,
) {
  if (!isRecord(value)) return false
  return (
    value.algorithm === 'ffmpeg-crest-loudnorm-v1' &&
    value.profile === expectedProfile &&
    value.crestPreconditioner ===
      'acompressor=threshold=0.015:ratio=4:attack=0.1:release=60:knee=2.828:makeup=1' &&
    typeof value.inputSha256 === 'string' &&
    SHA256_PATTERN.test(value.inputSha256) &&
    isIsoTimestamp(value.processedAt) &&
    value.targetIntegratedLoudnessLufs === -20 &&
    value.normalizationTruePeakDbfs === -2.2 &&
    value.targetTruePeakDbfs === -1.5 &&
    value.outputSampleRateHz === 44_100 &&
    value.outputBitRateBps === 128_000 &&
    Number.isFinite(value.inputIntegratedLoudnessLufs) &&
    Number.isFinite(value.inputTruePeakDbfs) &&
    Number.isFinite(value.outputIntegratedLoudnessLufs) &&
    Number.isFinite(value.outputTruePeakDbfs)
  )
}

function requireMasteringProfile(
  value: unknown,
  required: true,
  cueId: string,
): ZombieEscapeAudioMasteringProfile
function requireMasteringProfile(value: unknown, required: false, cueId: string): null
function requireMasteringProfile(
  value: unknown,
  required: boolean,
  cueId: string,
): ZombieEscapeAudioMasteringProfile | null
function requireMasteringProfile(
  value: unknown,
  required: boolean,
  cueId: string,
): ZombieEscapeAudioMasteringProfile | null {
  if (required) {
    if (value !== 'one-shot-v1') throw new Error(`${cueId}.masteringProfile must be one-shot-v1`)
    return value
  }
  if (value !== undefined) {
    throw new Error(`${cueId}.masteringProfile is only valid for mastered one-shot cues`)
  }
  return null
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

function requireVariantPrompts(
  value: unknown,
  fileCount: number,
  cueId: string,
): readonly [string, string, string] {
  if (fileCount !== 3) throw new Error(`${cueId}.files must contain exactly three variants`)
  return requireVariantPromptList(value, fileCount, cueId) as [string, string, string]
}

function requireFourVariantPrompts(
  value: unknown,
  cueId: string,
): readonly [string, string, string, string] {
  return requireVariantPromptList(value, 4, cueId) as [string, string, string, string]
}

function requireVariantPromptList(value: unknown, fileCount: number, cueId: string) {
  const countLabel = fileCount === 3 ? 'three' : fileCount === 4 ? 'four' : String(fileCount)
  if (!Array.isArray(value) || value.length !== fileCount) {
    throw new Error(`${cueId}.variantPrompts must match its ${countLabel} files`)
  }
  const normalized = new Set<string>()
  const prompts = value.map((entry, index) => {
    const prompt = requireString(entry, `${cueId}.variantPrompts[${String(index)}]`)
    if (prompt.length > 450) {
      throw new Error(`${cueId}.variantPrompts[${String(index)}] must be at most 450 characters`)
    }
    const normalizedPrompt = normalizeVariantPrompt(prompt)
    if (normalizedPrompt.length === 0) {
      throw new Error(`${cueId}.variantPrompts[${String(index)}] must contain text`)
    }
    if (normalized.has(normalizedPrompt)) {
      throw new Error(`${cueId}.variantPrompts must be unique after normalization`)
    }
    normalized.add(normalizedPrompt)
    return prompt
  })
  return prompts
}

function normalizeVariantPrompt(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
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

function requirePresenceSchedule(
  value: unknown,
  cueId: string,
): ZombieEscapePresenceAudioCue['schedule'] {
  const schedule = requireRecord(value, `${cueId}.schedule`)
  const initialDelaySeconds = requirePositiveRange(
    schedule.initialDelaySeconds,
    `${cueId}.schedule.initialDelaySeconds`,
  )
  const intervalSeconds = requirePositiveRange(
    schedule.intervalSeconds,
    `${cueId}.schedule.intervalSeconds`,
  )
  const rangeHysteresisMeters = requireFiniteNumber(
    schedule.rangeHysteresisMeters,
    `${cueId}.schedule.rangeHysteresisMeters`,
  )
  if (rangeHysteresisMeters <= 0) {
    throw new Error(`${cueId}.schedule.rangeHysteresisMeters must be positive`)
  }
  return { initialDelaySeconds, intervalSeconds, rangeHysteresisMeters }
}

function requirePositiveRange(value: unknown, label: string): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${label} must have two values`)
  }
  const minimum = requireFiniteNumber(value[0], `${label}[0]`)
  const maximum = requireFiniteNumber(value[1], `${label}[1]`)
  if (minimum < 0 || maximum < minimum) throw new Error(`${label} is invalid`)
  return [minimum, maximum]
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
