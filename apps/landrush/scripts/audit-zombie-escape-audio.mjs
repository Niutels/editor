import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  aggregateAudioProvenanceSource,
  DEFAULT_AUDIO_CATALOG_PATH,
  DEFAULT_AUDIO_PROVENANCE_PATH,
  DEFAULT_PUBLIC_ROOT,
  fileExists,
  inspectZombieEscapeAudioFile,
  inspectZombieEscapeAudioIntegrity,
  inspectZombieEscapeAudioLoudness,
  isIsoTimestamp,
  isSha256,
  listMp3Files,
  localAudioPath,
  readZombieEscapeAudioContract,
  readZombieEscapeAudioProvenance,
  validateZombieEscapeAudioInspection,
  validateZombieEscapeOneShotMastering,
  validateZombieEscapeOneShotVariantSpread,
  ZOMBIE_ESCAPE_ONE_SHOT_MASTERING,
  ZOMBIE_ESCAPE_AUDIO_PUBLIC_PREFIX,
} from './zombie-escape-audio-pipeline.mjs'

export async function auditZombieEscapeAudio({
  catalogPath = DEFAULT_AUDIO_CATALOG_PATH,
  provenancePath = DEFAULT_AUDIO_PROVENANCE_PATH,
  publicRoot = DEFAULT_PUBLIC_ROOT,
  probeMedia = true,
  requireReady = false,
} = {}) {
  const failures = []
  const contract = await readZombieEscapeAudioContract(catalogPath)
  const provenance = await readZombieEscapeAudioProvenance(provenancePath)
  const audioRoot = resolve(publicRoot, ZOMBIE_ESCAPE_AUDIO_PUBLIC_PREFIX.slice(1))
  const diskFiles = await listMp3Files(audioRoot)
  const diskPublicPaths = diskFiles.map((path) => publicPathFor(publicRoot, path))
  const artifactRecords = isRecord(provenance?.artifacts) ? provenance.artifacts : {}
  const masteredLoudnessByCue = new Map()
  const artifactKeys = Object.keys(artifactRecords)
  const pending =
    provenance?.schemaVersion === 2 &&
    provenance.catalogVersion === contract.catalog.catalogVersion &&
    provenance.catalogSha256 === null &&
    provenance.generatedAt === null &&
    provenance.source === null &&
    artifactKeys.length === 0 &&
    diskFiles.length === 0

  if (pending) {
    if (requireReady) failures.push('audio assets are pending generation')
    return createResult(contract, failures, false, 'pending', 0)
  }

  if (!isRecord(provenance)) {
    failures.push('provenance manifest is missing or is not an object')
  } else {
    if (provenance.schemaVersion !== 2) failures.push('provenance.schemaVersion must be 2')
    if (provenance.catalogVersion !== contract.catalog.catalogVersion) {
      failures.push('provenance.catalogVersion does not match the catalog')
    }
    if (provenance.catalogSha256 !== contract.catalogSha256) {
      failures.push('provenance.catalogSha256 does not match the catalog bytes')
    }
    if (!isIsoTimestamp(provenance.generatedAt)) {
      failures.push('provenance.generatedAt is not a canonical ISO-8601 timestamp')
    }
    if (
      provenance.source !== 'elevenlabs-api' &&
      provenance.source !== 'elevenlabs-web' &&
      provenance.source !== 'mixed'
    ) {
      failures.push('provenance.source is invalid')
    }
    if (
      !isRecord(provenance.generationSettings) ||
      provenance.generationSettings.promptImprovement !== false ||
      provenance.generationSettings.sharedWithExplore !== false
    ) {
      failures.push('provenance.generationSettings must preserve privacy and exact prompts')
    }
  }

  const expectedPaths = new Set(contract.assets.map((asset) => asset.publicPath))
  for (const artifactPath of artifactKeys) {
    if (!expectedPaths.has(artifactPath)) {
      failures.push(`unexpected provenance artifact ${artifactPath}`)
    }
  }
  for (const diskPath of diskPublicPaths) {
    if (!expectedPaths.has(diskPath)) failures.push(`unexpected audio file ${diskPath}`)
  }
  failures.push(
    ...findDuplicateZombieEscapeAudioArtifactHashes(contract.assets, artifactRecords),
  )

  for (const asset of contract.assets) {
    const label = asset.publicPath
    const artifact = artifactRecords[asset.publicPath]
    if (!isRecord(artifact)) {
      failures.push(`${label}: provenance artifact is missing`)
      continue
    }
    validateArtifactMetadata(failures, artifact, asset)

    const filePath = localAudioPath(publicRoot, asset.publicPath)
    if (!(await fileExists(filePath))) {
      failures.push(`${label}: file is missing`)
      continue
    }
    try {
      const inspection = probeMedia
        ? await inspectZombieEscapeAudioFile(filePath)
        : await inspectZombieEscapeAudioIntegrity(filePath)
      expectEqual(failures, `${label}: byteLength`, artifact.byteLength, inspection.byteLength)
      expectEqual(failures, `${label}: sha256`, artifact.sha256, inspection.sha256)
      if (probeMedia) {
        for (const failure of validateZombieEscapeAudioInspection(
          inspection,
          asset,
          artifact.source,
        )) {
          failures.push(`${label}: ${failure}`)
        }
        expectNear(
          failures,
          `${label}: durationSeconds`,
          artifact.durationSeconds,
          inspection.durationSeconds,
          0.000_001,
        )
        expectEqual(failures, `${label}: codecName`, artifact.codecName, inspection.codecName)
        expectEqual(failures, `${label}: sampleRateHz`, artifact.sampleRateHz, inspection.sampleRate)
        expectEqual(failures, `${label}: channels`, artifact.channels, inspection.channels)
        if (Number.isFinite(inspection.bitRate)) {
          expectEqual(failures, `${label}: bitRateBps`, artifact.bitRateBps, inspection.bitRate)
        }
        if (asset.masteringProfile) {
          const loudness = await inspectZombieEscapeAudioLoudness(filePath)
          for (const failure of validateZombieEscapeOneShotMastering(loudness)) {
            failures.push(`${label}: ${failure}`)
          }
          const cueLoudness = masteredLoudnessByCue.get(asset.cueId) ?? []
          cueLoudness.push(loudness)
          masteredLoudnessByCue.set(asset.cueId, cueLoudness)
          expectNear(
            failures,
            `${label}: mastering.outputIntegratedLoudnessLufs`,
            artifact.mastering?.outputIntegratedLoudnessLufs,
            loudness.integratedLoudnessLufs,
            0.01,
          )
          expectNear(
            failures,
            `${label}: mastering.outputTruePeakDbfs`,
            artifact.mastering?.outputTruePeakDbfs,
            loudness.truePeakDbfs,
            0.01,
          )
        }
      }
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  for (const [cueId, loudnesses] of masteredLoudnessByCue) {
    for (const failure of validateZombieEscapeOneShotVariantSpread(loudnesses)) {
      failures.push(`${cueId}: ${failure}`)
    }
  }

  const expectedSource = aggregateAudioProvenanceSource(artifactRecords)
  if (provenance?.source !== expectedSource) {
    failures.push(`provenance.source must aggregate to ${String(expectedSource)}`)
  }
  const ready = failures.length === 0 && artifactKeys.length === contract.assets.length
  if (requireReady && !ready && !failures.includes('audio assets are pending generation')) {
    failures.push('audio assets are not ready')
  }
  return createResult(
    contract,
    failures,
    failures.length === 0 && artifactKeys.length === contract.assets.length,
    failures.length === 0 ? 'ready' : 'invalid',
    artifactKeys.length,
  )
}

export function findDuplicateZombieEscapeAudioArtifactHashes(assets, artifactRecords) {
  const failures = []
  const firstPathByCueAndHash = new Map()
  for (const asset of assets) {
    const artifact = artifactRecords[asset.publicPath]
    if (!isRecord(artifact) || !isSha256(artifact.sha256)) continue
    const key = `${asset.cueId}\0${artifact.sha256}`
    const firstPath = firstPathByCueAndHash.get(key)
    if (firstPath) {
      failures.push(
        `${asset.publicPath}: sha256 duplicates ${firstPath} within cue ${asset.cueId}`,
      )
    } else {
      firstPathByCueAndHash.set(key, asset.publicPath)
    }
  }
  return failures
}

function validateArtifactMetadata(failures, artifact, asset) {
  const label = asset.publicPath
  expectEqual(failures, `${label}: path`, artifact.path, asset.publicPath)
  expectEqual(failures, `${label}: cueId`, artifact.cueId, asset.cueId)
  expectEqual(failures, `${label}: variantIndex`, artifact.variantIndex, asset.variantIndex)
  expectEqual(
    failures,
    `${label}: requestedDurationSeconds`,
    artifact.requestedDurationSeconds,
    asset.durationSeconds,
  )
  if (artifact.source !== 'elevenlabs-api' && artifact.source !== 'elevenlabs-web') {
    failures.push(`${label}: source is invalid`)
  }
  if (!Number.isInteger(artifact.byteLength) || artifact.byteLength <= 0) {
    failures.push(`${label}: byteLength must be a positive integer`)
  }
  if (!isSha256(artifact.sha256)) failures.push(`${label}: sha256 is invalid`)
  if (typeof artifact.durationSeconds !== 'number' || artifact.durationSeconds <= 0) {
    failures.push(`${label}: durationSeconds must be positive`)
  }
  if (!isIsoTimestamp(artifact.generatedAt)) {
    failures.push(`${label}: generatedAt is not a canonical ISO-8601 timestamp`)
  }
  if (artifact.requestId !== null && typeof artifact.requestId !== 'string') {
    failures.push(`${label}: requestId must be a string or null`)
  }
  if (artifact.traceId !== null && typeof artifact.traceId !== 'string') {
    failures.push(`${label}: traceId must be a string or null`)
  }
  if (artifact.codecName !== 'mp3') failures.push(`${label}: codecName must be mp3`)
  if (!Number.isInteger(artifact.sampleRateHz) || artifact.sampleRateHz <= 0) {
    failures.push(`${label}: sampleRateHz must be a positive integer`)
  }
  if (!Number.isInteger(artifact.channels) || artifact.channels <= 0) {
    failures.push(`${label}: channels must be a positive integer`)
  }
  if (artifact.bitRateBps !== null && !Number.isInteger(artifact.bitRateBps)) {
    failures.push(`${label}: bitRateBps must be an integer or null`)
  }
  if (asset.masteringProfile) {
    validateMasteringMetadata(
      failures,
      artifact.mastering,
      asset.masteringProfile,
      label,
    )
  } else if (artifact.mastering !== null) failures.push(`${label}: mastering must be null`)
}

function validateMasteringMetadata(failures, mastering, expectedProfile, label) {
  if (!isRecord(mastering)) {
    failures.push(`${label}: mastering metadata is missing`)
    return
  }
  expectEqual(
    failures,
    `${label}: mastering.algorithm`,
    mastering.algorithm,
    ZOMBIE_ESCAPE_ONE_SHOT_MASTERING.algorithm,
  )
  expectEqual(
    failures,
    `${label}: mastering.crestPreconditioner`,
    mastering.crestPreconditioner,
    ZOMBIE_ESCAPE_ONE_SHOT_MASTERING.crestPreconditioner,
  )
  expectEqual(
    failures,
    `${label}: mastering.targetIntegratedLoudnessLufs`,
    mastering.targetIntegratedLoudnessLufs,
    ZOMBIE_ESCAPE_ONE_SHOT_MASTERING.integratedLoudnessLufs,
  )
  expectEqual(
    failures,
    `${label}: mastering.normalizationTruePeakDbfs`,
    mastering.normalizationTruePeakDbfs,
    ZOMBIE_ESCAPE_ONE_SHOT_MASTERING.normalizationTruePeakDbfs,
  )
  expectEqual(
    failures,
    `${label}: mastering.targetTruePeakDbfs`,
    mastering.targetTruePeakDbfs,
    ZOMBIE_ESCAPE_ONE_SHOT_MASTERING.truePeakDbfs,
  )
  expectEqual(
    failures,
    `${label}: mastering.outputSampleRateHz`,
    mastering.outputSampleRateHz,
    ZOMBIE_ESCAPE_ONE_SHOT_MASTERING.outputSampleRateHz,
  )
  expectEqual(
    failures,
    `${label}: mastering.outputBitRateBps`,
    mastering.outputBitRateBps,
    ZOMBIE_ESCAPE_ONE_SHOT_MASTERING.outputBitRateBps,
  )
  expectEqual(failures, `${label}: mastering.profile`, mastering.profile, expectedProfile)
  if (!isSha256(mastering.inputSha256)) {
    failures.push(`${label}: mastering.inputSha256 is invalid`)
  }
  if (!isIsoTimestamp(mastering.processedAt)) {
    failures.push(`${label}: mastering.processedAt is not a canonical ISO-8601 timestamp`)
  }
  for (const field of [
    'inputIntegratedLoudnessLufs',
    'inputTruePeakDbfs',
    'outputIntegratedLoudnessLufs',
    'outputTruePeakDbfs',
  ]) {
    if (!Number.isFinite(mastering[field])) {
      failures.push(`${label}: mastering.${field} must be finite`)
    }
  }
}

function createResult(contract, failures, ready, status, artifactCount) {
  return {
    artifactCount,
    catalogSha256: contract.catalogSha256,
    catalogVersion: contract.catalog.catalogVersion,
    expectedArtifactCount: contract.assets.length,
    failures,
    pass: failures.length === 0,
    ready,
    status,
  }
}

function publicPathFor(publicRoot, path) {
  return `/${relative(publicRoot, path).replaceAll('\\', '/')}`
}

function expectEqual(failures, label, actual, expected) {
  if (actual !== expected) failures.push(`${label}: expected ${String(expected)}, got ${String(actual)}`)
}

function expectNear(failures, label, actual, expected, tolerance) {
  if (
    typeof actual !== 'number' ||
    !Number.isFinite(actual) ||
    Math.abs(actual - expected) > tolerance
  ) {
    failures.push(`${label}: expected ${expected.toFixed(6)}, got ${String(actual)}`)
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const audit = await auditZombieEscapeAudio({
    probeMedia: !process.argv.includes('--skip-media-probe'),
    requireReady: process.argv.includes('--require-ready'),
  })
  console.log(JSON.stringify(audit, null, 2))
  if (!audit.pass) process.exitCode = 1
}
