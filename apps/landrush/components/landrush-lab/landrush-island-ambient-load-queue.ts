export type LandrushIslandAmbientLoadUnitKind = 'boat' | 'fish' | 'npc' | 'palm'

export type LandrushIslandAmbientLoadUnit = {
  assetId: string
  catalogIndex: number
  id: string
  kind: LandrushIslandAmbientLoadUnitKind
}

export type LandrushIslandAmbientLoadOutcome = 'degraded' | 'failed' | 'loaded'

export type LandrushIslandAmbientLoadQueueState = {
  generation: number
  inFlightUnitId: string | null
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
  cancelIdleCallback?: (handle: number) => void
  requestAnimationFrame: (callback: () => void) => number
  requestIdleCallback?: (callback: () => void, options: { timeout: number }) => number
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

export const LANDRUSH_ISLAND_AMBIENT_LOAD_IDLE_TIMEOUT_MS = 250
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
    generation,
    inFlightUnitId: null,
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
  if (
    generation !== state.generation ||
    !(policy.admitted && policy.pageVisible && state.inFlightUnitId === null)
  ) {
    return state
  }

  const nextUnit = units.find((unit) => state.terminalOutcomes[unit.id] === undefined)
  return nextUnit ? { ...state, inFlightUnitId: nextUnit.id } : state
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
  const requestIdleCallback = host.requestIdleCallback
  const cancelIdleCallback = host.cancelIdleCallback
  let cancelScheduled: () => void

  if (requestIdleCallback && cancelIdleCallback) {
    const handle = requestIdleCallback(complete, {
      timeout: LANDRUSH_ISLAND_AMBIENT_LOAD_IDLE_TIMEOUT_MS,
    })
    cancelScheduled = () => cancelIdleCallback(handle)
  } else {
    const handle = host.requestAnimationFrame(complete)
    cancelScheduled = () => host.cancelAnimationFrame(handle)
  }

  return () => {
    if (!pending) return
    pending = false
    cancelScheduled()
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
  if (settlement.generation !== state.generation || settlement.unitId !== state.inFlightUnitId) {
    return state
  }

  return {
    ...state,
    inFlightUnitId: null,
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
  return {
    completed: terminalUnitIds.length,
    generation: state.generation,
    ready: state.inFlightUnitId === null && terminalUnitIds.length === totalUnitIds.length,
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
    !isOrderedUnitIdPrefix(current.terminalUnitIds, reported.terminalUnitIds) ||
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
  return units.filter(
    (unit) =>
      unit.id === state.inFlightUnitId ||
      state.terminalOutcomes[unit.id] === 'loaded' ||
      state.terminalOutcomes[unit.id] === 'degraded',
  )
}

function createBrowserLandrushIslandAmbientLoadYieldHost(): LandrushIslandAmbientLoadYieldHost {
  const browserWindow = window as Window & {
    cancelIdleCallback?: (handle: number) => void
    requestIdleCallback?: (callback: () => void, options: { timeout: number }) => number
  }
  const host: LandrushIslandAmbientLoadYieldHost = {
    cancelAnimationFrame: (handle) => browserWindow.cancelAnimationFrame(handle),
    requestAnimationFrame: (callback) => browserWindow.requestAnimationFrame(callback),
  }
  if (browserWindow.requestIdleCallback && browserWindow.cancelIdleCallback) {
    host.requestIdleCallback = (callback, options) =>
      browserWindow.requestIdleCallback!(callback, options)
    host.cancelIdleCallback = (handle) => browserWindow.cancelIdleCallback!(handle)
  }
  return host
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

function isOrderedUnitIdPrefix(prefix: readonly string[], unitIds: readonly string[]) {
  return (
    prefix.length <= unitIds.length && prefix.every((unitId, index) => unitId === unitIds[index])
  )
}
