export const ZOMBIE_NAVIGATION_SCALE_PROOF_POPULATIONS = Object.freeze([14, 100])
export const ZOMBIE_NAVIGATION_SCALE_PROOF_RECORDED_BREACH_BLOCKER_IDS = Object.freeze([
  'door_house_kitchen_back',
  'item_g_kitchen_run',
])
export const ZOMBIE_NAVIGATION_SCALE_PROOF_TARGET_WORK_KEYS = Object.freeze([
  'candidateVisits',
  'collisionPredicates',
  'graphEdgeVisits',
  'heapOperations',
  'hierarchyNodeVisits',
  'publications',
  'serviceSlices',
  'supportPredicates',
  'targetBuilds',
])

const TARGET_COMPACT_MAXIMUM_NODE_COUNT = 256
const TARGET_RAW_COMMON_STEP_CAPS = Object.freeze({
  collisionPredicates: 64,
  hierarchyNodeVisits: 256,
  publications: 1,
  serviceSlices: 1,
  supportPredicates: 128,
  targetBuilds: 2,
})
const TARGET_RAW_COMPACT_STEP_CAPS = Object.freeze({
  candidateVisits: 256,
  graphEdgeVisits: 512,
  heapOperations: 512,
})
const TARGET_RAW_FULL_STEP_CAPS = Object.freeze({
  candidateVisits: 1024,
  graphEdgeVisits: 1024,
  heapOperations: 3072,
})
const COUNTER_DELTA_KEYS = Object.freeze([
  'attachmentWork',
  'cachedAnchorLost',
  'inlineRecoveryWithoutFirstService',
  'intentCanceled',
  'intentFirstService',
  'intentIssued',
  'intentResolved',
  'intentResolveSlices',
  'routePublishedDemand',
  'searchRestarted',
  'searchStarted',
  'searchUncausedStartViolations',
])
const PRODUCTION_AGENT_SERVICE_SLICES_PER_TICK = 8
const MAXIMUM_REPAIR_FIRST_SERVICE_TICKS = 60
const MAXIMUM_REPAIR_HOLD_TICKS = 60
const PRODUCTION_TOPOLOGY_REPAIR_TICK_CAP = 30
const HASH_PATTERN = /^[0-9a-f]{16}$/
function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function targetStepCaps(navigationGraphNodeCount) {
  const regime =
    navigationGraphNodeCount <= TARGET_COMPACT_MAXIMUM_NODE_COUNT
      ? TARGET_RAW_COMPACT_STEP_CAPS
      : TARGET_RAW_FULL_STEP_CAPS
  const reservedWork = PRODUCTION_AGENT_SERVICE_SLICES_PER_TICK
  return {
    candidateVisits: regime.candidateVisits - reservedWork,
    collisionPredicates: TARGET_RAW_COMMON_STEP_CAPS.collisionPredicates - reservedWork,
    graphEdgeVisits: regime.graphEdgeVisits,
    heapOperations: regime.heapOperations - reservedWork,
    hierarchyNodeVisits: TARGET_RAW_COMMON_STEP_CAPS.hierarchyNodeVisits - reservedWork,
    publications: TARGET_RAW_COMMON_STEP_CAPS.publications,
    serviceSlices: TARGET_RAW_COMMON_STEP_CAPS.serviceSlices,
    supportPredicates: TARGET_RAW_COMMON_STEP_CAPS.supportPredicates - reservedWork,
    targetBuilds: TARGET_RAW_COMMON_STEP_CAPS.targetBuilds,
  }
}

function workIssues(work, label, maximumStep = false, navigationGraphNodeCount = 0) {
  if (!work || typeof work !== 'object') return [`${label} is missing`]
  const issues = []
  const caps = maximumStep ? targetStepCaps(navigationGraphNodeCount) : null
  for (const key of ZOMBIE_NAVIGATION_SCALE_PROOF_TARGET_WORK_KEYS) {
    if (!isNonNegativeInteger(work[key])) issues.push(`${label}.${key}=${String(work[key])}`)
    if (caps && work[key] > caps[key]) {
      issues.push(`${label}.${key}=${String(work[key])} (cap ${String(caps[key])})`)
    }
  }
  return issues
}

function zeroCounterDeltaIssues(delta, label) {
  if (!delta || typeof delta !== 'object') return [`${label} is missing`]
  const issues = []
  for (const key of COUNTER_DELTA_KEYS) {
    if (delta[key] !== 0) issues.push(`${label}.${key}=${String(delta[key])}`)
  }
  return issues
}

function nonNegativeCounterDeltaIssues(delta, label) {
  if (!delta || typeof delta !== 'object') return [`${label} is missing`]
  const issues = []
  for (const key of COUNTER_DELTA_KEYS) {
    if (!isNonNegativeInteger(delta[key])) issues.push(`${label}.${key}=${String(delta[key])}`)
  }
  return issues
}

export function zombieNavigationScaleProofTransitionDemandAccountingIssues(delta, label) {
  if (!delta || typeof delta !== 'object') return [`${label} is missing`]
  const issues = []
  if (
    delta.intentIssued !== delta.routePublishedDemand ||
    delta.intentIssued !== delta.intentResolved ||
    delta.intentIssued !== delta.intentResolveSlices
  ) {
    issues.push(
      `${label} demand conservation=${String(delta.intentIssued)}/` +
        `${String(delta.routePublishedDemand)}/${String(delta.intentResolved)}/` +
        `${String(delta.intentResolveSlices)}`,
    )
  }
  if (
    delta.intentResolved !==
    delta.intentFirstService + delta.inlineRecoveryWithoutFirstService
  ) {
    issues.push(
      `${label} resolution classification=${String(delta.intentResolved)}/` +
        `${String(delta.intentFirstService)}/${String(delta.inlineRecoveryWithoutFirstService)}`,
    )
  }
  if (delta.intentCanceled !== 0) {
    issues.push(`${label}.intentCanceled=${String(delta.intentCanceled)}`)
  }
  const uniqueSearchStarts = delta.searchStarted - delta.searchRestarted
  if (
    !isNonNegativeInteger(uniqueSearchStarts) ||
    uniqueSearchStarts > delta.intentIssued
  ) {
    issues.push(
      `${label} unique search starts=${String(uniqueSearchStarts)} ` +
        `(issued ${String(delta.intentIssued)})`,
    )
  }
  if (delta.searchUncausedStartViolations !== 0) {
    issues.push(
      `${label}.searchUncausedStartViolations=${String(delta.searchUncausedStartViolations)}`,
    )
  }
  return issues
}

function fingerprintIssues(fingerprint, label) {
  if (!fingerprint || typeof fingerprint !== 'object') return [`${label} is missing`]
  const issues = []
  for (const key of [
    'activeMaskHash',
    'combinedHash',
    'semanticKeyHash',
    'signatureHash',
    'topologyHash',
  ]) {
    if (typeof fingerprint[key] !== 'string' || !HASH_PATTERN.test(fingerprint[key])) {
      issues.push(`${label}.${key}=${String(fingerprint[key])}`)
    }
  }
  if (fingerprint.requiredDoorClosedBreakable !== true) {
    issues.push(`${label} does not authenticate the active closed breakable recorded door`)
  }
  return issues
}

function reverseFieldIssues(inspection, label) {
  if (!inspection || typeof inspection !== 'object') return [`${label} is missing`]
  const issues = []
  if (!isPositiveInteger(inspection.allocatedBytes)) {
    issues.push(`${label}.allocatedBytes=${String(inspection.allocatedBytes)}`)
  }
  for (const key of [
    'leaseInvariantViolationCount',
    'publicationBlockedCount',
    'readerLeaseCount',
  ]) {
    if (inspection[key] !== 0) issues.push(`${label}.${key}=${String(inspection[key])}`)
  }
  return issues
}

function connectorWitnessIssues(
  witness,
  direction,
  connectorTickCap,
  expectedStartLayerIndex,
  expectedEndLayerIndex,
  expectedSourceNode,
  label,
) {
  if (!witness || typeof witness !== 'object') return [`${label} is missing`]
  const issues = []
  if (witness.direction !== direction) {
    issues.push(`${label}.direction=${String(witness.direction)}`)
  }
  if (witness.completed !== true) issues.push(`${label} did not complete`)
  if (witness.enteredConnector !== true) issues.push(`${label} did not enter connector`)
  if (witness.sourceRadialReady !== true) issues.push(`${label} source was not radially ready`)
  if (witness.waypointAdvanced !== true) issues.push(`${label} did not advance its anchor`)
  if (witness.finalConnectorIndex !== -1) {
    issues.push(`${label}.finalConnectorIndex=${String(witness.finalConnectorIndex)}`)
  }
  if (!isPositiveInteger(witness.tickCount) || witness.tickCount > connectorTickCap) {
    issues.push(`${label}.tickCount=${String(witness.tickCount)} (cap ${String(connectorTickCap)})`)
  }
  if (witness.startLayerIndex === witness.endLayerIndex) {
    issues.push(`${label} did not change layers`)
  }
  if (!isFiniteNumber(witness.startY) || !isFiniteNumber(witness.endY)) {
    issues.push(`${label} has invalid vertical endpoints`)
  }
  if (!isNonNegativeInteger(witness.sourceNode) || witness.sourceNode !== expectedSourceNode) {
    issues.push(`${label}.sourceNode=${String(witness.sourceNode)}`)
  }
  if (
    isNonNegativeInteger(expectedStartLayerIndex) &&
    witness.startLayerIndex !== expectedStartLayerIndex
  ) {
    issues.push(`${label}.startLayerIndex=${String(witness.startLayerIndex)}`)
  }
  if (
    isNonNegativeInteger(expectedEndLayerIndex) &&
    witness.endLayerIndex !== expectedEndLayerIndex
  ) {
    issues.push(`${label}.endLayerIndex=${String(witness.endLayerIndex)}`)
  }
  return issues
}

function frozenTransitionIssues(
  frozen,
  expectedPopulation,
  generationAfter,
  navigationGraphNodeCount,
  repairTickCap,
  label,
) {
  if (!frozen || typeof frozen !== 'object') return [`${label} is missing`]
  const issues = []
  for (const key of [
    'adoptedAgentCount',
    'publicationAdoptedAgentCount',
    'publicationRepairAgentCount',
    'repairFirstServiceObservedCount',
    'repairHoldObservedCount',
    'repairInlineRecoveryWithoutFirstServiceCount',
  ]) {
    if (!isNonNegativeInteger(frozen[key])) issues.push(`${label}.${key}=${String(frozen[key])}`)
  }
  if (frozen.publicationRepairAgentCount > expectedPopulation) {
    issues.push(
      `${label}.publicationRepairAgentCount=${String(frozen.publicationRepairAgentCount)}`,
    )
  }
  if (frozen.adoptedAgentCount !== expectedPopulation) {
    issues.push(`${label}.adoptedAgentCount=${String(frozen.adoptedAgentCount)}`)
  }
  if (frozen.reacquiringAgentCount !== 0) {
    issues.push(`${label}.reacquiringAgentCount=${String(frozen.reacquiringAgentCount)}`)
  }
  if (frozen.invalidAgentCount !== 0) {
    issues.push(`${label}.invalidAgentCount=${String(frozen.invalidAgentCount)}`)
  }
  if (frozen.committedGeneration !== generationAfter) {
    issues.push(`${label}.committedGeneration=${String(frozen.committedGeneration)}`)
  }
  if (
    frozen.publicationAdoptedAgentCount + frozen.publicationRepairAgentCount !==
    expectedPopulation
  ) {
    issues.push(
      `${label} publication classification total=${String(
        frozen.publicationAdoptedAgentCount + frozen.publicationRepairAgentCount,
      )}`,
    )
  }
  if (
    frozen.repairFirstServiceObservedCount +
      frozen.repairInlineRecoveryWithoutFirstServiceCount !==
    frozen.publicationRepairAgentCount
  ) {
    issues.push(
      `${label} repair completion classification total=${String(
        frozen.repairFirstServiceObservedCount +
          frozen.repairInlineRecoveryWithoutFirstServiceCount,
      )}`,
    )
  }
  if (frozen.repairHoldObservedCount !== frozen.publicationRepairAgentCount) {
    issues.push(`${label}.repairHoldObservedCount=${String(frozen.repairHoldObservedCount)}`)
  }
  issues.push(...nonNegativeCounterDeltaIssues(frozen.counterDelta, `${label}.counterDelta`))
  issues.push(
    ...zombieNavigationScaleProofTransitionDemandAccountingIssues(
      frozen.counterDelta,
      `${label}.counterDelta`,
    ),
  )
  if (frozen.counterDelta?.cachedAnchorLost !== 0) {
    issues.push(`${label}.counterDelta.cachedAnchorLost=${String(frozen.counterDelta?.cachedAnchorLost)}`)
  }
  if (
    !isNonNegativeInteger(frozen.maximumAgentServiceSlicesPerTick) ||
    frozen.maximumAgentServiceSlicesPerTick > PRODUCTION_AGENT_SERVICE_SLICES_PER_TICK
  ) {
    issues.push(
      `${label}.maximumAgentServiceSlicesPerTick=${String(
        frozen.maximumAgentServiceSlicesPerTick,
      )} (cap ${String(PRODUCTION_AGENT_SERVICE_SLICES_PER_TICK)})`,
    )
  }
  const firstServiceAgeTickCap = Math.ceil(
    expectedPopulation / PRODUCTION_AGENT_SERVICE_SLICES_PER_TICK,
  )
  if (
    !isNonNegativeInteger(frozen.maximumFirstServiceAgeTicks) ||
    frozen.maximumFirstServiceAgeTicks > firstServiceAgeTickCap
  ) {
    issues.push(
      `${label}.maximumFirstServiceAgeTicks=${String(
        frozen.maximumFirstServiceAgeTicks,
      )} (cap ${String(firstServiceAgeTickCap)})`,
    )
  }
  const hasFirstServiceRepairs = frozen.repairFirstServiceObservedCount > 0
  if (
    (hasFirstServiceRepairs
      ? !isPositiveInteger(frozen.maximumRepairFirstServiceTicks)
      : frozen.maximumRepairFirstServiceTicks !== 0) ||
    !isPositiveInteger(repairTickCap) ||
    frozen.maximumRepairFirstServiceTicks > repairTickCap
  ) {
    issues.push(
      `${label}.maximumRepairFirstServiceTicks=${String(
        frozen.maximumRepairFirstServiceTicks,
      )} (cap ${String(repairTickCap)})`,
    )
  }
  const hasRepairs = frozen.publicationRepairAgentCount > 0
  if (
    (hasRepairs
      ? !isPositiveInteger(frozen.maximumRepairHoldTicks)
      : frozen.maximumRepairHoldTicks !== 0) ||
    !isPositiveInteger(repairTickCap) ||
    frozen.maximumRepairHoldTicks > repairTickCap
  ) {
    issues.push(
      `${label}.maximumRepairHoldTicks=${String(
        frozen.maximumRepairHoldTicks,
      )} (cap ${String(repairTickCap)})`,
    )
  }
  if (
    frozen.maximumRepairFirstServiceTicks > frozen.maximumRepairHoldTicks ||
    frozen.maximumRepairHoldTicks > frozen.settleTickCount
  ) {
    issues.push(
      `${label} repair latency order=${String(frozen.maximumRepairFirstServiceTicks)}/` +
        `${String(frozen.maximumRepairHoldTicks)}/${String(frozen.settleTickCount)}`,
    )
  }
  if (
    !isNonNegativeInteger(frozen.maximumSuccessorVisits) ||
    frozen.maximumSuccessorVisits > navigationGraphNodeCount
  ) {
    issues.push(
      `${label}.maximumSuccessorVisits=${String(frozen.maximumSuccessorVisits)} ` +
        `(cap ${String(navigationGraphNodeCount)})`,
    )
  }
  if (
    !isPositiveInteger(frozen.settleTickCount) ||
    frozen.settleTickCount > repairTickCap
  ) {
    issues.push(
      `${label}.settleTickCount=${String(frozen.settleTickCount)} ` +
        `(cap ${String(repairTickCap)})`,
    )
  }
  return issues
}

function topologyTransitionIssues(
  transition,
  expectedPopulation,
  navigationGraphNodeCount,
  repairTickCap,
  label,
  requireRepair = true,
) {
  if (!transition || typeof transition !== 'object') return [`${label} is missing`]
  const issues = []
  if (!isPositiveInteger(transition.generationBefore)) {
    issues.push(`${label}.generationBefore=${String(transition.generationBefore)}`)
  }
  if (
    !isPositiveInteger(transition.generationAfter) ||
    transition.generationAfter <= transition.generationBefore
  ) {
    issues.push(`${label}.generationAfter=${String(transition.generationAfter)}`)
  }
  issues.push(
    ...frozenTransitionIssues(
      transition.frozen,
      expectedPopulation,
      transition.generationAfter,
      navigationGraphNodeCount,
      repairTickCap,
      `${label}.frozen`,
    ),
  )
  if (requireRepair && (transition.frozen?.publicationRepairAgentCount ?? 0) <= 0) {
    issues.push(
      `${label}.frozen.publicationRepairAgentCount=${String(
        transition.frozen?.publicationRepairAgentCount,
      )}`,
    )
  }
  return issues
}

function publicationTransitionIssues(
  transition,
  expectedPopulation,
  navigationGraphNodeCount,
  bounds,
  label,
) {
  const issues = topologyTransitionIssues(
    transition,
    expectedPopulation,
    navigationGraphNodeCount,
    bounds?.maximumRepairHoldTicks,
    label,
    false,
  )
  if (!transition || typeof transition !== 'object') return issues
  const movement = transition.movement
  if (!movement || typeof movement !== 'object') {
    issues.push(`${label}.movement is missing`)
    return issues
  }
  for (const key of [
    'enabledAgentCount',
    'finalAdoptedAgentCount',
    'fixtureParkingAgentCount',
    'lockstepAnchorOccupancy',
    'movementStartCoincidentAgentCount',
    'setupValidationUnchangedAgentCount',
  ]) {
    if (movement[key] !== expectedPopulation) {
      issues.push(`${label}.movement.${key}=${String(movement[key])}`)
    }
  }
  if (movement.fixtureParkingSetupOnly !== true) {
    issues.push(`${label}.movement.fixtureParkingSetupOnly is not true`)
  }
  if (movement.currentGenerationMovementOnly !== true) {
    issues.push(`${label}.movement.currentGenerationMovementOnly is not true`)
  }
  if (movement.lockstepSeparationNeighborDelta !== 0) {
    issues.push(
      `${label}.movement.lockstepSeparationNeighborDelta=${String(
        movement.lockstepSeparationNeighborDelta,
      )}`,
    )
  }
  if (movement.lockstepSpeedScale !== 0.25) {
    issues.push(`${label}.movement.lockstepSpeedScale=${String(movement.lockstepSpeedScale)}`)
  }
  if (
    !isFiniteNumber(movement.fixtureParkingDistanceMinimum) ||
    !isFiniteNumber(movement.fixtureParkingDistanceMaximum) ||
    movement.fixtureParkingDistanceMinimum <= 0 ||
    movement.fixtureParkingDistanceMaximum < movement.fixtureParkingDistanceMinimum
  ) {
    issues.push(`${label}.movement fixture parking distance is invalid`)
  }
  if (
    !isFiniteNumber(movement.lockstepAnalyticFirstTickDisplacement) ||
    movement.lockstepAnalyticFirstTickDisplacement <= 0 ||
    movement.lockstepAnalyticFirstTickDisplacement >= 0.01
  ) {
    issues.push(
      `${label}.movement.lockstepAnalyticFirstTickDisplacement=${String(
        movement.lockstepAnalyticFirstTickDisplacement,
      )}`,
    )
  }
  if (!isFiniteNumber(movement.lockstepRadialGap) || movement.lockstepRadialGap <= 0) {
    issues.push(`${label}.movement.lockstepRadialGap=${String(movement.lockstepRadialGap)}`)
  }
  if (
    !isFiniteNumber(movement.lockstepFirstTickDisplacement) ||
    movement.lockstepFirstTickDisplacement <= 0
  ) {
    issues.push(
      `${label}.movement.lockstepFirstTickDisplacement=${String(
        movement.lockstepFirstTickDisplacement,
      )}`,
    )
  }
  if (
    !isFiniteNumber(movement.lockstepFirstTickRadialProgress) ||
    movement.lockstepFirstTickRadialProgress <= 0
  ) {
    issues.push(
      `${label}.movement.lockstepFirstTickRadialProgress=${String(
        movement.lockstepFirstTickRadialProgress,
      )}`,
    )
  }
  if (
    !isFiniteNumber(movement.maximumInitialWaypointDistance) ||
    movement.maximumInitialWaypointDistance <= 0
  ) {
    issues.push(
      `${label}.movement.maximumInitialWaypointDistance=${String(
        movement.maximumInitialWaypointDistance,
      )}`,
    )
  }
  if (
    !isPositiveInteger(movement.maximumAdoptionTick) ||
    movement.maximumAdoptionTick !== transition.frozen?.settleTickCount ||
    movement.maximumAdoptionTick > bounds?.maximumRepairHoldTicks
  ) {
    issues.push(`${label}.movement.maximumAdoptionTick=${String(movement.maximumAdoptionTick)}`)
  }
  if (movement.tickCount !== 1) {
    issues.push(`${label}.movement.tickCount=${String(movement.tickCount)}`)
  }
  for (const key of ['fixtureParkingPoseHash', 'lockstepPoseHash']) {
    if (typeof movement[key] !== 'string' || !HASH_PATTERN.test(movement[key])) {
      issues.push(`${label}.movement.${key}=${String(movement[key])}`)
    }
  }
  issues.push(...zeroCounterDeltaIssues(movement.counterDelta, `${label}.movement.counterDelta`))
  issues.push(
    ...zeroCounterDeltaIssues(
      movement.setupValidationCounterDelta,
      `${label}.movement.setupValidationCounterDelta`,
    ),
  )
  return issues
}

function populationIssues(population, expectedPopulation, traceRequestCount, worldNodeCount) {
  const label = `population ${expectedPopulation}`
  if (!population || typeof population !== 'object') return [`${label} is missing`]
  const issues = []
  for (const [key, expected] of [
    ['population', expectedPopulation],
    ['activeAgentCount', expectedPopulation],
    ['anchorNodeCount', expectedPopulation],
    ['coldReadyAgentCount', expectedPopulation],
  ]) {
    if (population[key] !== expected) issues.push(`${label}.${key}=${String(population[key])}`)
  }
  if (population.navigationOnly !== true) issues.push(`${label}.navigationOnly is not true`)
  if (population.noAudioEventDelta !== 0) {
    issues.push(`${label}.noAudioEventDelta=${String(population.noAudioEventDelta)}`)
  }
  if (typeof population.anchorDigest !== 'string' || !HASH_PATTERN.test(population.anchorDigest)) {
    issues.push(`${label}.anchorDigest=${String(population.anchorDigest)}`)
  }
  if (
    typeof population.sharedFourteenAnchorPrefixHash !== 'string' ||
    !HASH_PATTERN.test(population.sharedFourteenAnchorPrefixHash)
  ) {
    issues.push(
      `${label}.sharedFourteenAnchorPrefixHash=${String(population.sharedFourteenAnchorPrefixHash)}`,
    )
  }
  const bounds = population.bounds
  if (!bounds || typeof bounds !== 'object') {
    issues.push(`${label}.bounds is missing`)
  } else {
    for (const key of [
      'coldDrainTickCap',
      'connectorTickCap',
      'maximumRepairFirstServiceTicks',
      'maximumRepairHoldTicks',
      'productionTopologyRepairTickCap',
      'topologyTransitionTickCap',
      'targetDrainTickCap',
    ]) {
      if (!isPositiveInteger(bounds[key])) issues.push(`${label}.bounds.${key}=${String(bounds[key])}`)
    }
    if (!isPositiveInteger(population.coldDrainTicks) || population.coldDrainTicks > bounds.coldDrainTickCap) {
      issues.push(
        `${label}.coldDrainTicks=${String(population.coldDrainTicks)} ` +
          `(cap ${String(bounds.coldDrainTickCap)})`,
      )
    }
    if (bounds.maximumRepairFirstServiceTicks !== MAXIMUM_REPAIR_FIRST_SERVICE_TICKS) {
      issues.push(
        `${label}.bounds.maximumRepairFirstServiceTicks=${String(
          bounds.maximumRepairFirstServiceTicks,
        )}`,
      )
    }
    if (bounds.maximumRepairHoldTicks !== MAXIMUM_REPAIR_HOLD_TICKS) {
      issues.push(
        `${label}.bounds.maximumRepairHoldTicks=${String(bounds.maximumRepairHoldTicks)}`,
      )
    }
    if (bounds.productionTopologyRepairTickCap !== PRODUCTION_TOPOLOGY_REPAIR_TICK_CAP) {
      issues.push(
        `${label}.bounds.productionTopologyRepairTickCap=${String(
          bounds.productionTopologyRepairTickCap,
        )}`,
      )
    }
    if (bounds.topologyTransitionTickCap !== MAXIMUM_REPAIR_HOLD_TICKS) {
      issues.push(
        `${label}.bounds.topologyTransitionTickCap=${String(bounds.topologyTransitionTickCap)}`,
      )
    }
  }
  if (
    !isPositiveInteger(population.uniqueAnchorNodeCount) ||
    population.uniqueAnchorNodeCount > expectedPopulation
  ) {
    issues.push(`${label}.uniqueAnchorNodeCount=${String(population.uniqueAnchorNodeCount)}`)
  }
  if (
    !isPositiveInteger(population.maximumAnchorNodeOccupancy) ||
    population.maximumAnchorNodeOccupancy > expectedPopulation
  ) {
    issues.push(
      `${label}.maximumAnchorNodeOccupancy=${String(population.maximumAnchorNodeOccupancy)}`,
    )
  }
  if (population.navigationGraphNodeCount !== worldNodeCount) {
    issues.push(
      `${label}.navigationGraphNodeCount=${String(population.navigationGraphNodeCount)} ` +
        `(expected ${String(worldNodeCount)})`,
    )
  }
  if (!population.publicationTransitions || typeof population.publicationTransitions !== 'object') {
    issues.push(`${label}.publicationTransitions is missing`)
  } else {
    for (const direction of ['upper', 'lower']) {
      issues.push(
        ...publicationTransitionIssues(
          population.publicationTransitions[direction],
          expectedPopulation,
          population.navigationGraphNodeCount,
          bounds,
          `${label}.publicationTransitions.${direction}`,
        ),
      )
    }
    if ((population.publicationTransitions.upper?.frozen?.publicationRepairAgentCount ?? 0) <= 0) {
      issues.push(
        `${label}.publicationTransitions.upper.frozen.publicationRepairAgentCount=${String(
          population.publicationTransitions.upper?.frozen?.publicationRepairAgentCount,
        )}`,
      )
    }
  }
  if (!population.topologyTransitions || typeof population.topologyTransitions !== 'object') {
    issues.push(`${label}.topologyTransitions is missing`)
  } else {
    for (const direction of ['upper', 'lower']) {
      issues.push(
        ...topologyTransitionIssues(
          population.topologyTransitions[direction],
          expectedPopulation,
          population.navigationGraphNodeCount,
          bounds?.productionTopologyRepairTickCap,
          `${label}.topologyTransitions.${direction}`,
        ),
      )
    }
  }
  issues.push(...reverseFieldIssues(population.reverseFieldBefore, `${label}.reverseFieldBefore`))
  issues.push(...reverseFieldIssues(population.reverseFieldAfter, `${label}.reverseFieldAfter`))
  if (
    population.reverseFieldBefore?.allocatedBytes !== population.reverseFieldAfter?.allocatedBytes
  ) {
    issues.push(`${label} persistent reverse-field storage changed`)
  }
  const target = population.target
  if (!target || typeof target !== 'object') {
    issues.push(`${label}.target is missing`)
  } else {
    if (target.explicitRequestCount !== traceRequestCount + 2) {
      issues.push(
        `${label}.target.explicitRequestCount=${String(target.explicitRequestCount)} ` +
          `(expected ${String(traceRequestCount + 2)})`,
      )
    }
    if (!isPositiveInteger(target.physicsTickCount) || target.physicsTickCount < traceRequestCount) {
      issues.push(`${label}.target.physicsTickCount=${String(target.physicsTickCount)}`)
    } else if (bounds) {
      const physicsTickCap =
        traceRequestCount + 5 * bounds.targetDrainTickCap + 2 * bounds.connectorTickCap
      if (target.physicsTickCount > physicsTickCap) {
        issues.push(
          `${label}.target.physicsTickCount=${String(target.physicsTickCount)} ` +
            `(cap ${String(physicsTickCap)})`,
        )
      }
    }
    if (!isPositiveInteger(target.eventCount) || target.eventCount > target.physicsTickCount) {
      issues.push(`${label}.target.eventCount=${String(target.eventCount)}`)
    }
    if (!isPositiveInteger(target.committedGeneration)) {
      issues.push(`${label}.target.committedGeneration=${String(target.committedGeneration)}`)
    }
    if (!isNonNegativeInteger(target.committedContentHash)) {
      issues.push(`${label}.target.committedContentHash=${String(target.committedContentHash)}`)
    }
    for (const key of ['publicationHash', 'tickWorkHash']) {
      if (typeof target[key] !== 'string' || !HASH_PATTERN.test(target[key])) {
        issues.push(`${label}.target.${key}=${String(target[key])}`)
      }
    }
    issues.push(...workIssues(target.work, `${label}.target.work`))
    issues.push(
      ...workIssues(
        target.maximumStepWork,
        `${label}.target.maximumStepWork`,
        true,
        population.navigationGraphNodeCount,
      ),
    )
    if ((target.work?.publications ?? 0) < 2) {
      issues.push(`${label}.target.work.publications=${String(target.work?.publications)}`)
    }
  }
  return issues
}

export function summarizeZombieNavigationScaleProof(result) {
  if (!result || !Array.isArray(result.populations)) return null
  return {
    fixedDeltaSeconds: result.fixedDeltaSeconds,
    navigationOnly: result.populations.every((population) => population?.navigationOnly === true),
    populations: result.populations.map((population) => ({
      coldDrainTicks: population.coldDrainTicks,
      eventCount: population.target?.eventCount ?? null,
      maximumAnchorNodeOccupancy: population.maximumAnchorNodeOccupancy,
      population: population.population,
      publicationCount: population.target?.work?.publications ?? null,
      publicationSettleTicks: {
        lower: population.publicationTransitions?.lower?.frozen?.settleTickCount ?? null,
        upper: population.publicationTransitions?.upper?.frozen?.settleTickCount ?? null,
      },
      publicationRepairLatencyTicks: {
        lower: {
          firstServiceAgentCount:
            population.publicationTransitions?.lower?.frozen?.repairFirstServiceObservedCount ??
            null,
          firstService:
            population.publicationTransitions?.lower?.frozen?.maximumRepairFirstServiceTicks ??
            null,
          hold:
            population.publicationTransitions?.lower?.frozen?.maximumRepairHoldTicks ?? null,
          holdAgentCount:
            population.publicationTransitions?.lower?.frozen?.repairHoldObservedCount ?? null,
          inlineRecoveryWithoutFirstServiceAgentCount:
            population.publicationTransitions?.lower?.frozen
              ?.repairInlineRecoveryWithoutFirstServiceCount ?? null,
        },
        upper: {
          firstServiceAgentCount:
            population.publicationTransitions?.upper?.frozen?.repairFirstServiceObservedCount ??
            null,
          firstService:
            population.publicationTransitions?.upper?.frozen?.maximumRepairFirstServiceTicks ??
            null,
          hold:
            population.publicationTransitions?.upper?.frozen?.maximumRepairHoldTicks ?? null,
          holdAgentCount:
            population.publicationTransitions?.upper?.frozen?.repairHoldObservedCount ?? null,
          inlineRecoveryWithoutFirstServiceAgentCount:
            population.publicationTransitions?.upper?.frozen
              ?.repairInlineRecoveryWithoutFirstServiceCount ?? null,
        },
      },
      targetWork: population.target?.work ?? null,
      topologyTransitionSettleTicks: {
        lower: population.topologyTransitions?.lower?.frozen?.settleTickCount ?? null,
        upper: population.topologyTransitions?.upper?.frozen?.settleTickCount ?? null,
      },
      topologyRepairLatencyTicks: {
        lower: {
          firstServiceAgentCount:
            population.topologyTransitions?.lower?.frozen?.repairFirstServiceObservedCount ?? null,
          firstService:
            population.topologyTransitions?.lower?.frozen?.maximumRepairFirstServiceTicks ?? null,
          hold: population.topologyTransitions?.lower?.frozen?.maximumRepairHoldTicks ?? null,
          holdAgentCount:
            population.topologyTransitions?.lower?.frozen?.repairHoldObservedCount ?? null,
          inlineRecoveryWithoutFirstServiceAgentCount:
            population.topologyTransitions?.lower?.frozen
              ?.repairInlineRecoveryWithoutFirstServiceCount ?? null,
        },
        upper: {
          firstServiceAgentCount:
            population.topologyTransitions?.upper?.frozen?.repairFirstServiceObservedCount ?? null,
          firstService:
            population.topologyTransitions?.upper?.frozen?.maximumRepairFirstServiceTicks ?? null,
          hold: population.topologyTransitions?.upper?.frozen?.maximumRepairHoldTicks ?? null,
          holdAgentCount:
            population.topologyTransitions?.upper?.frozen?.repairHoldObservedCount ?? null,
          inlineRecoveryWithoutFirstServiceAgentCount:
            population.topologyTransitions?.upper?.frozen
              ?.repairInlineRecoveryWithoutFirstServiceCount ?? null,
        },
      },
      uniqueAnchorNodeCount: population.uniqueAnchorNodeCount,
    })),
    topologyHash: result.world?.fingerprintBefore?.topologyHash ?? null,
    traceBreachBlockerIds: result.trace?.recordedBreachBlockerIds ?? null,
    traceHash: result.trace?.hash ?? null,
    traceRequestCount: result.trace?.requestCount ?? null,
  }
}

export function zombieNavigationScaleProofIssues(result) {
  if (!result || typeof result !== 'object') return ['navigation scale proof result is missing']
  const issues = []
  if (result.schemaVersion !== 7) issues.push(`schemaVersion=${String(result.schemaVersion)}`)
  if (result.fixedDeltaSeconds !== 1 / 60) {
    issues.push(`fixedDeltaSeconds=${String(result.fixedDeltaSeconds)}`)
  }
  if (
    typeof result.navigationOnlyLimitation !== 'string' ||
    !result.navigationOnlyLimitation.includes('bounded topology-change repair') ||
    !result.navigationOnlyLimitation.includes('stable publication adoption') ||
    !result.navigationOnlyLimitation.includes('current-generation route movement') ||
    !result.navigationOnlyLimitation.includes('does not claim crowd collision latency') ||
    !result.navigationOnlyLimitation.includes('rendering')
  ) {
    issues.push('navigation-only limitation is missing')
  }
  const world = result.world
  if (!world || typeof world !== 'object') {
    issues.push('world summary is missing')
  } else {
    if (world.navigationMode !== 'sparse') {
      issues.push(`world.navigationMode=${String(world.navigationMode)}`)
    }
    for (const key of ['nodeCount', 'layerCount', 'connectorCount', 'collisionWorldGeneration']) {
      if (!isPositiveInteger(world[key])) issues.push(`world.${key}=${String(world[key])}`)
    }
    if (!isNonNegativeInteger(world.activationRevision)) {
      issues.push(`world.activationRevision=${String(world.activationRevision)}`)
    }
    if (typeof world.revision !== 'string' || world.revision.length === 0) {
      issues.push('world.revision is missing')
    }
    issues.push(...fingerprintIssues(world.fingerprintBefore, 'world.fingerprintBefore'))
    issues.push(...fingerprintIssues(world.fingerprintAfter, 'world.fingerprintAfter'))
    if (JSON.stringify(world.fingerprintBefore) !== JSON.stringify(world.fingerprintAfter)) {
      issues.push('world topology, active mask, signature, or semantics changed during proof')
    }
  }
  const trace = result.trace
  if (!trace || typeof trace !== 'object') {
    issues.push('trace is missing')
  } else {
    if (!Array.isArray(trace.samples) || trace.samples.length !== 53 || trace.requestCount !== 53) {
      issues.push('trace must contain exactly 53 one-per-tick room requests')
    }
    if (trace.recordedDoorFixedStepCount !== 52) {
      issues.push(`trace.recordedDoorFixedStepCount=${String(trace.recordedDoorFixedStepCount)}`)
    }
    if (trace.recordedBuildingScopeId !== 'parcel:parcel-02') {
      issues.push(`trace.recordedBuildingScopeId=${String(trace.recordedBuildingScopeId)}`)
    }
    if (trace.recordedDoorId !== 'door_house_kitchen_back') {
      issues.push(`trace.recordedDoorId=${String(trace.recordedDoorId)}`)
    }
    if (
      !Array.isArray(trace.recordedBreachBlockerIds) ||
      trace.recordedBreachBlockerIds.length !==
        ZOMBIE_NAVIGATION_SCALE_PROOF_RECORDED_BREACH_BLOCKER_IDS.length ||
      ZOMBIE_NAVIGATION_SCALE_PROOF_RECORDED_BREACH_BLOCKER_IDS.some(
        (blockerId, index) => trace.recordedBreachBlockerIds[index] !== blockerId,
      )
    ) {
      issues.push(
        `trace.recordedBreachBlockerIds=${JSON.stringify(trace.recordedBreachBlockerIds)}`,
      )
    }
    if (trace.recordedLevelId !== 'level_landrush-parcel-1msovbflbvkdc-0') {
      issues.push(`trace.recordedLevelId=${String(trace.recordedLevelId)}`)
    }
    if (
      trace.recordedOutsideWorld?.x !== -27 ||
      trace.recordedOutsideWorld?.z !== -17.5 ||
      trace.recordedInsideWorld?.x !== -27 ||
      trace.recordedInsideWorld?.z !== -14.5
    ) {
      issues.push('trace recorded room endpoints changed')
    }
    if (typeof trace.hash !== 'string' || !HASH_PATTERN.test(trace.hash)) {
      issues.push(`trace.hash=${String(trace.hash)}`)
    }
    if (Array.isArray(trace.samples)) {
      const firstSample = trace.samples[0]
      const hasRecordedContinuity =
        isFiniteNumber(trace.recordedOutsideWorld?.x) &&
        isFiniteNumber(trace.recordedOutsideWorld?.z) &&
        isFiniteNumber(trace.recordedInsideWorld?.x) &&
        isFiniteNumber(trace.recordedInsideWorld?.z)
      for (const [index, sample] of trace.samples.entries()) {
        if (
          sample?.index !== index ||
          !isFiniteNumber(sample?.x) ||
          !isFiniteNumber(sample?.y) ||
          !isFiniteNumber(sample?.z)
        ) {
          issues.push(`trace.samples[${String(index)}] is malformed`)
          break
        }
        if (!hasRecordedContinuity) continue
        const amount = index / 52
        const expectedX =
          firstSample.x + (trace.recordedInsideWorld.x - trace.recordedOutsideWorld.x) * amount
        const expectedZ =
          firstSample.z + (trace.recordedInsideWorld.z - trace.recordedOutsideWorld.z) * amount
        if (
          sample.y !== firstSample.y ||
          Math.abs(sample.x - expectedX) > 1e-9 ||
          Math.abs(sample.z - expectedZ) > 1e-9
        ) {
          issues.push(`trace.samples[${String(index)}] breaks recorded 60 Hz continuity`)
          break
        }
      }
    }
  }
  const connector = result.connector
  if (!connector || typeof connector !== 'object') {
    issues.push('connector plan is missing')
  } else {
    for (const key of [
      'connectorIndex',
      'lowerLayerIndex',
      'lowerSourceNode',
      'lowerTargetNode',
      'upperLayerIndex',
      'upperSourceNode',
      'upperTargetNode',
    ]) {
      if (!isNonNegativeInteger(connector[key])) {
        issues.push(`connector.${key}=${String(connector[key])}`)
      }
    }
    if (connector.lowerLayerIndex === connector.upperLayerIndex) {
      issues.push('connector plan does not bridge layers')
    }
    if (typeof connector.chainId !== 'string' || connector.chainId.length === 0) {
      issues.push('connector.chainId is missing')
    }
    if (typeof connector.connectorId !== 'string' || connector.connectorId.length === 0) {
      issues.push('connector.connectorId is missing')
    }
    if (connector.functionalCorrectnessOnly !== true) {
      issues.push('connector.functionalCorrectnessOnly is not true')
    }
    for (const key of ['planHash', 'witnessHash', 'workHash']) {
      if (typeof connector[key] !== 'string' || !HASH_PATTERN.test(connector[key])) {
        issues.push(`connector.${key}=${String(connector[key])}`)
      }
    }
    issues.push(...nonNegativeCounterDeltaIssues(connector.refreshDelta, 'connector.refreshDelta'))
    if (world && typeof world === 'object') {
      if (connector.connectorIndex >= world.connectorCount) {
        issues.push(`connector.connectorIndex=${String(connector.connectorIndex)} is out of range`)
      }
      for (const key of ['lowerLayerIndex', 'upperLayerIndex']) {
        if (connector[key] >= world.layerCount) {
          issues.push(`connector.${key}=${String(connector[key])} is out of range`)
        }
      }
      for (const key of [
        'lowerSourceNode',
        'lowerTargetNode',
        'upperSourceNode',
        'upperTargetNode',
      ]) {
        if (connector[key] >= world.nodeCount) {
          issues.push(`connector.${key}=${String(connector[key])} is out of range`)
        }
      }
    }
    const connectorTickCap = result.populations?.[0]?.bounds?.connectorTickCap
    if (!isPositiveInteger(connectorTickCap)) {
      issues.push(`connector tick cap=${String(connectorTickCap)}`)
    }
    if (!Array.isArray(connector.witnesses) || connector.witnesses.length !== 2) {
      issues.push('connector.witnesses must contain two directions')
    } else {
      issues.push(
        ...connectorWitnessIssues(
          connector.witnesses[0],
          'lower-to-upper',
          connectorTickCap,
          connector.lowerLayerIndex,
          connector.upperLayerIndex,
          connector.lowerSourceNode,
          'connector.witnesses[0]',
        ),
        ...connectorWitnessIssues(
          connector.witnesses[1],
          'upper-to-lower',
          connectorTickCap,
          connector.upperLayerIndex,
          connector.lowerLayerIndex,
          connector.upperSourceNode,
          'connector.witnesses[1]',
        ),
      )
    }
  }
  if (!Array.isArray(result.populations) || result.populations.length !== 2) {
    issues.push(`population result count=${String(result.populations?.length)}`)
    return issues
  }
  const traceRequestCount = Number.isInteger(trace?.requestCount) ? trace.requestCount : 0
  for (let index = 0; index < ZOMBIE_NAVIGATION_SCALE_PROOF_POPULATIONS.length; index += 1) {
    issues.push(
      ...populationIssues(
        result.populations[index],
        ZOMBIE_NAVIGATION_SCALE_PROOF_POPULATIONS[index],
        traceRequestCount,
        world?.nodeCount,
      ),
    )
  }
  const [small, scale] = result.populations
  if (small && scale) {
    if (small.sharedFourteenAnchorPrefixHash !== scale.sharedFourteenAnchorPrefixHash) {
      issues.push('14 agents are not the shared prefix of the 100-agent proof')
    }
    for (const key of [
      'work',
      'maximumStepWork',
      'tickWorkHash',
      'publicationHash',
      'committedContentHash',
      'committedGeneration',
    ]) {
      if (JSON.stringify(small.target?.[key]) !== JSON.stringify(scale.target?.[key])) {
        issues.push(`14/100 target ${key} differs`)
      }
    }
    if (small.reverseFieldAfter?.allocatedBytes !== scale.reverseFieldAfter?.allocatedBytes) {
      issues.push('14/100 reverse-field storage differs')
    }
    for (const key of [
      'maximumRepairFirstServiceTicks',
      'maximumRepairHoldTicks',
      'productionTopologyRepairTickCap',
      'topologyTransitionTickCap',
    ]) {
      if (small.bounds?.[key] !== scale.bounds?.[key]) {
        issues.push(`14/100 ${key} bounds differ`)
      }
    }
  }
  return issues
}
