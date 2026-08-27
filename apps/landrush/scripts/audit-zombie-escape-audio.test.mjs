import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import {
  auditZombieEscapeAudio,
  findDuplicateZombieEscapeAudioArtifactHashes,
} from './audit-zombie-escape-audio.mjs'
import {
  DEFAULT_AUDIO_PROVENANCE_PATH,
  DEFAULT_PUBLIC_ROOT,
  inspectZombieEscapeAudioIntegrity,
  masterZombieEscapeOneShotAudio,
  readZombieEscapeAudioContract,
  validateZombieEscapeAudioCatalog,
  validateZombieEscapeOneShotMastering,
  validateZombieEscapeOneShotVariantSpread,
} from './zombie-escape-audio-pipeline.mjs'

const execFileAsync = promisify(execFile)
const generatorPath = resolve(import.meta.dirname, 'generate-zombie-escape-audio.mjs')

test('expands each explicit zombie variant with its matching mastered prompt', async () => {
  const contract = await readZombieEscapeAudioContract()
  const zombieCues = [
    contract.catalog.cues.find((cue) => cue.id === 'enemy-hit'),
    contract.catalog.cues.find((cue) => cue.id === 'enemy-death'),
    contract.catalog.presenceCues.find((cue) => cue.id === 'enemy-presence'),
  ]

  for (const cue of zombieCues) {
    assert.ok(cue)
    const assets = contract.assets.filter((asset) => asset.cueId === cue.id)
    assert.deepEqual(
      assets.map((asset) => asset.publicPath),
      cue.files,
    )
    assert.deepEqual(
      assets.map((asset) => asset.prompt),
      cue.variantPrompts,
    )
    assert.deepEqual(
      assets.map((asset) => asset.variantIndex),
      [0, 1, 2],
    )
    assert.ok(assets.every((asset) => asset.masteringProfile === 'one-shot-v1'))
  }
})

test('rejects ambiguous or oversized explicit zombie variant prompts', async () => {
  const contract = await readZombieEscapeAudioContract()
  const duplicate = structuredClone(contract.catalog)
  const duplicateHit = duplicate.cues.find((cue) => cue.id === 'enemy-hit')
  duplicateHit.variantPrompts[1] = ` ${duplicateHit.variantPrompts[0].toUpperCase()} `
  assert.throws(
    () => validateZombieEscapeAudioCatalog(duplicate),
    /variantPrompts must be unique after normalization/,
  )

  const oversized = structuredClone(contract.catalog)
  oversized.presenceCues[0].variantPrompts[0] = 'x'.repeat(451)
  assert.throws(
    () => validateZombieEscapeAudioCatalog(oversized),
    /must be at most 450 characters/,
  )
})

test('audits every checked-in ElevenLabs artifact against measured file metadata', async () => {
  const audit = await auditZombieEscapeAudio({ requireReady: true })

  assert.equal(audit.pass, true, audit.failures.join('\n'))
  assert.equal(audit.ready, true)
  assert.equal(audit.artifactCount, 27)
  assert.equal(audit.artifactCount, audit.expectedArtifactCount)

  const shippingAudit = await auditZombieEscapeAudio({
    probeMedia: false,
    requireReady: true,
  })
  assert.equal(shippingAudit.pass, true, shippingAudit.failures.join('\n'))
  assert.equal(shippingAudit.ready, true)
})

test('rejects provenance that does not match immutable audio bytes', async () => {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'zombie-audio-audit-'))
  try {
    const provenance = JSON.parse(await readFile(DEFAULT_AUDIO_PROVENANCE_PATH, 'utf8'))
    const firstArtifact = Object.values(provenance.artifacts)[0]
    firstArtifact.sha256 = '0'.repeat(64)
    const provenancePath = resolve(temporaryRoot, 'provenance.json')
    await writeFile(provenancePath, JSON.stringify(provenance))

    const audit = await auditZombieEscapeAudio({
      provenancePath,
      publicRoot: DEFAULT_PUBLIC_ROOT,
    })
    assert.equal(audit.pass, false)
    assert.ok(audit.failures.some((failure) => failure.includes(': sha256:')))
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true })
  }
})

test('rejects duplicate artifact hashes within one cue but permits reuse across cues', () => {
  const duplicateHash = 'a'.repeat(64)
  const uniqueHash = 'b'.repeat(64)
  const firstPath = '/audios/sfx/zombie-escape/enemy/hit-0.mp3'
  const duplicatePath = '/audios/sfx/zombie-escape/enemy/hit-1.mp3'
  const otherCuePath = '/audios/sfx/zombie-escape/enemy/death-0.mp3'
  const uniquePath = '/audios/sfx/zombie-escape/enemy/hit-2.mp3'
  const assets = [
    { cueId: 'enemy-hit', publicPath: firstPath },
    { cueId: 'enemy-hit', publicPath: duplicatePath },
    { cueId: 'enemy-death', publicPath: otherCuePath },
    { cueId: 'enemy-hit', publicPath: uniquePath },
  ]
  const artifacts = {
    [firstPath]: { sha256: duplicateHash },
    [duplicatePath]: { sha256: duplicateHash },
    [otherCuePath]: { sha256: duplicateHash },
    [uniquePath]: { sha256: uniqueHash },
  }

  assert.deepEqual(findDuplicateZombieEscapeAudioArtifactHashes(assets, artifacts), [
    `${duplicatePath}: sha256 duplicates ${firstPath} within cue enemy-hit`,
  ])
})

test('allows a clean pending catalog but --require-ready rejects it', async () => {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'zombie-audio-pending-'))
  try {
    const provenancePath = resolve(temporaryRoot, 'provenance.json')
    const publicRoot = resolve(temporaryRoot, 'public')
    const contract = await readZombieEscapeAudioContract()
    await writeFile(
      provenancePath,
      JSON.stringify({
        artifacts: {},
        catalogSha256: null,
        catalogVersion: contract.catalog.catalogVersion,
        generatedAt: null,
        schemaVersion: 2,
        source: null,
      }),
    )

    const pending = await auditZombieEscapeAudio({ provenancePath, publicRoot })
    assert.equal(pending.pass, true)
    assert.equal(pending.ready, false)
    assert.equal(pending.status, 'pending')

    const required = await auditZombieEscapeAudio({
      provenancePath,
      publicRoot,
      requireReady: true,
    })
    assert.equal(required.pass, false)
    assert.deepEqual(required.failures, ['audio assets are pending generation'])
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true })
  }
})

test('API generation refuses to run without an environment-only ElevenLabs key', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [generatorPath], {
      env: { ...process.env, ELEVENLABS_API_KEY: '' },
      windowsHide: true,
    }),
    (error) => error.stderr.includes('ELEVENLABS_API_KEY is required'),
  )
})

test('web recording requires explicit prompt and privacy settings', async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [generatorPath, '--record-web'], {
      windowsHide: true,
    }),
    (error) =>
      error.stderr.includes(
        '--record-web requires --prompt-improvement=off and --explore-sharing=off',
      ),
  )
})

test('masters one-shot sources deterministically into the audited loudness envelope', async () => {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'zombie-audio-mastering-'))
  try {
    const inputPath = resolve(temporaryRoot, 'input.mp3')
    const outputAPath = resolve(temporaryRoot, 'output-a.mp3')
    const outputBPath = resolve(temporaryRoot, 'output-b.mp3')
    await execFileAsync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=48000:duration=0.5',
        '-af',
        'volume=0.03',
        '-codec:a',
        'libmp3lame',
        '-b:a',
        '192k',
        inputPath,
      ],
      { windowsHide: true },
    )

    const first = await masterZombieEscapeOneShotAudio(inputPath, outputAPath)
    const second = await masterZombieEscapeOneShotAudio(inputPath, outputBPath)
    const [integrityA, integrityB] = await Promise.all([
      inspectZombieEscapeAudioIntegrity(outputAPath),
      inspectZombieEscapeAudioIntegrity(outputBPath),
    ])

    assert.equal(integrityA.sha256, integrityB.sha256)
    assert.deepEqual(validateZombieEscapeOneShotMastering(first.outputLoudness), [])
    assert.deepEqual(first.outputLoudness, second.outputLoudness)
    assert.notEqual(first.inputInspection.sha256, integrityA.sha256)
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true })
  }
})

test('rejects one-shot output outside the mastering envelope', () => {
  const failures = validateZombieEscapeOneShotMastering({
    integratedLoudnessLufs: -31,
    truePeakDbfs: -0.5,
  })

  assert.equal(failures.length, 2)
})

test('rejects mastered variants whose integrated loudness differs by more than one LU', () => {
  assert.deepEqual(
    validateZombieEscapeOneShotVariantSpread([
      { integratedLoudnessLufs: -20.1 },
      { integratedLoudnessLufs: -20.9 },
    ]),
    [],
  )
  assert.equal(
    validateZombieEscapeOneShotVariantSpread([
      { integratedLoudnessLufs: -19.8 },
      { integratedLoudnessLufs: -21.1 },
    ]).length,
    1,
  )
})
