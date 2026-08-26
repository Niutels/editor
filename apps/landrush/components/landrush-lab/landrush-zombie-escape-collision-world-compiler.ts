import {
  createZombieEscapeCollisionWorld,
  ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND,
  type ZombieEscapeCollisionBoxSource,
  type ZombieEscapeCollisionCircleSource,
  type ZombieEscapeCollisionObjectSemanticSource,
  type ZombieEscapeCollisionSegmentSource,
  type ZombieEscapeCollisionWorld,
  type ZombieEscapeNavigationConnectorSource,
  type ZombieEscapeNavigationSupportSource,
} from './zombie-escape-collision-world'

const FNV_1A_64_OFFSET_BASIS = 0xcbf2_9ce4_8422_2325n
const FNV_1A_64_PRIME = 0x0000_0100_0000_01b3n
const UINT_64_MASK = 0xffff_ffff_ffff_ffffn

export type LandrushZombieEscapeCollisionWorldCompilePayload = Readonly<{
  agentRadius: number
  circles: readonly ZombieEscapeCollisionCircleSource[]
  combatBoxes: readonly ZombieEscapeCollisionBoxSource[]
  navigationBoxes: readonly ZombieEscapeCollisionBoxSource[]
  navigationConnectors: readonly ZombieEscapeNavigationConnectorSource[]
  navigationSupports: readonly ZombieEscapeNavigationSupportSource[]
  objectSemantics: readonly ZombieEscapeCollisionObjectSemanticSource[]
  playRadius: number
  segments: readonly ZombieEscapeCollisionSegmentSource[]
}>

export type LandrushZombieEscapeCollisionWorlds = Readonly<{
  combat: ZombieEscapeCollisionWorld
  navigation: ZombieEscapeCollisionWorld
}>

export function assertLandrushZombieEscapeCollisionWorldCompilePayload(
  value: unknown,
): asserts value is LandrushZombieEscapeCollisionWorldCompilePayload {
  if (!isRecord(value)) throwInvalidCompilePayload('must be an object')
  if (!(Number.isFinite(value.agentRadius) && Number.isFinite(value.playRadius))) {
    throwInvalidCompilePayload('must have finite agentRadius and playRadius values')
  }
  for (const key of [
    'circles',
    'combatBoxes',
    'navigationBoxes',
    'navigationConnectors',
    'navigationSupports',
    'objectSemantics',
    'segments',
  ] as const) {
    if (!Array.isArray(value[key])) throwInvalidCompilePayload(`${key} must be an array`)
  }
  const arrays = value as Record<
    | 'circles'
    | 'combatBoxes'
    | 'navigationBoxes'
    | 'navigationConnectors'
    | 'navigationSupports'
    | 'objectSemantics'
    | 'segments',
    readonly unknown[]
  >

  const sourceObjectIds = new Set<string>()
  for (const source of [
    ...arrays.circles,
    ...arrays.combatBoxes,
    ...arrays.navigationBoxes,
    ...arrays.navigationConnectors,
    ...arrays.segments,
  ]) {
    if (!isRecord(source)) throwInvalidCompilePayload('contains a malformed collision source')
    const objectId =
      typeof source.objectId === 'string' && source.objectId.length > 0
        ? source.objectId
        : source.id
    if (typeof objectId !== 'string' || objectId.length === 0) {
      throwInvalidCompilePayload('contains a collision source without an object id')
    }
    sourceObjectIds.add(objectId)
  }

  let previousObjectId: string | null = null
  const semanticObjectIds = new Set<string>()
  for (const semantic of arrays.objectSemantics) {
    if (!isRecord(semantic)) throwInvalidCompilePayload('contains malformed object semantics')
    const { objectId, semanticKind } = semantic
    if (typeof objectId !== 'string' || objectId.length === 0) {
      throwInvalidCompilePayload('contains object semantics without an object id')
    }
    if (
      semanticKind !== ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.other &&
      semanticKind !== ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.door &&
      semanticKind !== ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.furniture
    ) {
      throwInvalidCompilePayload(`contains an invalid semantic kind for ${objectId}`)
    }
    if (previousObjectId !== null && previousObjectId.localeCompare(objectId) >= 0) {
      throwInvalidCompilePayload('object semantics must be uniquely sorted by object id')
    }
    previousObjectId = objectId
    semanticObjectIds.add(objectId)
  }
  if (
    semanticObjectIds.size !== sourceObjectIds.size ||
    [...sourceObjectIds].some((objectId) => !semanticObjectIds.has(objectId))
  ) {
    throwInvalidCompilePayload('object semantics must cover every compiled collision object')
  }
}

export function createLandrushZombieEscapeCollisionWorldsFromCompilePayload(
  payload: LandrushZombieEscapeCollisionWorldCompilePayload,
): LandrushZombieEscapeCollisionWorlds {
  assertLandrushZombieEscapeCollisionWorldCompilePayload(payload)
  const {
    agentRadius,
    circles,
    combatBoxes,
    navigationBoxes,
    navigationConnectors,
    navigationSupports,
    objectSemantics,
    playRadius,
    segments,
  } = payload
  const navigation = createZombieEscapeCollisionWorld({
    agentRadius,
    boundaryPolicy: navigationSupports.some((support) => support.boundary === true)
      ? 'none'
      : 'solid',
    boxes: navigationBoxes,
    circles,
    navigationConnectors,
    navigationSupports,
    objectSemantics,
    playRadius,
    segments,
  })
  const combat = createZombieEscapeCollisionWorld({
    agentRadius,
    boundaryPolicy: 'none',
    boxes: combatBoxes,
    cellSize: Math.max(1, playRadius * 2),
    circles,
    navigationConnectors: [],
    navigationSupports: [],
    objectSemantics,
    playRadius,
    segments,
  })
  return { combat, navigation }
}

export function createLandrushZombieEscapeCollisionWorldCompilePayloadIntegrity(
  payload: LandrushZombieEscapeCollisionWorldCompilePayload,
  signature: string,
) {
  const serialized = JSON.stringify([signature, payload])
  let hash = FNV_1A_64_OFFSET_BASIS
  for (let index = 0; index < serialized.length; index += 1) {
    const codeUnit = serialized.charCodeAt(index)
    hash ^= BigInt(codeUnit & 0xff)
    hash = (hash * FNV_1A_64_PRIME) & UINT_64_MASK
    hash ^= BigInt(codeUnit >>> 8)
    hash = (hash * FNV_1A_64_PRIME) & UINT_64_MASK
  }
  return `${String(serialized.length)}:${hash.toString(16).padStart(16, '0')}`
}

export function assertLandrushZombieEscapeCollisionWorldCompilePayloadIntegrity(
  payload: LandrushZombieEscapeCollisionWorldCompilePayload,
  signature: string,
  expectedIntegrity: string,
) {
  assertLandrushZombieEscapeCollisionWorldCompilePayload(payload)
  const actualIntegrity = createLandrushZombieEscapeCollisionWorldCompilePayloadIntegrity(
    payload,
    signature,
  )
  if (actualIntegrity === expectedIntegrity) return
  const error = new Error('Collision-world compile payload failed integrity validation.')
  error.name = 'DataError'
  throw error
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function throwInvalidCompilePayload(reason: string): never {
  const error = new Error(`Collision-world compile payload ${reason}.`)
  error.name = 'DataError'
  throw error
}
