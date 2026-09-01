import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readdir, readFile, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

export const DEFAULT_AUDIO_CATALOG_PATH = resolve(
  import.meta.dirname,
  '../components/landrush-lab/zombie-escape-audio-catalog.json',
)
export const DEFAULT_AUDIO_PROVENANCE_PATH = resolve(
  import.meta.dirname,
  '../components/landrush-lab/zombie-escape-audio-provenance.json',
)
export const DEFAULT_PUBLIC_ROOT = resolve(import.meta.dirname, '../public')
export const ZOMBIE_ESCAPE_AUDIO_PUBLIC_PREFIX = '/audios/sfx/zombie-escape/'
export const AUDIO_DURATION_TOLERANCE_SECONDS = 0.08
export const ZOMBIE_ESCAPE_ONE_SHOT_MASTERING = Object.freeze({
  algorithm: 'ffmpeg-crest-loudnorm-v1',
  crestPreconditioner:
    'acompressor=threshold=0.015:ratio=4:attack=0.1:release=60:knee=2.828:makeup=1',
  integratedLoudnessLufs: -20,
  loudnessRangeLufs: 7,
  normalizationTruePeakDbfs: -2.2,
  outputBitRateBps: 128_000,
  outputSampleRateHz: 44_100,
  toleranceLufs: 1.25,
  truePeakDbfs: -1.5,
  variantSpreadToleranceLufs: 1,
})

const execFileAsync = promisify(execFile)
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const EVENT_KINDS = new Set([
  'enemy-hit',
  'enemy-killed',
  'environment-impact',
  'melee-swing',
  'player-hurt',
  'player-killed',
  'purchase-denied',
  'shot-fired',
  'weapon-impact',
  'weapon-purchased',
])
const SINGLETON_EVENT_KINDS = new Set([
  'enemy-hit',
  'enemy-killed',
  'environment-impact',
  'melee-swing',
  'player-hurt',
  'player-killed',
  'purchase-denied',
  'weapon-purchased',
])
const SHOT_WEAPON_IDS = new Set([
  'sunflare-pistol',
  'reef-carbine',
  'driftwood-scattergun',
  'storm-coil-repeater',
  'tidebreak-launcher',
])
const WEAPON_IMPACT_WEAPON_IDS = new Set([
  'reef-carbine',
  'driftwood-scattergun',
  'storm-coil-repeater',
  'tidebreak-launcher',
])
const MOVEMENT_KINDS = new Set(['jump'])
const PRESENCE_KINDS = new Set(['zombie-vocalization'])
const AMBIENT_KINDS = new Set(['npc-bump-vocalization'])
const ZOMBIE_VARIANT_EVENT_KINDS = new Set(['enemy-hit', 'enemy-killed'])

export async function readZombieEscapeAudioContract(
  catalogPath = DEFAULT_AUDIO_CATALOG_PATH,
) {
  const catalogBody = await readFile(catalogPath)
  const catalog = JSON.parse(catalogBody.toString('utf8'))
  const assets = validateZombieEscapeAudioCatalog(catalog)
  return {
    assets,
    catalog,
    catalogBody,
    catalogSha256: sha256(catalogBody),
  }
}

export function validateZombieEscapeAudioCatalog(catalog) {
  requireRecord(catalog, 'catalog')
  if (catalog.schemaVersion !== 6) throw new Error('catalog.schemaVersion must be 6')
  requireNonEmptyString(catalog.catalogVersion, 'catalog.catalogVersion')
  if (catalog.modelId !== 'eleven_text_to_sound_v2') {
    throw new Error('catalog.modelId must be eleven_text_to_sound_v2')
  }
  if (catalog.outputFormat !== 'mp3_44100_128') {
    throw new Error('catalog.outputFormat must be mp3_44100_128')
  }
  if (!Array.isArray(catalog.cues) || catalog.cues.length === 0) {
    throw new Error('catalog.cues must be a non-empty array')
  }

  const cueIds = new Set()
  const publicPaths = new Set()
  const shotWeaponIds = new Set()
  const weaponImpactWeaponIds = new Set()
  const singletonEventKinds = new Set()
  const assets = []
  for (const [cueIndex, cue] of catalog.cues.entries()) {
    const cueLabel = `catalog.cues[${cueIndex}]`
    requireRecord(cue, cueLabel)
    requireNonEmptyString(cue.id, `${cueLabel}.id`)
    if (cueIds.has(cue.id)) throw new Error(`duplicate cue id ${cue.id}`)
    cueIds.add(cue.id)
    if (!EVENT_KINDS.has(cue.eventKind)) {
      throw new Error(`${cueLabel}.eventKind is invalid`)
    }
    if (SINGLETON_EVENT_KINDS.has(cue.eventKind)) {
      if (singletonEventKinds.has(cue.eventKind)) {
        throw new Error(`duplicate non-shot event kind ${cue.eventKind}`)
      }
      singletonEventKinds.add(cue.eventKind)
    }
    if (cue.eventKind === 'shot-fired' || cue.eventKind === 'weapon-impact') {
      requireNonEmptyString(cue.weaponId, `${cueLabel}.weaponId`)
      if (!SHOT_WEAPON_IDS.has(cue.weaponId)) {
        throw new Error(`${cueLabel}.weaponId is unknown`)
      }
      if (cue.eventKind === 'weapon-impact') {
        if (!WEAPON_IMPACT_WEAPON_IDS.has(cue.weaponId)) {
          throw new Error(`${cueLabel}.weaponId does not support impact audio`)
        }
        if (weaponImpactWeaponIds.has(cue.weaponId)) {
          throw new Error(`duplicate weapon impact cue for ${cue.weaponId}`)
        }
        weaponImpactWeaponIds.add(cue.weaponId)
      } else {
        if (shotWeaponIds.has(cue.weaponId)) {
          throw new Error(`duplicate shot cue for ${cue.weaponId}`)
        }
        shotWeaponIds.add(cue.weaponId)
      }
    } else if (cue.weaponId !== undefined) {
      throw new Error(`${cueLabel}.weaponId is only valid for shot-fired or weapon-impact cues`)
    }
    requireFiniteNumber(cue.durationSeconds, `${cueLabel}.durationSeconds`)
    if (
      cue.durationSeconds < 0.5 ||
      cue.durationSeconds > 30 ||
      Math.abs(cue.durationSeconds * 10 - Math.round(cue.durationSeconds * 10)) > 1e-9
    ) {
      throw new Error(`${cueLabel}.durationSeconds must be a 0.1 second step from 0.5 to 30`)
    }
    requireFiniteNumber(cue.promptInfluence, `${cueLabel}.promptInfluence`)
    if (cue.promptInfluence < 0 || cue.promptInfluence > 1) {
      throw new Error(`${cueLabel}.promptInfluence must be between 0 and 1`)
    }
    requireNonEmptyString(cue.prompt, `${cueLabel}.prompt`)
    if (!Array.isArray(cue.files) || cue.files.length === 0) {
      throw new Error(`${cueLabel}.files must be a non-empty array`)
    }
    const requiresZombieVariants = ZOMBIE_VARIANT_EVENT_KINDS.has(cue.eventKind)
    const variantPrompts = requiresZombieVariants
      ? requireVariantPrompts(cue.variantPrompts, cue.files.length, cueLabel)
      : null

    for (const [variantIndex, publicPath] of cue.files.entries()) {
      requireNonEmptyString(publicPath, `${cueLabel}.files[${variantIndex}]`)
      if (
        !publicPath.startsWith(ZOMBIE_ESCAPE_AUDIO_PUBLIC_PREFIX) ||
        !publicPath.endsWith(`-${variantIndex}.mp3`) ||
        publicPath.includes('..') ||
        publicPath.includes('\\')
      ) {
        throw new Error(`${cueLabel}.files[${variantIndex}] is not a canonical audio path`)
      }
      if (publicPaths.has(publicPath)) throw new Error(`duplicate audio path ${publicPath}`)
      publicPaths.add(publicPath)
      const masteringProfile = requireMasteringProfile(
        cue.masteringProfile,
        cue.eventKind === 'shot-fired' ||
          cue.eventKind === 'weapon-impact' ||
          requiresZombieVariants,
        cueLabel,
      )
      assets.push({
        cueId: cue.id,
        durationSeconds: cue.durationSeconds,
        kind: 'event',
        masteringProfile,
        prompt: variantPrompts?.[variantIndex] ?? cue.prompt,
        promptInfluence: cue.promptInfluence,
        publicPath,
        variantIndex,
      })
    }
  }
  if (singletonEventKinds.size !== SINGLETON_EVENT_KINDS.size) {
    throw new Error('catalog must define exactly one cue for every non-shot event kind')
  }
  if (shotWeaponIds.size !== SHOT_WEAPON_IDS.size) {
    throw new Error('catalog must define exactly one shot cue for every weapon')
  }
  if (weaponImpactWeaponIds.size !== WEAPON_IMPACT_WEAPON_IDS.size) {
    throw new Error('catalog must define one impact cue for every selected weapon')
  }

  if (!Array.isArray(catalog.movementCues) || catalog.movementCues.length === 0) {
    throw new Error('catalog.movementCues must be a non-empty array')
  }
  const movementKinds = new Set()
  for (const [cueIndex, cue] of catalog.movementCues.entries()) {
    const cueLabel = `catalog.movementCues[${cueIndex}]`
    requireRecord(cue, cueLabel)
    requireNonEmptyString(cue.id, `${cueLabel}.id`)
    if (cueIds.has(cue.id)) throw new Error(`duplicate cue id ${cue.id}`)
    cueIds.add(cue.id)
    if (!MOVEMENT_KINDS.has(cue.movementKind)) {
      throw new Error(`${cueLabel}.movementKind is invalid`)
    }
    if (movementKinds.has(cue.movementKind)) {
      throw new Error(`duplicate movement cue kind ${cue.movementKind}`)
    }
    movementKinds.add(cue.movementKind)
    requireFiniteNumber(cue.durationSeconds, `${cueLabel}.durationSeconds`)
    if (
      cue.durationSeconds < 0.5 ||
      cue.durationSeconds > 30 ||
      Math.abs(cue.durationSeconds * 10 - Math.round(cue.durationSeconds * 10)) > 1e-9
    ) {
      throw new Error(`${cueLabel}.durationSeconds must be a 0.1 second step from 0.5 to 30`)
    }
    requireFiniteNumber(cue.promptInfluence, `${cueLabel}.promptInfluence`)
    if (cue.promptInfluence < 0 || cue.promptInfluence > 1) {
      throw new Error(`${cueLabel}.promptInfluence must be between 0 and 1`)
    }
    requireNonEmptyString(cue.prompt, `${cueLabel}.prompt`)
    if (!Array.isArray(cue.files) || cue.files.length === 0) {
      throw new Error(`${cueLabel}.files must be a non-empty array`)
    }
    for (const [variantIndex, publicPath] of cue.files.entries()) {
      requireNonEmptyString(publicPath, `${cueLabel}.files[${variantIndex}]`)
      if (
        !publicPath.startsWith(ZOMBIE_ESCAPE_AUDIO_PUBLIC_PREFIX) ||
        !publicPath.endsWith(`-${variantIndex}.mp3`) ||
        publicPath.includes('..') ||
        publicPath.includes('\\')
      ) {
        throw new Error(`${cueLabel}.files[${variantIndex}] is not a canonical audio path`)
      }
      if (publicPaths.has(publicPath)) throw new Error(`duplicate audio path ${publicPath}`)
      publicPaths.add(publicPath)
      const masteringProfile = requireMasteringProfile(
        cue.masteringProfile,
        true,
        cueLabel,
      )
      assets.push({
        cueId: cue.id,
        durationSeconds: cue.durationSeconds,
        kind: 'movement',
        masteringProfile,
        prompt: cue.prompt,
        promptInfluence: cue.promptInfluence,
        publicPath,
        variantIndex,
      })
    }
  }
  if (movementKinds.size !== MOVEMENT_KINDS.size) {
    throw new Error('catalog must define exactly one cue for every movement kind')
  }

  if (!Array.isArray(catalog.presenceCues) || catalog.presenceCues.length === 0) {
    throw new Error('catalog.presenceCues must be a non-empty array')
  }
  const presenceKinds = new Set()
  for (const [cueIndex, cue] of catalog.presenceCues.entries()) {
    const cueLabel = `catalog.presenceCues[${cueIndex}]`
    requireRecord(cue, cueLabel)
    requireNonEmptyString(cue.id, `${cueLabel}.id`)
    if (cueIds.has(cue.id)) throw new Error(`duplicate cue id ${cue.id}`)
    cueIds.add(cue.id)
    if (!PRESENCE_KINDS.has(cue.presenceKind)) {
      throw new Error(`${cueLabel}.presenceKind is invalid`)
    }
    if (presenceKinds.has(cue.presenceKind)) {
      throw new Error(`duplicate presence cue kind ${cue.presenceKind}`)
    }
    presenceKinds.add(cue.presenceKind)
    requireFiniteNumber(cue.durationSeconds, `${cueLabel}.durationSeconds`)
    if (
      cue.durationSeconds < 0.5 ||
      cue.durationSeconds > 30 ||
      Math.abs(cue.durationSeconds * 10 - Math.round(cue.durationSeconds * 10)) > 1e-9
    ) {
      throw new Error(`${cueLabel}.durationSeconds must be a 0.1 second step from 0.5 to 30`)
    }
    requireFiniteNumber(cue.promptInfluence, `${cueLabel}.promptInfluence`)
    if (cue.promptInfluence < 0 || cue.promptInfluence > 1) {
      throw new Error(`${cueLabel}.promptInfluence must be between 0 and 1`)
    }
    requireNonEmptyString(cue.prompt, `${cueLabel}.prompt`)
    if (!Array.isArray(cue.files) || cue.files.length !== 3) {
      throw new Error(`${cueLabel}.files must contain exactly three variants`)
    }
    const variantPrompts = requireVariantPrompts(
      cue.variantPrompts,
      cue.files.length,
      cueLabel,
    )
    validatePresencePlayback(cue.playback, `${cueLabel}.playback`)
    validatePresenceSchedule(cue.schedule, `${cueLabel}.schedule`)
    for (const [variantIndex, publicPath] of cue.files.entries()) {
      requireNonEmptyString(publicPath, `${cueLabel}.files[${variantIndex}]`)
      if (
        !publicPath.startsWith(ZOMBIE_ESCAPE_AUDIO_PUBLIC_PREFIX) ||
        !publicPath.endsWith(`-${variantIndex}.mp3`) ||
        publicPath.includes('..') ||
        publicPath.includes('\\')
      ) {
        throw new Error(`${cueLabel}.files[${variantIndex}] is not a canonical audio path`)
      }
      if (publicPaths.has(publicPath)) throw new Error(`duplicate audio path ${publicPath}`)
      publicPaths.add(publicPath)
      assets.push({
        cueId: cue.id,
        durationSeconds: cue.durationSeconds,
        kind: 'presence',
        masteringProfile: requireMasteringProfile(cue.masteringProfile, true, cueLabel),
        prompt: variantPrompts[variantIndex],
        promptInfluence: cue.promptInfluence,
        publicPath,
        variantIndex,
      })
    }
  }
  if (presenceKinds.size !== PRESENCE_KINDS.size) {
    throw new Error('catalog must define exactly one cue for every presence kind')
  }

  if (!Array.isArray(catalog.ambientCues) || catalog.ambientCues.length === 0) {
    throw new Error('catalog.ambientCues must be a non-empty array')
  }
  const ambientKinds = new Set()
  for (const [cueIndex, cue] of catalog.ambientCues.entries()) {
    const cueLabel = `catalog.ambientCues[${cueIndex}]`
    requireRecord(cue, cueLabel)
    requireNonEmptyString(cue.id, `${cueLabel}.id`)
    if (cueIds.has(cue.id)) throw new Error(`duplicate cue id ${cue.id}`)
    cueIds.add(cue.id)
    if (!AMBIENT_KINDS.has(cue.ambientKind)) {
      throw new Error(`${cueLabel}.ambientKind is invalid`)
    }
    if (ambientKinds.has(cue.ambientKind)) {
      throw new Error(`duplicate ambient cue kind ${cue.ambientKind}`)
    }
    ambientKinds.add(cue.ambientKind)
    requireFiniteNumber(cue.durationSeconds, `${cueLabel}.durationSeconds`)
    if (
      cue.durationSeconds < 0.5 ||
      cue.durationSeconds > 30 ||
      Math.abs(cue.durationSeconds * 10 - Math.round(cue.durationSeconds * 10)) > 1e-9
    ) {
      throw new Error(`${cueLabel}.durationSeconds must be a 0.1 second step from 0.5 to 30`)
    }
    requireFiniteNumber(cue.promptInfluence, `${cueLabel}.promptInfluence`)
    if (cue.promptInfluence < 0 || cue.promptInfluence > 1) {
      throw new Error(`${cueLabel}.promptInfluence must be between 0 and 1`)
    }
    requireNonEmptyString(cue.prompt, `${cueLabel}.prompt`)
    if (!Array.isArray(cue.files) || cue.files.length !== 4) {
      throw new Error(`${cueLabel}.files must contain exactly four variants`)
    }
    const variantPrompts = requireVariantPrompts(
      cue.variantPrompts,
      cue.files.length,
      cueLabel,
    )
    validatePresencePlayback(cue.playback, `${cueLabel}.playback`)
    for (const [variantIndex, publicPath] of cue.files.entries()) {
      requireNonEmptyString(publicPath, `${cueLabel}.files[${variantIndex}]`)
      if (
        !publicPath.startsWith(ZOMBIE_ESCAPE_AUDIO_PUBLIC_PREFIX) ||
        !publicPath.endsWith(`-${variantIndex}.mp3`) ||
        publicPath.includes('..') ||
        publicPath.includes('\\')
      ) {
        throw new Error(`${cueLabel}.files[${variantIndex}] is not a canonical audio path`)
      }
      if (publicPaths.has(publicPath)) throw new Error(`duplicate audio path ${publicPath}`)
      publicPaths.add(publicPath)
      assets.push({
        cueId: cue.id,
        durationSeconds: cue.durationSeconds,
        kind: 'ambient',
        masteringProfile: requireMasteringProfile(cue.masteringProfile, true, cueLabel),
        prompt: variantPrompts[variantIndex],
        promptInfluence: cue.promptInfluence,
        publicPath,
        variantIndex,
      })
    }
  }
  if (ambientKinds.size !== AMBIENT_KINDS.size) {
    throw new Error('catalog must define exactly one cue for every ambient kind')
  }
  return assets
}

export async function readZombieEscapeAudioProvenance(
  provenancePath = DEFAULT_AUDIO_PROVENANCE_PATH,
) {
  try {
    return JSON.parse(await readFile(provenancePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

export function localAudioPath(publicRoot, publicPath) {
  if (
    !publicPath.startsWith(ZOMBIE_ESCAPE_AUDIO_PUBLIC_PREFIX) ||
    publicPath.includes('..') ||
    publicPath.includes('\\')
  ) {
    throw new Error(`invalid Zombie Escape audio path ${publicPath}`)
  }
  const localPath = resolve(publicRoot, publicPath.slice(1))
  const fromRoot = relative(publicRoot, localPath)
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new Error(`audio path escapes public root: ${publicPath}`)
  }
  return localPath
}

export async function inspectZombieEscapeAudioFile(path) {
  const [integrity, probe] = await Promise.all([
    inspectZombieEscapeAudioIntegrity(path),
    runFfprobe(path),
  ])
  const parsed = JSON.parse(probe.stdout)
  const stream = parsed.streams?.[0]
  const format = parsed.format
  if (!stream || !format) throw new Error(`${path} does not contain an audio stream`)
  const durationSeconds = Number(format.duration)
  const sampleRate = Number(stream.sample_rate)
  const bitRate = Number(stream.bit_rate ?? format.bit_rate)
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error(`${path} has no finite positive duration`)
  }
  return {
    bitRate,
    byteLength: integrity.byteLength,
    channels: Number(stream.channels),
    codecName: stream.codec_name,
    durationSeconds,
    formatName: format.format_name,
    sampleRate,
    sha256: integrity.sha256,
  }
}

export async function inspectZombieEscapeAudioIntegrity(path) {
  const [body, fileStat] = await Promise.all([readFile(path), stat(path)])
  return {
    byteLength: fileStat.size,
    sha256: sha256(body),
  }
}

export async function inspectZombieEscapeAudioLoudness(path) {
  return inspectZombieEscapeAudioLoudnessWithPrefix(path, null)
}

async function inspectZombieEscapeAudioLoudnessWithPrefix(path, filterPrefix) {
  const result = await runFfmpeg([
    '-hide_banner',
    '-nostdin',
    '-i',
    path,
    '-af',
    joinAudioFilters(filterPrefix, createLoudnormFilter()),
    '-f',
    'null',
    '-',
  ])
  return parseLoudnormMeasurement(result.stderr)
}

export async function masterZombieEscapeOneShotAudio(inputPath, outputPath) {
  const [inputInspection, inputLoudness, normalizationMeasurement] = await Promise.all([
    inspectZombieEscapeAudioIntegrity(inputPath),
    inspectZombieEscapeAudioLoudness(inputPath),
    inspectZombieEscapeAudioLoudnessWithPrefix(
      inputPath,
      ZOMBIE_ESCAPE_ONE_SHOT_MASTERING.crestPreconditioner,
    ),
  ])
  const filter = joinAudioFilters(
    ZOMBIE_ESCAPE_ONE_SHOT_MASTERING.crestPreconditioner,
    createLoudnormFilter(normalizationMeasurement),
  )
  await runFfmpeg([
    '-hide_banner',
    '-nostdin',
    '-y',
    '-i',
    inputPath,
    '-map_metadata',
    '-1',
    '-vn',
    '-af',
    filter,
    '-ar',
    String(ZOMBIE_ESCAPE_ONE_SHOT_MASTERING.outputSampleRateHz),
    '-codec:a',
    'libmp3lame',
    '-b:a',
    String(ZOMBIE_ESCAPE_ONE_SHOT_MASTERING.outputBitRateBps),
    outputPath,
  ])
  const [outputInspection, outputLoudness] = await Promise.all([
    inspectZombieEscapeAudioFile(outputPath),
    inspectZombieEscapeAudioLoudness(outputPath),
  ])
  const failures = validateZombieEscapeOneShotMastering(outputLoudness)
  if (failures.length > 0) throw new Error(`${outputPath}: ${failures.join('; ')}`)
  return {
    inputInspection,
    inputLoudness,
    outputInspection,
    outputLoudness,
  }
}

export function validateZombieEscapeOneShotMastering(loudness) {
  const failures = []
  if (
    !Number.isFinite(loudness?.integratedLoudnessLufs) ||
    Math.abs(
      loudness.integratedLoudnessLufs -
        ZOMBIE_ESCAPE_ONE_SHOT_MASTERING.integratedLoudnessLufs,
    ) > ZOMBIE_ESCAPE_ONE_SHOT_MASTERING.toleranceLufs
  ) {
    failures.push(
      `integrated loudness ${String(loudness?.integratedLoudnessLufs)} LUFS is outside the one-shot target envelope`,
    )
  }
  if (
    !Number.isFinite(loudness?.truePeakDbfs) ||
    loudness.truePeakDbfs > ZOMBIE_ESCAPE_ONE_SHOT_MASTERING.truePeakDbfs + 0.05
  ) {
    failures.push(
      `true peak ${String(loudness?.truePeakDbfs)} dBFS exceeds the one-shot ceiling`,
    )
  }
  return failures
}

export function validateZombieEscapeOneShotVariantSpread(loudnesses) {
  const integrated = loudnesses
    .map((loudness) => loudness?.integratedLoudnessLufs)
    .filter(Number.isFinite)
  if (integrated.length !== loudnesses.length || integrated.length < 2) return []
  const spread = Math.max(...integrated) - Math.min(...integrated)
  return spread > ZOMBIE_ESCAPE_ONE_SHOT_MASTERING.variantSpreadToleranceLufs
    ? [
        `integrated loudness spread ${spread.toFixed(2)} LU exceeds the one-shot variant limit`,
      ]
    : []
}

export function validateZombieEscapeAudioInspection(inspection, asset, source) {
  const failures = []
  if (inspection.byteLength < 512) failures.push('file is unexpectedly small')
  if (inspection.codecName !== 'mp3' || !inspection.formatName.split(',').includes('mp3')) {
    failures.push('file is not MP3 audio')
  }
  if (
    (source === 'elevenlabs-api' && inspection.sampleRate !== 44_100) ||
    (source === 'elevenlabs-web' &&
      inspection.sampleRate !== 44_100 &&
      inspection.sampleRate !== 48_000)
  ) {
    failures.push(`sample rate ${inspection.sampleRate} Hz is invalid for ${source}`)
  }
  if (
    source === 'elevenlabs-api' &&
    (!Number.isFinite(inspection.bitRate) ||
      inspection.bitRate < 115_200 ||
      inspection.bitRate > 140_800)
  ) {
    failures.push('bit rate is outside the requested 128 kbps API contract')
  }
  if (
    source === 'elevenlabs-web' &&
    (!Number.isFinite(inspection.bitRate) ||
      inspection.bitRate < 96_000 ||
      inspection.bitRate > 320_000)
  ) {
    failures.push('web artifact bit rate is outside the supported MP3 range')
  }
  if (
    Math.abs(inspection.durationSeconds - asset.durationSeconds) >
    AUDIO_DURATION_TOLERANCE_SECONDS
  ) {
    failures.push(
      `duration ${inspection.durationSeconds.toFixed(3)}s differs from requested ${asset.durationSeconds.toFixed(1)}s`,
    )
  }
  return failures
}

export function createZombieEscapeAudioArtifact({
  asset,
  generatedAt,
  inspection,
  mastering = null,
  requestId = null,
  source,
  traceId = null,
}) {
  return {
    bitRateBps: Number.isFinite(inspection.bitRate) ? inspection.bitRate : null,
    byteLength: inspection.byteLength,
    channels: Number.isFinite(inspection.channels) ? inspection.channels : null,
    codecName: inspection.codecName,
    cueId: asset.cueId,
    durationSeconds: roundDuration(inspection.durationSeconds),
    generatedAt,
    mastering,
    path: asset.publicPath,
    requestId: nullableHeader(requestId),
    requestedDurationSeconds: asset.durationSeconds,
    sampleRateHz: inspection.sampleRate,
    sha256: inspection.sha256,
    source,
    traceId: nullableHeader(traceId),
    variantIndex: asset.variantIndex,
  }
}

export function aggregateAudioProvenanceSource(artifacts) {
  const sources = new Set(Object.values(artifacts).map((artifact) => artifact.source))
  if (sources.size === 0) return null
  if (sources.size === 1) return sources.values().next().value
  return 'mixed'
}

export function sha256(body) {
  return createHash('sha256').update(body).digest('hex')
}

export function isSha256(value) {
  return typeof value === 'string' && SHA256_PATTERN.test(value)
}

export function isIsoTimestamp(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  )
}

export async function listMp3Files(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    const paths = []
    for (const entry of entries) {
      const path = resolve(root, entry.name)
      if (entry.isDirectory()) paths.push(...(await listMp3Files(path)))
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.mp3')) paths.push(path)
    }
    return paths.sort()
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
}

export async function fileExists(path) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function runFfprobe(path) {
  try {
    return await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'a:0',
        '-show_entries',
        'stream=codec_name,sample_rate,channels,bit_rate:format=format_name,duration,bit_rate',
        '-of',
        'json',
        path,
      ],
      { maxBuffer: 1024 * 1024, windowsHide: true },
    )
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('ffprobe is required to generate or audit Zombie Escape audio assets')
    }
    throw error
  }
}

async function runFfmpeg(arguments_) {
  try {
    return await execFileAsync('ffmpeg', arguments_, {
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    })
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('ffmpeg is required to master or audit Zombie Escape audio assets')
    }
    throw error
  }
}

function createLoudnormFilter(measurement = null) {
  const target = ZOMBIE_ESCAPE_ONE_SHOT_MASTERING
  const settings = [
    `I=${target.integratedLoudnessLufs}`,
    `TP=${target.normalizationTruePeakDbfs}`,
    `LRA=${target.loudnessRangeLufs}`,
  ]
  if (measurement) {
    settings.push(
      `measured_I=${measurement.integratedLoudnessLufs}`,
      `measured_LRA=${measurement.loudnessRangeLufs}`,
      `measured_TP=${measurement.truePeakDbfs}`,
      `measured_thresh=${measurement.thresholdLufs}`,
      `offset=${measurement.targetOffsetLufs}`,
      'linear=true',
    )
  }
  settings.push('print_format=json')
  return `loudnorm=${settings.join(':')}`
}

function joinAudioFilters(prefix, filter) {
  return prefix ? `${prefix},${filter}` : filter
}

function parseLoudnormMeasurement(stderr) {
  const matches = stderr.match(/\{\s*"input_i"[\s\S]*?\}/g)
  const body = matches?.at(-1)
  if (!body) throw new Error('ffmpeg loudnorm did not report a measurement')
  const parsed = JSON.parse(body)
  const measurement = {
    integratedLoudnessLufs: Number(parsed.input_i),
    loudnessRangeLufs: Number(parsed.input_lra),
    targetOffsetLufs: Number(parsed.target_offset),
    thresholdLufs: Number(parsed.input_thresh),
    truePeakDbfs: Number(parsed.input_tp),
  }
  if (Object.values(measurement).some((value) => !Number.isFinite(value))) {
    throw new Error('ffmpeg loudnorm reported a non-finite measurement')
  }
  return measurement
}

function nullableHeader(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function roundDuration(value) {
  return Math.round(value * 1_000_000) / 1_000_000
}

function requireRecord(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`)
  }
}

function requireFiniteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`)
  }
}

function requireMasteringProfile(value, required, label) {
  if (required) {
    if (value !== 'one-shot-v1') {
      throw new Error(`${label}.masteringProfile must be one-shot-v1`)
    }
    return value
  }
  if (value !== undefined) {
    throw new Error(`${label}.masteringProfile is only valid for mastered one-shot cues`)
  }
  return null
}

function requireVariantPrompts(value, fileCount, label) {
  if (fileCount !== 3 && fileCount !== 4) {
    throw new Error(`${label}.files must contain exactly three or four variants`)
  }
  const countLabel = fileCount === 3 ? 'three' : 'four'
  if (!Array.isArray(value) || value.length !== fileCount) {
    throw new Error(`${label}.variantPrompts must match its ${countLabel} files`)
  }
  const normalized = new Set()
  return value.map((prompt, index) => {
    requireNonEmptyString(prompt, `${label}.variantPrompts[${index}]`)
    if (prompt.length > 450) {
      throw new Error(`${label}.variantPrompts[${index}] must be at most 450 characters`)
    }
    const normalizedPrompt = prompt.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
    if (normalizedPrompt.length === 0) {
      throw new Error(`${label}.variantPrompts[${index}] must contain text`)
    }
    if (normalized.has(normalizedPrompt)) {
      throw new Error(`${label}.variantPrompts must be unique after normalization`)
    }
    normalized.add(normalizedPrompt)
    return prompt
  })
}

function validatePresencePlayback(value, label) {
  requireRecord(value, label)
  requireFiniteNumber(value.maxDistance, `${label}.maxDistance`)
  requireFiniteNumber(value.referenceDistance, `${label}.referenceDistance`)
  requireFiniteNumber(value.maxVoices, `${label}.maxVoices`)
  requireFiniteNumber(value.minIntervalMs, `${label}.minIntervalMs`)
  requireFiniteNumber(value.volume, `${label}.volume`)
  if (!Array.isArray(value.rateRange) || value.rateRange.length !== 2) {
    throw new Error(`${label}.rateRange must have two values`)
  }
  requireFiniteNumber(value.rateRange[0], `${label}.rateRange[0]`)
  requireFiniteNumber(value.rateRange[1], `${label}.rateRange[1]`)
  if (
    value.spatial !== true ||
    value.referenceDistance <= 0 ||
    value.maxDistance <= value.referenceDistance ||
    !Number.isInteger(value.maxVoices) ||
    value.maxVoices < 1 ||
    value.minIntervalMs < 0 ||
    value.rateRange[0] <= 0 ||
    value.rateRange[1] < value.rateRange[0] ||
    value.volume < 0 ||
    value.volume > 2
  ) {
    throw new Error(`${label} is invalid`)
  }
}

function validatePresenceSchedule(value, label) {
  requireRecord(value, label)
  validatePositiveRange(value.initialDelaySeconds, `${label}.initialDelaySeconds`)
  validatePositiveRange(value.intervalSeconds, `${label}.intervalSeconds`)
  requireFiniteNumber(value.rangeHysteresisMeters, `${label}.rangeHysteresisMeters`)
  if (value.rangeHysteresisMeters <= 0) {
    throw new Error(`${label}.rangeHysteresisMeters must be positive`)
  }
}

function validatePositiveRange(value, label) {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`${label} must have two values`)
  }
  requireFiniteNumber(value[0], `${label}[0]`)
  requireFiniteNumber(value[1], `${label}[1]`)
  if (value[0] < 0 || value[1] < value[0]) throw new Error(`${label} is invalid`)
}
