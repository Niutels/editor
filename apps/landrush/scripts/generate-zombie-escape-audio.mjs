import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  aggregateAudioProvenanceSource,
  createZombieEscapeAudioArtifact,
  DEFAULT_AUDIO_PROVENANCE_PATH,
  DEFAULT_PUBLIC_ROOT,
  fileExists,
  inspectZombieEscapeAudioFile,
  isIsoTimestamp,
  localAudioPath,
  readZombieEscapeAudioContract,
  readZombieEscapeAudioProvenance,
  validateZombieEscapeAudioInspection,
} from './zombie-escape-audio-pipeline.mjs'

const API_URL = 'https://api.elevenlabs.io/v1/sound-generation'
const recordWeb = process.argv.includes('--record-web')
const force = process.argv.includes('--force')
const replaceCueIds = readRepeatedArguments('--replace-cue')
const generatedAt = readSingleArgument('--generated-at') ?? new Date().toISOString()
const webRequestIds = readRequestIds()
const apiKey = process.env.ELEVENLABS_API_KEY

if (!isIsoTimestamp(generatedAt)) {
  throw new Error('--generated-at must be a canonical ISO-8601 timestamp')
}
if (!recordWeb && (!apiKey || apiKey.trim().length === 0)) {
  throw new Error('ELEVENLABS_API_KEY is required. Keep it in the environment; never commit it.')
}
if (!recordWeb && webRequestIds.size > 0) {
  throw new Error('--request-id is only valid with --record-web')
}
if (recordWeb && replaceCueIds.size > 0) {
  throw new Error('--replace-cue is only valid for ElevenLabs API generation')
}
if (force && replaceCueIds.size > 0) {
  throw new Error('Use either --force or --replace-cue, not both')
}
if (
  recordWeb &&
  (!process.argv.includes('--prompt-improvement=off') ||
    !process.argv.includes('--explore-sharing=off'))
) {
  throw new Error(
    '--record-web requires --prompt-improvement=off and --explore-sharing=off to certify the web generation settings.',
  )
}

const contract = await readZombieEscapeAudioContract()
for (const cueId of webRequestIds.keys()) {
  if (!contract.assets.some((asset) => asset.cueId === cueId)) {
    throw new Error(`--request-id references unknown cue ${cueId}`)
  }
}
for (const cueId of replaceCueIds) {
  if (!contract.assets.some((asset) => asset.cueId === cueId)) {
    throw new Error(`--replace-cue references unknown cue ${cueId}`)
  }
}

if (recordWeb) await recordElevenLabsWebArtifacts(contract)
else await generateElevenLabsApiArtifacts(contract)

async function recordElevenLabsWebArtifacts(audioContract) {
  const existing = await readZombieEscapeAudioProvenance()
  const artifacts = {}
  for (const asset of audioContract.assets) {
    const path = localAudioPath(DEFAULT_PUBLIC_ROOT, asset.publicPath)
    if (!(await fileExists(path))) {
      throw new Error(`Missing ElevenLabs web artifact ${asset.publicPath}`)
    }
    const inspection = await inspectZombieEscapeAudioFile(path)
    assertInspection(asset, inspection, 'elevenlabs-web')
    const existingArtifact = existing?.artifacts?.[asset.publicPath]
    const existingMatchesBytes =
      existingArtifact?.cueId === asset.cueId &&
      existingArtifact.variantIndex === asset.variantIndex &&
      existingArtifact.sha256 === inspection.sha256
    artifacts[asset.publicPath] = createZombieEscapeAudioArtifact({
      asset,
      generatedAt:
        existingMatchesBytes && isIsoTimestamp(existingArtifact.generatedAt)
          ? existingArtifact.generatedAt
          : generatedAt,
      inspection,
      requestId:
        webRequestIds.get(asset.cueId) ??
        (existingMatchesBytes ? existingArtifact.requestId : null),
      source: 'elevenlabs-web',
    })
  }
  const provenance = createProvenance(audioContract, artifacts)
  if (
    existing?.catalogSha256 === audioContract.catalogSha256 &&
    isIsoTimestamp(existing.generatedAt)
  ) {
    provenance.generatedAt = existing.generatedAt
  }
  await writeProvenance(provenance)
  console.log(`Recorded ${audioContract.assets.length} unchanged ElevenLabs web artifacts.`)
}

async function generateElevenLabsApiArtifacts(audioContract) {
  const existing = await readZombieEscapeAudioProvenance()
  if (
    existing?.catalogSha256 &&
    existing.catalogSha256 !== audioContract.catalogSha256 &&
    !force &&
    replaceCueIds.size === 0
  ) {
    throw new Error('Audio catalog changed; rerun with --force to replace stale generated files.')
  }

  const artifacts = {}
  const stagedArtifacts = []
  await mkdir(DEFAULT_PUBLIC_ROOT, { recursive: true })
  const stagingRoot = await mkdtemp(resolve(DEFAULT_PUBLIC_ROOT, '.zombie-escape-audio-staging-'))
  try {
    for (const [assetIndex, asset] of audioContract.assets.entries()) {
      const targetPath = localAudioPath(DEFAULT_PUBLIC_ROOT, asset.publicPath)
      const existingArtifact = existing?.artifacts?.[asset.publicPath]
      const replaceAsset = force || replaceCueIds.has(asset.cueId)
      if (!replaceAsset && existingArtifact && (await fileExists(targetPath))) {
        const inspection = await inspectZombieEscapeAudioFile(targetPath)
        const failures = validateZombieEscapeAudioInspection(
          inspection,
          asset,
          existingArtifact.source,
        )
        if (
          failures.length === 0 &&
          (existingArtifact.source === 'elevenlabs-api' ||
            existingArtifact.source === 'elevenlabs-web') &&
          existingArtifact.path === asset.publicPath &&
          existingArtifact.cueId === asset.cueId &&
          existingArtifact.variantIndex === asset.variantIndex &&
          existingArtifact.byteLength === inspection.byteLength &&
          existingArtifact.sha256 === inspection.sha256
        ) {
          artifacts[asset.publicPath] = existingArtifact
          console.log(`[${asset.cueId}:${asset.variantIndex}] verified; skipping`)
          continue
        }
        throw new Error(
          `${asset.publicPath} exists but provenance does not verify it; use --force to replace it.`,
        )
      }
      if (!replaceAsset && (await fileExists(targetPath))) {
        throw new Error(
          `${asset.publicPath} exists without verified provenance; use --force to replace it.`,
        )
      }

      console.log(`[${asset.cueId}:${asset.variantIndex}] generating`)
      const response = await fetch(
        `${API_URL}?output_format=${encodeURIComponent(audioContract.catalog.outputFormat)}`,
        {
          body: JSON.stringify({
            duration_seconds: asset.durationSeconds,
            loop: false,
            model_id: audioContract.catalog.modelId,
            prompt_influence: asset.promptInfluence,
            text: asset.prompt,
          }),
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
          },
          method: 'POST',
        },
      )
      if (!response.ok) {
        const errorBody = (await response.text()).slice(0, 500)
        throw new Error(`ElevenLabs sound generation failed (${response.status}): ${errorBody}`)
      }

      const stagedPath = resolve(stagingRoot, `${String(assetIndex).padStart(2, '0')}.mp3`)
      await writeFile(stagedPath, Buffer.from(await response.arrayBuffer()))
      const inspection = await inspectZombieEscapeAudioFile(stagedPath)
      assertInspection(asset, inspection, 'elevenlabs-api')
      artifacts[asset.publicPath] = createZombieEscapeAudioArtifact({
        asset,
        generatedAt: new Date().toISOString(),
        inspection,
        requestId: response.headers.get('request-id') ?? response.headers.get('x-request-id'),
        source: 'elevenlabs-api',
        traceId: response.headers.get('trace-id') ?? response.headers.get('x-trace-id'),
      })
      stagedArtifacts.push({ stagedPath, targetPath })
    }

    const provenance = createProvenance(audioContract, artifacts)
    if (
      stagedArtifacts.length === 0 &&
      existing?.catalogSha256 === audioContract.catalogSha256 &&
      isIsoTimestamp(existing.generatedAt)
    ) {
      provenance.generatedAt = existing.generatedAt
    }
    await commitStagedApiArtifacts(stagedArtifacts, provenance, stagingRoot)
    console.log(`ElevenLabs API pipeline complete: ${audioContract.assets.length} artifacts.`)
  } finally {
    await rm(stagingRoot, { force: true, recursive: true })
  }
}

async function commitStagedApiArtifacts(stagedArtifacts, provenance, stagingRoot) {
  const installed = []
  try {
    for (const [index, artifact] of stagedArtifacts.entries()) {
      await mkdir(dirname(artifact.targetPath), { recursive: true })
      const backupPath = resolve(stagingRoot, `backup-${String(index).padStart(2, '0')}.mp3`)
      const hadExistingTarget = await fileExists(artifact.targetPath)
      if (hadExistingTarget) await rename(artifact.targetPath, backupPath)
      try {
        await rename(artifact.stagedPath, artifact.targetPath)
      } catch (error) {
        if (hadExistingTarget) await rename(backupPath, artifact.targetPath)
        throw error
      }
      installed.push({
        backupPath: hadExistingTarget ? backupPath : null,
        targetPath: artifact.targetPath,
      })
    }
    await writeProvenance(provenance)
  } catch (error) {
    for (let index = installed.length - 1; index >= 0; index -= 1) {
      const artifact = installed[index]
      if (!artifact) continue
      try {
        await rm(artifact.targetPath, { force: true })
        if (artifact.backupPath) await rename(artifact.backupPath, artifact.targetPath)
      } catch {}
    }
    throw error
  }
}

function createProvenance(audioContract, artifacts) {
  return {
    schemaVersion: 1,
    catalogVersion: audioContract.catalog.catalogVersion,
    catalogSha256: audioContract.catalogSha256,
    generatedAt,
    source: aggregateAudioProvenanceSource(artifacts),
    generationSettings: {
      promptImprovement: false,
      sharedWithExplore: false,
    },
    artifacts,
  }
}

function assertInspection(asset, inspection, source) {
  const failures = validateZombieEscapeAudioInspection(inspection, asset, source)
  if (failures.length > 0) {
    throw new Error(`${asset.publicPath}: ${failures.join('; ')}`)
  }
}

async function writeProvenance(provenance) {
  await mkdir(dirname(DEFAULT_AUDIO_PROVENANCE_PATH), { recursive: true })
  const temporaryPath = `${DEFAULT_AUDIO_PROVENANCE_PATH}.${process.pid}.tmp`
  const backupPath = `${DEFAULT_AUDIO_PROVENANCE_PATH}.${process.pid}.backup`
  const hadExistingManifest = await fileExists(DEFAULT_AUDIO_PROVENANCE_PATH)
  await writeFile(temporaryPath, `${JSON.stringify(provenance, null, 2)}\n`)
  try {
    if (hadExistingManifest) await rename(DEFAULT_AUDIO_PROVENANCE_PATH, backupPath)
    await rename(temporaryPath, DEFAULT_AUDIO_PROVENANCE_PATH)
  } catch (error) {
    await rm(temporaryPath, { force: true })
    if (hadExistingManifest && !(await fileExists(DEFAULT_AUDIO_PROVENANCE_PATH))) {
      await rename(backupPath, DEFAULT_AUDIO_PROVENANCE_PATH)
    }
    throw error
  }
  try {
    await rm(backupPath, { force: true })
  } catch {}
}

function readSingleArgument(name) {
  const prefix = `${name}=`
  const value = process.argv.find((argument) => argument.startsWith(prefix))
  return value?.slice(prefix.length)
}

function readRepeatedArguments(name) {
  const prefix = `${name}=`
  const values = new Set()
  for (const argument of process.argv) {
    if (!argument.startsWith(prefix)) continue
    const value = argument.slice(prefix.length)
    if (!value) throw new Error(`${name} requires a value`)
    if (values.has(value)) throw new Error(`duplicate ${name} for ${value}`)
    values.add(value)
  }
  return values
}

function readRequestIds() {
  const result = new Map()
  const prefix = '--request-id='
  for (const argument of process.argv) {
    if (!argument.startsWith(prefix)) continue
    const assignment = argument.slice(prefix.length)
    const separator = assignment.indexOf(':')
    if (separator <= 0 || separator === assignment.length - 1) {
      throw new Error('--request-id must use --request-id=cue-id:request-id')
    }
    const cueId = assignment.slice(0, separator)
    const requestId = assignment.slice(separator + 1)
    if (result.has(cueId)) throw new Error(`duplicate --request-id for ${cueId}`)
    result.set(cueId, requestId)
  }
  return result
}
