import { ZOMBIE_ESCAPE_COLLISION_EPSILON_METERS } from './zombie-escape-collision-tolerances'
import {
  classifyZombieEscapeCollisionObjectDelta,
  createZombieEscapeCollisionHit,
  createZombieEscapeCollisionObjectDeltaResult,
  createZombieEscapeNavigationMoveResult,
  createZombieEscapeSparseCommittedNodeRoute,
  createZombieEscapeSparseSpawnAnchor,
  deactivateZombieEscapeCollisionObject,
  followZombieEscapeCachedSparseWaypoint,
  getZombieEscapeSparseCommittedRouteContentHash,
  getZombieEscapeSparseCommittedRouteGeneration,
  inspectZombieEscapeSparseAttachmentHeapLeases,
  inspectZombieEscapeSparseReverseFieldBanks,
  moveZombieEscapeNavigationAgent,
  resolveZombieEscapeCollisionHitObjectId,
  sampleZombieEscapeSparseCommittedNodeRoute,
  sampleZombieEscapeSparseSpawnAnchor,
  sweepZombieEscapeCircleAgainstWorldInVerticalRange,
  type ZombieEscapeCollisionWorld,
  type ZombieEscapeFlowSample,
  type ZombieEscapeSparseReverseFieldBankInspection,
  type ZombieEscapeSparseSearchBudget,
  zombieEscapeSegmentIsClearInVerticalRange,
} from './zombie-escape-collision-world'
import {
  getZombieEscapeZombieCatalogEntry,
  getZombieEscapeZombieCollisionRadiusMeters,
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from './zombie-escape-config'
import { createZombieEscapeControlState } from './zombie-escape-controls'
import {
  applyZombieEscapeObstacleDelta,
  createZombieEscapeSimulation,
  inspectZombieEscapeCommittedNavigationAction,
  setZombieEscapeCollisionWorld,
  setZombieEscapeExternalPlayerPose,
  setZombieEscapeGamePhase,
  setZombieEscapeObstacleDamageEnabled,
  spawnZombieEscapeZombieAtNavigationElevation,
  stepZombieEscapeSimulationPhysics,
  ZOMBIE_ESCAPE_ZOMBIE_INTENT,
  type ZombieEscapeSimulation,
} from './zombie-escape-simulation'
import { resolveSparseNavigationStrictRegionWitnessNode } from './zombie-escape-sparse-navigation'
import type { ZombieEscapeArenaData } from './zombie-escape-world'
import { ZOMBIE_ESCAPE_ZOMBIE_GAIT } from './zombie-escape-zombie-roster'

const RECORDED_ROOM_OUTSIDE_WORLD_X = -27
const RECORDED_ROOM_OUTSIDE_WORLD_Z = -17.5
const RECORDED_ROOM_INSIDE_WORLD_X = -27
const RECORDED_ROOM_INSIDE_WORLD_Z = -14.5
const RECORDED_ROOM_TRANSITION_FIXED_STEP_COUNT = 52
const RECORDED_ROOM_BUILDING_SCOPE_ID = 'parcel:parcel-02'
const RECORDED_ROOM_DOOR_ID = 'door_house_kitchen_back'
const RECORDED_ROOM_CABINET_ID = 'item_g_kitchen_run'
const RECORDED_ROOM_BREACH_BLOCKER_IDS = [RECORDED_ROOM_DOOR_ID, RECORDED_ROOM_CABINET_ID] as const
const RECORDED_ROOM_LEVEL_ID = 'level_landrush-parcel-1msovbflbvkdc-0'
const SMALL_POPULATION = 14
const SCALE_POPULATION = 100
const DEFAULT_PROOF_TIMEOUT_MS = 120_000
const PROOF_YIELD_TICK_INTERVAL = 16
const HASH_SEED_A = 2_166_136_261
const HASH_SEED_B = 2_246_822_519
const LOCKSTEP_MOVEMENT_SPEED_SCALE = 0.25
const LOCKSTEP_RADIAL_GAP_FRACTION_OF_FIRST_STEP = 0.5
const MAXIMUM_REPAIR_FIRST_SERVICE_TICKS = 60
const MAXIMUM_REPAIR_HOLD_TICKS = 60
const INITIAL_TARGET_PUBLICATION_TICK_CAP = 4_096
const PRODUCTION_TOPOLOGY_REPAIR_TICK_CAP = 30

const ZERO_SPARSE_SEARCH_BUDGET: ZombieEscapeSparseSearchBudget = {
  maximumCandidateVisits: 0,
  maximumCollisionPredicates: 0,
  maximumHeapOperations: 0,
  maximumHierarchyNodeVisits: 0,
  maximumSupportPredicates: 0,
}

const TARGET_WORK_KEYS = [
  'candidateVisits',
  'collisionPredicates',
  'graphEdgeVisits',
  'heapOperations',
  'hierarchyNodeVisits',
  'publications',
  'serviceSlices',
  'supportPredicates',
  'targetBuilds',
] as const

type TargetWorkKey = (typeof TARGET_WORK_KEYS)[number]
type MutableTargetWork = { -readonly [Key in TargetWorkKey]: number }

export type LandrushZombieEscapeNavigationScaleProofTargetWork = Readonly<
  Record<TargetWorkKey, number>
>

export type LandrushZombieEscapeNavigationScaleProofTraceSample = Readonly<{
  index: number
  x: number
  y: number
  z: number
}>

export type LandrushZombieEscapeNavigationScaleProofWorldFingerprint = Readonly<{
  activeMaskHash: string
  combinedHash: string
  requiredDoorClosedBreakable: boolean
  semanticKeyHash: string
  signatureHash: string
  topologyHash: string
}>

export type LandrushZombieEscapeNavigationScaleProofCounterDelta = Readonly<{
  attachmentWork: number
  cachedAnchorLost: number
  inlineRecoveryWithoutFirstService: number
  intentCanceled: number
  intentFirstService: number
  intentIssued: number
  intentResolved: number
  intentResolveSlices: number
  routePublishedDemand: number
  searchRestarted: number
  searchStarted: number
  searchUncausedStartViolations: number
}>

export type LandrushZombieEscapeNavigationScaleProofFrozenClassification = Readonly<{
  adoptedAgentCount: number
  committedGeneration: number
  counterDelta: LandrushZombieEscapeNavigationScaleProofCounterDelta
  directActionCount: number
  invalidAgentCount: number
  maximumAgentServiceSlicesPerTick: number
  maximumFirstServiceAgeTicks: number
  maximumRepairFirstServiceTicks: number
  maximumRepairHoldTicks: number
  maximumSuccessorVisits: number
  publicationAdoptedAgentCount: number
  publicationRepairAgentCount: number
  reacquiringAgentCount: number
  repairFirstServiceObservedCount: number
  repairHoldObservedCount: number
  repairInlineRecoveryWithoutFirstServiceCount: number
  settleTickCount: number
}>

export type LandrushZombieEscapeNavigationScaleProofReacquisitionWitness = Readonly<{
  counterDelta: LandrushZombieEscapeNavigationScaleProofCounterDelta
  enabledAgentCount: number
  finalAdoptedAgentCount: number
  fixtureParkingAgentCount: number
  fixtureParkingDistanceMaximum: number
  fixtureParkingDistanceMinimum: number
  fixtureParkingPoseHash: string
  fixtureParkingSetupOnly: true
  currentGenerationMovementOnly: true
  lockstepAnalyticFirstTickDisplacement: number
  lockstepAnchorOccupancy: number
  lockstepFirstTickDisplacement: number
  lockstepFirstTickRadialProgress: number
  lockstepPoseHash: string
  lockstepRadialGap: number
  lockstepSeparationNeighborDelta: number
  lockstepSpeedScale: number
  maximumAdoptionTick: number
  maximumInitialWaypointDistance: number
  movementStartCoincidentAgentCount: number
  setupValidationCounterDelta: LandrushZombieEscapeNavigationScaleProofCounterDelta
  setupValidationUnchangedAgentCount: number
  tickCount: number
}>

export type LandrushZombieEscapeNavigationScaleProofTransition = Readonly<{
  frozen: LandrushZombieEscapeNavigationScaleProofFrozenClassification
  generationAfter: number
  generationBefore: number
  movement: LandrushZombieEscapeNavigationScaleProofReacquisitionWitness
}>

export type LandrushZombieEscapeNavigationScaleProofTopologyTransition = Readonly<{
  frozen: LandrushZombieEscapeNavigationScaleProofFrozenClassification
  generationAfter: number
  generationBefore: number
}>

export type LandrushZombieEscapeNavigationScaleProofConnectorWitness = Readonly<{
  completed: boolean
  direction: 'lower-to-upper' | 'upper-to-lower'
  endLayerIndex: number
  endY: number
  enteredConnector: boolean
  finalConnectorIndex: number
  startLayerIndex: number
  sourceNode: number
  sourceRadialReady: boolean
  startY: number
  tickCount: number
  waypointAdvanced: boolean
}>

export type LandrushZombieEscapeNavigationScaleProofPopulation = Readonly<{
  activeAgentCount: number
  anchorDigest: string
  anchorNodeCount: number
  bounds: Readonly<{
    coldDrainTickCap: number
    connectorTickCap: number
    maximumRepairFirstServiceTicks: number
    maximumRepairHoldTicks: number
    productionTopologyRepairTickCap: number
    topologyTransitionTickCap: number
    targetDrainTickCap: number
  }>
  coldDrainTicks: number
  coldReadyAgentCount: number
  maximumAnchorNodeOccupancy: number
  navigationGraphNodeCount: number
  navigationOnly: true
  noAudioEventDelta: number
  population: number
  publicationTransitions: Readonly<{
    lower: LandrushZombieEscapeNavigationScaleProofTransition
    upper: LandrushZombieEscapeNavigationScaleProofTransition
  }>
  reverseFieldAfter: ZombieEscapeSparseReverseFieldBankInspection
  reverseFieldBefore: ZombieEscapeSparseReverseFieldBankInspection
  sharedFourteenAnchorPrefixHash: string
  target: Readonly<{
    committedContentHash: number
    committedGeneration: number
    eventCount: number
    explicitRequestCount: number
    maximumStepWork: LandrushZombieEscapeNavigationScaleProofTargetWork
    physicsTickCount: number
    publicationHash: string
    tickWorkHash: string
    work: LandrushZombieEscapeNavigationScaleProofTargetWork
  }>
  topologyTransitions: Readonly<{
    lower: LandrushZombieEscapeNavigationScaleProofTopologyTransition
    upper: LandrushZombieEscapeNavigationScaleProofTopologyTransition
  }>
  uniqueAnchorNodeCount: number
}>

export type LandrushZombieEscapeNavigationScaleProofResult = Readonly<{
  connector: Readonly<{
    chainId: string
    connectorId: string
    connectorIndex: number
    lowerLayerIndex: number
    lowerSourceNode: number
    lowerTargetNode: number
    upperLayerIndex: number
    upperSourceNode: number
    upperTargetNode: number
    functionalCorrectnessOnly: true
    planHash: string
    refreshDelta: LandrushZombieEscapeNavigationScaleProofCounterDelta
    witnessHash: string
    witnesses: readonly [
      LandrushZombieEscapeNavigationScaleProofConnectorWitness,
      LandrushZombieEscapeNavigationScaleProofConnectorWitness,
    ]
    workHash: string
  }>
  fixedDeltaSeconds: number
  navigationOnlyLimitation: string
  populations: readonly [
    LandrushZombieEscapeNavigationScaleProofPopulation,
    LandrushZombieEscapeNavigationScaleProofPopulation,
  ]
  schemaVersion: 7
  trace: Readonly<{
    hash: string
    recordedBreachBlockerIds: readonly string[]
    recordedBuildingScopeId: string
    recordedDoorFixedStepCount: number
    recordedDoorId: string
    recordedInsideWorld: Readonly<{ x: number; y: number; z: number }>
    recordedLevelId: string
    recordedOutsideWorld: Readonly<{ x: number; y: number; z: number }>
    requestCount: number
    samples: readonly LandrushZombieEscapeNavigationScaleProofTraceSample[]
  }>
  world: Readonly<{
    activationRevision: number
    collisionWorldGeneration: number
    connectorCount: number
    fingerprintAfter: LandrushZombieEscapeNavigationScaleProofWorldFingerprint
    fingerprintBefore: LandrushZombieEscapeNavigationScaleProofWorldFingerprint
    layerCount: number
    navigationMode: ZombieEscapeCollisionWorld['navigationMode']
    nodeCount: number
    revision: string
  }>
}>

export type LandrushZombieEscapeNavigationScaleProofInput = Readonly<{
  arena: ZombieEscapeArenaData
  collisionWorld: ZombieEscapeCollisionWorld
  collisionWorldGeneration: number
  collisionWorldSignature: string
  fixedDeltaSeconds: number
  signal?: AbortSignal
  timeoutMs?: number
  worldOrigin: Readonly<{ x: number; y: number; z: number }>
}>

type ProofTarget = Readonly<{ x: number; y: number; z: number }>

export type LandrushZombieEscapeNavigationScaleProofConnectorPlan = Readonly<{
  chainId: string
  connectorId: string
  connectorIndex: number
  lowerLayerIndex: number
  lowerSourceNode: number
  lowerTargetNode: number
  upperLayerIndex: number
  upperSourceNode: number
  upperTargetNode: number
}>

export type LandrushZombieEscapeNavigationScaleProofAnchorCertificate = Readonly<{
  elevation: number
  generation: number
  layerIndex: number
  node: number
  storedX: number
  storedZ: number
  usesFallback: boolean
  witnessNode: number
  x: number
  z: number
}>

type PopulationAnchorLayout =
  | Readonly<{ mode: 'explicit'; nodes: Int32Array }>
  | Readonly<{ mode: 'lockstep' }>

type TargetWorkSnapshot = Readonly<Record<TargetWorkKey, number>>

type TargetRecorder = {
  eventCount: number
  explicitRequestCount: number
  maximumStepWork: MutableTargetWork
  physicsTickCount: number
  previous: TargetWorkSnapshot
  publicationHash: ProofHash
  tickWorkHash: ProofHash
  work: MutableTargetWork
}

type PopulationHarness = {
  anchorNodes: Int32Array
  audioSequenceBefore: number
  bounds: {
    coldDrainTickCap: number
    connectorTickCap: number
    maximumRepairFirstServiceTicks: number
    maximumRepairHoldTicks: number
    productionTopologyRepairTickCap: number
    topologyTransitionTickCap: number
    targetDrainTickCap: number
  }
  input: ReturnType<typeof createZombieEscapeControlState>
  plan: LandrushZombieEscapeNavigationScaleProofConnectorPlan
  population: number
  simulation: ZombieEscapeSimulation
  targetRecorder: TargetRecorder
}

class ProofHash {
  private first = HASH_SEED_A
  private second = HASH_SEED_B
  private readonly floatBuffer = new ArrayBuffer(8)
  private readonly floatBytes = new Uint8Array(this.floatBuffer)
  private readonly floatView = new DataView(this.floatBuffer)

  addByte(value: number) {
    const byte = value & 0xff
    this.first = Math.imul(this.first ^ byte, 16_777_619) >>> 0
    this.second = Math.imul(this.second ^ byte, 2_246_822_519) >>> 0
  }

  addNumber(value: number) {
    this.addByte(0x6e)
    this.floatView.setFloat64(0, value, true)
    for (const byte of this.floatBytes) this.addByte(byte)
  }

  addString(value: string) {
    this.addByte(0x73)
    this.addNumber(value.length)
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index)
      this.addByte(code)
      this.addByte(code >>> 8)
    }
  }

  digest() {
    return `${this.first.toString(16).padStart(8, '0')}${this.second.toString(16).padStart(8, '0')}`
  }
}

function hashStableValue(hash: ProofHash, value: unknown): void {
  if (value === null) {
    hash.addByte(0)
    return
  }
  if (value === undefined) {
    hash.addByte(1)
    return
  }
  if (typeof value === 'boolean') {
    hash.addByte(value ? 3 : 2)
    return
  }
  if (typeof value === 'number') {
    hash.addNumber(value)
    return
  }
  if (typeof value === 'string') {
    hash.addString(value)
    return
  }
  if (ArrayBuffer.isView(value)) {
    const view = value as unknown as { readonly length: number; readonly [index: number]: number }
    hash.addString(value.constructor.name)
    hash.addNumber(view.length)
    for (let index = 0; index < view.length; index += 1) hash.addNumber(view[index]!)
    return
  }
  if (Array.isArray(value)) {
    hash.addByte(0x61)
    hash.addNumber(value.length)
    for (const item of value) hashStableValue(hash, item)
    return
  }
  if (value instanceof Map) {
    hash.addByte(0x6d)
    const entries = [...value.entries()].sort(([first], [second]) =>
      String(first).localeCompare(String(second)),
    )
    hash.addNumber(entries.length)
    for (const [key, item] of entries) {
      hashStableValue(hash, key)
      hashStableValue(hash, item)
    }
    return
  }
  if (value instanceof Set) {
    hash.addByte(0x74)
    const entries = [...value].sort((first, second) => String(first).localeCompare(String(second)))
    hash.addNumber(entries.length)
    for (const item of entries) hashStableValue(hash, item)
    return
  }
  if (typeof value === 'object') {
    hash.addByte(0x6f)
    const object = value as Record<string, unknown>
    const keys = Object.keys(object).sort()
    hash.addNumber(keys.length)
    for (const key of keys) {
      hash.addString(key)
      hashStableValue(hash, object[key])
    }
    return
  }
  throw new Error(`navigation scale proof cannot hash ${typeof value}`)
}

function stableHash(value: unknown) {
  const hash = new ProofHash()
  hashStableValue(hash, value)
  return hash.digest()
}

function float32Ulp(value: number) {
  const magnitude = Math.abs(Math.fround(value))
  if (magnitude === 0) return 2 ** -149
  return 2 ** (Math.floor(Math.log2(magnitude)) - 23)
}

function createWorldTopologyProjection(world: ZombieEscapeCollisionWorld) {
  const graph = world.navigationGraph
  return {
    agentRadius: world.agentRadius,
    boundaryPolicy: world.boundaryPolicy,
    boxes: world.boxes,
    breakableObjectIds: world.breakableObjectIds,
    cellSize: world.cellSize,
    circles: world.circles,
    gridHeight: world.gridHeight,
    gridOriginX: world.gridOriginX,
    gridOriginZ: world.gridOriginZ,
    gridWidth: world.gridWidth,
    navigationConnectorAdjacency: world.navigationConnectorAdjacency,
    navigationConnectors: world.navigationConnectors,
    navigationGraph: {
      bucketSize: graph.bucketSize,
      buckets: graph.buckets,
      connectorEnds: graph.connectorEnds,
      connectorIndices: graph.connectorIndices,
      fallbackAdjacency: graph.fallbackAdjacency,
      fallbackComponentIndices: graph.fallbackComponentIndices,
      fallbackSameLayerComponentIndices: graph.fallbackSameLayerComponentIndices,
      layerIndices: graph.layerIndices,
      maximumBucketX: graph.maximumBucketX,
      maximumBucketZ: graph.maximumBucketZ,
      minimumBucketX: graph.minimumBucketX,
      minimumBucketZ: graph.minimumBucketZ,
      nodeIds: graph.nodeIds,
      nodeKeys: graph.nodeKeys,
      strictAdjacency: graph.strictAdjacency,
      strictComponentIndices: graph.strictComponentIndices,
      strictSameLayerComponentIndices: graph.strictSameLayerComponentIndices,
      supportIndices: graph.supportIndices,
      supportOffsets: graph.supportOffsets,
      x: graph.x,
      z: graph.z,
    },
    navigationLayers: world.navigationLayers,
    navigationMode: world.navigationMode,
    navigationSupports: world.navigationSupports,
    objectCatalog: world.objectCatalog,
    playRadius: world.playRadius,
    segments: world.segments,
  }
}

function parseJson(value: string, label: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new Error(`navigation scale proof ${label} is not valid JSON`)
  }
}

function signatureAuthenticatesClosedRecordedDoor(signatureValue: unknown) {
  if (
    !Array.isArray(signatureValue) ||
    signatureValue.length !== 7 ||
    typeof signatureValue[6] !== 'string'
  ) {
    return false
  }
  let semanticEntries: unknown
  try {
    semanticEntries = JSON.parse(signatureValue[6]) as unknown
  } catch {
    return false
  }
  return (
    Array.isArray(semanticEntries) &&
    semanticEntries.some(
      (entry) =>
        Array.isArray(entry) &&
        entry.length === 6 &&
        entry[0] === 'door' &&
        entry[1] === RECORDED_ROOM_DOOR_ID &&
        entry[5] === false,
    )
  )
}

function worldAuthenticatesActiveBreakableRecordedDoor(world: ZombieEscapeCollisionWorld) {
  return worldAuthenticatesActiveBreakableCollisionObject(world, RECORDED_ROOM_DOOR_ID)
}

function worldAuthenticatesActiveBreakableCollisionObject(
  world: ZombieEscapeCollisionWorld,
  objectId: string,
) {
  const objectOrdinal = world.objectCatalog.objectIds.indexOf(objectId)
  const colliders = [...world.segments, ...world.circles, ...world.boxes]
  return (
    objectOrdinal >= 0 &&
    world.objectCatalog.objectHasCollider[objectOrdinal] === 1 &&
    world.objectCatalog.objectSupportsMaskRemoval[objectOrdinal] === 1 &&
    world.activeObjectMask[objectOrdinal] === 1 &&
    world.breakableObjectIds.has(objectId) &&
    colliders.some(
      (collider, colliderIndex) =>
        collider.objectId === objectId &&
        collider.breakable === true &&
        world.objectCatalog.colliderObjectOrdinals[colliderIndex] === objectOrdinal,
    )
  )
}

export function inspectLandrushZombieEscapeNavigationScaleProofWorld(
  world: ZombieEscapeCollisionWorld,
  collisionWorldSignature: string,
): LandrushZombieEscapeNavigationScaleProofWorldFingerprint {
  parseJson(world.semanticKey, 'world semantic key')
  const signatureValue = parseJson(collisionWorldSignature, 'collision-world signature')
  const topologyHash = stableHash(createWorldTopologyProjection(world))
  const activeMaskHash = stableHash({
    activationRevision: world.activationRevision,
    activeObjectMask: world.activeObjectMask,
    revision: world.revision,
  })
  const semanticKeyHash = stableHash(world.semanticKey)
  const signatureHash = stableHash(collisionWorldSignature)
  const requiredDoorClosedBreakable =
    signatureAuthenticatesClosedRecordedDoor(signatureValue) &&
    worldAuthenticatesActiveBreakableRecordedDoor(world)
  return {
    activeMaskHash,
    combinedHash: stableHash({ activeMaskHash, semanticKeyHash, signatureHash, topologyHash }),
    requiredDoorClosedBreakable,
    semanticKeyHash,
    signatureHash,
    topologyHash,
  }
}

export function createLandrushZombieEscapeNavigationScaleProofOpenWorld(
  closedWorld: ZombieEscapeCollisionWorld,
  worldOrigin: Readonly<{ x: number; y: number; z: number }>,
) {
  const samples = createRecordedRoomSamples(worldOrigin)
  const openWorld = structuredClone(closedWorld)
  for (const blockerId of RECORDED_ROOM_BREACH_BLOCKER_IDS) {
    if (!worldAuthenticatesActiveBreakableCollisionObject(openWorld, blockerId)) {
      throw new Error(
        `navigation scale proof recorded blocker ${blockerId} is not an active breakable mask-removable collider`,
      )
    }
    const blockedSweep = findRecordedRoomExpectedBlockerSweep(openWorld, samples, blockerId)
    const delta = createZombieEscapeCollisionObjectDeltaResult()
    if (
      classifyZombieEscapeCollisionObjectDelta(openWorld, blockerId, delta) !== 'changed' ||
      deactivateZombieEscapeCollisionObject(openWorld, delta) !== 'changed'
    ) {
      throw new Error(
        `navigation scale proof could not remove recorded blocker ${blockerId} through an obstacle delta`,
      )
    }
    const clearedHit = sweepRecordedRoomTraceSegment(openWorld, blockedSweep)
    if (clearedHit.colliderKind !== 'none') {
      const objectId = resolveZombieEscapeCollisionHitObjectId(openWorld, clearedHit)
      throw new Error(
        `navigation scale proof recorded blocker sweep remained blocked by ${objectId ?? clearedHit.colliderKind} after removing ${blockerId}`,
      )
    }
  }
  assertRecordedRoomTraceUsesOpenTopology(openWorld, samples)
  return openWorld
}

function createTargetWork(): MutableTargetWork {
  return {
    candidateVisits: 0,
    collisionPredicates: 0,
    graphEdgeVisits: 0,
    heapOperations: 0,
    hierarchyNodeVisits: 0,
    publications: 0,
    serviceSlices: 0,
    supportPredicates: 0,
    targetBuilds: 0,
  }
}

function readTargetWorkSnapshot(state: ZombieEscapeSimulation): TargetWorkSnapshot {
  const work = state.navigationSparseTargetWork
  return {
    candidateVisits: work.candidateVisitsTotal,
    collisionPredicates: work.collisionPredicatesTotal,
    graphEdgeVisits: work.graphEdgeVisitsTotal,
    heapOperations: work.heapOperationsTotal,
    hierarchyNodeVisits: work.hierarchyNodeVisitsTotal,
    publications: inspectZombieEscapeSparseReverseFieldBanks(state.navigationField)
      .publicationCount,
    serviceSlices: state.navigationSparseSearchTargetServiceSliceCountTotal,
    supportPredicates: work.supportPredicatesTotal,
    targetBuilds: state.navigationSparseSearchTargetBuildsTotal,
  }
}

function createTargetRecorder(state: ZombieEscapeSimulation): TargetRecorder {
  return {
    eventCount: 0,
    explicitRequestCount: 0,
    maximumStepWork: createTargetWork(),
    physicsTickCount: 0,
    previous: readTargetWorkSnapshot(state),
    publicationHash: new ProofHash(),
    tickWorkHash: new ProofHash(),
    work: createTargetWork(),
  }
}

function recordTargetWork(state: ZombieEscapeSimulation, recorder: TargetRecorder) {
  const next = readTargetWorkSnapshot(state)
  const delta = createTargetWork()
  let hasEvent = false
  for (const key of TARGET_WORK_KEYS) {
    const amount = next[key] - recorder.previous[key]
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new Error(`navigation scale proof target counter ${key} regressed`)
    }
    delta[key] = amount
    recorder.work[key] += amount
    recorder.maximumStepWork[key] = Math.max(recorder.maximumStepWork[key], amount)
    if (amount !== 0) hasEvent = true
  }
  recorder.previous = next
  recorder.physicsTickCount += 1
  if (hasEvent) {
    recorder.tickWorkHash.addNumber(recorder.eventCount)
    for (const key of TARGET_WORK_KEYS) recorder.tickWorkHash.addNumber(delta[key])
    recorder.tickWorkHash.addNumber(state.navigationTargetRequestedRevision)
    recorder.tickWorkHash.addNumber(state.navigationTargetCommittedRouteGeneration)
    recorder.eventCount += 1
  }
  if (delta.publications > 0) {
    recorder.publicationHash.addNumber(delta.publications)
    recorder.publicationHash.addNumber(
      getZombieEscapeSparseCommittedRouteGeneration(state.navigationField),
    )
    recorder.publicationHash.addNumber(
      getZombieEscapeSparseCommittedRouteContentHash(state.navigationField),
    )
  }
}

function createRecordedRoomSamples(worldOrigin: Readonly<{ x: number; y: number; z: number }>) {
  return Array.from(
    { length: RECORDED_ROOM_TRANSITION_FIXED_STEP_COUNT + 1 },
    (_, step): LandrushZombieEscapeNavigationScaleProofTraceSample => {
      const amount = step / RECORDED_ROOM_TRANSITION_FIXED_STEP_COUNT
      return {
        index: step,
        x:
          RECORDED_ROOM_OUTSIDE_WORLD_X +
          (RECORDED_ROOM_INSIDE_WORLD_X - RECORDED_ROOM_OUTSIDE_WORLD_X) * amount -
          worldOrigin.x,
        y: 0,
        z:
          RECORDED_ROOM_OUTSIDE_WORLD_Z +
          (RECORDED_ROOM_INSIDE_WORLD_Z - RECORDED_ROOM_OUTSIDE_WORLD_Z) * amount -
          worldOrigin.z,
      }
    },
  )
}

function sweepRecordedRoomTraceSegment(
  world: ZombieEscapeCollisionWorld,
  segment: Readonly<{
    end: LandrushZombieEscapeNavigationScaleProofTraceSample
    start: LandrushZombieEscapeNavigationScaleProofTraceSample
  }>,
) {
  const hit = createZombieEscapeCollisionHit()
  sweepZombieEscapeCircleAgainstWorldInVerticalRange(
    world,
    segment.start.x,
    segment.start.z,
    segment.end.x - segment.start.x,
    segment.end.z - segment.start.z,
    world.agentRadius,
    segment.start.y + 0.05,
    segment.start.y + 1.8,
    hit,
  )
  return hit
}

function findRecordedRoomExpectedBlockerSweep(
  world: ZombieEscapeCollisionWorld,
  samples: readonly LandrushZombieEscapeNavigationScaleProofTraceSample[],
  expectedBlockerId: string,
) {
  for (let index = 1; index < samples.length; index += 1) {
    const segment = { end: samples[index]!, start: samples[index - 1]! }
    const hit = sweepRecordedRoomTraceSegment(world, segment)
    if (hit.colliderKind === 'none') continue
    const objectId = resolveZombieEscapeCollisionHitObjectId(world, hit)
    if (!(hit.time > 0 && hit.time < 1)) {
      throw new Error(
        `navigation scale proof expected a positive-time hit on ${expectedBlockerId} but ${objectId ?? hit.colliderKind} hit at ${String(hit.time)} on sweep ${String(index - 1)}-${String(index)}`,
      )
    }
    if (objectId !== expectedBlockerId) {
      throw new Error(
        `navigation scale proof expected recorded blocker ${expectedBlockerId} but hit ${objectId ?? hit.colliderKind} on sweep ${String(index - 1)}-${String(index)}`,
      )
    }
    return segment
  }
  throw new Error(
    `navigation scale proof recorded trace has no positive-time sweep blocked by ${expectedBlockerId}`,
  )
}

function findNearestNodeOnLayer(
  world: ZombieEscapeCollisionWorld,
  layerIndex: number,
  x: number,
  z: number,
) {
  const graph = world.navigationGraph
  let bestNode = -1
  let bestDistanceSquared = Number.POSITIVE_INFINITY
  for (let node = 0; node < graph.nodeIds.length; node += 1) {
    if (graph.layerIndices[node] !== layerIndex) continue
    const distanceSquared = (graph.x[node]! - x) ** 2 + (graph.z[node]! - z) ** 2
    if (
      distanceSquared < bestDistanceSquared ||
      (distanceSquared === bestDistanceSquared &&
        (bestNode < 0 || graph.nodeIds[node]!.localeCompare(graph.nodeIds[bestNode]!) < 0))
    ) {
      bestNode = node
      bestDistanceSquared = distanceSquared
    }
  }
  return bestNode
}

function findConnectorEndpointNode(
  world: ZombieEscapeCollisionWorld,
  connectorIndex: number,
  layerIndex: number,
  x: number,
  z: number,
) {
  const graph = world.navigationGraph
  let bestNode = -1
  let bestDistanceSquared = Number.POSITIVE_INFINITY
  for (let node = 0; node < graph.nodeIds.length; node += 1) {
    if (
      graph.connectorIndices[node] !== connectorIndex ||
      graph.layerIndices[node] !== layerIndex
    ) {
      continue
    }
    const distanceSquared = (graph.x[node]! - x) ** 2 + (graph.z[node]! - z) ** 2
    if (distanceSquared < bestDistanceSquared) {
      bestNode = node
      bestDistanceSquared = distanceSquared
    }
  }
  return bestNode
}

function findCrossLayerNeighbor(
  world: ZombieEscapeCollisionWorld,
  sourceNode: number,
  targetLayerIndex: number,
) {
  const graph = world.navigationGraph
  const start = graph.strictAdjacency.nodeOffsets[sourceNode]!
  const end = graph.strictAdjacency.nodeOffsets[sourceNode + 1]!
  for (let edge = start; edge < end; edge += 1) {
    const node = graph.strictAdjacency.toNodes[edge]!
    if (graph.layerIndices[node] === targetLayerIndex) return node
  }
  return -1
}

function resolveFirstHopDistances(world: ZombieEscapeCollisionWorld, sourceNode: number) {
  const graph = world.navigationGraph
  const nodeCount = graph.nodeIds.length
  const distances = new Float64Array(nodeCount).fill(Number.POSITIVE_INFINITY)
  const firstHops = new Int32Array(nodeCount).fill(-1)
  const visited = new Uint8Array(nodeCount)
  distances[sourceNode] = 0
  firstHops[sourceNode] = sourceNode
  for (let iteration = 0; iteration < nodeCount; iteration += 1) {
    let current = -1
    let currentDistance = Number.POSITIVE_INFINITY
    for (let node = 0; node < nodeCount; node += 1) {
      if (visited[node] !== 0 || distances[node]! >= currentDistance) continue
      current = node
      currentDistance = distances[node]!
    }
    if (current < 0) break
    visited[current] = 1
    const start = graph.strictAdjacency.nodeOffsets[current]!
    const end = graph.strictAdjacency.nodeOffsets[current + 1]!
    for (let edge = start; edge < end; edge += 1) {
      const next = graph.strictAdjacency.toNodes[edge]!
      const distance = currentDistance + graph.strictAdjacency.weights[edge]!
      const firstHop = current === sourceNode ? next : firstHops[current]!
      if (
        distance < distances[next]! ||
        (distance === distances[next]! &&
          (firstHops[next]! < 0 ||
            graph.nodeIds[firstHop]!.localeCompare(graph.nodeIds[firstHops[next]!]!) < 0))
      ) {
        distances[next] = distance
        firstHops[next] = firstHop
      }
    }
  }
  return { distances, firstHops }
}

function selectConnectorTargetNode(
  world: ZombieEscapeCollisionWorld,
  sourceNode: number,
  crossLayerNode: number,
  targetLayerIndex: number,
  connectorLength: number,
  acceptsTarget: (node: number) => boolean = () => true,
) {
  const graph = world.navigationGraph
  const { distances, firstHops } = resolveFirstHopDistances(world, sourceNode)
  let bestNode = -1
  let bestDistance = Number.POSITIVE_INFINITY
  let fallbackNode = -1
  let fallbackDistance = Number.NEGATIVE_INFINITY
  let openLandingFallbackNode = -1
  let openLandingFallbackDistance = Number.NEGATIVE_INFINITY
  for (let node = 0; node < graph.nodeIds.length; node += 1) {
    if (graph.layerIndices[node] !== targetLayerIndex) continue
    if (!Number.isFinite(distances[node]!)) continue
    if (firstHops[node] !== crossLayerNode) continue
    if (!acceptsTarget(node)) continue
    const sufficientlyDistant = distances[node]! >= connectorLength + 1.5
    if (sufficientlyDistant && distances[node]! > openLandingFallbackDistance) {
      openLandingFallbackNode = node
      openLandingFallbackDistance = distances[node]!
    }
    if (!nodeIsObstructedFromTarget(world, crossLayerNode, targetForNode(world, node))) continue
    if (distances[node]! > fallbackDistance) {
      fallbackNode = node
      fallbackDistance = distances[node]!
    }
    if (!sufficientlyDistant) continue
    if (distances[node]! >= bestDistance) continue
    bestNode = node
    bestDistance = distances[node]!
  }
  if (bestNode >= 0) return bestNode
  return fallbackNode >= 0 ? fallbackNode : openLandingFallbackNode
}

function nodeIsObstructedFromTarget(
  world: ZombieEscapeCollisionWorld,
  node: number,
  target: ProofTarget,
) {
  const graph = world.navigationGraph
  const layerIndex = graph.layerIndices[node]!
  const layer = world.navigationLayers[layerIndex]
  if (!layer || Math.abs(layer.elevation - target.y) > 0.08) return true
  return !zombieEscapeSegmentIsClearInVerticalRange(
    world,
    graph.x[node]!,
    graph.z[node]!,
    target.x,
    target.z,
    world.agentRadius,
    layer.elevation + 0.05,
    layer.elevation + 1.8,
  )
}

function selectProductionConnectorPlan(
  world: ZombieEscapeCollisionWorld,
  initialTarget: ProofTarget,
): LandrushZombieEscapeNavigationScaleProofConnectorPlan {
  const graph = world.navigationGraph
  const rejections: Array<Readonly<Record<string, number | string>>> = []
  const reject = (
    connectorIndex: number,
    stage: string,
    details: Readonly<Record<string, number | string>> = {},
  ) => {
    const connector = world.navigationConnectors[connectorIndex]!
    rejections.push({
      chainId: connector.chainId,
      connectorId: connector.id,
      connectorIndex,
      stage,
      ...details,
    })
  }
  const targetLayerIndex = worldLayerNearestY(world, initialTarget.y)
  const targetNode = findNearestNodeOnLayer(
    world,
    targetLayerIndex,
    initialTarget.x,
    initialTarget.z,
  )
  if (targetNode < 0) {
    throw new Error('navigation scale proof initial target has no production graph node')
  }
  const targetComponent = graph.fallbackComponentIndices[targetNode]
  const ordered = [...world.navigationConnectors.keys()].sort((firstIndex, secondIndex) => {
    const first = world.navigationConnectors[firstIndex]!
    const second = world.navigationConnectors[secondIndex]!
    return (
      Math.abs(second.chainUpperY - second.chainLowerY) -
        Math.abs(first.chainUpperY - first.chainLowerY) ||
      first.chainId.localeCompare(second.chainId) ||
      first.chainOrder - second.chainOrder ||
      first.id.localeCompare(second.id)
    )
  })
  for (const connectorIndex of ordered) {
    const connector = world.navigationConnectors[connectorIndex]!
    const startElevation = world.navigationLayers[connector.startLayerIndex]?.elevation
    const endElevation = world.navigationLayers[connector.endLayerIndex]?.elevation
    if (
      startElevation === undefined ||
      endElevation === undefined ||
      startElevation === endElevation
    ) {
      reject(connectorIndex, 'invalid-layer-transition', {
        endLayerIndex: connector.endLayerIndex,
        startLayerIndex: connector.startLayerIndex,
      })
      continue
    }
    const startNode = findConnectorEndpointNode(
      world,
      connectorIndex,
      connector.startLayerIndex,
      connector.startX,
      connector.startZ,
    )
    const endNode = findConnectorEndpointNode(
      world,
      connectorIndex,
      connector.endLayerIndex,
      connector.endX,
      connector.endZ,
    )
    if (startNode < 0 || endNode < 0) {
      reject(connectorIndex, 'missing-endpoint-node', { endNode, startNode })
      continue
    }
    if (
      graph.fallbackComponentIndices[startNode] !== targetComponent ||
      graph.fallbackComponentIndices[endNode] !== targetComponent
    ) {
      reject(connectorIndex, 'outside-target-fallback-component', {
        endComponent: graph.fallbackComponentIndices[endNode]!,
        startComponent: graph.fallbackComponentIndices[startNode]!,
        targetComponent: targetComponent!,
      })
      continue
    }
    const lowerSourceNode = startElevation < endElevation ? startNode : endNode
    const upperSourceNode = startElevation < endElevation ? endNode : startNode
    const lowerLayerIndex = graph.layerIndices[lowerSourceNode]!
    const upperLayerIndex = graph.layerIndices[upperSourceNode]!
    const lowerCrossNode = findCrossLayerNeighbor(world, lowerSourceNode, upperLayerIndex)
    const upperCrossNode = findCrossLayerNeighbor(world, upperSourceNode, lowerLayerIndex)
    if (lowerCrossNode < 0 || upperCrossNode < 0) {
      reject(connectorIndex, 'missing-bidirectional-cross-layer-edge', {
        lowerCrossNode,
        lowerSourceNode,
        upperCrossNode,
        upperSourceNode,
      })
      continue
    }
    const initialSourceNode =
      graph.layerIndices[lowerSourceNode] === targetLayerIndex ? lowerSourceNode : upperSourceNode
    if (!nodeIsObstructedFromTarget(world, initialSourceNode, initialTarget)) {
      reject(connectorIndex, 'initial-source-has-direct-target-line-of-sight', {
        initialSourceNode,
        targetLayerIndex,
      })
      continue
    }
    const upperTargetNode = selectConnectorTargetNode(
      world,
      lowerSourceNode,
      lowerCrossNode,
      upperLayerIndex,
      connector.length,
    )
    const lowerTargetNode = selectConnectorTargetNode(
      world,
      upperSourceNode,
      upperCrossNode,
      lowerLayerIndex,
      connector.length,
      (node) =>
        connectorTargetNodeClearsTraversalCombatReach(
          world,
          connectorIndex,
          !connector.ascendingEnd,
          node,
        ),
    )
    if (upperTargetNode < 0 || lowerTargetNode < 0) {
      reject(connectorIndex, 'missing-bidirectional-target-node', {
        lowerTargetNode,
        upperTargetNode,
      })
      continue
    }
    return {
      chainId: connector.chainId,
      connectorId: connector.id,
      connectorIndex,
      lowerLayerIndex,
      lowerSourceNode,
      lowerTargetNode,
      upperLayerIndex,
      upperSourceNode,
      upperTargetNode,
    }
  }
  throw new Error(
    `navigation scale proof requires a bidirectional production connector witness: ${JSON.stringify(
      {
        connectorCount: world.navigationConnectors.length,
        rejections,
        targetComponent,
        targetLayerIndex,
        targetNode,
      },
    )}`,
  )
}

export function createLandrushZombieEscapeNavigationScaleProofTrace(
  world: ZombieEscapeCollisionWorld,
  worldOrigin: Readonly<{ x: number; y: number; z: number }>,
) {
  const samples = createRecordedRoomSamples(worldOrigin)
  const connector = selectProductionConnectorPlan(world, samples[0]!)
  return {
    connector,
    hash: stableHash({ recordedBreachBlockerIds: RECORDED_ROOM_BREACH_BLOCKER_IDS, samples }),
    recordedBreachBlockerIds: [...RECORDED_ROOM_BREACH_BLOCKER_IDS],
    recordedBuildingScopeId: RECORDED_ROOM_BUILDING_SCOPE_ID,
    recordedDoorFixedStepCount: RECORDED_ROOM_TRANSITION_FIXED_STEP_COUNT,
    recordedDoorId: RECORDED_ROOM_DOOR_ID,
    recordedInsideWorld: {
      x: RECORDED_ROOM_INSIDE_WORLD_X,
      y: worldOrigin.y,
      z: RECORDED_ROOM_INSIDE_WORLD_Z,
    },
    recordedLevelId: RECORDED_ROOM_LEVEL_ID,
    recordedOutsideWorld: {
      x: RECORDED_ROOM_OUTSIDE_WORLD_X,
      y: worldOrigin.y,
      z: RECORDED_ROOM_OUTSIDE_WORLD_Z,
    },
    requestCount: samples.length,
    samples,
  } as const
}

function assertRecordedRoomTraceUsesOpenTopology(
  world: ZombieEscapeCollisionWorld,
  samples: readonly LandrushZombieEscapeNavigationScaleProofTraceSample[],
) {
  for (let index = 1; index < samples.length; index += 1) {
    const hit = sweepRecordedRoomTraceSegment(world, {
      end: samples[index]!,
      start: samples[index - 1]!,
    })
    if (hit.colliderKind === 'none') continue
    const objectId = resolveZombieEscapeCollisionHitObjectId(world, hit)
    throw new Error(
      `navigation scale proof recorded room trace intersects active collider ${objectId ?? hit.colliderKind} on sweep ${String(index - 1)}-${String(index)}`,
    )
  }
}

function createProofBounds(world: ZombieEscapeCollisionWorld, population: number) {
  const graph = world.navigationGraph
  const nodeCount = graph.nodeIds.length
  const edgeCount = graph.strictAdjacency.toNodes.length + graph.fallbackAdjacency.toNodes.length
  const graphRounds = Math.max(1, Math.ceil(edgeCount / Math.max(1, nodeCount)))
  const serviceRounds = Math.ceil(
    population / Math.max(1, ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick),
  )
  const topologyTickCap = Math.max(360, nodeCount * 12 + edgeCount * 2)
  return {
    coldDrainTickCap: Math.max(
      256,
      nodeCount * 8 + serviceRounds * (8 + Math.ceil(Math.log2(nodeCount + 1)) + graphRounds),
    ),
    connectorTickCap: topologyTickCap,
    maximumRepairFirstServiceTicks: MAXIMUM_REPAIR_FIRST_SERVICE_TICKS,
    maximumRepairHoldTicks: MAXIMUM_REPAIR_HOLD_TICKS,
    productionTopologyRepairTickCap: PRODUCTION_TOPOLOGY_REPAIR_TICK_CAP,
    topologyTransitionTickCap: MAXIMUM_REPAIR_HOLD_TICKS,
    targetDrainTickCap: Math.max(192, topologyTickCap),
  }
}

export function createLandrushZombieEscapeNavigationScaleProofCertifiedAnchorSet(
  state: ZombieEscapeSimulation,
) {
  const graph = state.collisionWorld.navigationGraph
  const currentGeneration = state.navigationTargetCommittedRouteGeneration
  const fieldGeneration = getZombieEscapeSparseCommittedRouteGeneration(state.navigationField)
  const authoredAnchor = createZombieEscapeSparseSpawnAnchor()
  const authoredRoute = createZombieEscapeSparseCommittedNodeRoute()
  const storedAnchor = createZombieEscapeSparseSpawnAnchor()
  const storedRoute = createZombieEscapeSparseCommittedNodeRoute()
  const certified = new Map<number, LandrushZombieEscapeNavigationScaleProofAnchorCertificate>()
  if (currentGeneration <= 0 || fieldGeneration !== currentGeneration) return certified
  for (let node = 0; node < graph.nodeIds.length; node += 1) {
    const layerIndex = graph.layerIndices[node]!
    const layer = state.collisionWorld.navigationLayers[layerIndex]
    if (!layer) continue
    const x = graph.x[node]!
    const z = graph.z[node]!
    if (
      !sampleZombieEscapeSparseSpawnAnchor(
        state.navigationField,
        x,
        z,
        layer.elevation,
        authoredRoute,
        authoredAnchor,
      ) ||
      !authoredAnchor.reachable ||
      authoredAnchor.layerIndex !== layerIndex ||
      authoredAnchor.elevation !== layer.elevation ||
      authoredAnchor.generation !== currentGeneration
    ) {
      continue
    }
    const storedX = Math.fround(x)
    const storedZ = Math.fround(z)
    if (
      !sampleZombieEscapeSparseSpawnAnchor(
        state.navigationField,
        storedX,
        storedZ,
        layer.elevation,
        storedRoute,
        storedAnchor,
      ) ||
      !storedAnchor.reachable ||
      storedAnchor.layerIndex !== layerIndex ||
      storedAnchor.elevation !== layer.elevation ||
      storedAnchor.generation !== currentGeneration ||
      storedAnchor.witnessNode !== authoredAnchor.witnessNode ||
      storedAnchor.usesFallback !== authoredAnchor.usesFallback
    ) {
      continue
    }
    certified.set(node, {
      elevation: authoredAnchor.elevation,
      generation: authoredAnchor.generation,
      layerIndex: authoredAnchor.layerIndex,
      node,
      storedX,
      storedZ,
      usesFallback: authoredAnchor.usesFallback,
      witnessNode: authoredAnchor.witnessNode,
      x,
      z,
    })
  }
  return certified
}

export function selectLandrushZombieEscapeNavigationScaleProofAnchorNodes(
  world: ZombieEscapeCollisionWorld,
  plan: LandrushZombieEscapeNavigationScaleProofConnectorPlan,
  initialTarget: ProofTarget,
  roomTarget: ProofTarget,
  population: number,
  certifiedAnchors: ReadonlyMap<number, LandrushZombieEscapeNavigationScaleProofAnchorCertificate>,
) {
  const graph = world.navigationGraph
  const initialLayer = worldLayerNearestY(world, initialTarget.y)
  const targetNode = findNearestNodeOnLayer(world, initialLayer, initialTarget.x, initialTarget.z)
  const component = graph.fallbackComponentIndices[targetNode]
  const excluded = new Set([plan.lowerSourceNode, plan.upperSourceNode])
  const targets = [
    initialTarget,
    roomTarget,
    targetForNode(world, plan.lowerTargetNode),
    targetForNode(world, plan.upperTargetNode),
  ]
  const candidates = [...graph.nodeIds.keys()]
    .filter(
      (node) =>
        !excluded.has(node) &&
        certifiedAnchors.has(node) &&
        graph.fallbackComponentIndices[node] === component &&
        targets.every((target) => nodeIsObstructedFromTarget(world, node, target)) &&
        Math.hypot(
          graph.x[node]! - graph.x[plan.lowerSourceNode]!,
          graph.z[node]! - graph.z[plan.lowerSourceNode]!,
        ) >= 2.5 &&
        Math.hypot(
          graph.x[node]! - graph.x[plan.upperSourceNode]!,
          graph.z[node]! - graph.z[plan.upperSourceNode]!,
        ) >= 2.5 &&
        Math.hypot(graph.x[node]! - initialTarget.x, graph.z[node]! - initialTarget.z) >= 1.5,
    )
    .sort(
      (first, second) =>
        graph.layerIndices[first]! - graph.layerIndices[second]! ||
        graph.nodeIds[first]!.localeCompare(graph.nodeIds[second]!),
    )
  let usedBroadFallback = false
  if (candidates.length === 0) {
    usedBroadFallback = true
    for (let node = 0; node < graph.nodeIds.length; node += 1) {
      if (
        !excluded.has(node) &&
        certifiedAnchors.has(node) &&
        graph.fallbackComponentIndices[node] === component
      ) {
        candidates.push(node)
      }
    }
  }
  if (candidates.length === 0) {
    throw new Error('navigation scale proof has no certified connected graph anchors')
  }
  if (!certifiedAnchors.has(plan.lowerSourceNode)) {
    throw new Error('navigation scale proof pinned lower connector source is not certified')
  }
  if (population > 1 && !certifiedAnchors.has(plan.upperSourceNode)) {
    throw new Error('navigation scale proof pinned upper connector source is not certified')
  }
  const nodes = new Int32Array(population)
  nodes[0] = plan.lowerSourceNode
  if (population > 1) nodes[1] = plan.upperSourceNode
  for (let slot = 2; slot < population; slot += 1) {
    nodes[slot] = candidates[(slot - 2) % candidates.length]!
  }
  return { nodes, usedBroadFallback }
}

export function assertLandrushZombieEscapeNavigationScaleProofAnchorLayoutCertified(
  anchorNodes: Int32Array,
  population: number,
  certifiedAnchors: ReadonlyMap<number, LandrushZombieEscapeNavigationScaleProofAnchorCertificate>,
) {
  if (anchorNodes.length !== population) {
    throw new Error('navigation scale proof anchor override length does not match population')
  }
  for (let slot = 0; slot < anchorNodes.length; slot += 1) {
    const node = anchorNodes[slot]!
    if (!certifiedAnchors.has(node)) {
      throw new Error(
        `navigation scale proof explicit anchor ${node} is not certified at slot ${slot}`,
      )
    }
  }
}

function inspectAnchorNodeOccupancy(anchorNodes: Int32Array) {
  const occupancy = new Map<number, number>()
  for (const node of anchorNodes) occupancy.set(node, (occupancy.get(node) ?? 0) + 1)
  let maximumAnchorNodeOccupancy = 0
  let movementStartCoincidentAgentCount = 0
  for (const count of occupancy.values()) {
    maximumAnchorNodeOccupancy = Math.max(maximumAnchorNodeOccupancy, count)
    if (count > 1) movementStartCoincidentAgentCount += count
  }
  return {
    maximumAnchorNodeOccupancy,
    movementStartCoincidentAgentCount,
    uniqueAnchorNodeCount: occupancy.size,
  }
}

function hashAnchorPrefix(anchorNodes: Int32Array, count = anchorNodes.length) {
  const hash = new ProofHash()
  for (let index = 0; index < Math.min(count, anchorNodes.length); index += 1) {
    hash.addNumber(anchorNodes[index]!)
  }
  return hash.digest()
}

function targetForNode(world: ZombieEscapeCollisionWorld, node: number): ProofTarget {
  const layer = world.navigationGraph.layerIndices[node]!
  return {
    x: world.navigationGraph.x[node]!,
    y: world.navigationLayers[layer]!.elevation,
    z: world.navigationGraph.z[node]!,
  }
}

function connectorTraversalTargetOffset(world: ZombieEscapeCollisionWorld) {
  const physicalClearance = world.agentRadius + ZOMBIE_ESCAPE_COLLISION_EPSILON_METERS
  return (
    physicalClearance +
    ZOMBIE_ESCAPE_SIMULATION.zombiePlayerAttackReachMeters +
    world.agentRadius +
    ZOMBIE_ESCAPE_COLLISION_EPSILON_METERS
  )
}

function connectorTargetNodeClearsTraversalCombatReach(
  world: ZombieEscapeCollisionWorld,
  connectorIndex: number,
  targetEnd: boolean,
  node: number,
) {
  const connector = world.navigationConnectors[connectorIndex]
  if (!connector) return false
  const target = targetForNode(world, node)
  const directionAmount = targetEnd ? 1 : -1
  const endpointX = targetEnd ? connector.endX : connector.startX
  const endpointZ = targetEnd ? connector.endZ : connector.startZ
  const signedTargetOffset =
    ((target.x - endpointX) * connector.directionX +
      (target.z - endpointZ) * connector.directionZ) *
    directionAmount
  return signedTargetOffset > connectorTraversalTargetOffset(world)
}

export function createLandrushZombieEscapeNavigationScaleProofConnectorTraversalTarget(
  world: ZombieEscapeCollisionWorld,
  plan: LandrushZombieEscapeNavigationScaleProofConnectorPlan,
  direction: 'lower-to-upper' | 'upper-to-lower',
) {
  const connectorIndex = plan.connectorIndex
  const connector = world.navigationConnectors[connectorIndex]
  if (!connector) throw new Error('navigation scale proof connector is unavailable')
  const targetEnd =
    direction === 'lower-to-upper' ? connector.ascendingEnd : !connector.ascendingEnd
  const targetLayerIndex =
    direction === 'lower-to-upper' ? plan.upperLayerIndex : plan.lowerLayerIndex
  const authenticatedLandingNode =
    direction === 'lower-to-upper' ? plan.upperSourceNode : plan.lowerSourceNode
  const authenticatedLanding = targetForNode(world, authenticatedLandingNode)
  const targetLayer = world.navigationLayers[targetLayerIndex]
  if (!targetLayer || authenticatedLanding.y !== targetLayer.elevation) {
    throw new Error('navigation scale proof connector landing is on the wrong layer')
  }
  if (direction === 'upper-to-lower') {
    const target = targetForNode(world, plan.lowerTargetNode)
    if (
      target.y !== targetLayer.elevation ||
      resolveSparseNavigationStrictRegionWitnessNode(
        world.navigationGraph.targetRegionIndex,
        targetLayerIndex,
        target.x,
        target.z,
      ) < 0 ||
      !connectorTargetNodeClearsTraversalCombatReach(
        world,
        connectorIndex,
        targetEnd,
        plan.lowerTargetNode,
      )
    ) {
      throw new Error(
        'navigation scale proof lower connector target is not an authenticated clear landing exit',
      )
    }
    return target
  }
  const directionAmount = targetEnd ? 1 : -1
  const endpointX = targetEnd ? connector.endX : connector.startX
  const endpointZ = targetEnd ? connector.endZ : connector.startZ
  const physicalClearance = world.agentRadius + ZOMBIE_ESCAPE_COLLISION_EPSILON_METERS
  const targetOffset = connectorTraversalTargetOffset(world)
  const target = {
    x: endpointX + connector.directionX * directionAmount * targetOffset,
    y: authenticatedLanding.y,
    z: endpointZ + connector.directionZ * directionAmount * targetOffset,
  }
  const offsetX = target.x - endpointX
  const offsetZ = target.z - endpointZ
  const signedTargetOffset =
    (offsetX * connector.directionX + offsetZ * connector.directionZ) * directionAmount
  const lateralTargetOffset = offsetX * -connector.directionZ + offsetZ * connector.directionX
  if (
    signedTargetOffset - physicalClearance <=
      ZOMBIE_ESCAPE_SIMULATION.zombiePlayerAttackReachMeters ||
    Math.abs(lateralTargetOffset) > ZOMBIE_ESCAPE_COLLISION_EPSILON_METERS
  ) {
    throw new Error('navigation scale proof connector traversal target cannot clear combat reach')
  }
  return target
}

function worldLayerNearestY(world: ZombieEscapeCollisionWorld, y: number) {
  return world.navigationLayers.reduce(
    (best, layer, index) =>
      Math.abs(layer.elevation - y) < Math.abs(world.navigationLayers[best]!.elevation - y)
        ? index
        : best,
    0,
  )
}

function setProofTarget(state: ZombieEscapeSimulation, target: ProofTarget) {
  state.player.x = target.x
  state.player.y = target.y
  state.player.z = target.z
  state.player.vx = 0
  state.player.vz = 0
}

function assertProofSimulationEnvelope(harness: PopulationHarness) {
  const state = harness.simulation
  if (
    state.phase !== 'night' ||
    state.status !== 'playing' ||
    state.waveState !== 'escape' ||
    state.zombies.pool.activeCount !== harness.population
  ) {
    throw new Error('navigation scale proof simulation envelope changed')
  }
  if (state.audioEvents.writeSequence !== harness.audioSequenceBefore) {
    throw new Error('navigation scale proof emitted gameplay audio')
  }
  for (let slot = 0; slot < state.zombies.pool.capacity; slot += 1) {
    if (
      state.zombies.pool.active[slot] !== 0 &&
      state.zombies.health[slot]! > 0 &&
      state.zombies.navigationIntentHasCached[slot] !== 0 &&
      inspectZombieEscapeCommittedNavigationAction(state, slot) === 'none'
    ) {
      throw new Error(`navigation scale proof admitted slot ${slot} lost its committed action`)
    }
  }
}

function throwIfStopped(signal: AbortSignal | undefined, deadline: number) {
  if (signal?.aborted) throw new Error('Landrush Zombie Escape navigation scale proof was aborted')
  if (Date.now() > deadline)
    throw new Error('Landrush Zombie Escape navigation scale proof timed out')
}

async function yieldProofControl(signal: AbortSignal | undefined, deadline: number) {
  throwIfStopped(signal, deadline)
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  throwIfStopped(signal, deadline)
}

async function stepHarness(
  harness: PopulationHarness,
  arena: ZombieEscapeArenaData,
  fixedDeltaSeconds: number,
  signal: AbortSignal | undefined,
  deadline: number,
  recordTarget: boolean,
  tick: number,
) {
  throwIfStopped(signal, deadline)
  stepZombieEscapeSimulationPhysics(harness.simulation, harness.input, fixedDeltaSeconds, arena)
  if (recordTarget) recordTargetWork(harness.simulation, harness.targetRecorder)
  assertProofSimulationEnvelope(harness)
  if ((tick + 1) % PROOF_YIELD_TICK_INTERVAL === 0) {
    await yieldProofControl(signal, deadline)
  }
}

function readCounterSnapshot(state: ZombieEscapeSimulation) {
  const flowWork = state.navigationSparseFlowSearchWork
  return {
    attachmentWork:
      flowWork.candidateVisitsTotal +
      flowWork.collisionPredicatesTotal +
      flowWork.heapOperationsTotal +
      flowWork.hierarchyNodeVisitsTotal +
      flowWork.supportPredicatesTotal,
    cachedAnchorLost: state.navigationIntentDemandCachedAnchorLostCount,
    inlineRecoveryWithoutFirstService: state.navigationIntentInlineRecoveryWithoutFirstServiceCount,
    intentCanceled: state.navigationIntentCanceledCount,
    intentFirstService: state.navigationIntentFirstServiceCount,
    intentIssued: state.navigationIntentIssuedCount,
    intentResolved: state.navigationIntentResolvedCount,
    intentResolveSlices: state.navigationIntentResolveCount,
    routePublishedDemand: state.navigationIntentDemandRoutePublishedCount,
    searchRestarted: state.navigationSparseSearchRestartedCount,
    searchStarted: state.navigationSparseSearchStartedCount,
    searchUncausedStartViolations: state.navigationSparseSearchUncausedStartViolationCount,
  }
}

function subtractCounters(
  after: ReturnType<typeof readCounterSnapshot>,
  before: ReturnType<typeof readCounterSnapshot>,
): LandrushZombieEscapeNavigationScaleProofCounterDelta {
  return {
    attachmentWork: after.attachmentWork - before.attachmentWork,
    cachedAnchorLost: after.cachedAnchorLost - before.cachedAnchorLost,
    inlineRecoveryWithoutFirstService:
      after.inlineRecoveryWithoutFirstService - before.inlineRecoveryWithoutFirstService,
    intentCanceled: after.intentCanceled - before.intentCanceled,
    intentFirstService: after.intentFirstService - before.intentFirstService,
    intentIssued: after.intentIssued - before.intentIssued,
    intentResolved: after.intentResolved - before.intentResolved,
    intentResolveSlices: after.intentResolveSlices - before.intentResolveSlices,
    routePublishedDemand: after.routePublishedDemand - before.routePublishedDemand,
    searchRestarted: after.searchRestarted - before.searchRestarted,
    searchStarted: after.searchStarted - before.searchStarted,
    searchUncausedStartViolations:
      after.searchUncausedStartViolations - before.searchUncausedStartViolations,
  }
}

function addCounterDeltas(
  first: LandrushZombieEscapeNavigationScaleProofCounterDelta,
  second: LandrushZombieEscapeNavigationScaleProofCounterDelta,
): LandrushZombieEscapeNavigationScaleProofCounterDelta {
  return {
    attachmentWork: first.attachmentWork + second.attachmentWork,
    cachedAnchorLost: first.cachedAnchorLost + second.cachedAnchorLost,
    inlineRecoveryWithoutFirstService:
      first.inlineRecoveryWithoutFirstService + second.inlineRecoveryWithoutFirstService,
    intentCanceled: first.intentCanceled + second.intentCanceled,
    intentFirstService: first.intentFirstService + second.intentFirstService,
    intentIssued: first.intentIssued + second.intentIssued,
    intentResolved: first.intentResolved + second.intentResolved,
    intentResolveSlices: first.intentResolveSlices + second.intentResolveSlices,
    routePublishedDemand: first.routePublishedDemand + second.routePublishedDemand,
    searchRestarted: first.searchRestarted + second.searchRestarted,
    searchStarted: first.searchStarted + second.searchStarted,
    searchUncausedStartViolations:
      first.searchUncausedStartViolations + second.searchUncausedStartViolations,
  }
}

function counterDeltaIsZero(delta: LandrushZombieEscapeNavigationScaleProofCounterDelta) {
  return Object.values(delta).every((value) => value === 0)
}

function createProofFlowSample(): ZombieEscapeFlowSample {
  return {
    blockingDistance: Number.POSITIVE_INFINITY,
    blockingX: 0,
    blockingZ: 0,
    connectorIndex: -1,
    connectorTargetEnd: false,
    reachable: false,
    waypointNode: -1,
    waypointUsesFallback: false,
    x: 0,
    z: 0,
  }
}

function inspectReachableCachedAgent(
  state: ZombieEscapeSimulation,
  slot: number,
  sample: ZombieEscapeFlowSample,
) {
  const zombies = state.zombies
  const waypoint = zombies.navigationWaypointNode[slot]!
  if (
    zombies.pool.active[slot] === 0 ||
    zombies.health[slot]! <= 0 ||
    waypoint < 0 ||
    waypoint >= state.collisionWorld.navigationGraph.nodeIds.length ||
    zombies.navigationConnector[slot]! >= 0 ||
    zombies.navigationIntentHasCached[slot] === 0 ||
    zombies.navigationIntentValid[slot] === 0 ||
    zombies.navigationIntentPending[slot] !== 0 ||
    zombies.navigationSparseFlowSearchActive[slot] !== 0 ||
    zombies.navigationIntentWorldGeneration[slot] !== state.collisionWorldGeneration ||
    zombies.navigationReachable[slot] === 0
  ) {
    return null
  }
  sample.blockingDistance = zombies.navigationBlockingDistance[slot]!
  sample.blockingX = zombies.navigationBlockingX[slot]!
  sample.blockingZ = zombies.navigationBlockingZ[slot]!
  sample.connectorIndex = zombies.navigationRequestedConnector[slot]!
  sample.connectorTargetEnd = zombies.navigationRequestedConnectorTargetEnd[slot] !== 0
  sample.reachable = true
  sample.waypointNode = waypoint
  sample.waypointUsesFallback = zombies.navigationWaypointFallback[slot] !== 0
  sample.x = zombies.navigationDirectionX[slot]!
  sample.z = zombies.navigationDirectionZ[slot]!
  const routeStatus = followZombieEscapeCachedSparseWaypoint(
    state.navigationField,
    zombies.x[slot]!,
    zombies.z[slot]!,
    zombies.y[slot]!,
    sample,
    zombies.navigationSparseCommittedFlowSearch[slot]!,
    ZERO_SPARSE_SEARCH_BUDGET,
    true,
  )
  if (routeStatus !== 'followed' && routeStatus !== 'reacquiring') return null
  return {
    committedGeneration: zombies.navigationIntentCommittedRouteGeneration[slot]!,
    routeStatus,
    waypoint,
  }
}

function agentHasCertifiedCurrentDirectAction(state: ZombieEscapeSimulation, slot: number) {
  return (
    state.zombies.navigationIntentTargetRevision[slot] ===
      state.navigationTargetRequestedRevision &&
    inspectZombieEscapeCommittedNavigationAction(state, slot) === 'direct'
  )
}

function inspectAnchoredAgents(state: ZombieEscapeSimulation) {
  const zombies = state.zombies
  const committedGeneration = state.navigationTargetCommittedRouteGeneration
  const sample = createProofFlowSample()
  let count = 0
  for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
    if (agentHasCertifiedCurrentDirectAction(state, slot)) {
      count += 1
      continue
    }
    const inspection = inspectReachableCachedAgent(state, slot, sample)
    if (inspection?.committedGeneration === committedGeneration) count += 1
  }
  return count
}

type FrozenClassificationCounts = Readonly<{
  adoptedAgentCount: number
  committedGeneration: number
  directActionCount: number
  invalidAgentCount: number
  reacquiringAgentCount: number
}>

function inspectFrozenPopulationClassification(
  state: ZombieEscapeSimulation,
): FrozenClassificationCounts {
  const zombies = state.zombies
  const graph = state.collisionWorld.navigationGraph
  const committedGeneration = state.navigationTargetCommittedRouteGeneration
  const arrivalRadius = Math.max(0.08, state.collisionWorld.agentRadius * 0.5)
  const sample = createProofFlowSample()
  let adoptedAgentCount = 0
  let directActionCount = 0
  let invalidAgentCount = 0
  let reacquiringAgentCount = 0
  for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
    if (zombies.pool.active[slot] === 0 || zombies.health[slot]! <= 0) continue
    if (agentHasCertifiedCurrentDirectAction(state, slot)) {
      adoptedAgentCount += 1
      directActionCount += 1
      continue
    }
    const inspection = inspectReachableCachedAgent(state, slot, sample)
    if (!inspection) {
      invalidAgentCount += 1
      continue
    }
    if (inspection.committedGeneration === committedGeneration) {
      adoptedAgentCount += 1
      continue
    }
    const waypoint = inspection.waypoint
    const waypointDistance = Math.hypot(
      graph.x[waypoint]! - zombies.x[slot]!,
      graph.z[waypoint]! - zombies.z[slot]!,
    )
    if (inspection.routeStatus === 'reacquiring' && waypointDistance > arrivalRadius) {
      reacquiringAgentCount += 1
    } else {
      invalidAgentCount += 1
    }
  }
  return {
    adoptedAgentCount,
    committedGeneration,
    directActionCount,
    invalidAgentCount,
    reacquiringAgentCount,
  }
}

function frozenClassificationIsComplete(
  classification: FrozenClassificationCounts,
  population: number,
) {
  return (
    classification.invalidAgentCount === 0 &&
    classification.adoptedAgentCount + classification.reacquiringAgentCount === population
  )
}

function inspectUnanchoredAgents(state: ZombieEscapeSimulation, maximumCount: number) {
  const zombies = state.zombies
  const graph = state.collisionWorld.navigationGraph
  const arrivalRadius = Math.max(0.08, state.collisionWorld.agentRadius * 0.5)
  const reverse = inspectZombieEscapeSparseReverseFieldBanks(state.navigationField)
  const failures: Array<Readonly<Record<string, number | string>>> = []
  for (let slot = 0; slot < zombies.pool.capacity && failures.length < maximumCount; slot += 1) {
    if (zombies.pool.active[slot] === 0 || zombies.health[slot]! <= 0) continue
    if (agentHasCertifiedCurrentDirectAction(state, slot)) continue
    if (
      zombies.navigationWaypointNode[slot]! >= 0 &&
      zombies.navigationIntentValid[slot] !== 0 &&
      zombies.navigationIntentPending[slot] === 0 &&
      zombies.navigationIntentWorldGeneration[slot] === state.collisionWorldGeneration &&
      zombies.navigationIntentCommittedRouteGeneration[slot] ===
        state.navigationTargetCommittedRouteGeneration
    ) {
      continue
    }
    const waypoint = zombies.navigationWaypointNode[slot]!
    const waypointX = waypoint >= 0 && waypoint < graph.x.length ? graph.x[waypoint]! : Number.NaN
    const waypointZ = waypoint >= 0 && waypoint < graph.z.length ? graph.z[waypoint]! : Number.NaN
    const layerIndex =
      waypoint >= 0 && waypoint < graph.layerIndices.length ? graph.layerIndices[waypoint]! : -1
    const layerElevation =
      state.collisionWorld.navigationLayers[layerIndex]?.elevation ?? Number.NaN
    const activeRoute = createZombieEscapeSparseCommittedNodeRoute()
    const activeReachable = sampleZombieEscapeSparseCommittedNodeRoute(
      state.navigationField,
      waypoint,
      zombies.navigationWaypointFallback[slot] !== 0,
      activeRoute,
    )
    const alternateRoute = createZombieEscapeSparseCommittedNodeRoute()
    const alternateReachable = sampleZombieEscapeSparseCommittedNodeRoute(
      state.navigationField,
      waypoint,
      zombies.navigationWaypointFallback[slot] === 0,
      alternateRoute,
    )
    const search = zombies.navigationSparseFlowSearch[slot]!
    failures.push({
      activeRouteGeneration: activeRoute.generation,
      activeRouteNextNode: activeRoute.nextNode,
      activeRouteReachable: activeReachable ? 1 : 0,
      activeRouteTerminal: activeRoute.terminal ? 1 : 0,
      alternateRouteGeneration: alternateRoute.generation,
      alternateRouteNextNode: alternateRoute.nextNode,
      alternateRouteReachable: alternateReachable ? 1 : 0,
      alternateRouteTerminal: alternateRoute.terminal ? 1 : 0,
      arrivalRadius,
      committed: zombies.navigationIntentCommittedRouteGeneration[slot]!,
      connector: zombies.navigationConnector[slot]!,
      directionX: zombies.navigationDirectionX[slot]!,
      directionZ: zombies.navigationDirectionZ[slot]!,
      fallback: zombies.navigationWaypointFallback[slot]!,
      fieldCommitted: getZombieEscapeSparseCommittedRouteGeneration(state.navigationField),
      hasCached: zombies.navigationIntentHasCached[slot]!,
      layerElevation,
      layerIndex,
      layerYMismatch: Number.isFinite(layerElevation)
        ? Math.abs(layerElevation - zombies.y[slot]!)
        : Number.NaN,
      pending: zombies.navigationIntentPending[slot]!,
      poseX: zombies.x[slot]!,
      poseY: zombies.y[slot]!,
      poseZ: zombies.z[slot]!,
      reachable: zombies.navigationReachable[slot]!,
      requestedConnector: zombies.navigationRequestedConnector[slot]!,
      reverseActiveGeneration: reverse.activeGeneration,
      searchActive: zombies.navigationSparseFlowSearchActive[slot]!,
      searchDependencyWaiting: zombies.navigationSparseFlowSearchDependencyWaiting[slot]!,
      searchPhase: search.phase,
      searchStatus: search.status,
      slot,
      speedScale: zombies.speedScale[slot]!,
      targetCommitted: state.navigationTargetCommittedRouteGeneration,
      targetStatus: state.navigationField.graphSparseTargetUpdate.status,
      valid: zombies.navigationIntentValid[slot]!,
      waypoint,
      waypointDistance: Math.hypot(waypointX - zombies.x[slot]!, waypointZ - zombies.z[slot]!),
      waypointX,
      waypointZ,
      world: zombies.navigationIntentWorldGeneration[slot]!,
      worldCurrent: state.collisionWorldGeneration,
    })
  }
  return failures
}

function simulationHasNoPendingNavigation(state: ZombieEscapeSimulation) {
  const leases = inspectZombieEscapeSparseAttachmentHeapLeases(state.navigationField)
  const reverse = inspectZombieEscapeSparseReverseFieldBanks(state.navigationField)
  return (
    state.navigationIntentPendingCount === 0 &&
    state.navigationIntentAdmissionDeferredPendingCount === 0 &&
    state.navigationSparseSearchActiveAgentCount === 0 &&
    state.navigationSparseSearchPendingAgentCount === 0 &&
    state.navigationWorldRefreshPendingCount === 0 &&
    leases.activeAgentLeases === 0 &&
    leases.leaseInvariantViolationCount === 0 &&
    reverse.readerLeaseCount === 0 &&
    reverse.leaseInvariantViolationCount === 0 &&
    reverse.publicationBlockedCount === 0
  )
}

async function drainColdAnchors(
  harness: PopulationHarness,
  arena: ZombieEscapeArenaData,
  fixedDeltaSeconds: number,
  signal: AbortSignal | undefined,
  deadline: number,
) {
  for (let tick = 0; tick < harness.bounds.coldDrainTickCap; tick += 1) {
    await stepHarness(harness, arena, fixedDeltaSeconds, signal, deadline, false, tick)
    if (
      tick % 8 === 7 &&
      simulationHasNoPendingNavigation(harness.simulation) &&
      inspectAnchoredAgents(harness.simulation) === harness.population
    ) {
      return tick + 1
    }
  }
  const state = harness.simulation
  const attachmentLeases = inspectZombieEscapeSparseAttachmentHeapLeases(state.navigationField)
  const reverseLeases = inspectZombieEscapeSparseReverseFieldBanks(state.navigationField)
  throw new Error(
    `navigation scale proof cold drain exceeded ${harness.bounds.coldDrainTickCap} topology-derived ticks: ${JSON.stringify(
      {
        activeSearches: state.navigationSparseSearchActiveAgentCount,
        anchored: inspectAnchoredAgents(state),
        deferred: state.navigationIntentAdmissionDeferredPendingCount,
        pendingAgents: state.navigationSparseSearchPendingAgentCount,
        pending: state.navigationIntentPendingCount,
        population: harness.population,
        reverseBlocked: reverseLeases.publicationBlockedCount,
        reverseLeases: reverseLeases.readerLeaseCount,
        searchLeases: attachmentLeases.activeAgentLeases,
        singletonReserved: attachmentLeases.singletonReserved,
        spawnReserved: attachmentLeases.spawnReserved,
        targetGeneration: state.navigationTargetCommittedRouteGeneration,
        targetStatus: state.navigationField.graphSparseTargetUpdate.status,
        unanchored: inspectUnanchoredAgents(state, 16),
        worldRefresh: state.navigationWorldRefreshPendingCount,
      },
    )}`,
  )
}

type FrozenTransitionEvidence = Readonly<{
  frozen: LandrushZombieEscapeNavigationScaleProofFrozenClassification
  generationAfter: number
  generationBefore: number
}>

export function landrushZombieEscapeNavigationScaleProofFirstServiceBelongsToPublication(
  hasReceivedFirstService: number,
  firstServiceTick: number,
  publicationNavigationIntentTick: number,
) {
  return (
    hasReceivedFirstService !== 0 &&
    publicationNavigationIntentTick >= 0 &&
    firstServiceTick >= publicationNavigationIntentTick
  )
}

export function classifyLandrushZombieEscapeNavigationScaleProofRepairObservation(
  firstServiceAlreadyObserved: boolean,
  holdAlreadyObserved: boolean,
  firstServiceBelongsToPublication: boolean,
  hasCurrentCommittedHold: boolean,
) {
  if (holdAlreadyObserved) {
    return { firstService: false, hold: false, inlineRecoveryWithoutFirstService: false }
  }
  const firstService = !firstServiceAlreadyObserved && firstServiceBelongsToPublication
  const hold = hasCurrentCommittedHold
  return {
    firstService,
    hold,
    inlineRecoveryWithoutFirstService:
      hold && !(firstServiceAlreadyObserved || firstServiceBelongsToPublication),
  }
}

export function landrushZombieEscapeNavigationScaleProofTransitionDemandAccountingIsConserved(
  counterDelta: LandrushZombieEscapeNavigationScaleProofCounterDelta,
) {
  if (!Object.values(counterDelta).every((value) => Number.isSafeInteger(value) && value >= 0)) {
    return false
  }
  const uniqueSearchStarts = counterDelta.searchStarted - counterDelta.searchRestarted
  return (
    counterDelta.intentCanceled === 0 &&
    counterDelta.intentIssued === counterDelta.routePublishedDemand &&
    counterDelta.intentIssued === counterDelta.intentResolved &&
    counterDelta.intentIssued === counterDelta.intentResolveSlices &&
    counterDelta.intentResolved ===
      counterDelta.intentFirstService + counterDelta.inlineRecoveryWithoutFirstService &&
    counterDelta.searchUncausedStartViolations === 0 &&
    uniqueSearchStarts >= 0 &&
    uniqueSearchStarts <= counterDelta.intentIssued
  )
}

export function landrushZombieEscapeNavigationScaleProofPopulationIdentityIsCurrent(
  state: ZombieEscapeSimulation,
  expectedPoolGenerations: Uint32Array,
  population: number,
) {
  if (expectedPoolGenerations.length !== population) return false
  const zombies = state.zombies
  for (let slot = 0; slot < population; slot += 1) {
    if (
      zombies.pool.active[slot] === 0 ||
      zombies.health[slot]! <= 0 ||
      zombies.pool.generation[slot] !== expectedPoolGenerations[slot]
    ) {
      return false
    }
  }
  return zombies.pool.activeCount === population
}

export function inspectLandrushZombieEscapeNavigationScaleProofCurrentCommittedHold(
  state: ZombieEscapeSimulation,
  slot: number,
  committedGeneration: number,
) {
  const zombies = state.zombies
  return (
    zombies.pool.active[slot] !== 0 &&
    zombies.health[slot]! > 0 &&
    zombies.navigationIntentPoolGeneration[slot] === zombies.pool.generation[slot] &&
    zombies.navigationIntentWorldGeneration[slot] === state.collisionWorldGeneration &&
    zombies.navigationIntentCommittedRouteGeneration[slot] === committedGeneration &&
    zombies.navigationIntentTargetRevision[slot] === state.navigationTargetRequestedRevision &&
    zombies.navigationIntentValid[slot] !== 0 &&
    zombies.navigationIntentPending[slot] === 0 &&
    zombies.navigationSparseFlowSearchActive[slot] === 0 &&
    inspectZombieEscapeCommittedNavigationAction(state, slot) !== 'none'
  )
}

async function waitForFrozenTargetTransition(
  harness: PopulationHarness,
  target: ProofTarget,
  targetLayerIndex: number,
  arena: ZombieEscapeArenaData,
  fixedDeltaSeconds: number,
  signal: AbortSignal | undefined,
  deadline: number,
  recordTarget: boolean,
) {
  const state = harness.simulation
  const zombies = state.zombies
  if (!simulationHasNoPendingNavigation(state)) {
    throw new Error('navigation scale proof target transition did not start quiescent')
  }
  const generationBefore = state.navigationTargetCommittedRouteGeneration
  const countersBefore = readCounterSnapshot(state)
  const expectedPoolGenerations = zombies.pool.generation.slice(0, harness.population)
  const repairSlots = new Uint8Array(harness.population)
  const repairFirstServiceObserved = new Uint8Array(harness.population)
  const repairHoldObserved = new Uint8Array(harness.population)
  let maximumAgentServiceSlicesPerTick = 0
  let maximumRepairFirstServiceTicks = 0
  let maximumRepairHoldTicks = 0
  let maximumSuccessorVisits = 0
  let publicationAdoptedAgentCount = 0
  let publicationRepairAgentCount = 0
  let repairFirstServiceObservedCount = 0
  let repairHoldObservedCount = 0
  let repairInlineRecoveryWithoutFirstServiceCount = 0
  let publicationNavigationIntentTick = -1
  let publicationTick = -1
  if (recordTarget) harness.targetRecorder.explicitRequestCount += 1
  for (let tick = 0; tick < harness.bounds.targetDrainTickCap; tick += 1) {
    setProofTarget(state, target)
    await stepHarness(harness, arena, fixedDeltaSeconds, signal, deadline, recordTarget, tick)
    const reverse = inspectZombieEscapeSparseReverseFieldBanks(state.navigationField)
    if (reverse.activeGeneration > generationBefore && publicationTick < 0) {
      publicationTick = tick
      publicationNavigationIntentTick = state.navigationIntentTick
      for (let slot = 0; slot < harness.population; slot += 1) {
        const immediatelyAdopted =
          inspectLandrushZombieEscapeNavigationScaleProofCurrentCommittedHold(
            state,
            slot,
            reverse.activeGeneration,
          )
        if (immediatelyAdopted) publicationAdoptedAgentCount += 1
        else {
          repairSlots[slot] = 1
          publicationRepairAgentCount += 1
        }
        maximumSuccessorVisits = Math.max(
          maximumSuccessorVisits,
          zombies.navigationSparseCommittedFlowSearch[slot]!.lastRouteCorridorSuccessorVisits,
        )
      }
    }
    if (publicationTick >= 0) {
      if (
        !landrushZombieEscapeNavigationScaleProofPopulationIdentityIsCurrent(
          state,
          expectedPoolGenerations,
          harness.population,
        )
      ) {
        throw new Error('navigation scale proof repair cohort changed pool generation')
      }
      maximumAgentServiceSlicesPerTick = Math.max(
        maximumAgentServiceSlicesPerTick,
        state.navigationSparseSearchAgentServiceSliceCountThisTick,
      )
      for (let slot = 0; slot < harness.population; slot += 1) {
        if (repairSlots[slot] === 0) continue
        const elapsedPublicationTicks = tick - publicationTick + 1
        const firstServiceBelongsToPublication =
          landrushZombieEscapeNavigationScaleProofFirstServiceBelongsToPublication(
            zombies.navigationIntentHasReceivedFirstService[slot]!,
            zombies.navigationIntentFirstServiceTick[slot]!,
            publicationNavigationIntentTick,
          )
        const hasCurrentCommittedHold =
          inspectLandrushZombieEscapeNavigationScaleProofCurrentCommittedHold(
            state,
            slot,
            reverse.activeGeneration,
          )
        const observation = classifyLandrushZombieEscapeNavigationScaleProofRepairObservation(
          repairFirstServiceObserved[slot] !== 0,
          repairHoldObserved[slot] !== 0,
          firstServiceBelongsToPublication,
          hasCurrentCommittedHold,
        )
        if (observation.firstService) {
          repairFirstServiceObserved[slot] = 1
          repairFirstServiceObservedCount += 1
          maximumRepairFirstServiceTicks = Math.max(
            maximumRepairFirstServiceTicks,
            elapsedPublicationTicks,
          )
        }
        if (observation.hold) {
          repairHoldObserved[slot] = 1
          repairHoldObservedCount += 1
          maximumRepairHoldTicks = Math.max(maximumRepairHoldTicks, elapsedPublicationTicks)
          if (observation.inlineRecoveryWithoutFirstService) {
            repairInlineRecoveryWithoutFirstServiceCount += 1
          }
        }
      }
    }
    const classification = inspectFrozenPopulationClassification(state)
    if (
      reverse.activeGeneration > generationBefore &&
      reverse.activeRouteTargetLayerIndex === targetLayerIndex &&
      simulationHasNoPendingNavigation(state) &&
      frozenClassificationIsComplete(classification, harness.population)
    ) {
      const counterDelta = subtractCounters(readCounterSnapshot(state), countersBefore)
      if (
        repairFirstServiceObservedCount + repairInlineRecoveryWithoutFirstServiceCount !==
          publicationRepairAgentCount ||
        repairHoldObservedCount !== publicationRepairAgentCount ||
        counterDelta.cachedAnchorLost !== 0 ||
        !landrushZombieEscapeNavigationScaleProofTransitionDemandAccountingIsConserved(counterDelta)
      ) {
        throw new Error(
          `navigation scale proof repair classification did not conserve published repairs: ${JSON.stringify({ counterDelta, publicationNavigationIntentTick, publicationRepairAgentCount, repairFirstServiceObservedCount, repairHoldObservedCount, repairInlineRecoveryWithoutFirstServiceCount })}`,
        )
      }
      return {
        frozen: {
          ...classification,
          counterDelta,
          maximumAgentServiceSlicesPerTick,
          maximumFirstServiceAgeTicks: state.navigationIntentMaximumUnservicedAgeTicksObserved,
          maximumRepairFirstServiceTicks,
          maximumRepairHoldTicks,
          maximumSuccessorVisits,
          publicationAdoptedAgentCount,
          publicationRepairAgentCount,
          repairFirstServiceObservedCount,
          repairHoldObservedCount,
          repairInlineRecoveryWithoutFirstServiceCount,
          settleTickCount: tick - publicationTick + 1,
        },
        generationAfter: reverse.activeGeneration,
        generationBefore,
      }
    }
  }
  throw new Error(
    `navigation scale proof frozen target transition exceeded ${harness.bounds.targetDrainTickCap} topology-derived ticks: ${JSON.stringify(
      {
        classification: inspectFrozenPopulationClassification(harness.simulation),
        population: harness.population,
        target,
        targetLayerIndex,
        unadopted: inspectUnanchoredAgents(harness.simulation, harness.population),
      },
    )}`,
  )
}

async function waitForExistingTargetAdoption(
  harness: PopulationHarness,
  target: ProofTarget,
  targetLayerIndex: number,
  arena: ZombieEscapeArenaData,
  fixedDeltaSeconds: number,
  signal: AbortSignal | undefined,
  deadline: number,
  recordTarget = true,
) {
  for (let tick = 0; tick < harness.bounds.targetDrainTickCap; tick += 1) {
    setProofTarget(harness.simulation, target)
    await stepHarness(harness, arena, fixedDeltaSeconds, signal, deadline, recordTarget, tick)
    const reverse = inspectZombieEscapeSparseReverseFieldBanks(harness.simulation.navigationField)
    if (
      reverse.activeRouteTargetLayerIndex === targetLayerIndex &&
      simulationHasNoPendingNavigation(harness.simulation) &&
      inspectAnchoredAgents(harness.simulation) === harness.population
    ) {
      return
    }
  }
  const graph = harness.simulation.collisionWorld.navigationGraph
  const targetNode = findNearestNodeOnLayer(
    harness.simulation.collisionWorld,
    targetLayerIndex,
    target.x,
    target.z,
  )
  const unadopted = inspectUnanchoredAgents(harness.simulation, harness.population)
  throw new Error(
    `navigation scale proof overlapping target trace did not settle: ${JSON.stringify({
      breachBlockers: RECORDED_ROOM_BREACH_BLOCKER_IDS.map((objectId) => {
        const objectOrdinal =
          harness.simulation.collisionWorld.objectCatalog.objectIds.indexOf(objectId)
        return {
          active: harness.simulation.collisionWorld.activeObjectMask[objectOrdinal] ?? null,
          objectId,
          objectOrdinal,
        }
      }),
      population: harness.population,
      target,
      targetLayerIndex,
      targetNode: {
        component: graph.fallbackComponentIndices[targetNode] ?? null,
        id: graph.nodeIds[targetNode] ?? null,
        node: targetNode,
        x: graph.x[targetNode] ?? null,
        z: graph.z[targetNode] ?? null,
      },
      unadopted,
      unadoptedAnchors: unadopted.map((failure) => {
        const slot = typeof failure.slot === 'number' ? failure.slot : -1
        const node = harness.anchorNodes[slot] ?? -1
        return {
          component: graph.fallbackComponentIndices[node] ?? null,
          id: graph.nodeIds[node] ?? null,
          layerIndex: graph.layerIndices[node] ?? null,
          node,
          slot,
          x: graph.x[node] ?? null,
          z: graph.z[node] ?? null,
        }
      }),
    })}`,
  )
}

async function drainConnectorRefresh(
  harness: PopulationHarness,
  target: ProofTarget,
  arena: ZombieEscapeArenaData,
  fixedDeltaSeconds: number,
  signal: AbortSignal | undefined,
  deadline: number,
) {
  for (let tick = 0; tick < harness.bounds.targetDrainTickCap; tick += 1) {
    setProofTarget(harness.simulation, target)
    await stepHarness(harness, arena, fixedDeltaSeconds, signal, deadline, true, tick)
    const classification = inspectFrozenPopulationClassification(harness.simulation)
    if (
      simulationHasNoPendingNavigation(harness.simulation) &&
      frozenClassificationIsComplete(classification, harness.population)
    ) {
      return
    }
  }
  throw new Error(
    `navigation scale proof connector refresh did not drain: ${JSON.stringify({
      classification: inspectFrozenPopulationClassification(harness.simulation),
      population: harness.population,
      target,
      unadopted: inspectUnanchoredAgents(harness.simulation, harness.population),
    })}`,
  )
}

async function runConnectorWitness(
  harness: PopulationHarness,
  slot: number,
  direction: 'lower-to-upper' | 'upper-to-lower',
  sourceNode: number,
  authenticatedLandingNode: number,
  target: ProofTarget,
  targetLayerIndex: number,
  arena: ZombieEscapeArenaData,
  fixedDeltaSeconds: number,
  signal: AbortSignal | undefined,
  deadline: number,
): Promise<LandrushZombieEscapeNavigationScaleProofConnectorWitness> {
  const state = harness.simulation
  const zombies = state.zombies
  const startLayerIndex =
    direction === 'lower-to-upper' ? harness.plan.lowerLayerIndex : harness.plan.upperLayerIndex
  const startY = zombies.y[slot]!
  const waypointBefore = zombies.navigationWaypointNode[slot]!
  const graph = state.collisionWorld.navigationGraph
  const sourceRoute = createZombieEscapeSparseCommittedNodeRoute()
  if (
    !sampleZombieEscapeSparseCommittedNodeRoute(
      state.navigationField,
      sourceNode,
      zombies.navigationWaypointFallback[slot] !== 0,
      sourceRoute,
    ) ||
    sourceRoute.nextNode !== authenticatedLandingNode
  ) {
    throw new Error(
      `navigation scale proof ${direction} route does not use the authenticated opposite landing`,
    )
  }
  const sourceDistance = Math.hypot(
    graph.x[sourceNode]! - zombies.x[slot]!,
    graph.z[sourceNode]! - zombies.z[slot]!,
  )
  const waypointDistance =
    waypointBefore >= 0
      ? Math.hypot(
          graph.x[waypointBefore]! - zombies.x[slot]!,
          graph.z[waypointBefore]! - zombies.z[slot]!,
        )
      : Number.POSITIVE_INFINITY
  const sourceRadialReady = sourceDistance <= 1e-5
  if (!sourceRadialReady) {
    throw new Error(
      `navigation scale proof ${direction} connector source is not radially ready: ${JSON.stringify({ sourceDistance, sourceNode, waypointBefore, waypointDistance })}`,
    )
  }
  let enteredConnector = false
  let waypointAdvanced = false
  zombies.speedScale[slot] = 1
  for (let tick = 0; tick < harness.bounds.connectorTickCap; tick += 1) {
    setProofTarget(state, target)
    await stepHarness(harness, arena, fixedDeltaSeconds, signal, deadline, true, tick)
    if (zombies.navigationConnector[slot] === harness.plan.connectorIndex) enteredConnector = true
    if (zombies.navigationWaypointNode[slot] !== waypointBefore) waypointAdvanced = true
    if (
      zombies.navigationConnector[slot] === harness.plan.connectorIndex &&
      zombies.intent[slot] === ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackPlayer
    ) {
      throw new Error(`navigation scale proof ${direction} attacked before clearing the connector`)
    }
    const completed =
      enteredConnector &&
      zombies.navigationConnector[slot]! < 0 &&
      Math.abs(
        zombies.y[slot]! - state.collisionWorld.navigationLayers[targetLayerIndex]!.elevation,
      ) < 0.08
    if (!completed) continue
    zombies.speedScale[slot] = 0
    zombies.vx[slot] = 0
    zombies.vz[slot] = 0
    return {
      completed: true,
      direction,
      endLayerIndex: targetLayerIndex,
      endY: zombies.y[slot]!,
      enteredConnector,
      finalConnectorIndex: zombies.navigationConnector[slot]!,
      startLayerIndex,
      sourceNode,
      sourceRadialReady,
      startY,
      tickCount: tick + 1,
      waypointAdvanced,
    }
  }
  zombies.speedScale[slot] = 0
  const waypoint = zombies.navigationWaypointNode[slot]!
  throw new Error(
    `navigation scale proof ${direction} witness exceeded ${harness.bounds.connectorTickCap} topology-derived ticks: ${JSON.stringify(
      {
        committedGeneration: zombies.navigationIntentCommittedRouteGeneration[slot],
        directionX: zombies.navigationDirectionX[slot],
        directionZ: zombies.navigationDirectionZ[slot],
        enteredConnector,
        fieldGeneration: state.navigationTargetCommittedRouteGeneration,
        pending: zombies.navigationIntentPending[slot],
        poseX: zombies.x[slot],
        poseY: zombies.y[slot],
        poseZ: zombies.z[slot],
        reachable: zombies.navigationReachable[slot],
        requestedConnector: zombies.navigationRequestedConnector[slot],
        slot,
        valid: zombies.navigationIntentValid[slot],
        waypoint,
        waypointAdvanced,
        waypointDistance:
          waypoint >= 0
            ? Math.hypot(
                graph.x[waypoint]! - zombies.x[slot]!,
                graph.z[waypoint]! - zombies.z[slot]!,
              )
            : null,
      },
    )}`,
  )
}

function createPopulationHarness(
  sourceWorld: ZombieEscapeCollisionWorld,
  arena: ZombieEscapeArenaData,
  plan: LandrushZombieEscapeNavigationScaleProofConnectorPlan,
  initialTarget: ProofTarget,
  roomTarget: ProofTarget,
  population: number,
  anchorLayout?: PopulationAnchorLayout,
) {
  const sourceFingerprintBefore = stableHash({
    activationRevision: sourceWorld.activationRevision,
    activeObjectMask: sourceWorld.activeObjectMask,
    revision: sourceWorld.revision,
    topology: createWorldTopologyProjection(sourceWorld),
  })
  const state = createZombieEscapeSimulation(arena, 0x51ca_1e5, [], {
    zombieCapacity: population,
  })
  setZombieEscapeExternalPlayerPose(state, true)
  setZombieEscapeCollisionWorld(state, structuredClone(sourceWorld))
  setZombieEscapeGamePhase(state, 'night')
  let appliedRevision = state.obstacleDeltaMetrics.appliedRevision
  for (const blockerId of RECORDED_ROOM_BREACH_BLOCKER_IDS) {
    const result = applyZombieEscapeObstacleDelta(state, blockerId)
    const navigationOrdinal = state.collisionWorld.objectCatalog.objectIds.indexOf(blockerId)
    const combatOrdinal = state.combatCollisionWorld.objectCatalog.objectIds.indexOf(blockerId)
    if (
      result.applied !== true ||
      result.appliedRevision !== appliedRevision + 1 ||
      result.objectId !== blockerId ||
      !state.destroyedObstacleIds.has(blockerId) ||
      navigationOrdinal < 0 ||
      combatOrdinal < 0 ||
      state.collisionWorld.activeObjectMask[navigationOrdinal] !== 0 ||
      state.combatCollisionWorld.activeObjectMask[combatOrdinal] !== 0
    ) {
      throw new Error(
        `navigation scale proof failed to install recorded breach blocker ${blockerId} through the production obstacle lifecycle`,
      )
    }
    appliedRevision = result.appliedRevision
  }
  const sourceFingerprintAfter = stableHash({
    activationRevision: sourceWorld.activationRevision,
    activeObjectMask: sourceWorld.activeObjectMask,
    revision: sourceWorld.revision,
    topology: createWorldTopologyProjection(sourceWorld),
  })
  if (sourceFingerprintAfter !== sourceFingerprintBefore) {
    throw new Error('navigation scale proof source clone changed during obstacle lifecycle setup')
  }
  setZombieEscapeObstacleDamageEnabled(state, false)
  state.waveState = 'escape'
  state.waveSpawnRemaining = 0
  state.replacementSpawnRemaining = 0
  state.player.health = 1_000_000_000
  setProofTarget(state, initialTarget)
  const input = createZombieEscapeControlState()
  for (
    let tick = 0;
    tick < INITIAL_TARGET_PUBLICATION_TICK_CAP &&
    (!state.navigationGoalInitialized ||
      state.navigationField.graphSparseTargetUpdate.status !== 'ready' ||
      state.navigationTargetCommittedRouteGeneration === 0);
    tick += 1
  ) {
    stepZombieEscapeSimulationPhysics(
      state,
      input,
      ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
      arena,
    )
  }
  if (state.navigationTargetCommittedRouteGeneration === 0) {
    throw new Error('navigation scale proof target did not publish before agent admission')
  }
  const certifiedAnchors = createLandrushZombieEscapeNavigationScaleProofCertifiedAnchorSet(state)
  let anchorNodes: Int32Array
  if (anchorLayout?.mode === 'explicit') {
    anchorNodes = anchorLayout.nodes
  } else if (anchorLayout?.mode === 'lockstep') {
    const selected = selectLandrushZombieEscapeNavigationScaleProofAnchorNodes(
      state.collisionWorld,
      plan,
      initialTarget,
      roomTarget,
      3,
      certifiedAnchors,
    ).nodes[2]!
    if (state.collisionWorld.navigationGraph.connectorIndices[selected]! >= 0) {
      throw new Error('navigation scale proof lockstep anchor intersects a connector')
    }
    anchorNodes = new Int32Array(population).fill(selected)
  } else {
    anchorNodes = selectLandrushZombieEscapeNavigationScaleProofAnchorNodes(
      state.collisionWorld,
      plan,
      initialTarget,
      roomTarget,
      population,
      certifiedAnchors,
    ).nodes
  }
  assertLandrushZombieEscapeNavigationScaleProofAnchorLayoutCertified(
    anchorNodes,
    population,
    certifiedAnchors,
  )
  for (let slot = 0; slot < population; slot += 1) {
    const node = anchorNodes[slot]!
    const graph = state.collisionWorld.navigationGraph
    const layerIndex = graph.layerIndices[node]!
    const layer = state.collisionWorld.navigationLayers[layerIndex]
    const expectedAnchor = certifiedAnchors.get(node)
    if (!layer || !expectedAnchor)
      throw new Error(`navigation scale proof certified anchor ${node} disappeared at slot ${slot}`)
    const spawnedSlot = spawnZombieEscapeZombieAtNavigationElevation(
      state,
      graph.x[node]!,
      graph.z[node]!,
      layer.elevation,
      1_000_000,
    )
    if (spawnedSlot !== slot) {
      throw new Error(`navigation scale proof non-deterministic spawn slot ${spawnedSlot}/${slot}`)
    }
    const waypointNode = state.zombies.navigationWaypointNode[slot]!
    const expectedPoseX = expectedAnchor.storedX
    const expectedPoseY = Math.fround(expectedAnchor.elevation)
    const expectedPoseZ = expectedAnchor.storedZ
    if (
      state.zombies.x[slot] !== expectedPoseX ||
      state.zombies.y[slot] !== expectedPoseY ||
      state.zombies.z[slot] !== expectedPoseZ ||
      state.zombies.navigationSourceCertifiedX[slot] !== expectedPoseX ||
      state.zombies.navigationSourceCertifiedY[slot] !== expectedPoseY ||
      state.zombies.navigationSourceCertifiedZ[slot] !== expectedPoseZ ||
      waypointNode !== expectedAnchor.witnessNode ||
      graph.layerIndices[waypointNode] !== expectedAnchor.layerIndex ||
      expectedAnchor.layerIndex !== layerIndex ||
      state.zombies.navigationWaypointFallback[slot] !== (expectedAnchor.usesFallback ? 1 : 0) ||
      state.zombies.navigationIntentCommittedRouteGeneration[slot] !== expectedAnchor.generation ||
      expectedAnchor.generation !== state.navigationTargetCommittedRouteGeneration
    ) {
      throw new Error(
        `navigation scale proof spawn ${slot} did not preserve its certified navigation anchor: ${JSON.stringify({ expectedAnchor, layerIndex, node, pose: { x: state.zombies.x[slot], y: state.zombies.y[slot], z: state.zombies.z[slot] }, source: { x: state.zombies.navigationSourceCertifiedX[slot], y: state.zombies.navigationSourceCertifiedY[slot], z: state.zombies.navigationSourceCertifiedZ[slot] }, waypointLayerIndex: graph.layerIndices[waypointNode] ?? null, waypointNode })}`,
      )
    }
    if (
      getZombieEscapeZombieCollisionRadiusMeters(state.zombies.variant[slot]!) >
      state.collisionWorld.agentRadius
    ) {
      throw new Error(
        `navigation scale proof active capsule exceeds the compiled radius at slot ${slot}`,
      )
    }
    state.zombies.speedScale[slot] = 0
    state.zombies.attackCooldown[slot] = 1_000_000_000
  }
  const harness: PopulationHarness = {
    anchorNodes,
    audioSequenceBefore: state.audioEvents.writeSequence,
    bounds: createProofBounds(state.collisionWorld, population),
    input,
    plan,
    population,
    simulation: state,
    targetRecorder: createTargetRecorder(state),
  }
  assertProofSimulationEnvelope(harness)
  return harness
}

function countCoincidentActiveAgents(state: ZombieEscapeSimulation) {
  const zombies = state.zombies
  const coincident = new Uint8Array(zombies.pool.capacity)
  const thresholdSquared = 0.01 ** 2
  for (let first = 0; first < zombies.pool.capacity; first += 1) {
    if (zombies.pool.active[first] === 0 || zombies.health[first]! <= 0) continue
    for (let second = first + 1; second < zombies.pool.capacity; second += 1) {
      if (zombies.pool.active[second] === 0 || zombies.health[second]! <= 0) continue
      if (Math.abs(zombies.y[first]! - zombies.y[second]!) > 0.08) continue
      const offsetX = zombies.x[first]! - zombies.x[second]!
      const offsetZ = zombies.z[first]! - zombies.z[second]!
      if (offsetX * offsetX + offsetZ * offsetZ > thresholdSquared) continue
      coincident[first] = 1
      coincident[second] = 1
    }
  }
  let count = 0
  for (const value of coincident) count += value
  return count
}

function normalizeLockstepPopulation(harness: PopulationHarness) {
  const state = harness.simulation
  const zombies = state.zombies
  const referenceWaypoint = zombies.navigationWaypointNode[0]!
  const referenceFallback = zombies.navigationWaypointFallback[0]!
  const referenceVariant = zombies.variant[0]!
  for (let slot = 0; slot < harness.population; slot += 1) {
    if (
      zombies.navigationWaypointNode[slot] !== referenceWaypoint ||
      zombies.navigationWaypointFallback[slot] !== referenceFallback ||
      zombies.navigationConnector[slot]! >= 0
    ) {
      throw new Error(`navigation scale proof lockstep navigation setup diverged at slot ${slot}`)
    }
    zombies.variant[slot] = referenceVariant
    zombies.gait[slot] = ZOMBIE_ESCAPE_ZOMBIE_GAIT.runner
    zombies.speedScale[slot] = 0
    zombies.runBlend[slot] = 1
    zombies.vx[slot] = 0
    zombies.vz[slot] = 0
    zombies.heading[slot] = 0
    zombies.intent[slot] = ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase
    zombies.locomotionBlend[slot] = 0
    zombies.locomotionPhase[slot] = 0
    zombies.attackCooldown[slot] = 1_000_000_000
    zombies.attackFocusX[slot] = state.player.x
    zombies.attackFocusZ[slot] = state.player.z
    zombies.attackTargetObjectId[slot] = null
    zombies.attackTargetObjectOrdinal[slot] = -1
  }
}

function assertLockstepPoses(state: ZombieEscapeSimulation, population: number, label: string) {
  const zombies = state.zombies
  const x = zombies.x[0]!
  const y = zombies.y[0]!
  const z = zombies.z[0]!
  const vx = zombies.vx[0]!
  const vz = zombies.vz[0]!
  const heading = zombies.heading[0]!
  const runBlend = zombies.runBlend[0]!
  for (let slot = 1; slot < population; slot += 1) {
    if (
      !Object.is(zombies.x[slot], x) ||
      !Object.is(zombies.y[slot], y) ||
      !Object.is(zombies.z[slot], z) ||
      !Object.is(zombies.vx[slot], vx) ||
      !Object.is(zombies.vz[slot], vz) ||
      !Object.is(zombies.heading[slot], heading) ||
      !Object.is(zombies.runBlend[slot], runBlend)
    ) {
      throw new Error(`navigation scale proof lockstep pose diverged ${label} at slot ${slot}`)
    }
  }
  return { x, y, z }
}

async function runFrozenTracePrelude(
  harness: PopulationHarness,
  trace: ReturnType<typeof createLandrushZombieEscapeNavigationScaleProofTrace>,
  arena: ZombieEscapeArenaData,
  fixedDeltaSeconds: number,
  signal: AbortSignal | undefined,
  deadline: number,
  recordTarget: boolean,
) {
  await drainColdAnchors(harness, arena, fixedDeltaSeconds, signal, deadline)
  for (const sample of trace.samples) {
    if (recordTarget) harness.targetRecorder.explicitRequestCount += 1
    setProofTarget(harness.simulation, sample)
    await stepHarness(
      harness,
      arena,
      fixedDeltaSeconds,
      signal,
      deadline,
      recordTarget,
      sample.index,
    )
  }
  const finalRoomSample = trace.samples.at(-1)!
  await waitForExistingTargetAdoption(
    harness,
    finalRoomSample,
    worldLayerNearestY(harness.simulation.collisionWorld, finalRoomSample.y),
    arena,
    fixedDeltaSeconds,
    signal,
    deadline,
    recordTarget,
  )
}

async function parkFrozenReacquisitionFixture(
  harness: PopulationHarness,
  arena: ZombieEscapeArenaData,
  fixedDeltaSeconds: number,
  signal: AbortSignal | undefined,
  deadline: number,
) {
  const state = harness.simulation
  const zombies = state.zombies
  if (!simulationHasNoPendingNavigation(state)) {
    throw new Error('navigation scale proof cannot park a busy reacquisition fixture')
  }
  const graph = state.collisionWorld.navigationGraph
  const arrivalRadius = Math.max(0.08, state.collisionWorld.agentRadius * 0.5)
  const catalogEntry = getZombieEscapeZombieCatalogEntry(zombies.variant[0]!)
  const runBlendResponse = 1 - Math.exp(-4.5 * fixedDeltaSeconds)
  const firstTickRunBlend = zombies.runBlend[0]! + (1 - zombies.runBlend[0]!) * runBlendResponse
  const walkSpeed = catalogEntry.movement.walkMetersPerSecond + state.wave * 0.06
  const runSpeed = catalogEntry.movement.runMetersPerSecond + state.wave * 0.18
  const firstTickDesiredSpeed =
    (walkSpeed + (runSpeed - walkSpeed) * firstTickRunBlend) * LOCKSTEP_MOVEMENT_SPEED_SCALE
  const velocityResponse = 1 - Math.exp(-7 * fixedDeltaSeconds)
  const lockstepAnalyticFirstTickDisplacement =
    firstTickDesiredSpeed * velocityResponse * fixedDeltaSeconds
  if (
    !Number.isFinite(lockstepAnalyticFirstTickDisplacement) ||
    lockstepAnalyticFirstTickDisplacement <= 0
  ) {
    throw new Error('navigation scale proof lockstep analytic first displacement is invalid')
  }
  const lockstepRadialGap =
    lockstepAnalyticFirstTickDisplacement * LOCKSTEP_RADIAL_GAP_FRACTION_OF_FIRST_STEP
  const parkingDistance = arrivalRadius + lockstepRadialGap
  const waypointBefore = new Int32Array(harness.population)
  const fallbackBefore = new Uint8Array(harness.population)
  const validBefore = new Uint8Array(harness.population)
  const cachedBefore = new Uint8Array(harness.population)
  const worldGenerationBefore = new Uint32Array(harness.population)
  const committedGenerationBefore = new Uint32Array(harness.population)
  const hit = createZombieEscapeCollisionHit()
  const move = createZombieEscapeNavigationMoveResult()
  const poseHash = new ProofHash()
  let fixtureParkingDistanceMinimum = Number.POSITIVE_INFINITY
  let fixtureParkingDistanceMaximum = 0
  for (let slot = 0; slot < harness.population; slot += 1) {
    if (
      zombies.speedScale[slot] !== 0 ||
      zombies.navigationIntentPending[slot] !== 0 ||
      zombies.navigationSparseFlowSearchActive[slot] !== 0
    ) {
      throw new Error(`navigation scale proof parking precondition failed at slot ${slot}`)
    }
    const waypoint = zombies.navigationWaypointNode[slot]!
    const layerIndex = waypoint >= 0 ? graph.layerIndices[waypoint]! : -1
    const layer = state.collisionWorld.navigationLayers[layerIndex]
    if (!layer)
      throw new Error(`navigation scale proof parking waypoint is invalid at slot ${slot}`)
    waypointBefore[slot] = waypoint
    fallbackBefore[slot] = zombies.navigationWaypointFallback[slot]!
    validBefore[slot] = zombies.navigationIntentValid[slot]!
    cachedBefore[slot] = zombies.navigationIntentHasCached[slot]!
    worldGenerationBefore[slot] = zombies.navigationIntentWorldGeneration[slot]!
    committedGenerationBefore[slot] = zombies.navigationIntentCommittedRouteGeneration[slot]!
    const waypointX = graph.x[waypoint]!
    const waypointZ = graph.z[waypoint]!
    const collisionRadius = getZombieEscapeZombieCollisionRadiusMeters(zombies.variant[slot]!)
    const approachX = zombies.navigationDirectionX[slot]!
    const approachZ = zombies.navigationDirectionZ[slot]!
    const approachLength = Math.hypot(approachX, approachZ)
    const phase = (((waypoint + 1) * 2_654_435_761) >>> 0) / 0x1_0000_0000
    const baseAngle =
      approachLength > 1e-6 ? Math.atan2(-approachZ, -approachX) : phase * Math.PI * 2
    let parked = false
    for (let attempt = 0; attempt < 32; attempt += 1) {
      const angle = baseAngle + attempt * 0.618_033_988_749_894_9 * Math.PI * 2
      moveZombieEscapeNavigationAgent(
        state.collisionWorld,
        waypointX,
        layer.elevation,
        waypointZ,
        Math.cos(angle) * parkingDistance,
        Math.sin(angle) * parkingDistance,
        collisionRadius,
        -1,
        false,
        hit,
        move,
      )
      const offsetX = move.x - waypointX
      const offsetZ = move.z - waypointZ
      const distance = Math.hypot(offsetX, offsetZ)
      const lateralDistance =
        approachLength > 1e-6
          ? Math.abs(offsetX * -approachZ + offsetZ * approachX) / approachLength
          : Number.POSITIVE_INFINITY
      const wouldPassApproachPlane =
        approachLength > 1e-6 &&
        offsetX * approachX + offsetZ * approachZ >= 0 &&
        lateralDistance <= arrivalRadius
      if (
        move.collided ||
        move.connectorIndex >= 0 ||
        Math.abs(move.y - layer.elevation) > 1e-9 ||
        distance <= arrivalRadius + 1e-6 ||
        Math.abs(distance - parkingDistance) > 1e-5 ||
        wouldPassApproachPlane
      ) {
        continue
      }
      zombies.x[slot] = move.x
      zombies.y[slot] = move.y
      zombies.z[slot] = move.z
      zombies.vx[slot] = 0
      zombies.vz[slot] = 0
      fixtureParkingDistanceMinimum = Math.min(fixtureParkingDistanceMinimum, distance)
      fixtureParkingDistanceMaximum = Math.max(fixtureParkingDistanceMaximum, distance)
      poseHash.addNumber(slot)
      poseHash.addNumber(waypoint)
      poseHash.addNumber(move.x)
      poseHash.addNumber(move.y)
      poseHash.addNumber(move.z)
      parked = true
      break
    }
    if (!parked) {
      throw new Error(`navigation scale proof could not park slot ${slot} outside radial arrival`)
    }
  }
  assertLockstepPoses(state, harness.population, 'after public-move parking')
  const oldTarget = { x: state.player.x, y: state.player.y, z: state.player.z }
  const validationCountersBefore = readCounterSnapshot(state)
  setProofTarget(state, oldTarget)
  await stepHarness(harness, arena, fixedDeltaSeconds, signal, deadline, false, 0)
  let setupValidationUnchangedAgentCount = 0
  const setupValidationChanges: Array<Readonly<Record<string, number>>> = []
  for (let slot = 0; slot < harness.population; slot += 1) {
    if (
      zombies.navigationIntentValid[slot] === validBefore[slot] &&
      zombies.navigationIntentHasCached[slot] === cachedBefore[slot] &&
      zombies.navigationIntentWorldGeneration[slot] === worldGenerationBefore[slot] &&
      zombies.navigationIntentCommittedRouteGeneration[slot] === committedGenerationBefore[slot] &&
      zombies.navigationIntentPending[slot] === 0 &&
      zombies.navigationSparseFlowSearchActive[slot] === 0 &&
      inspectZombieEscapeCommittedNavigationAction(state, slot) !== 'none'
    ) {
      setupValidationUnchangedAgentCount += 1
    } else if (setupValidationChanges.length < 16) {
      setupValidationChanges.push({
        cachedAfter: zombies.navigationIntentHasCached[slot]!,
        cachedBefore: cachedBefore[slot]!,
        committedAfter: zombies.navigationIntentCommittedRouteGeneration[slot]!,
        committedBefore: committedGenerationBefore[slot]!,
        connectorAfter: zombies.navigationConnector[slot]!,
        fallbackAfter: zombies.navigationWaypointFallback[slot]!,
        fallbackBefore: fallbackBefore[slot]!,
        pendingAfter: zombies.navigationIntentPending[slot]!,
        searchActiveAfter: zombies.navigationSparseFlowSearchActive[slot]!,
        slot,
        validAfter: zombies.navigationIntentValid[slot]!,
        validBefore: validBefore[slot]!,
        waypointAfter: zombies.navigationWaypointNode[slot]!,
        waypointBefore: waypointBefore[slot]!,
        worldAfter: zombies.navigationIntentWorldGeneration[slot]!,
        worldBefore: worldGenerationBefore[slot]!,
      })
    }
  }
  const setupValidationCounterDelta = subtractCounters(
    readCounterSnapshot(state),
    validationCountersBefore,
  )
  if (
    setupValidationUnchangedAgentCount !== harness.population ||
    !counterDeltaIsZero(setupValidationCounterDelta) ||
    !simulationHasNoPendingNavigation(state)
  ) {
    throw new Error(
      `navigation scale proof parked fixture validation failed: ${JSON.stringify({ setupValidationChanges, setupValidationCounterDelta, setupValidationUnchangedAgentCount })}`,
    )
  }
  harness.targetRecorder = createTargetRecorder(state)
  return {
    fixtureParkingAgentCount: harness.population,
    fixtureParkingDistanceMaximum,
    fixtureParkingDistanceMinimum,
    fixtureParkingPoseHash: poseHash.digest(),
    fixtureParkingSetupOnly: true as const,
    lockstepAnalyticFirstTickDisplacement,
    lockstepRadialGap,
    setupValidationCounterDelta,
    setupValidationUnchangedAgentCount,
  }
}

async function runMovingReacquisitionTransition(
  harness: PopulationHarness,
  target: ProofTarget,
  targetLayerIndex: number,
  arena: ZombieEscapeArenaData,
  fixedDeltaSeconds: number,
  signal: AbortSignal | undefined,
  deadline: number,
): Promise<LandrushZombieEscapeNavigationScaleProofTransition> {
  normalizeLockstepPopulation(harness)
  const parking = await parkFrozenReacquisitionFixture(
    harness,
    arena,
    fixedDeltaSeconds,
    signal,
    deadline,
  )
  const frozen = await waitForFrozenTargetTransition(
    harness,
    target,
    targetLayerIndex,
    arena,
    fixedDeltaSeconds,
    signal,
    deadline,
    false,
  )
  normalizeLockstepPopulation(harness)
  const state = harness.simulation
  const zombies = state.zombies
  const graph = state.collisionWorld.navigationGraph
  const initialWaypoint = new Int32Array(harness.population)
  const distanceBefore = new Float64Array(harness.population)
  let maximumInitialWaypointDistance = 0
  if (
    frozen.frozen.adoptedAgentCount !== harness.population ||
    frozen.frozen.reacquiringAgentCount !== 0 ||
    frozen.frozen.invalidAgentCount !== 0
  ) {
    throw new Error(
      `navigation scale proof lockstep topology repair did not settle current-generation agents: ${JSON.stringify(frozen)}`,
    )
  }
  for (let slot = 0; slot < harness.population; slot += 1) {
    const waypoint = zombies.navigationWaypointNode[slot]!
    initialWaypoint[slot] = waypoint
    if (
      waypoint < 0 ||
      zombies.navigationIntentCommittedRouteGeneration[slot] !== frozen.generationAfter ||
      zombies.navigationIntentValid[slot] === 0 ||
      zombies.navigationIntentPending[slot] !== 0 ||
      zombies.navigationSparseFlowSearchActive[slot] !== 0
    ) {
      throw new Error(`navigation scale proof lockstep repaired route is invalid at slot ${slot}`)
    }
    const distance = Math.hypot(
      graph.x[waypoint]! - zombies.x[slot]!,
      graph.z[waypoint]! - zombies.z[slot]!,
    )
    maximumInitialWaypointDistance = Math.max(maximumInitialWaypointDistance, distance)
  }
  const movementStartCoincidentAgentCount = countCoincidentActiveAgents(state)
  if (movementStartCoincidentAgentCount !== harness.population) {
    throw new Error('navigation scale proof lockstep cohort is not exactly coincident')
  }
  const startPose = assertLockstepPoses(state, harness.population, 'before movement')
  const lockstepPoseHash = new ProofHash()
  lockstepPoseHash.addNumber(0)
  lockstepPoseHash.addNumber(startPose.x)
  lockstepPoseHash.addNumber(startPose.y)
  lockstepPoseHash.addNumber(startPose.z)
  for (let slot = 0; slot < harness.population; slot += 1) {
    zombies.speedScale[slot] = LOCKSTEP_MOVEMENT_SPEED_SCALE
    zombies.vx[slot] = 0
    zombies.vz[slot] = 0
  }
  const countersBefore = readCounterSnapshot(state)
  const deferredMarkedBefore = state.navigationIntentAdmissionDeferredMarkedCount
  const separationNeighborCountBefore = state.agentSpatialIndex.separationNeighborCount
  const demandCountersBefore = {
    cachedAnchorLost: state.navigationIntentDemandCachedAnchorLostCount,
    collisionRecovery: state.navigationIntentDemandCollisionRecoveryCount,
    connectorChanged: state.navigationIntentDemandConnectorChangedCount,
    worldChanged: state.navigationIntentDemandWorldChangedCount,
  }
  for (let slot = 0; slot < harness.population; slot += 1) {
    const waypoint = initialWaypoint[slot]!
    distanceBefore[slot] = Math.hypot(
      graph.x[waypoint]! - zombies.x[slot]!,
      graph.z[waypoint]! - zombies.z[slot]!,
    )
  }
  setProofTarget(state, target)
  await stepHarness(harness, arena, fixedDeltaSeconds, signal, deadline, false, 0)
  if (state.navigationTargetCommittedRouteGeneration !== frozen.generationAfter) {
    throw new Error('navigation scale proof current-generation movement changed target generation')
  }
  const pose = assertLockstepPoses(state, harness.population, 'after current-generation movement')
  lockstepPoseHash.addNumber(1)
  lockstepPoseHash.addNumber(pose.x)
  lockstepPoseHash.addNumber(pose.y)
  lockstepPoseHash.addNumber(pose.z)
  const lockstepFirstTickDisplacement = Math.hypot(pose.x - startPose.x, pose.z - startPose.z)
  const firstWaypoint = initialWaypoint[0]!
  const distanceAfter = Math.hypot(
    graph.x[firstWaypoint]! - pose.x,
    graph.z[firstWaypoint]! - pose.z,
  )
  const lockstepFirstTickRadialProgress = distanceBefore[0]! - distanceAfter
  const counterDelta = subtractCounters(readCounterSnapshot(state), countersBefore)
  const demandDelta = {
    cachedAnchorLost:
      state.navigationIntentDemandCachedAnchorLostCount - demandCountersBefore.cachedAnchorLost,
    collisionRecovery:
      state.navigationIntentDemandCollisionRecoveryCount - demandCountersBefore.collisionRecovery,
    connectorChanged:
      state.navigationIntentDemandConnectorChangedCount - demandCountersBefore.connectorChanged,
    worldChanged: state.navigationIntentDemandWorldChangedCount - demandCountersBefore.worldChanged,
  }
  const lockstepSeparationNeighborDelta =
    state.agentSpatialIndex.separationNeighborCount - separationNeighborCountBefore
  let currentAgentCount = 0
  for (let slot = 0; slot < harness.population; slot += 1) {
    if (
      zombies.navigationIntentCommittedRouteGeneration[slot] === frozen.generationAfter &&
      zombies.navigationIntentValid[slot] !== 0 &&
      zombies.navigationIntentPending[slot] === 0 &&
      zombies.navigationWaypointNode[slot]! >= 0 &&
      zombies.navigationReachable[slot] !== 0 &&
      zombies.intent[slot] === ZOMBIE_ESCAPE_ZOMBIE_INTENT.chase &&
      zombies.attackTargetObjectId[slot] === null
    ) {
      currentAgentCount += 1
    }
  }
  if (
    currentAgentCount !== harness.population ||
    lockstepFirstTickDisplacement <= 0 ||
    lockstepFirstTickRadialProgress <= 0 ||
    !counterDeltaIsZero(counterDelta) ||
    Object.values(demandDelta).some((value) => value !== 0) ||
    state.navigationIntentAdmissionDeferredMarkedCount !== deferredMarkedBefore ||
    state.navigationIntentAdmissionDeferredPendingCount !== 0 ||
    !simulationHasNoPendingNavigation(state)
  ) {
    throw new Error(
      `navigation scale proof current-generation movement failed: ${JSON.stringify({ counterDelta, currentAgentCount, demandDelta, lockstepFirstTickDisplacement, lockstepFirstTickRadialProgress })}`,
    )
  }
  for (let slot = 0; slot < harness.population; slot += 1) {
    zombies.speedScale[slot] = 0
    zombies.vx[slot] = 0
    zombies.vz[slot] = 0
  }
  return {
    ...frozen,
    movement: {
      counterDelta,
      currentGenerationMovementOnly: true,
      enabledAgentCount: harness.population,
      finalAdoptedAgentCount: currentAgentCount,
      ...parking,
      lockstepAnchorOccupancy: harness.population,
      lockstepFirstTickDisplacement,
      lockstepFirstTickRadialProgress,
      lockstepPoseHash: lockstepPoseHash.digest(),
      lockstepSeparationNeighborDelta,
      lockstepSpeedScale: LOCKSTEP_MOVEMENT_SPEED_SCALE,
      maximumAdoptionTick: frozen.frozen.settleTickCount,
      maximumInitialWaypointDistance,
      movementStartCoincidentAgentCount,
      tickCount: 1,
    },
  }
}

async function runMovingReacquisitionTransitions(
  sourceWorld: ZombieEscapeCollisionWorld,
  arena: ZombieEscapeArenaData,
  trace: ReturnType<typeof createLandrushZombieEscapeNavigationScaleProofTrace>,
  population: number,
  fixedDeltaSeconds: number,
  signal: AbortSignal | undefined,
  deadline: number,
) {
  const harness = createPopulationHarness(
    sourceWorld,
    arena,
    trace.connector,
    trace.samples[0]!,
    trace.samples.at(-1)!,
    population,
    { mode: 'lockstep' },
  )
  await runFrozenTracePrelude(harness, trace, arena, fixedDeltaSeconds, signal, deadline, false)
  const upper = await runMovingReacquisitionTransition(
    harness,
    targetForNode(harness.simulation.collisionWorld, harness.plan.upperTargetNode),
    harness.plan.upperLayerIndex,
    arena,
    fixedDeltaSeconds,
    signal,
    deadline,
  )
  const lower = await runMovingReacquisitionTransition(
    harness,
    targetForNode(harness.simulation.collisionWorld, harness.plan.lowerTargetNode),
    harness.plan.lowerLayerIndex,
    arena,
    fixedDeltaSeconds,
    signal,
    deadline,
  )
  return { lower, upper }
}

async function runIsolatedConnectorProof(
  sourceWorld: ZombieEscapeCollisionWorld,
  arena: ZombieEscapeArenaData,
  trace: ReturnType<typeof createLandrushZombieEscapeNavigationScaleProofTrace>,
  fixedDeltaSeconds: number,
  signal: AbortSignal | undefined,
  deadline: number,
) {
  const runDirection = async (direction: 'lower-to-upper' | 'upper-to-lower') => {
    const sourceNode =
      direction === 'lower-to-upper'
        ? trace.connector.lowerSourceNode
        : trace.connector.upperSourceNode
    const authenticatedLandingNode =
      direction === 'lower-to-upper'
        ? trace.connector.upperSourceNode
        : trace.connector.lowerSourceNode
    const targetLayerIndex =
      direction === 'lower-to-upper'
        ? trace.connector.upperLayerIndex
        : trace.connector.lowerLayerIndex
    const target = createLandrushZombieEscapeNavigationScaleProofConnectorTraversalTarget(
      sourceWorld,
      trace.connector,
      direction,
    )
    const harness = createPopulationHarness(
      sourceWorld,
      arena,
      trace.connector,
      target,
      target,
      1,
      { mode: 'explicit', nodes: new Int32Array([sourceNode]) },
    )
    const state = harness.simulation
    const resolvedGoalMustRemainExact = direction === 'upper-to-lower'
    if (
      state.navigationGoalLayerIndex !== targetLayerIndex ||
      state.navigationGoalY !==
        state.collisionWorld.navigationLayers[targetLayerIndex]!.elevation ||
      (resolvedGoalMustRemainExact &&
        (state.navigationGoalX !== target.x || state.navigationGoalZ !== target.z))
    ) {
      throw new Error(
        `navigation scale proof ${direction} target resolved onto the wrong production layer: ${JSON.stringify({ goal: { layerIndex: state.navigationGoalLayerIndex, x: state.navigationGoalX, y: state.navigationGoalY, z: state.navigationGoalZ }, target, targetLayerIndex })}`,
      )
    }
    await drainColdAnchors(harness, arena, fixedDeltaSeconds, signal, deadline)
    const countersBefore = readCounterSnapshot(state)
    const witness = await runConnectorWitness(
      harness,
      0,
      direction,
      sourceNode,
      authenticatedLandingNode,
      target,
      targetLayerIndex,
      arena,
      fixedDeltaSeconds,
      signal,
      deadline,
    )
    await drainConnectorRefresh(harness, target, arena, fixedDeltaSeconds, signal, deadline)
    const reverse = inspectZombieEscapeSparseReverseFieldBanks(state.navigationField)
    const leases = inspectZombieEscapeSparseAttachmentHeapLeases(state.navigationField)
    if (
      reverse.readerLeaseCount !== 0 ||
      reverse.leaseInvariantViolationCount !== 0 ||
      reverse.publicationBlockedCount !== 0 ||
      leases.activeAgentLeases !== 0 ||
      leases.leaseInvariantViolationCount !== 0
    ) {
      throw new Error(`navigation scale proof ${direction} connector witness leaked leases`)
    }
    return {
      delta: subtractCounters(readCounterSnapshot(state), countersBefore),
      witness,
    }
  }
  const upward = await runDirection('lower-to-upper')
  const downward = await runDirection('upper-to-lower')
  const refreshDelta = addCounterDeltas(upward.delta, downward.delta)
  const witnesses = [upward.witness, downward.witness] as const
  return {
    functionalCorrectnessOnly: true as const,
    planHash: stableHash(trace.connector),
    refreshDelta,
    witnessHash: stableHash(witnesses),
    witnesses,
    workHash: stableHash(refreshDelta),
  }
}

async function runPopulationProof(
  sourceWorld: ZombieEscapeCollisionWorld,
  arena: ZombieEscapeArenaData,
  trace: ReturnType<typeof createLandrushZombieEscapeNavigationScaleProofTrace>,
  population: number,
  fixedDeltaSeconds: number,
  signal: AbortSignal | undefined,
  deadline: number,
): Promise<LandrushZombieEscapeNavigationScaleProofPopulation> {
  const initialTarget = trace.samples[0]!
  const harness = createPopulationHarness(
    sourceWorld,
    arena,
    trace.connector,
    initialTarget,
    trace.samples.at(-1)!,
    population,
  )
  const coldDrainTicks = await drainColdAnchors(harness, arena, fixedDeltaSeconds, signal, deadline)
  const state = harness.simulation
  const coldReadyAgentCount = inspectAnchoredAgents(state)
  const reverseFieldBefore = inspectZombieEscapeSparseReverseFieldBanks(state.navigationField)
  harness.targetRecorder = createTargetRecorder(state)

  for (const sample of trace.samples) {
    harness.targetRecorder.explicitRequestCount += 1
    setProofTarget(state, sample)
    await stepHarness(harness, arena, fixedDeltaSeconds, signal, deadline, true, sample.index)
  }
  const finalRoomSample = trace.samples.at(-1)!
  const roomLayerIndex = worldLayerNearestY(state.collisionWorld, finalRoomSample.y)
  await waitForExistingTargetAdoption(
    harness,
    finalRoomSample,
    roomLayerIndex,
    arena,
    fixedDeltaSeconds,
    signal,
    deadline,
  )

  const upperTarget = targetForNode(state.collisionWorld, harness.plan.upperTargetNode)
  const upperFrozen = await waitForFrozenTargetTransition(
    harness,
    upperTarget,
    harness.plan.upperLayerIndex,
    arena,
    fixedDeltaSeconds,
    signal,
    deadline,
    true,
  )

  const lowerTarget = targetForNode(state.collisionWorld, harness.plan.lowerTargetNode)
  const lowerFrozen = await waitForFrozenTargetTransition(
    harness,
    lowerTarget,
    harness.plan.lowerLayerIndex,
    arena,
    fixedDeltaSeconds,
    signal,
    deadline,
    true,
  )
  const reverseFieldAfter = inspectZombieEscapeSparseReverseFieldBanks(state.navigationField)
  const leases = inspectZombieEscapeSparseAttachmentHeapLeases(state.navigationField)
  if (
    reverseFieldAfter.readerLeaseCount !== 0 ||
    reverseFieldAfter.leaseInvariantViolationCount !== 0 ||
    reverseFieldAfter.publicationBlockedCount !== 0 ||
    leases.activeAgentLeases !== 0 ||
    leases.leaseInvariantViolationCount !== 0
  ) {
    throw new Error('navigation scale proof leaked sparse navigation leases')
  }
  const movingTransitions = await runMovingReacquisitionTransitions(
    sourceWorld,
    arena,
    trace,
    population,
    fixedDeltaSeconds,
    signal,
    deadline,
  )
  const anchorOccupancy = inspectAnchorNodeOccupancy(harness.anchorNodes)
  const target = harness.targetRecorder
  return {
    activeAgentCount: state.zombies.pool.activeCount,
    anchorDigest: hashAnchorPrefix(harness.anchorNodes),
    anchorNodeCount: harness.anchorNodes.length,
    bounds: harness.bounds,
    coldDrainTicks,
    coldReadyAgentCount,
    maximumAnchorNodeOccupancy: anchorOccupancy.maximumAnchorNodeOccupancy,
    navigationGraphNodeCount: state.collisionWorld.navigationGraph.nodeIds.length,
    navigationOnly: true,
    noAudioEventDelta: state.audioEvents.writeSequence - harness.audioSequenceBefore,
    population,
    publicationTransitions: movingTransitions,
    reverseFieldAfter,
    reverseFieldBefore,
    sharedFourteenAnchorPrefixHash: hashAnchorPrefix(harness.anchorNodes, SMALL_POPULATION),
    target: {
      committedContentHash: getZombieEscapeSparseCommittedRouteContentHash(state.navigationField),
      committedGeneration: getZombieEscapeSparseCommittedRouteGeneration(state.navigationField),
      eventCount: target.eventCount,
      explicitRequestCount: target.explicitRequestCount,
      maximumStepWork: target.maximumStepWork,
      physicsTickCount: target.physicsTickCount,
      publicationHash: target.publicationHash.digest(),
      tickWorkHash: target.tickWorkHash.digest(),
      work: target.work,
    },
    topologyTransitions: {
      lower: lowerFrozen,
      upper: upperFrozen,
    },
    uniqueAnchorNodeCount: anchorOccupancy.uniqueAnchorNodeCount,
  }
}

function assertPopulationComparison(
  small: LandrushZombieEscapeNavigationScaleProofPopulation,
  scale: LandrushZombieEscapeNavigationScaleProofPopulation,
) {
  const assertTransitionEvidence = (
    population: LandrushZombieEscapeNavigationScaleProofPopulation,
    direction: string,
    transition: LandrushZombieEscapeNavigationScaleProofTopologyTransition,
    repairTickCap: number,
  ) => {
    const frozen = transition.frozen
    if (
      transition.generationAfter <= transition.generationBefore ||
      frozen.committedGeneration !== transition.generationAfter ||
      frozen.invalidAgentCount !== 0 ||
      frozen.adoptedAgentCount !== population.population ||
      frozen.reacquiringAgentCount !== 0 ||
      frozen.publicationAdoptedAgentCount + frozen.publicationRepairAgentCount !==
        population.population ||
      frozen.repairFirstServiceObservedCount +
        frozen.repairInlineRecoveryWithoutFirstServiceCount !==
        frozen.publicationRepairAgentCount ||
      frozen.repairHoldObservedCount !== frozen.publicationRepairAgentCount ||
      frozen.counterDelta.cachedAnchorLost !== 0 ||
      !landrushZombieEscapeNavigationScaleProofTransitionDemandAccountingIsConserved(
        frozen.counterDelta,
      ) ||
      (frozen.repairFirstServiceObservedCount === 0
        ? frozen.maximumRepairFirstServiceTicks !== 0
        : frozen.maximumRepairFirstServiceTicks < 1) ||
      (frozen.publicationRepairAgentCount === 0
        ? frozen.maximumRepairHoldTicks !== 0
        : frozen.maximumRepairHoldTicks < 1) ||
      frozen.maximumAgentServiceSlicesPerTick >
        ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick ||
      frozen.maximumFirstServiceAgeTicks >
        Math.ceil(
          population.population / ZOMBIE_ESCAPE_SIMULATION.navigationSparseSearchAgentSlicesPerTick,
        ) ||
      frozen.maximumRepairFirstServiceTicks > repairTickCap ||
      frozen.maximumRepairFirstServiceTicks > frozen.maximumRepairHoldTicks ||
      frozen.maximumRepairHoldTicks > repairTickCap ||
      frozen.maximumSuccessorVisits > population.navigationGraphNodeCount ||
      frozen.settleTickCount < 1 ||
      frozen.settleTickCount > repairTickCap
    ) {
      throw new Error(
        `navigation scale proof ${population.population} ${direction} topology transition failed: ${JSON.stringify(transition)}`,
      )
    }
  }
  for (const [label, population] of [
    ['14', small],
    ['100', scale],
  ] as const) {
    for (const [direction, transition] of Object.entries(population.topologyTransitions)) {
      assertTransitionEvidence(
        population,
        `${direction} production`,
        transition,
        population.bounds.productionTopologyRepairTickCap,
      )
    }
    for (const [direction, transition] of Object.entries(population.publicationTransitions)) {
      assertTransitionEvidence(
        population,
        `${direction} movement`,
        transition,
        population.bounds.maximumRepairHoldTicks,
      )
      if (
        transition.movement.enabledAgentCount !== population.population ||
        transition.movement.finalAdoptedAgentCount !== population.population ||
        transition.movement.fixtureParkingAgentCount !== population.population ||
        transition.movement.fixtureParkingSetupOnly !== true ||
        transition.movement.currentGenerationMovementOnly !== true ||
        transition.movement.lockstepAnchorOccupancy !== population.population ||
        transition.movement.movementStartCoincidentAgentCount !== population.population ||
        transition.movement.lockstepAnalyticFirstTickDisplacement >= 0.01 ||
        transition.movement.lockstepFirstTickDisplacement <= 0 ||
        transition.movement.lockstepFirstTickRadialProgress <= 0 ||
        transition.movement.lockstepSpeedScale !== LOCKSTEP_MOVEMENT_SPEED_SCALE ||
        !/^[0-9a-f]{16}$/.test(transition.movement.lockstepPoseHash) ||
        transition.movement.maximumAdoptionTick > population.bounds.maximumRepairHoldTicks ||
        transition.movement.setupValidationUnchangedAgentCount !== population.population ||
        !counterDeltaIsZero(transition.movement.setupValidationCounterDelta) ||
        transition.movement.tickCount !== 1 ||
        !counterDeltaIsZero(transition.movement.counterDelta)
      ) {
        throw new Error(
          `navigation scale proof ${label} ${direction} reacquisition contract failed: ${JSON.stringify(transition)}`,
        )
      }
    }
  }
  if (
    small.bounds.topologyTransitionTickCap !== scale.bounds.topologyTransitionTickCap ||
    small.bounds.maximumRepairFirstServiceTicks !== scale.bounds.maximumRepairFirstServiceTicks ||
    small.bounds.maximumRepairHoldTicks !== scale.bounds.maximumRepairHoldTicks ||
    small.bounds.productionTopologyRepairTickCap !== scale.bounds.productionTopologyRepairTickCap ||
    small.sharedFourteenAnchorPrefixHash !== scale.sharedFourteenAnchorPrefixHash ||
    JSON.stringify(small.target.work) !== JSON.stringify(scale.target.work) ||
    JSON.stringify(small.target.maximumStepWork) !== JSON.stringify(scale.target.maximumStepWork) ||
    small.target.tickWorkHash !== scale.target.tickWorkHash ||
    small.target.publicationHash !== scale.target.publicationHash ||
    small.target.committedContentHash !== scale.target.committedContentHash ||
    small.target.committedGeneration !== scale.target.committedGeneration ||
    small.reverseFieldAfter.allocatedBytes !== scale.reverseFieldAfter.allocatedBytes
  ) {
    throw new Error('navigation scale proof 14/100 production target work diverged')
  }
}

export async function runLandrushZombieEscapeNavigationScaleProof({
  arena,
  collisionWorld,
  collisionWorldGeneration,
  collisionWorldSignature,
  fixedDeltaSeconds,
  signal,
  timeoutMs = DEFAULT_PROOF_TIMEOUT_MS,
  worldOrigin,
}: LandrushZombieEscapeNavigationScaleProofInput): Promise<LandrushZombieEscapeNavigationScaleProofResult> {
  if (collisionWorld.navigationMode !== 'sparse') {
    throw new Error('Landrush Zombie Escape navigation scale proof requires a sparse live world')
  }
  if (collisionWorld.agentRadius !== ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS) {
    throw new Error(
      'Landrush Zombie Escape navigation scale proof requires the production maximum roster radius',
    )
  }
  if (!Number.isInteger(collisionWorldGeneration) || collisionWorldGeneration < 1) {
    throw new Error(
      'Landrush Zombie Escape navigation scale proof requires a live world generation',
    )
  }
  if (fixedDeltaSeconds !== ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds) {
    throw new Error(
      'Landrush Zombie Escape navigation scale proof requires the production fixed step',
    )
  }
  const normalizedTimeoutMs = Number.isFinite(timeoutMs)
    ? Math.max(1, Math.trunc(timeoutMs))
    : DEFAULT_PROOF_TIMEOUT_MS
  const deadline = Date.now() + normalizedTimeoutMs
  throwIfStopped(signal, deadline)
  const fingerprintBefore = inspectLandrushZombieEscapeNavigationScaleProofWorld(
    collisionWorld,
    collisionWorldSignature,
  )
  if (!fingerprintBefore.requiredDoorClosedBreakable) {
    throw new Error('Landrush Zombie Escape navigation scale proof world authentication failed')
  }
  const sourceWorld = createLandrushZombieEscapeNavigationScaleProofOpenWorld(
    collisionWorld,
    worldOrigin,
  )
  const trace = createLandrushZombieEscapeNavigationScaleProofTrace(sourceWorld, worldOrigin)
  assertRecordedRoomTraceUsesOpenTopology(sourceWorld, trace.samples)
  const small = await runPopulationProof(
    sourceWorld,
    arena,
    trace,
    SMALL_POPULATION,
    fixedDeltaSeconds,
    signal,
    deadline,
  )
  const scale = await runPopulationProof(
    sourceWorld,
    arena,
    trace,
    SCALE_POPULATION,
    fixedDeltaSeconds,
    signal,
    deadline,
  )
  assertPopulationComparison(small, scale)
  const connectorProof = await runIsolatedConnectorProof(
    sourceWorld,
    arena,
    trace,
    fixedDeltaSeconds,
    signal,
    deadline,
  )
  const fingerprintAfter = inspectLandrushZombieEscapeNavigationScaleProofWorld(
    collisionWorld,
    collisionWorldSignature,
  )
  if (fingerprintAfter.combinedHash !== fingerprintBefore.combinedHash) {
    throw new Error('Landrush Zombie Escape navigation scale proof live world changed during proof')
  }
  return {
    connector: { ...trace.connector, ...connectorProof },
    fixedDeltaSeconds,
    navigationOnlyLimitation:
      'This proves production navigation scheduling, bounded topology-change repair, stable publication adoption, and current-generation route movement; repeated anchor poses mean it does not claim crowd collision latency, rendering, animation, audio, projectiles, networking, or total-frame scaling.',
    populations: [small, scale],
    schemaVersion: 7,
    trace: {
      hash: trace.hash,
      recordedBreachBlockerIds: trace.recordedBreachBlockerIds,
      recordedBuildingScopeId: trace.recordedBuildingScopeId,
      recordedDoorFixedStepCount: trace.recordedDoorFixedStepCount,
      recordedDoorId: trace.recordedDoorId,
      recordedInsideWorld: trace.recordedInsideWorld,
      recordedLevelId: trace.recordedLevelId,
      recordedOutsideWorld: trace.recordedOutsideWorld,
      requestCount: trace.requestCount,
      samples: trace.samples,
    },
    world: {
      activationRevision: collisionWorld.activationRevision,
      collisionWorldGeneration,
      connectorCount: collisionWorld.navigationConnectors.length,
      fingerprintAfter,
      fingerprintBefore,
      layerCount: collisionWorld.navigationLayers.length,
      navigationMode: collisionWorld.navigationMode,
      nodeCount: collisionWorld.navigationGraph.nodeIds.length,
      revision: collisionWorld.revision,
    },
  }
}
