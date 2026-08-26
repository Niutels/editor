import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  summarizeZombieNavigationScaleProof,
  zombieNavigationScaleProofIssues,
} from './scenario/scenarios/landrush-zombie-navigation-scale-proof-contract.mjs'

const execFileAsync = promisify(execFile)
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

export const LANDRUSH_ZOMBIE_NAVIGATION_FIXTURE_PATH = path.join(
  REPO_ROOT,
  'tooling/bench/fixtures/landrush-zombie-navigation-real-island.v2.json',
)
export const LANDRUSH_ZOMBIE_NAVIGATION_SOURCE_REPLAY_PATH = path.join(
  REPO_ROOT,
  'tooling/bench/fixtures/landrush-zombie-navigation-real-island-source.v1.json',
)
export const LANDRUSH_ZOMBIE_NAVIGATION_BROWSER_PARITY_RESULT_PATH = path.join(
  REPO_ROOT,
  '.landrush-local/benchmark-reports/landrush-zombie-navigation-proof-parity.json',
)

export async function loadLandrushZombieNavigationCanonicalFixture() {
  const [fixtureBytes, sourceReplayBytes] = await Promise.all([
    readFile(LANDRUSH_ZOMBIE_NAVIGATION_FIXTURE_PATH),
    readFile(LANDRUSH_ZOMBIE_NAVIGATION_SOURCE_REPLAY_PATH),
  ])
  return {
    fixture: JSON.parse(fixtureBytes.toString('utf8')),
    sourceReplayBytes,
  }
}

export async function writeLandrushZombieNavigationCanonicalFixtureFromCapture({
  capture,
  sourceReplayBytes,
}) {
  const sourceReplay = JSON.parse(sourceReplayBytes.toString('utf8'))
  assert.equal(sourceReplay?.schemaVersion, 1, 'source replay schema must be v1')
  assert.equal(typeof sourceReplay?.capturedAt, 'string', 'source replay capturedAt is missing')
  assert.equal(
    typeof sourceReplay?.report?.save?.worldId,
    'string',
    'source replay worldId is missing',
  )
  const fixture = {
    compilation: {
      ...capture.compilation,
      payloadSha256: sha256(JSON.stringify(capture.compilation.payload)),
    },
    expectedWorld: capture.expectedWorld,
    proofInput: capture.proofInput,
    schemaVersion: 2,
    source: {
      capturedAt: sourceReplay.capturedAt,
      replaySha256: sha256(sourceReplayBytes),
      worldId: sourceReplay.report.save.worldId,
    },
  }
  await writeFile(
    LANDRUSH_ZOMBIE_NAVIGATION_FIXTURE_PATH,
    `${JSON.stringify(fixture, null, 2)}\n`,
    'utf8',
  )
  return fixture
}

export function assertLandrushZombieNavigationFixtureCaptureParity({
  capture,
  fixture,
  sourceReplayBytes,
}) {
  assert.equal(fixture?.schemaVersion, 2, 'canonical fixture schema must be v2')
  assert.equal(
    fixture?.source?.replaySha256,
    sha256(sourceReplayBytes),
    'canonical source replay SHA-256 changed',
  )
  assert.equal(
    fixture?.compilation?.payloadSha256,
    sha256(JSON.stringify(capture?.compilation?.payload)),
    'browser payload SHA-256 differs from the canonical fixture',
  )
  assert.deepEqual(
    capture?.compilation,
    {
      payload: fixture?.compilation?.payload,
      payloadIntegrity: fixture?.compilation?.payloadIntegrity,
      signature: fixture?.compilation?.signature,
    },
    'browser production compilation differs from the canonical fixture',
  )
  assert.deepEqual(
    capture?.expectedWorld,
    fixture?.expectedWorld,
    'browser installed-world fingerprint differs from the canonical fixture',
  )
  assert.deepEqual(
    capture?.proofInput,
    fixture?.proofInput,
    'browser proof generation or world origin differs from the canonical fixture',
  )
  return {
    payloadSha256: fixture.compilation.payloadSha256,
    replaySha256: fixture.source.replaySha256,
    world: capture.expectedWorld,
  }
}

export function assertLandrushZombieNavigationExecutionParity({
  browserResult,
  headlessResult,
}) {
  const browserIssues = zombieNavigationScaleProofIssues(browserResult)
  const headlessIssues = zombieNavigationScaleProofIssues(headlessResult)
  const browserSummary = summarizeZombieNavigationScaleProof(browserResult)
  const headlessSummary = summarizeZombieNavigationScaleProof(headlessResult)
  assert.deepEqual(headlessIssues, browserIssues, 'browser/headless proof issue lists differ')
  assert.deepEqual(headlessSummary, browserSummary, 'browser/headless proof summaries differ')
  assert.deepEqual(headlessResult, browserResult, 'browser/headless proof results differ')
  assert.deepEqual(browserIssues, [], `browser proof issues: ${browserIssues.join('; ')}`)
  return { issues: browserIssues, summary: browserSummary }
}

export async function runHeadlessLandrushZombieNavigationProofProcess({
  timeoutMs = 120_000,
} = {}) {
  const executable = process.execPath
  const script = path.join(
    REPO_ROOT,
    'apps/landrush/scripts/run-zombie-navigation-scale-proof.mjs',
  )
  const { stdout } = await execFileAsync(
    executable,
    [script, `--timeout-ms=${String(timeoutMs)}`],
    {
      cwd: REPO_ROOT,
      maxBuffer: 16 * 1024 * 1024,
      timeout: timeoutMs + 30_000,
      windowsHide: true,
    },
  )
  return JSON.parse(stdout)
}

export async function writeLandrushZombieNavigationBrowserParityResult(value) {
  await writeFile(
    LANDRUSH_ZOMBIE_NAVIGATION_BROWSER_PARITY_RESULT_PATH,
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  )
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}
