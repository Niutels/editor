import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'
import { auditZombieEscapeAudio } from './audit-zombie-escape-audio.mjs'
import {
  DEFAULT_AUDIO_PROVENANCE_PATH,
  DEFAULT_PUBLIC_ROOT,
} from './zombie-escape-audio-pipeline.mjs'

const execFileAsync = promisify(execFile)
const generatorPath = resolve(import.meta.dirname, 'generate-zombie-escape-audio.mjs')

test('audits every checked-in ElevenLabs web artifact against measured file metadata', async () => {
  const audit = await auditZombieEscapeAudio({ requireReady: true })

  assert.equal(audit.pass, true, audit.failures.join('\n'))
  assert.equal(audit.ready, true)
  assert.equal(audit.artifactCount, 22)
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

test('allows a clean pending catalog but --require-ready rejects it', async () => {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'zombie-audio-pending-'))
  try {
    const provenancePath = resolve(temporaryRoot, 'provenance.json')
    const publicRoot = resolve(temporaryRoot, 'public')
    const checkedIn = JSON.parse(await readFile(DEFAULT_AUDIO_PROVENANCE_PATH, 'utf8'))
    await writeFile(
      provenancePath,
      JSON.stringify({
        artifacts: {},
        catalogSha256: null,
        catalogVersion: checkedIn.catalogVersion,
        generatedAt: null,
        schemaVersion: 1,
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
