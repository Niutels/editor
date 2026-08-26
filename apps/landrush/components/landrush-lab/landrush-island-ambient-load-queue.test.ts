import { describe, expect, test } from 'bun:test'
import {
  advanceLandrushIslandAmbientLoadQueueAfterYield,
  createLandrushIslandAmbientLoadGenerationAllocator,
  createLandrushIslandAmbientLoadQueueState,
  createLandrushIslandAmbientLoadQueueStateForMount,
  createLandrushIslandAmbientLoadUnits,
  createLandrushIslandAmbientLoadUnitWatchdog,
  LANDRUSH_ISLAND_AMBIENT_LOAD_IDLE_TIMEOUT_MS,
  LANDRUSH_ISLAND_AMBIENT_LOAD_UNIT_TIMEOUT_MS,
  type LandrushIslandAmbientLoadSettlement,
  type LandrushIslandAmbientLoadWatchdogHost,
  type LandrushIslandAmbientLoadYieldHost,
  reconcileLandrushIslandAmbientLoadReadiness,
  resetLandrushIslandAmbientLoadQueue,
  resolveLandrushIslandAmbientLoadReadiness,
  resolveMountedLandrushIslandAmbientLoadUnits,
  scheduleLandrushIslandAmbientLoadAdmissionYield,
  settleLandrushIslandAmbientLoadQueue,
} from './landrush-island-ambient-load-queue'

const UNITS = createLandrushIslandAmbientLoadUnits({
  boatIds: ['boat-a', 'boat-b'],
  fishIds: ['fish-a', 'fish-b'],
  npcIds: ['npc-a', 'npc-b'],
  palmIds: ['palm-a', 'palm-b'],
})
const ACTIVE_POLICY = { admitted: true, pageVisible: true }

describe('Landrush island ambient load queue', () => {
  test('admits no asset request before core paint readiness or while the page is hidden', () => {
    const initial = createLandrushIslandAmbientLoadQueueState()

    expect(
      advanceLandrushIslandAmbientLoadQueueAfterYield(initial, UNITS, {
        generation: initial.generation,
        policy: { ...ACTIVE_POLICY, admitted: false },
      }),
    ).toBe(initial)
    expect(
      advanceLandrushIslandAmbientLoadQueueAfterYield(initial, UNITS, {
        generation: initial.generation,
        policy: { ...ACTIVE_POLICY, pageVisible: false },
      }),
    ).toBe(initial)
    expect(resolveMountedLandrushIslandAmbientLoadUnits(initial, UNITS)).toEqual([])
  })

  test('settlement terminalizes without synchronously admitting the next unit', () => {
    const initial = createLandrushIslandAmbientLoadQueueState()
    const firstYield = yieldAdmission(initial)
    const settled = settleLandrushIslandAmbientLoadQueue(firstYield, {
      generation: firstYield.generation,
      outcome: 'loaded',
      unitId: 'palm:palm-a',
    })

    expect(firstYield.inFlightUnitId).toBe('palm:palm-a')
    expect(settled.inFlightUnitId).toBeNull()
    expect(settled.terminalOutcomes).toEqual({ 'palm:palm-a': 'loaded' })
    expect(
      resolveMountedLandrushIslandAmbientLoadUnits(settled, UNITS).map((unit) => unit.id),
    ).toEqual(['palm:palm-a'])

    const secondYield = yieldAdmission(settled)
    expect(secondYield.inFlightUnitId).toBe('palm:palm-b')
  })

  test('uses deterministic palm, boat, NPC, then fish priority one yield at a time', () => {
    let state = createLandrushIslandAmbientLoadQueueState()
    const expectedOrder = [
      'palm:palm-a',
      'palm:palm-b',
      'boat:boat-a',
      'boat:boat-b',
      'npc:npc-a',
      'npc:npc-b',
      'fish:fish-a',
      'fish:fish-b',
    ]

    for (const unitId of expectedOrder) {
      const beforeYield = state
      state = yieldAdmission(state)
      expect(beforeYield.inFlightUnitId).toBeNull()
      expect(state.inFlightUnitId).toBe(unitId)
      state = settleLandrushIslandAmbientLoadQueue(state, {
        generation: state.generation,
        outcome: 'loaded',
        unitId,
      })
      expect(state.inFlightUnitId).toBeNull()
    }

    expect(yieldAdmission(state)).toBe(state)
    expect(Object.keys(state.terminalOutcomes)).toHaveLength(expectedOrder.length)
  })

  test('keeps loaded units mounted while failure terminalizes before the next yield', () => {
    let state = yieldAdmission(createLandrushIslandAmbientLoadQueueState())
    state = settleLandrushIslandAmbientLoadQueue(state, {
      generation: state.generation,
      outcome: 'loaded',
      unitId: 'palm:palm-a',
    })
    state = yieldAdmission(state)
    state = settleLandrushIslandAmbientLoadQueue(state, {
      generation: state.generation,
      outcome: 'failed',
      unitId: 'palm:palm-b',
    })

    expect(state.inFlightUnitId).toBeNull()
    expect(
      resolveMountedLandrushIslandAmbientLoadUnits(state, UNITS).map((unit) => unit.id),
    ).toEqual(['palm:palm-a'])
    expect(state.terminalOutcomes['palm:palm-b']).toBe('failed')

    state = yieldAdmission(state)
    expect(state.inFlightUnitId).toBe('boat:boat-a')
  })

  test('keeps NPC load eligibility independent from presentation visibility', () => {
    let state = createLandrushIslandAmbientLoadQueueState()
    for (const unitId of ['palm:palm-a', 'palm:palm-b', 'boat:boat-a', 'boat:boat-b']) {
      state = advanceLandrushIslandAmbientLoadQueueAfterYield(state, UNITS, {
        generation: state.generation,
        policy: ACTIVE_POLICY,
      })
      expect(state.inFlightUnitId).toBe(unitId)
      state = settleLandrushIslandAmbientLoadQueue(state, {
        generation: state.generation,
        outcome: 'loaded',
        unitId,
      })
    }

    state = advanceLandrushIslandAmbientLoadQueueAfterYield(state, UNITS, {
      generation: state.generation,
      policy: ACTIVE_POLICY,
    })
    expect(state.inFlightUnitId).toBe('npc:npc-a')
  })

  test('generation-fences stale settlements and yielded admissions', () => {
    const active = yieldAdmission(createLandrushIslandAmbientLoadQueueState(12))
    const staleSettlement = settleLandrushIslandAmbientLoadQueue(active, {
      generation: 11,
      outcome: 'loaded',
      unitId: 'palm:palm-a',
    })
    expect(staleSettlement).toBe(active)

    const reset = resetLandrushIslandAmbientLoadQueue(active)
    const staleYield = advanceLandrushIslandAmbientLoadQueueAfterYield(reset, UNITS, {
      generation: active.generation,
      policy: ACTIVE_POLICY,
    })
    expect(staleYield).toBe(reset)
    expect(staleYield.inFlightUnitId).toBeNull()
  })

  test('reports readiness only after every load unit terminalizes, including failures', () => {
    let state = createLandrushIslandAmbientLoadQueueState(4)
    const unitIds = UNITS.map((unit) => unit.id)

    for (const [index, unitId] of unitIds.entries()) {
      state = yieldAdmission(state)
      expect(resolveLandrushIslandAmbientLoadReadiness(state, UNITS)).toEqual({
        completed: index,
        generation: 4,
        ready: false,
        terminalUnitIds: unitIds.slice(0, index),
        total: unitIds.length,
        totalUnitIds: unitIds,
      })
      state = settleLandrushIslandAmbientLoadQueue(state, {
        generation: state.generation,
        outcome: index % 2 === 0 ? 'loaded' : 'failed',
        unitId,
      })
    }

    expect(resolveLandrushIslandAmbientLoadReadiness(state, UNITS)).toEqual({
      completed: unitIds.length,
      generation: 4,
      ready: true,
      terminalUnitIds: unitIds,
      total: unitIds.length,
      totalUnitIds: unitIds,
    })
  })

  test('reconciles only monotonic progress against the stable unit order of a generation', () => {
    let completedState = createLandrushIslandAmbientLoadQueueState(8)
    for (const unit of UNITS) {
      completedState = yieldAdmission(completedState)
      completedState = settleLandrushIslandAmbientLoadQueue(completedState, {
        generation: completedState.generation,
        outcome: 'loaded',
        unitId: unit.id,
      })
    }
    const completed = resolveLandrushIslandAmbientLoadReadiness(completedState, UNITS)
    const resetState = resetLandrushIslandAmbientLoadQueue(completedState)
    const reset = resolveLandrushIslandAmbientLoadReadiness(resetState, UNITS)
    let firstTerminalState = resetState
    firstTerminalState = yieldAdmission(firstTerminalState)
    firstTerminalState = settleLandrushIslandAmbientLoadQueue(firstTerminalState, {
      generation: firstTerminalState.generation,
      outcome: 'loaded',
      unitId: UNITS[0]!.id,
    })
    const firstTerminal = resolveLandrushIslandAmbientLoadReadiness(firstTerminalState, UNITS)
    let secondTerminalState = yieldAdmission(firstTerminalState)
    secondTerminalState = settleLandrushIslandAmbientLoadQueue(secondTerminalState, {
      generation: secondTerminalState.generation,
      outcome: 'failed',
      unitId: UNITS[1]!.id,
    })
    const secondTerminal = resolveLandrushIslandAmbientLoadReadiness(secondTerminalState, UNITS)
    const changedUnitSet = resolveLandrushIslandAmbientLoadReadiness(
      secondTerminalState,
      UNITS.slice(0, -1),
    )

    expect(reconcileLandrushIslandAmbientLoadReadiness(completed, reset)).toBe(reset)
    expect(reconcileLandrushIslandAmbientLoadReadiness(reset, completed)).toBe(reset)
    expect(reconcileLandrushIslandAmbientLoadReadiness(reset, firstTerminal)).toBe(firstTerminal)
    expect(reconcileLandrushIslandAmbientLoadReadiness(firstTerminal, secondTerminal)).toBe(
      secondTerminal,
    )
    expect(reconcileLandrushIslandAmbientLoadReadiness(secondTerminal, firstTerminal)).toBe(
      secondTerminal,
    )
    expect(reconcileLandrushIslandAmbientLoadReadiness(secondTerminal, changedUnitSet)).toBe(
      secondTerminal,
    )
    expect(reconcileLandrushIslandAmbientLoadReadiness(secondTerminal, secondTerminal)).toBe(
      secondTerminal,
    )
  })

  test('allocates a monotonically newer queue generation for every component mount', () => {
    const allocate = createLandrushIslandAmbientLoadGenerationAllocator(40)
    expect([allocate(), allocate(50), allocate()]).toEqual([40, 51, 52])

    const firstMount = createLandrushIslandAmbientLoadQueueStateForMount()
    const remount = createLandrushIslandAmbientLoadQueueStateForMount()
    let previousState = firstMount
    for (const unit of UNITS) {
      previousState = yieldAdmission(previousState)
      previousState = settleLandrushIslandAmbientLoadQueue(previousState, {
        generation: previousState.generation,
        outcome: 'loaded',
        unitId: unit.id,
      })
    }
    const previousReady = resolveLandrushIslandAmbientLoadReadiness(previousState, UNITS)
    const remountPending = resolveLandrushIslandAmbientLoadReadiness(remount, UNITS)

    expect(remount.generation).toBeGreaterThan(firstMount.generation)
    expect(reconcileLandrushIslandAmbientLoadReadiness(previousReady, remountPending)).toBe(
      remountPending,
    )
    expect(reconcileLandrushIslandAmbientLoadReadiness(remountPending, previousReady)).toBe(
      remountPending,
    )
  })

  test('prefers a cancellable idle turn and delivers its yield at most once', () => {
    const controlled = createControlledYieldHost(true)
    let yieldCount = 0
    const cancel = scheduleLandrushIslandAmbientLoadAdmissionYield({
      host: controlled.host,
      onYield: () => {
        yieldCount += 1
      },
    })

    expect(yieldCount).toBe(0)
    expect(controlled.idleRequests).toHaveLength(1)
    expect(controlled.frameRequests).toHaveLength(0)
    expect(controlled.idleRequests[0]?.timeout).toBe(LANDRUSH_ISLAND_AMBIENT_LOAD_IDLE_TIMEOUT_MS)
    controlled.idleRequests[0]?.callback()
    controlled.idleRequests[0]?.callback()
    cancel()
    expect(yieldCount).toBe(1)
    expect(controlled.cancelledIdleHandles).toEqual([])

    const cancelBeforeYield = scheduleLandrushIslandAmbientLoadAdmissionYield({
      host: controlled.host,
      onYield: () => {
        yieldCount += 1
      },
    })
    cancelBeforeYield()
    controlled.idleRequests[1]?.callback()
    expect(yieldCount).toBe(1)
    expect(controlled.cancelledIdleHandles).toEqual([2])
  })

  test('falls back to a cancellable animation-frame recovery turn', () => {
    const controlled = createControlledYieldHost(false)
    let yielded = false
    const cancel = scheduleLandrushIslandAmbientLoadAdmissionYield({
      host: controlled.host,
      onYield: () => {
        yielded = true
      },
    })

    expect(yielded).toBe(false)
    expect(controlled.frameRequests).toHaveLength(1)
    cancel()
    controlled.frameRequests[0]?.callback()
    expect(yielded).toBe(false)
    expect(controlled.cancelledFrameHandles).toEqual([1])
  })

  test('terminalizes and retains a hung load unit after its watchdog deadline', () => {
    const controlled = createControlledWatchdogHost()
    let state = yieldAdmission(createLandrushIslandAmbientLoadQueueState(60))
    const watchdog = createLandrushIslandAmbientLoadUnitWatchdog({
      generation: state.generation,
      host: controlled.host,
      onSettled: (settlement) => {
        state = settleLandrushIslandAmbientLoadQueue(state, settlement)
      },
      unitId: 'palm:palm-a',
    })

    expect(controlled.timeoutRequests[0]?.timeoutMs).toBe(
      LANDRUSH_ISLAND_AMBIENT_LOAD_UNIT_TIMEOUT_MS,
    )
    controlled.timeoutRequests[0]?.callback()

    expect(state.inFlightUnitId).toBeNull()
    expect(state.terminalOutcomes['palm:palm-a']).toBe('degraded')
    expect(resolveMountedLandrushIslandAmbientLoadUnits(state, UNITS)).toEqual([UNITS[0]])

    watchdog.settle('loaded')
    expect(state.terminalOutcomes['palm:palm-a']).toBe('degraded')
  })

  test('cancels the watchdog when a load unit settles normally', () => {
    const controlled = createControlledWatchdogHost()
    const settlements: LandrushIslandAmbientLoadSettlement[] = []
    const watchdog = createLandrushIslandAmbientLoadUnitWatchdog({
      generation: 70,
      host: controlled.host,
      onSettled: (settlement) => settlements.push(settlement),
      unitId: 'boat:boat-a',
    })

    watchdog.settle('loaded')
    expect(controlled.clearedTimeoutHandles).toEqual([1])
    expect(settlements).toEqual([{ generation: 70, outcome: 'loaded', unitId: 'boat:boat-a' }])

    controlled.timeoutRequests[0]?.callback()
    expect(settlements).toHaveLength(1)
  })

  test('cancels the watchdog without settlement when its load unit unmounts', () => {
    const controlled = createControlledWatchdogHost()
    const settlements: LandrushIslandAmbientLoadSettlement[] = []
    const watchdog = createLandrushIslandAmbientLoadUnitWatchdog({
      generation: 80,
      host: controlled.host,
      onSettled: (settlement) => settlements.push(settlement),
      unitId: 'fish:fish-a',
    })

    watchdog.dispose()
    expect(controlled.clearedTimeoutHandles).toEqual([1])
    controlled.timeoutRequests[0]?.callback()
    expect(settlements).toEqual([])
  })

  test('generation-fences a watchdog callback from a stale load unit', () => {
    const controlled = createControlledWatchdogHost()
    const current = yieldAdmission(createLandrushIslandAmbientLoadQueueState(91))
    let afterTimeout = current
    createLandrushIslandAmbientLoadUnitWatchdog({
      generation: 90,
      host: controlled.host,
      onSettled: (settlement) => {
        afterTimeout = settleLandrushIslandAmbientLoadQueue(afterTimeout, settlement)
      },
      unitId: 'palm:palm-a',
    })

    controlled.timeoutRequests[0]?.callback()
    expect(afterTimeout).toBe(current)
    expect(afterTimeout.inFlightUnitId).toBe('palm:palm-a')
  })

  test('represents each NPC and its four GLBs as one queue unit', () => {
    const npcUnits = UNITS.filter((unit) => unit.kind === 'npc')
    expect(npcUnits).toHaveLength(2)
    expect(npcUnits.map((unit) => unit.assetId)).toEqual(['npc-a', 'npc-b'])
  })
})

function createControlledWatchdogHost() {
  const clearedTimeoutHandles: number[] = []
  const timeoutRequests: Array<{ callback: () => void; handle: number; timeoutMs: number }> = []
  const host: LandrushIslandAmbientLoadWatchdogHost = {
    clearTimeout: (handle) => {
      clearedTimeoutHandles.push(handle)
    },
    setTimeout: (callback, timeoutMs) => {
      const handle = timeoutRequests.length + 1
      timeoutRequests.push({ callback, handle, timeoutMs })
      return handle
    },
  }
  return { clearedTimeoutHandles, host, timeoutRequests }
}

function yieldAdmission(state: ReturnType<typeof createLandrushIslandAmbientLoadQueueState>) {
  return advanceLandrushIslandAmbientLoadQueueAfterYield(state, UNITS, {
    generation: state.generation,
    policy: ACTIVE_POLICY,
  })
}

function createControlledYieldHost(withIdleCallback: boolean) {
  const idleRequests: Array<{ callback: () => void; handle: number; timeout: number }> = []
  const frameRequests: Array<{ callback: () => void; handle: number }> = []
  const cancelledIdleHandles: number[] = []
  const cancelledFrameHandles: number[] = []
  const host: LandrushIslandAmbientLoadYieldHost = {
    cancelAnimationFrame: (handle) => {
      cancelledFrameHandles.push(handle)
    },
    requestAnimationFrame: (callback) => {
      const handle = frameRequests.length + 1
      frameRequests.push({ callback, handle })
      return handle
    },
  }
  if (withIdleCallback) {
    host.cancelIdleCallback = (handle) => {
      cancelledIdleHandles.push(handle)
    }
    host.requestIdleCallback = (callback, options) => {
      const handle = idleRequests.length + 1
      idleRequests.push({ callback, handle, timeout: options.timeout })
      return handle
    }
  }
  return {
    cancelledFrameHandles,
    cancelledIdleHandles,
    frameRequests,
    host,
    idleRequests,
  }
}
