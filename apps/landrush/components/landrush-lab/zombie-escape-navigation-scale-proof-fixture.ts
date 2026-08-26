import {
  assertLandrushZombieEscapeCollisionWorldCompilePayload,
  assertLandrushZombieEscapeCollisionWorldCompilePayloadIntegrity,
  type LandrushZombieEscapeCollisionWorldCompilePayload,
} from './landrush-zombie-escape-collision-world-compiler'
import {
  ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND,
  type ZombieEscapeCollisionWorld,
} from './zombie-escape-collision-world'
import {
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from './zombie-escape-config'
import {
  inspectLandrushZombieEscapeNavigationScaleProofWorld,
  type LandrushZombieEscapeNavigationScaleProofWorldFingerprint,
} from './zombie-escape-navigation-scale-proof'

export const LANDRUSH_ZOMBIE_ESCAPE_NAVIGATION_SCALE_PROOF_FIXTURE_SCHEMA_VERSION = 2
export const LANDRUSH_ZOMBIE_ESCAPE_NAVIGATION_SCALE_PROOF_RESULT_SCHEMA_VERSION = 7
export const LANDRUSH_ZOMBIE_ESCAPE_NAVIGATION_SCALE_PROOF_RECORDED_BREACH_BLOCKER_IDS = [
  'door_house_kitchen_back',
  'item_g_kitchen_run',
] as const

const SHA_256_PATTERN = /^[0-9a-f]{64}$/
const FNV_INTEGRITY_PATTERN = /^\d+:[0-9a-f]{16}$/
const PROOF_HASH_PATTERN = /^[0-9a-f]{16}$/

export type LandrushZombieEscapeNavigationScaleProofFixture = Readonly<{
  compilation: Readonly<{
    payload: LandrushZombieEscapeCollisionWorldCompilePayload
    payloadIntegrity: string
    payloadSha256: string
    signature: string
  }>
  expectedWorld: LandrushZombieEscapeNavigationScaleProofFixtureWorldSummary
  proofInput: Readonly<{
    collisionWorldGeneration: number
    worldOrigin: Readonly<{ x: number; y: number; z: number }>
  }>
  schemaVersion: 2
  source: Readonly<{
    capturedAt: string
    replaySha256: string
    worldId: string
  }>
}>

export type LandrushZombieEscapeNavigationScaleProofFixtureWorldSummary = Readonly<{
  activationRevision: number
  connectorCount: number
  fingerprint: LandrushZombieEscapeNavigationScaleProofWorldFingerprint
  layerCount: number
  navigationMode: 'sparse'
  nodeCount: number
  revision: string
}>

export function serializeLandrushZombieEscapeNavigationScaleProofPayload(
  payload: LandrushZombieEscapeCollisionWorldCompilePayload,
) {
  return JSON.stringify(payload)
}

export function assertLandrushZombieEscapeNavigationScaleProofFixture(
  value: unknown,
  contentHashes: Readonly<{
    payloadSha256: string
    replaySha256: string
  }>,
): LandrushZombieEscapeNavigationScaleProofFixture {
  if (!isRecord(value)) throw new Error('Navigation scale proof fixture must be an object.')
  if (
    value.schemaVersion !== LANDRUSH_ZOMBIE_ESCAPE_NAVIGATION_SCALE_PROOF_FIXTURE_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported navigation scale proof fixture schema ${String(value.schemaVersion)}.`,
    )
  }
  const source = requireRecord(value.source, 'source')
  const compilation = requireRecord(value.compilation, 'compilation')
  const proofInput = requireRecord(value.proofInput, 'proofInput')
  const expectedWorld = requireRecord(value.expectedWorld, 'expectedWorld')
  const payload = compilation.payload
  if (!isCompilePayload(payload)) {
    throw new Error('Navigation scale proof fixture compilation payload is malformed.')
  }
  const signature = requireNonEmptyString(compilation.signature, 'compilation.signature')
  const payloadIntegrity = requirePattern(
    compilation.payloadIntegrity,
    FNV_INTEGRITY_PATTERN,
    'compilation.payloadIntegrity',
  )
  const payloadSha256 = requirePattern(
    compilation.payloadSha256,
    SHA_256_PATTERN,
    'compilation.payloadSha256',
  )
  const replaySha256 = requirePattern(source.replaySha256, SHA_256_PATTERN, 'source.replaySha256')
  if (contentHashes.payloadSha256 !== payloadSha256) {
    throw new Error('Navigation scale proof fixture payload SHA-256 does not match its content.')
  }
  if (contentHashes.replaySha256 !== replaySha256) {
    throw new Error('Navigation scale proof source replay SHA-256 does not match its fixture.')
  }
  assertLandrushZombieEscapeCollisionWorldCompilePayloadIntegrity(
    payload,
    signature,
    payloadIntegrity,
  )
  if (payload.agentRadius !== ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS) {
    throw new Error('Navigation scale proof fixture does not use the production roster radius.')
  }
  if (!(Number.isFinite(payload.playRadius) && payload.playRadius >= 14)) {
    throw new Error('Navigation scale proof fixture play radius is invalid.')
  }
  if (!payload.navigationSupports.some((support) => support.boundary === true)) {
    throw new Error('Navigation scale proof fixture has no authored surface boundary.')
  }
  if (payload.navigationConnectors.length === 0) {
    throw new Error('Navigation scale proof fixture has no authored navigation connector.')
  }
  for (const blockerId of LANDRUSH_ZOMBIE_ESCAPE_NAVIGATION_SCALE_PROOF_RECORDED_BREACH_BLOCKER_IDS) {
    if (!payloadAuthenticatesBreakableObject(payload, blockerId)) {
      throw new Error(`Navigation scale proof fixture does not authenticate blocker ${blockerId}.`)
    }
  }
  assertRecordedBlockerSemantics(payload)
  const worldOrigin = requireRecord(proofInput.worldOrigin, 'proofInput.worldOrigin')
  for (const axis of ['x', 'y', 'z'] as const) {
    requireFiniteNumber(worldOrigin[axis], `proofInput.worldOrigin.${axis}`)
  }
  const collisionWorldGeneration = requirePositiveInteger(
    proofInput.collisionWorldGeneration,
    'proofInput.collisionWorldGeneration',
  )
  const expectedFingerprint = requireRecord(expectedWorld.fingerprint, 'expectedWorld.fingerprint')
  for (const key of [
    'activeMaskHash',
    'combinedHash',
    'semanticKeyHash',
    'signatureHash',
    'topologyHash',
  ] as const) {
    requirePattern(expectedFingerprint[key], PROOF_HASH_PATTERN, `expectedWorld.fingerprint.${key}`)
  }
  if (expectedFingerprint.requiredDoorClosedBreakable !== true) {
    throw new Error(
      'Navigation scale proof fixture expected fingerprint does not authenticate its door.',
    )
  }
  if (expectedWorld.navigationMode !== 'sparse') {
    throw new Error('Navigation scale proof fixture expected world is not sparse.')
  }
  requireNonNegativeInteger(expectedWorld.activationRevision, 'expectedWorld.activationRevision')
  requirePositiveInteger(expectedWorld.connectorCount, 'expectedWorld.connectorCount')
  requirePositiveInteger(expectedWorld.layerCount, 'expectedWorld.layerCount')
  requirePositiveInteger(expectedWorld.nodeCount, 'expectedWorld.nodeCount')
  requireNonEmptyString(expectedWorld.revision, 'expectedWorld.revision')
  requireNonEmptyString(source.capturedAt, 'source.capturedAt')
  requireNonEmptyString(source.worldId, 'source.worldId')
  if (ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds !== 1 / 60) {
    throw new Error('Navigation scale proof production fixed step changed.')
  }
  return {
    compilation: { payload, payloadIntegrity, payloadSha256, signature },
    expectedWorld: expectedWorld as LandrushZombieEscapeNavigationScaleProofFixtureWorldSummary,
    proofInput: {
      collisionWorldGeneration,
      worldOrigin: {
        x: worldOrigin.x as number,
        y: worldOrigin.y as number,
        z: worldOrigin.z as number,
      },
    },
    schemaVersion: LANDRUSH_ZOMBIE_ESCAPE_NAVIGATION_SCALE_PROOF_FIXTURE_SCHEMA_VERSION,
    source: {
      capturedAt: source.capturedAt as string,
      replaySha256,
      worldId: source.worldId as string,
    },
  }
}

export function createLandrushZombieEscapeNavigationScaleProofFixtureWorldSummary(
  world: ZombieEscapeCollisionWorld,
  collisionWorldSignature: string,
): LandrushZombieEscapeNavigationScaleProofFixtureWorldSummary {
  if (world.navigationMode !== 'sparse') {
    throw new Error('Navigation scale proof requires a sparse compiled world.')
  }
  return {
    activationRevision: world.activationRevision,
    connectorCount: world.navigationConnectors.length,
    fingerprint: inspectLandrushZombieEscapeNavigationScaleProofWorld(
      world,
      collisionWorldSignature,
    ),
    layerCount: world.navigationLayers.length,
    navigationMode: world.navigationMode,
    nodeCount: world.navigationGraph.nodeIds.length,
    revision: world.revision,
  }
}

export function assertLandrushZombieEscapeNavigationScaleProofFixtureWorld(
  world: ZombieEscapeCollisionWorld,
  fixture: LandrushZombieEscapeNavigationScaleProofFixture,
) {
  const actual = createLandrushZombieEscapeNavigationScaleProofFixtureWorldSummary(
    world,
    fixture.compilation.signature,
  )
  if (
    actual.navigationMode !== 'sparse' ||
    JSON.stringify(actual) !== JSON.stringify(fixture.expectedWorld)
  ) {
    throw new Error(
      `Navigation scale proof compiled world does not match the canonical real-island fixture: ${JSON.stringify({ actual, expected: fixture.expectedWorld })}`,
    )
  }
  return actual
}

function payloadAuthenticatesBreakableObject(
  payload: LandrushZombieEscapeCollisionWorldCompilePayload,
  objectId: string,
) {
  const isAuthenticated = (collider: Readonly<{ breakable?: boolean; objectId?: string }>) =>
    collider.objectId === objectId && collider.breakable === true
  return (
    payload.segments.some(isAuthenticated) ||
    payload.circles.some(isAuthenticated) ||
    payload.navigationBoxes.some(isAuthenticated) ||
    payload.combatBoxes.some(isAuthenticated)
  )
}

function isCompilePayload(
  value: unknown,
): value is LandrushZombieEscapeCollisionWorldCompilePayload {
  try {
    assertLandrushZombieEscapeCollisionWorldCompilePayload(value)
    return true
  } catch {
    return false
  }
}

function assertRecordedBlockerSemantics(payload: LandrushZombieEscapeCollisionWorldCompilePayload) {
  const semanticKindsByObjectId = new Map(
    payload.objectSemantics.map(({ objectId, semanticKind }) => [objectId, semanticKind]),
  )
  const expected = [
    ['door_house_kitchen_back', ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.door],
    ['item_g_kitchen_run', ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.furniture],
  ] as const
  for (const [objectId, semanticKind] of expected) {
    if (semanticKindsByObjectId.get(objectId) !== semanticKind) {
      throw new Error(
        `Navigation scale proof fixture does not authenticate blocker semantics for ${objectId}.`,
      )
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, label: string) {
  if (!isRecord(value)) throw new Error(`Navigation scale proof fixture ${label} is malformed.`)
  return value
}

function requireNonEmptyString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Navigation scale proof fixture ${label} is malformed.`)
  }
  return value
}

function requirePattern(value: unknown, pattern: RegExp, label: string) {
  const string = requireNonEmptyString(value, label)
  if (!pattern.test(string)) {
    throw new Error(`Navigation scale proof fixture ${label} is malformed.`)
  }
  return string
}

function requireFiniteNumber(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Navigation scale proof fixture ${label} is malformed.`)
  }
  return value
}

function requirePositiveInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`Navigation scale proof fixture ${label} is malformed.`)
  }
  return value as number
}

function requireNonNegativeInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`Navigation scale proof fixture ${label} is malformed.`)
  }
  return value as number
}
