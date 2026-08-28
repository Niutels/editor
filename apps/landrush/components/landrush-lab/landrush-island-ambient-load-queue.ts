export type LandrushIslandAmbientLoadUnitKind = 'boat' | 'fish' | 'npc' | 'palm'

export type LandrushIslandAmbientLoadUnit = {
  assetId: string
  catalogIndex: number
  id: string
  kind: LandrushIslandAmbientLoadUnitKind
}

export type LandrushIslandAmbientLoadOutcome = 'degraded' | 'failed' | 'loaded'

export type LandrushIslandAmbientLoadQueueState = {
  admittedUnitIds: readonly string[]
  generation: number
  terminalOutcomes: Readonly<Record<string, LandrushIslandAmbientLoadOutcome>>
}

export type LandrushIslandAmbientLoadPolicy = {
  admitted: boolean
  pageVisible: boolean
}

export type LandrushIslandAmbientLoadSettlement = {
  generation: number
  outcome: LandrushIslandAmbientLoadOutcome
  unitId: string
}

export type LandrushIslandAmbientLoadReadiness = {
  completed: number
  generation: number
  ready: boolean
  terminalUnitIds: readonly string[]
  total: number
  totalUnitIds: readonly string[]
}

export type LandrushIslandAmbientLoadYieldHost = {
  cancelAnimationFrame: (handle: number) => void
  requestAnimationFrame: (callback: () => void) => number
}

export type LandrushIslandAmbientLoadWatchdogHost = {
  clearTimeout: (handle: number) => void
  setTimeout: (callback: () => void, timeoutMs: number) => number
}

export type LandrushIslandAmbientLoadUnitWatchdog = {
  dispose: () => void
  settle: (outcome: LandrushIslandAmbientLoadOutcome) => void
}

export type LandrushIslandAmbientLoadGenerationAllocator = (
  minimumExclusiveGeneration?: number,
) => number

export const LANDRUSH_ISLAND_AMBIENT_LOAD_UNIT_TIMEOUT_MS = 15_000

const allocateLandrushIslandAmbientLoadMountGeneration =
  createLandrushIslandAmbientLoadGenerationAllocator()

export function createLandrushIslandAmbientLoadUnits({
  boatIds,
  fishIds,
  npcIds,
  palmIds,
}: {
  boatIds: readonly string[]
  fishIds: readonly string[]
  npcIds: readonly string[]
  palmIds: readonly string[]
}): readonly LandrushIslandAmbientLoadUnit[] {
  return [
    ...createKindUnits('palm', palmIds),
    ...createKindUnits('boat', boatIds),
    ...createKindUnits('npc', npcIds),
    ...createKindUnits('fish', fishIds),
  ]
}

export function createLandrushIslandAmbientLoadQueueState(
  generation = 0,
): LandrushIslandAmbientLoadQueueState {
  return {
    admittedUnitIds: [],
    generation,
    terminalOutcomes: {},
  }
}

export function createLandrushIslandAmbientLoadGenerationAllocator(
  initialGeneration = 0,
): LandrushIslandAmbientLoadGenerationAllocator {
  let nextGeneration = initialGeneration
  return (minimumExclusiveGeneration = Number.NEGATIVE_INFINITY) => {
    nextGeneration = Math.max(nextGeneration, minimumExclusiveGeneration + 1)
    const generation = nextGeneration
    nextGeneration += 1
    return generation
  }
}

export function createLandrushIslandAmbientLoadQueueStateForMount(): LandrushIslandAmbientLoadQueueState {
  return createLandrushIslandAmbientLoadQueueState(
    allocateLandrushIslandAmbientLoadMountGeneration(),
  )
}

export function resetLandrushIslandAmbientLoadQueue(
  state: LandrushIslandAmbientLoadQueueState,
): LandrushIslandAmbientLoadQueueState {
  return createLandrushIslandAmbientLoadQueueState(
    allocateLandrushIslandAmbientLoadMountGeneration(state.generation),
  )
}

export function advanceLandrushIslandAmbientLoadQueueAfterYield(
  state: LandrushIslandAmbientLoadQueueState,
  units: readonly LandrushIslandAmbientLoadUnit[],
  {
    generation,
    policy,
  }: {
    generation: number
    policy: LandrushIslandAmbientLoadPolicy
  },
): LandrushIslandAmbientLoadQueueState {
  if (generation !== state.generation || !(policy.admitted && policy.pageVisible)) {
    return state
  }

  const admittedUnitIdSet = new Set(state.admittedUnitIds)
  const nextUnit = units.find((unit) => !admittedUnitIdSet.has(unit.id))
  return nextUnit
    ? { ...state, admittedUnitIds: [...state.admittedUnitIds, nextUnit.id] }
    : state
}

export function scheduleLandrushIslandAmbientLoadAdmissionYield({
  host = createBrowserLandrushIslandAmbientLoadYieldHost(),
  onYield,
}: {
  host?: LandrushIslandAmbientLoadYieldHost
  onYield: () => void
}): () => void {
  let pending = true
  const complete = () => {
    if (!pending) return
    pending = false
    onYield()
  }
  const handle = host.requestAnimationFrame(complete)

  return () => {
    if (!pending) return
    pending = false
    host.cancelAnimationFrame(handle)
  }
}

export function createLandrushIslandAmbientLoadUnitWatchdog({
  generation,
  host = createBrowserLandrushIslandAmbientLoadWatchdogHost(),
  onSettled,
  timeoutMs = LANDRUSH_ISLAND_AMBIENT_LOAD_UNIT_TIMEOUT_MS,
  unitId,
}: {
  generation: number
  host?: LandrushIslandAmbientLoadWatchdogHost
  onSettled: (settlement: LandrushIslandAmbientLoadSettlement) => void
  timeoutMs?: number
  unitId: string
}): LandrushIslandAmbientLoadUnitWatchdog {
  let pending = true
  const timeoutHandle = host.setTimeout(() => {
    if (!pending) return
    pending = false
    onSettled({ generation, outcome: 'degraded', unitId })
  }, timeoutMs)

  return {
    dispose: () => {
      if (!pending) return
      pending = false
      host.clearTimeout(timeoutHandle)
    },
    settle: (outcome) => {
      if (!pending) return
      pending = false
      host.clearTimeout(timeoutHandle)
      onSettled({ generation, outcome, unitId })
    },
  }
}

export function settleLandrushIslandAmbientLoadQueue(
  state: LandrushIslandAmbientLoadQueueState,
  settlement: LandrushIslandAmbientLoadSettlement,
): LandrushIslandAmbientLoadQueueState {
  if (
    settlement.generation !== state.generation ||
    !state.admittedUnitIds.includes(settlement.unitId) ||
    state.terminalOutcomes[settlement.unitId] !== undefined
  ) {
    return state
  }

  return {
    ...state,
    terminalOutcomes: {
      ...state.terminalOutcomes,
      [settlement.unitId]: settlement.outcome,
    },
  }
}

export function resolveLandrushIslandAmbientLoadReadiness(
  state: LandrushIslandAmbientLoadQueueState,
  units: readonly LandrushIslandAmbientLoadUnit[],
): LandrushIslandAmbientLoadReadiness {
  const totalUnitIds = units.map((unit) => unit.id)
  const terminalUnitIds = totalUnitIds.filter(
    (unitId) => state.terminalOutcomes[unitId] !== undefined,
  )
  const admittedUnitIds = new Set(state.admittedUnitIds)
  return {
    completed: terminalUnitIds.length,
    generation: state.generation,
    ready:
      terminalUnitIds.length === totalUnitIds.length &&
      totalUnitIds.every((unitId) => admittedUnitIds.has(unitId)),
    terminalUnitIds,
    total: totalUnitIds.length,
    totalUnitIds,
  }
}

export function reconcileLandrushIslandAmbientLoadReadiness(
  current: LandrushIslandAmbientLoadReadiness | null,
  reported: LandrushIslandAmbientLoadReadiness,
): LandrushIslandAmbientLoadReadiness {
  if (current === null || reported.generation > current.generation) return reported
  if (reported.generation < current.generation) return current
  if (
    current.total !== reported.total ||
    !haveSameOrderedUnitIds(current.totalUnitIds, reported.totalUnitIds) ||
    reported.completed < current.completed ||
    !isOrderedUnitIdSubset(current.terminalUnitIds, reported.terminalUnitIds) ||
    (current.ready && !reported.ready)
  ) {
    return current
  }
  if (
    reported.completed === current.completed &&
    reported.ready === current.ready &&
    haveSameOrderedUnitIds(current.terminalUnitIds, reported.terminalUnitIds)
  ) {
    return current
  }
  return reported
}

export function resolveMountedLandrushIslandAmbientLoadUnits(
  state: LandrushIslandAmbientLoadQueueState,
  units: readonly LandrushIslandAmbientLoadUnit[],
): readonly LandrushIslandAmbientLoadUnit[] {
  const admittedUnitIds = new Set(state.admittedUnitIds)
  return units.filter(
    (unit) => admittedUnitIds.has(unit.id) && state.terminalOutcomes[unit.id] !== 'failed',
  )
}

function createBrowserLandrushIslandAmbientLoadYieldHost(): LandrushIslandAmbientLoadYieldHost {
  return {
    cancelAnimationFrame: (handle) => window.cancelAnimationFrame(handle),
    requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
  }
}

function createBrowserLandrushIslandAmbientLoadWatchdogHost(): LandrushIslandAmbientLoadWatchdogHost {
  return {
    clearTimeout: (handle) => window.clearTimeout(handle),
    setTimeout: (callback, timeoutMs) => window.setTimeout(callback, timeoutMs),
  }
}

function createKindUnits(
  kind: LandrushIslandAmbientLoadUnitKind,
  assetIds: readonly string[],
): LandrushIslandAmbientLoadUnit[] {
  return assetIds.map((assetId, catalogIndex) => ({
    assetId,
    catalogIndex,
    id: `${kind}:${assetId}`,
    kind,
  }))
}

function haveSameOrderedUnitIds(first: readonly string[], second: readonly string[]) {
  return first.length === second.length && first.every((unitId, index) => unitId === second[index])
}

function isOrderedUnitIdSubset(subset: readonly string[], unitIds: readonly string[]) {
  const unitIdSet = new Set(unitIds)
  return subset.every((unitId) => unitIdSet.has(unitId))
}
