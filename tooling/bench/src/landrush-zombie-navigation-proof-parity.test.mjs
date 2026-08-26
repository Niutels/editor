import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import {
  assertLandrushZombieNavigationExecutionParity,
  assertLandrushZombieNavigationFixtureCaptureParity,
  writeLandrushZombieNavigationCanonicalFixtureFromCapture,
} from './landrush-zombie-navigation-proof-parity.mjs'

const sourceReplayBytes = Buffer.from('{"source":"replay"}\n')

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function createCaptureFixturePair() {
  const compilation = {
    payload: { agentRadius: 0.4, objectSemantics: [], playRadius: 24 },
    payloadIntegrity: '10:0123456789abcdef',
    signature: 'fixture-signature',
  }
  const expectedWorld = {
    activationRevision: 0,
    connectorCount: 4,
    fingerprint: { combinedHash: '0123456789abcdef' },
    layerCount: 2,
    navigationMode: 'sparse',
    nodeCount: 100,
    revision: 'world-revision',
  }
  const proofInput = {
    collisionWorldGeneration: 2,
    worldOrigin: { x: 1, y: 0, z: -1 },
  }
  return {
    capture: { compilation, expectedWorld, proofInput },
    fixture: {
      compilation: {
        ...compilation,
        payloadSha256: sha256(JSON.stringify(compilation.payload)),
      },
      expectedWorld: structuredClone(expectedWorld),
      proofInput: structuredClone(proofInput),
      schemaVersion: 2,
      source: { replaySha256: sha256(sourceReplayBytes) },
    },
  }
}

test('fixture parity pins source, payload, compiler metadata, installed world, and proof input', () => {
  const pair = createCaptureFixturePair()
  assert.doesNotThrow(() =>
    assertLandrushZombieNavigationFixtureCaptureParity({ ...pair, sourceReplayBytes }),
  )
  for (const mutation of [
    (value) => {
      value.fixture.compilation.payloadSha256 = '0'.repeat(64)
    },
    (value) => {
      value.capture.compilation.signature = 'different'
    },
    (value) => {
      value.capture.expectedWorld.nodeCount += 1
    },
    (value) => {
      value.capture.proofInput.collisionWorldGeneration += 1
    },
  ]) {
    const changed = structuredClone(pair)
    mutation(changed)
    assert.throws(() =>
      assertLandrushZombieNavigationFixtureCaptureParity({
        ...changed,
        sourceReplayBytes,
      }),
    )
  }
})

test('execution parity requires exact result, issue-list, and summary identity', () => {
  const invalidButEqual = { populations: [], schemaVersion: 6 }
  assert.throws(() =>
    assertLandrushZombieNavigationExecutionParity({
      browserResult: invalidButEqual,
      headlessResult: structuredClone(invalidButEqual),
    }),
  )
  assert.throws(() =>
    assertLandrushZombieNavigationExecutionParity({
      browserResult: invalidButEqual,
      headlessResult: { ...invalidButEqual, schemaVersion: 5 },
    }),
  )
})

test('canonical fixture capture fails closed before writing a malformed source replay', async () => {
  const { capture } = createCaptureFixturePair()
  await assert.rejects(
    writeLandrushZombieNavigationCanonicalFixtureFromCapture({
      capture,
      sourceReplayBytes: Buffer.from('{"schemaVersion":1}'),
    }),
    /capturedAt/,
  )
})
