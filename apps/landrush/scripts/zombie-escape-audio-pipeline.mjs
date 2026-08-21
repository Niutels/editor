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
  if (catalog.schemaVersion !== 1) throw new Error('catalog.schemaVersion must be 1')
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
    if (cue.eventKind === 'shot-fired') {
      requireNonEmptyString(cue.weaponId, `${cueLabel}.weaponId`)
      if (!SHOT_WEAPON_IDS.has(cue.weaponId)) {
        throw new Error(`${cueLabel}.weaponId is unknown`)
      }
      if (shotWeaponIds.has(cue.weaponId)) {
        throw new Error(`duplicate shot cue for ${cue.weaponId}`)
      }
      shotWeaponIds.add(cue.weaponId)
    } else if (cue.weaponId !== undefined) {
      throw new Error(`${cueLabel}.weaponId is only valid for shot-fired cues`)
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
        prompt: cue.prompt,
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
