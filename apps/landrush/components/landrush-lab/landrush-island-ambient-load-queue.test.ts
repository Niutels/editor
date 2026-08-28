import { describe, expect, test } from 'bun:test'
import {
  advanceLandrushIslandAmbientLoadQueueAfterYield,
  createLandrushIslandAmbientLoadGenerationAllocator,
  createLandrushIslandAmbientLoadQueueState,
  createLandrushIslandAmbientLoadQueueStateForMount,
  createLandrushIslandAmbientLoadUnits,
  createLandrushIslandAmbientLoadUnitWatchdog,
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

  test('admits one unit per animation-frame yield without waiting for settlement', () => {
    const initial = createLandrushIslandAmbientLoadQueueState()
    const firstYield = yieldAdmission(initial)
    const settled = settleLandrushIslandAmbientLoadQueue(firstYield, {
      generation: firstYield.generation,
      outcome: 'loaded',
      unitId: 'palm:palm-a',
    })

    expect(firstYield.admittedUnitIds).toEqual(['palm:palm-a'])
    expect(settled.admittedUnitIds).toBe(firstYield.admittedUnitIds)
    expect(settled.terminalOutcomes).toEqual({ 'palm:palm-a': 'loaded' })
    expect(
      resolveMountedLandrushIslandAmbientLoadUnits(settled, UNITS).map((unit) => unit.id),
    ).toEqual(['palm:palm-a'])

    const secondYield = yieldAdmission(settled)
    expect(secondYield.admittedUnitIds).toEqual(['palm:palm-a', 'palm:palm-b'])
  })

  test('uses deterministic palm, boat, NPC, then fish order across frame yields', () => {
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

    for (const [index, unitId] of expectedOrder.entries()) {
      state = yieldAdmission(state)
      expect(state.admittedUnitIds).toEqual(expectedOrder.slice(0, index + 1))
      expect(state.admittedUnitIds.at(-1)).toBe(unitId)
    }
    for (const unitId of expectedOrder.toReversed()) {
      state = settleLandrushIslandAmbientLoadQueue(state, {
        generation: state.generation,
        outcome: 'loaded',
        unitId,
      })
    }

    expect(yieldAdmission(state)).toBe(state)
    expect(Object.keys(state.terminalOutcomes)).toHaveLength(expectedOrder.length)
  })

  test('keeps loaded units mounted while failure terminalizes before the next yield', () => {
    let state = createLandrushIslandAmbientLoadQueueState()
    state = yieldAdmission(state)
    state = yieldAdmission(state)
    state = settleLandrushIslandAmbientLoadQueue(state, {
      generation: state.generation,
      outcome: 'loaded',
      unitId: 'palm:palm-a',
    })
    state = settleLandrushIslandAmbientLoadQueue(state, {
      generation: state.generation,
      outcome: 'failed',
      unitId: 'palm:palm-b',
    })

    expect(
      resolveMountedLandrushIslandAmbientLoadUnits(state, UNITS).map((unit) => unit.id),
    ).toEqual(['palm:palm-a'])
    expect(state.terminalOutcomes['palm:palm-b']).toBe('failed')

    state = yieldAdmission(state)
    expect(state.admittedUnitIds).toEqual(['palm:palm-a', 'palm:palm-b', 'boat:boat-a'])
  })

  test('keeps NPC load eligibility independent from presentation visibility', () => {
    const state = admitAll(createLandrushIslandAmbientLoadQueueState())
    expect(state.admittedUnitIds).toContain('npc:npc-a')
    expect(state.admittedUnitIds).toContain('npc:npc-b')
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
    expect(staleYield.admittedUnitIds).toEqual([])
  })

  test('reports readiness only after every load unit terminalizes, including failures', () => {
    let state = createLandrushIslandAmbientLoadQueueState(4)
    const unitIds = UNITS.map((unit) => unit.id)
    state = admitAll(state)

    for (const [index, unitId] of unitIds.entries()) {
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
    let completedState = admitAll(createLandrushIslandAmbientLoadQueueState(8))
    for (const unit of UNITS) {
      completedState = settleLandrushIslandAmbientLoadQueue(completedState, {
        generation: completedState.generation,
        outcome: 'loaded',
        unitId: unit.id,
      })
    }
    const completed = resolveLandrushIslandAmbientLoadReadiness(completedState, UNITS)
    const resetState = resetLandrushIslandAmbientLoadQueue(completedState)
    const reset = resolveLandrushIslandAmbientLoadReadiness(resetState, UNITS)
    let firstTerminalState = admitAll(resetState)
    firstTerminalState = settleLandrushIslandAmbientLoadQueue(firstTerminalState, {
      generation: firstTerminalState.generation,
      outcome: 'loaded',
      unitId: UNITS[0]!.id,
    })
    const firstTerminal = resolveLandrushIslandAmbientLoadReadiness(firstTerminalState, UNITS)
    let secondTerminalState = firstTerminalState
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
    let previousState = admitAll(firstMount)
    for (const unit of UNITS) {
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

  test('uses a cancellable animation-frame turn and delivers its yield at most once', () => {
    const controlled = createControlledYieldHost()
    let yieldCount = 0
    const cancel = scheduleLandrushIslandAmbientLoadAdmissionYield({
      host: controlled.host,
      onYield: () => {
        yieldCount += 1
      },
    })

    expect(yieldCount).toBe(0)
    expect(controlled.frameRequests).toHaveLength(1)
    controlled.frameRequests[0]?.callback()
    controlled.frameRequests[0]?.callback()
    cancel()
    expect(yieldCount).toBe(1)
    expect(controlled.cancelledFrameHandles).toEqual([])

    const cancelBeforeYield = scheduleLandrushIslandAmbientLoadAdmissionYield({
      host: controlled.host,
      onYield: () => {
        yieldCount += 1
      },
    })
    cancelBeforeYield()
    controlled.frameRequests[1]?.callback()
    expect(yieldCount).toBe(1)
    expect(controlled.cancelledFrameHandles).toEqual([2])
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
    expect(afterTimeout.admittedUnitIds).toEqual(['palm:palm-a'])
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

function admitAll(state: ReturnType<typeof createLandrushIslandAmbientLoadQueueState>) {
  let admitted = state
  for (let index = 0; index < UNITS.length; index += 1) admitted = yieldAdmission(admitted)
  return admitted
}

function createControlledYieldHost() {
  const frameRequests: Array<{ callback: () => void; handle: number }> = []
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
  return {
    cancelledFrameHandles,
    frameRequests,
    host,
  }
}
