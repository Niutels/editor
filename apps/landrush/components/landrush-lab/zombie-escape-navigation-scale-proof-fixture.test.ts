import { describe, expect, it } from 'bun:test'
import { createHash } from 'node:crypto'
import {
  createLandrushZombieEscapeCollisionWorldCompilePayloadIntegrity,
  type LandrushZombieEscapeCollisionWorldCompilePayload,
} from '@landrush/zombie-gameplay/landrush-zombie-escape-collision-world-compiler'
import { ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND } from '@landrush/zombie-gameplay/zombie-escape-collision-world'
import { ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS } from '@landrush/zombie-gameplay/zombie-escape-config'
import {
  assertLandrushZombieEscapeNavigationScaleProofFixture,
  LANDRUSH_ZOMBIE_ESCAPE_NAVIGATION_SCALE_PROOF_FIXTURE_SCHEMA_VERSION,
  LANDRUSH_ZOMBIE_ESCAPE_NAVIGATION_SCALE_PROOF_RESULT_SCHEMA_VERSION,
  serializeLandrushZombieEscapeNavigationScaleProofPayload,
} from './zombie-escape-navigation-scale-proof-fixture'

const REPLAY_BYTES = new TextEncoder().encode('{"world":"real-island-source"}\n')

function sha256(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex')
}

function createPayload(): LandrushZombieEscapeCollisionWorldCompilePayload {
  const blocker = (objectId: string, centerX: number) => ({
    breakable: true,
    centerX,
    centerZ: 0,
    halfDepth: 0.5,
    halfWidth: 0.5,
    id: `box:${objectId}`,
    objectId,
    rotation: 0,
  })
  return {
    agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
    circles: [],
    combatBoxes: [],
    navigationBoxes: [blocker('door_house_kitchen_back', 0), blocker('item_g_kitchen_run', 2)],
    navigationConnectors: [
      {
        ascendingEnd: true,
        chainId: 'stairs',
        chainLowerY: 0,
        chainOrder: 0,
        chainUpperY: 3,
        endX: 1,
        endY: 3,
        endZ: 0,
        halfWidth: 0.6,
        id: 'stairs:0',
        startX: -1,
        startY: 0,
        startZ: 0,
      },
    ],
    navigationSupports: [
      {
        boundary: true,
        elevation: 0,
        id: 'island',
        polygon: [
          { x: -20, z: -20 },
          { x: 20, z: -20 },
          { x: 20, z: 20 },
          { x: -20, z: 20 },
        ],
      },
    ],
    objectSemantics: [
      {
        objectId: 'door_house_kitchen_back',
        semanticKind: ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.door,
      },
      {
        objectId: 'item_g_kitchen_run',
        semanticKind: ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.furniture,
      },
      {
        objectId: 'stairs:0',
        semanticKind: ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.other,
      },
    ],
    playRadius: 20,
    segments: [],
  }
}

function createFixture() {
  const payload = createPayload()
  const signature = '{"source":"real-island"}'
  return {
    compilation: {
      payload,
      payloadIntegrity: createLandrushZombieEscapeCollisionWorldCompilePayloadIntegrity(
        payload,
        signature,
      ),
      payloadSha256: sha256(serializeLandrushZombieEscapeNavigationScaleProofPayload(payload)),
      signature,
    },
    expectedWorld: {
      activationRevision: 0,
      connectorCount: 1,
      fingerprint: {
        activeMaskHash: '0123456789abcdef',
        combinedHash: '1123456789abcdef',
        requiredDoorClosedBreakable: true,
        semanticKeyHash: '2123456789abcdef',
        signatureHash: '3123456789abcdef',
        topologyHash: '4123456789abcdef',
      },
      layerCount: 2,
      navigationMode: 'sparse',
      nodeCount: 4,
      revision: 'fixture-revision',
    },
    proofInput: {
      collisionWorldGeneration: 7,
      worldOrigin: { x: 1, y: 2, z: 3 },
    },
    schemaVersion: 2,
    source: {
      capturedAt: '2026-08-25T00:00:00.000Z',
      replaySha256: sha256(REPLAY_BYTES),
      worldId: 'outside',
    },
  }
}

describe('real-island navigation scale proof fixture contract', () => {
  it('pins the navigation result schema consumed by fixture parity', () => {
    expect(LANDRUSH_ZOMBIE_ESCAPE_NAVIGATION_SCALE_PROOF_FIXTURE_SCHEMA_VERSION).toBe(2)
    expect(LANDRUSH_ZOMBIE_ESCAPE_NAVIGATION_SCALE_PROOF_RESULT_SCHEMA_VERSION).toBe(7)
  })

  it('authenticates the exact serialized payload, source replay, blockers, and proof inputs', () => {
    const fixture = createFixture()
    expect(
      assertLandrushZombieEscapeNavigationScaleProofFixture(fixture, {
        payloadSha256: fixture.compilation.payloadSha256,
        replaySha256: sha256(REPLAY_BYTES),
      }),
    ).toEqual(fixture)
  })

  it('fails closed on stale content or incomplete production semantics', () => {
    const fixture = createFixture()
    expect(() =>
      assertLandrushZombieEscapeNavigationScaleProofFixture(fixture, {
        payloadSha256: '0'.repeat(64),
        replaySha256: sha256(REPLAY_BYTES),
      }),
    ).toThrow('payload SHA-256')
    expect(() =>
      assertLandrushZombieEscapeNavigationScaleProofFixture(fixture, {
        payloadSha256: fixture.compilation.payloadSha256,
        replaySha256: '0'.repeat(64),
      }),
    ).toThrow('source replay SHA-256')

    const withoutCabinet = structuredClone(fixture)
    withoutCabinet.compilation.payload.navigationBoxes.pop()
    withoutCabinet.compilation.payload.objectSemantics =
      withoutCabinet.compilation.payload.objectSemantics.filter(
        ({ objectId }) => objectId !== 'item_g_kitchen_run',
      )
    withoutCabinet.compilation.payloadSha256 = sha256(
      serializeLandrushZombieEscapeNavigationScaleProofPayload(withoutCabinet.compilation.payload),
    )
    withoutCabinet.compilation.payloadIntegrity =
      createLandrushZombieEscapeCollisionWorldCompilePayloadIntegrity(
        withoutCabinet.compilation.payload,
        withoutCabinet.compilation.signature,
      )
    expect(() =>
      assertLandrushZombieEscapeNavigationScaleProofFixture(withoutCabinet, {
        payloadSha256: withoutCabinet.compilation.payloadSha256,
        replaySha256: sha256(REPLAY_BYTES),
      }),
    ).toThrow('item_g_kitchen_run')

    const missingSemantics = structuredClone(fixture)
    missingSemantics.compilation.payload.objectSemantics = undefined as never
    reauthenticatePayload(missingSemantics)
    expect(() =>
      assertLandrushZombieEscapeNavigationScaleProofFixture(missingSemantics, {
        payloadSha256: missingSemantics.compilation.payloadSha256,
        replaySha256: sha256(REPLAY_BYTES),
      }),
    ).toThrow('payload is malformed')

    const invalidSemantics = structuredClone(fixture)
    invalidSemantics.compilation.payload.objectSemantics[0]!.semanticKind = 99 as never
    reauthenticatePayload(invalidSemantics)
    expect(() =>
      assertLandrushZombieEscapeNavigationScaleProofFixture(invalidSemantics, {
        payloadSha256: invalidSemantics.compilation.payloadSha256,
        replaySha256: sha256(REPLAY_BYTES),
      }),
    ).toThrow('payload is malformed')

    const unsortedSemantics = structuredClone(fixture)
    unsortedSemantics.compilation.payload.objectSemantics.reverse()
    reauthenticatePayload(unsortedSemantics)
    expect(() =>
      assertLandrushZombieEscapeNavigationScaleProofFixture(unsortedSemantics, {
        payloadSha256: unsortedSemantics.compilation.payloadSha256,
        replaySha256: sha256(REPLAY_BYTES),
      }),
    ).toThrow('payload is malformed')

    const wrongBlockerSemantics = structuredClone(fixture)
    wrongBlockerSemantics.compilation.payload.objectSemantics[0]!.semanticKind =
      ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.other
    reauthenticatePayload(wrongBlockerSemantics)
    expect(() =>
      assertLandrushZombieEscapeNavigationScaleProofFixture(wrongBlockerSemantics, {
        payloadSha256: wrongBlockerSemantics.compilation.payloadSha256,
        replaySha256: sha256(REPLAY_BYTES),
      }),
    ).toThrow('blocker semantics for door_house_kitchen_back')
  })
})

function reauthenticatePayload(fixture: ReturnType<typeof createFixture>) {
  fixture.compilation.payloadSha256 = sha256(
    serializeLandrushZombieEscapeNavigationScaleProofPayload(fixture.compilation.payload),
  )
  fixture.compilation.payloadIntegrity =
    createLandrushZombieEscapeCollisionWorldCompilePayloadIntegrity(
      fixture.compilation.payload,
      fixture.compilation.signature,
    )
}
