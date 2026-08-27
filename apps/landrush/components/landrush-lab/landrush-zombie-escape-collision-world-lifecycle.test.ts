import { describe, expect, test } from 'bun:test'
import {
  createLandrushZombieEscapeCollisionWorldBuildCoordinator,
  isLandrushZombieEscapeDesiredCollisionWorldReady,
  LANDRUSH_ZOMBIE_ESCAPE_COLLISION_WORLD_EXECUTION_TIMEOUT_MS,
  LANDRUSH_ZOMBIE_ESCAPE_COLLISION_WORLD_RETRY_DELAYS_MS,
  type LandrushZombieEscapeCollisionWorldBuildCoordinator,
  type LandrushZombieEscapeCollisionWorldBuildScheduleHost,
  type LandrushZombieEscapeCollisionWorldBuildState,
  resolveLandrushZombieEscapeCollisionWorldBuildPriority,
  resolveLandrushZombieEscapeCollisionWorldPhaseReady,
} from './landrush-zombie-escape-collision-world-lifecycle'

type Input = Readonly<{ semanticKey: string; value: number }>
type Worlds = Readonly<{ combat: string; navigation: string }>

describe('Zombie Escape collision-world lifecycle', () => {
  test('accepts only a settled bundle with the exact desired signature', () => {
    const exactWorlds = createWorlds(1)
    const exactState: LandrushZombieEscapeCollisionWorldBuildState<Worlds> = {
      generation: 1,
      pendingSignature: null,
      ready: true,
      signature: 'exact',
      worlds: exactWorlds,
    }

    expect(
      isLandrushZombieEscapeDesiredCollisionWorldReady({
        desiredSignature: 'exact',
        state: exactState,
      }),
    ).toBe(true)

    for (const state of [
      { ...exactState, pendingSignature: 'next', ready: false },
      { ...exactState, pendingSignature: 'next' },
      { ...exactState, ready: false },
      { ...exactState, signature: 'stale' },
      { ...exactState, worlds: null },
    ] as const) {
      expect(
        isLandrushZombieEscapeDesiredCollisionWorldReady({
          desiredSignature: 'exact',
          state,
        }),
      ).toBe(false)
    }
  })

  test('debounces background edits and compiles only the latest input during idle time', () => {
    const schedule = createDeterministicScheduleHost()
    const compiled: Input[] = []
    const states: LandrushZombieEscapeCollisionWorldBuildState<Worlds>[] = []
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      backgroundDebounceMs: 25,
      compile: (input: Input) => {
        compiled.push(input)
        return createWorlds(input.value)
      },
      host: schedule.host,
      idleTimeoutMs: 80,
      onStateChange: (state) => states.push(state),
      resolveSignature: (input: Input) => input.semanticKey,
    })

    coordinator.request({ semanticKey: 'wall:a', value: 1 }, 'background')
    coordinator.request({ semanticKey: 'wall:b', value: 2 }, 'background')

    expect(schedule.pending('timeout')).toEqual([{ delayMs: 25, id: 2 }])
    expect(compiled).toHaveLength(0)
    schedule.runNext('timeout')
    expect(schedule.pending('idle')).toEqual([{ delayMs: 80, id: 3 }])
    expect(compiled).toHaveLength(0)
    schedule.runNext('idle')

    expect(compiled).toEqual([{ semanticKey: 'wall:b', value: 2 }])
    expect(states.at(-1)).toEqual({
      generation: 2,
      pendingSignature: null,
      ready: true,
      signature: 'wall:b',
      worlds: createWorlds(2),
    })
  })

  test('rejects a stale completion when a newer request arrives during compilation', () => {
    const schedule = createDeterministicScheduleHost()
    const states: LandrushZombieEscapeCollisionWorldBuildState<Worlds>[] = []
    const secondInput = { semanticKey: 'new', value: 2 } as const
    let coordinator: LandrushZombieEscapeCollisionWorldBuildCoordinator<Input, Worlds>
    coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: (input: Input) => {
        if (input.semanticKey === 'old') coordinator.request(secondInput, 'urgent')
        return createWorlds(input.value)
      },
      host: schedule.host,
      onStateChange: (state) => states.push(state),
      resolveSignature: (input: Input) => input.semanticKey,
    })

    coordinator.request({ semanticKey: 'old', value: 1 }, 'urgent')
    schedule.runNext('timeout')

    expect(states.at(-1)).toEqual({
      generation: 2,
      pendingSignature: 'new',
      ready: false,
      signature: null,
      worlds: null,
    })
    expect(states.some((state) => state.ready && state.signature === 'old')).toBe(false)

    schedule.runNext('timeout')
    expect(states.at(-1)).toEqual({
      generation: 2,
      pendingSignature: null,
      ready: true,
      signature: 'new',
      worlds: createWorlds(2),
    })
  })

  test('keeps the applied bundle atomic while pending and skips unchanged semantic builds', () => {
    const schedule = createDeterministicScheduleHost()
    const states: LandrushZombieEscapeCollisionWorldBuildState<Worlds>[] = []
    let compileCount = 0
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      backgroundDebounceMs: 10,
      compile: (input: Input) => {
        compileCount += 1
        return createWorlds(input.value)
      },
      host: schedule.host,
      onStateChange: (state) => states.push(state),
      resolveSignature: (input: Input) => input.semanticKey,
    })

    coordinator.request({ semanticKey: 'a', value: 1 }, 'urgent')
    schedule.runNext('timeout')
    const firstWorlds = states.at(-1)?.worlds

    coordinator.request({ semanticKey: 'b', value: 2 }, 'background')
    expect(states.at(-1)).toEqual({
      generation: 2,
      pendingSignature: 'b',
      ready: false,
      signature: 'a',
      worlds: firstWorlds,
    })
    schedule.runNext('timeout')
    schedule.runNext('idle')
    const secondWorlds = states.at(-1)?.worlds
    expect(secondWorlds).toEqual(createWorlds(2))

    coordinator.request({ semanticKey: 'b', value: 99 }, 'background')
    expect(states.at(-1)?.ready).toBe(true)
    expect(states.at(-1)?.worlds).toBe(secondWorlds)
    expect(schedule.pending('timeout')).toEqual([])
    expect(schedule.pending('idle')).toEqual([])

    expect(compileCount).toBe(2)
    expect(states.at(-1)).toEqual({
      generation: 2,
      pendingSignature: null,
      ready: true,
      signature: 'b',
      worlds: secondWorlds,
    })
  })

  test('disposes pending work and derives phase readiness and scheduling priority explicitly', () => {
    const schedule = createDeterministicScheduleHost()
    let compileCount = 0
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: (input: Input) => {
        compileCount += 1
        return createWorlds(input.value)
      },
      host: schedule.host,
      onStateChange: () => undefined,
      resolveSignature: (input: Input) => input.semanticKey,
    })

    coordinator.request({ semanticKey: 'pending', value: 1 }, 'background')
    const pendingState = coordinator.getState()
    expect(
      resolveLandrushZombieEscapeCollisionWorldPhaseReady({
        desiredSignature: 'pending',
        expectedPhase: 'build',
        phaseReady: true,
        state: pendingState,
      }),
    ).toBe(true)
    expect(
      resolveLandrushZombieEscapeCollisionWorldPhaseReady({
        desiredSignature: 'pending',
        expectedPhase: 'night',
        phaseReady: true,
        state: pendingState,
      }),
    ).toBe(false)
    expect(resolveLandrushZombieEscapeCollisionWorldBuildPriority('build')).toBe('background')
    expect(resolveLandrushZombieEscapeCollisionWorldBuildPriority('night')).toBe('urgent')

    coordinator.dispose()
    expect(schedule.pending('timeout')).toEqual([])
    expect(schedule.pending('idle')).toEqual([])
    expect(compileCount).toBe(0)

    const readyState: LandrushZombieEscapeCollisionWorldBuildState<Worlds> = {
      generation: 1,
      pendingSignature: null,
      ready: true,
      signature: 'ready',
      worlds: createWorlds(1),
    }
    expect(
      resolveLandrushZombieEscapeCollisionWorldPhaseReady({
        desiredSignature: 'ready',
        expectedPhase: 'night',
        phaseReady: false,
        state: readyState,
      }),
    ).toBe(false)
    expect(
      resolveLandrushZombieEscapeCollisionWorldPhaseReady({
        desiredSignature: 'ready',
        expectedPhase: 'night',
        phaseReady: true,
        state: readyState,
      }),
    ).toBe(true)
  })

  test('promotes pending background work and automatically recovers a transient urgent failure', () => {
    const schedule = createDeterministicScheduleHost()
    const errors: unknown[] = []
    const states: LandrushZombieEscapeCollisionWorldBuildState<Worlds>[] = []
    let compileCount = 0
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      backgroundDebounceMs: 25,
      compile: (input: Input) => {
        compileCount += 1
        if (compileCount === 1) throw new Error('transient compile failure')
        return createWorlds(input.value)
      },
      host: schedule.host,
      onError: (error) => errors.push(error),
      onStateChange: (state) => states.push(state),
      resolveSignature: (input: Input) => input.semanticKey,
    })

    const input = { semanticKey: 'current', value: 3 } as const
    coordinator.request(input, 'background')
    coordinator.request(input, 'urgent')

    expect(schedule.pending('timeout')).toEqual([{ delayMs: 0, id: 2 }])
    expect(schedule.pending('idle')).toEqual([])
    schedule.runNext('timeout')
    expect(errors).toHaveLength(1)
    expect(states.at(-1)).toEqual({
      generation: 2,
      pendingSignature: 'current',
      ready: false,
      signature: null,
      worlds: null,
    })
    expect(schedule.pending('timeout')).toEqual([
      { delayMs: LANDRUSH_ZOMBIE_ESCAPE_COLLISION_WORLD_RETRY_DELAYS_MS[0], id: 3 },
    ])

    schedule.runNext('timeout')

    expect(compileCount).toBe(2)
    expect(states.at(-1)).toEqual({
      generation: 2,
      pendingSignature: null,
      ready: true,
      signature: 'current',
      worlds: createWorlds(3),
    })
  })

  test('bounds persistent retries and allows an explicit same-input request after exhaustion', () => {
    const schedule = createDeterministicScheduleHost()
    const errors: unknown[] = []
    let compileCount = 0
    let failing = true
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: (input: Input) => {
        compileCount += 1
        if (failing) throw new Error('persistent compile failure')
        return createWorlds(input.value)
      },
      host: schedule.host,
      onError: (error) => errors.push(error),
      onStateChange: () => undefined,
      resolveSignature: (input: Input) => input.semanticKey,
    })
    const input = { semanticKey: 'blocked', value: 4 } as const

    coordinator.request(input, 'urgent')
    schedule.runNext('timeout')
    expect(schedule.pending('timeout')).toEqual([
      { delayMs: LANDRUSH_ZOMBIE_ESCAPE_COLLISION_WORLD_RETRY_DELAYS_MS[0], id: 2 },
    ])
    schedule.runNext('timeout')
    expect(schedule.pending('timeout')).toEqual([
      { delayMs: LANDRUSH_ZOMBIE_ESCAPE_COLLISION_WORLD_RETRY_DELAYS_MS[1], id: 3 },
    ])
    schedule.runNext('timeout')

    expect(compileCount).toBe(3)
    expect(errors).toHaveLength(3)
    expect(schedule.pending('timeout')).toEqual([])
    expect(coordinator.getState()).toEqual({
      generation: 1,
      pendingSignature: null,
      ready: false,
      signature: null,
      worlds: null,
    })

    failing = false
    coordinator.request(input, 'urgent')
    expect(schedule.pending('timeout')).toEqual([{ delayMs: 0, id: 4 }])
    schedule.runNext('timeout')

    expect(compileCount).toBe(4)
    expect(coordinator.getState()).toEqual({
      generation: 2,
      pendingSignature: null,
      ready: true,
      signature: 'blocked',
      worlds: createWorlds(4),
    })
  })

  test('cancels a stale retry when a newer semantic request arrives', () => {
    const schedule = createDeterministicScheduleHost()
    const compiled: string[] = []
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: (input: Input) => {
        compiled.push(input.semanticKey)
        if (input.semanticKey === 'old') throw new Error('old compile failure')
        return createWorlds(input.value)
      },
      host: schedule.host,
      onStateChange: () => undefined,
      resolveSignature: (input: Input) => input.semanticKey,
    })

    coordinator.request({ semanticKey: 'old', value: 1 }, 'urgent')
    schedule.runNext('timeout')
    expect(schedule.pending('timeout')).toEqual([
      { delayMs: LANDRUSH_ZOMBIE_ESCAPE_COLLISION_WORLD_RETRY_DELAYS_MS[0], id: 2 },
    ])

    coordinator.request({ semanticKey: 'new', value: 2 }, 'urgent')
    expect(schedule.pending('timeout')).toEqual([{ delayMs: 0, id: 3 }])
    schedule.runNext('timeout')

    expect(compiled).toEqual(['old', 'new'])
    expect(coordinator.getState()).toEqual({
      generation: 2,
      pendingSignature: null,
      ready: true,
      signature: 'new',
      worlds: createWorlds(2),
    })
  })

  test('cancels a scheduled retry when disposed', () => {
    const schedule = createDeterministicScheduleHost()
    let compileCount = 0
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: () => {
        compileCount += 1
        throw new Error('compile failure')
      },
      host: schedule.host,
      onStateChange: () => undefined,
      resolveSignature: (input: Input) => input.semanticKey,
    })

    coordinator.request({ semanticKey: 'dispose', value: 1 }, 'urgent')
    schedule.runNext('timeout')
    expect(schedule.pending('timeout')).toHaveLength(1)
    coordinator.dispose()

    expect(schedule.pending('timeout')).toEqual([])
    expect(compileCount).toBe(1)
  })

  test('cancels obsolete work when semantics return to the applied signature', () => {
    const schedule = createDeterministicScheduleHost()
    const states: LandrushZombieEscapeCollisionWorldBuildState<Worlds>[] = []
    let compileCount = 0
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      backgroundDebounceMs: 25,
      compile: (input: Input) => {
        compileCount += 1
        return createWorlds(input.value)
      },
      host: schedule.host,
      onStateChange: (state) => states.push(state),
      resolveSignature: (input: Input) => input.semanticKey,
    })

    coordinator.request({ semanticKey: 'applied', value: 1 }, 'urgent')
    schedule.runNext('timeout')
    const appliedWorlds = coordinator.getState().worlds
    coordinator.request({ semanticKey: 'temporary', value: 2 }, 'background')
    coordinator.request({ semanticKey: 'applied', value: 99 }, 'background')

    expect(schedule.pending('timeout')).toEqual([])
    expect(schedule.pending('idle')).toEqual([])
    expect(compileCount).toBe(1)
    expect(states.at(-1)).toEqual({
      generation: 3,
      pendingSignature: null,
      ready: true,
      signature: 'applied',
      worlds: appliedWorlds,
    })
  })

  test('ignores a completion when disposal occurs inside compilation', () => {
    const schedule = createDeterministicScheduleHost()
    const states: LandrushZombieEscapeCollisionWorldBuildState<Worlds>[] = []
    let coordinator: LandrushZombieEscapeCollisionWorldBuildCoordinator<Input, Worlds>
    coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: (input: Input) => {
        coordinator.dispose()
        return createWorlds(input.value)
      },
      host: schedule.host,
      onStateChange: (state) => states.push(state),
      resolveSignature: (input: Input) => input.semanticKey,
    })

    coordinator.request({ semanticKey: 'unmounted', value: 1 }, 'urgent')
    schedule.runNext('timeout')

    expect(states).toEqual([
      {
        generation: 1,
        pendingSignature: 'unmounted',
        ready: false,
        signature: null,
        worlds: null,
      },
    ])
  })

  test('does not arm a watchdog when compilation disposes before returning an async result', async () => {
    const schedule = createDeterministicScheduleHost()
    const errors: unknown[] = []
    const build = createDeferred<Worlds>()
    let signal: AbortSignal | null = null
    let coordinator: LandrushZombieEscapeCollisionWorldBuildCoordinator<Input, Worlds>
    coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: (_input: Input, candidateSignal) => {
        signal = candidateSignal
        coordinator.dispose()
        return build.promise
      },
      host: schedule.host,
      onError: (error) => errors.push(error),
      onStateChange: () => undefined,
      resolveSignature: (input: Input) => input.semanticKey,
    })

    coordinator.request({ semanticKey: 'disposed-async', value: 1 }, 'urgent')
    schedule.runNext('timeout')

    expect(signal?.aborted).toBe(true)
    expect(schedule.pending('timeout')).toEqual([])
    build.reject(new Error('disposed async result'))
    await flushPromises()
    expect(errors).toEqual([])
    expect(coordinator.getState()).toEqual({
      generation: 1,
      pendingSignature: 'disposed-async',
      ready: false,
      signature: null,
      worlds: null,
    })
  })

  test('keeps a newer async watchdog owned when compilation requests replacement work', async () => {
    const schedule = createDeterministicScheduleHost()
    const oldBuild = createDeferred<Worlds>()
    const newBuild = createDeferred<Worlds>()
    const newInput = { semanticKey: 'new-async', value: 2 } as const
    let oldSignal: AbortSignal | null = null
    let coordinator: LandrushZombieEscapeCollisionWorldBuildCoordinator<Input, Worlds>
    coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: (input: Input, signal) => {
        if (input.semanticKey === 'old-async') {
          oldSignal = signal
          coordinator.request(newInput, 'urgent')
          return oldBuild.promise
        }
        return newBuild.promise
      },
      host: schedule.host,
      onStateChange: () => undefined,
      resolveSignature: (input: Input) => input.semanticKey,
    })

    coordinator.request({ semanticKey: 'old-async', value: 1 }, 'urgent')
    schedule.runNext('timeout')

    expect(oldSignal?.aborted).toBe(true)
    expect(schedule.pending('timeout')).toEqual([{ delayMs: 0, id: 2 }])
    schedule.runNext('timeout')
    expect(schedule.pending('timeout')).toEqual([
      { delayMs: LANDRUSH_ZOMBIE_ESCAPE_COLLISION_WORLD_EXECUTION_TIMEOUT_MS, id: 3 },
    ])

    oldBuild.resolve(createWorlds(1))
    await flushPromises()
    expect(schedule.pending('timeout')).toEqual([
      { delayMs: LANDRUSH_ZOMBIE_ESCAPE_COLLISION_WORLD_EXECUTION_TIMEOUT_MS, id: 3 },
    ])
    expect(coordinator.getState()).toMatchObject({
      pendingSignature: 'new-async',
      ready: false,
    })

    newBuild.resolve(createWorlds(2))
    await flushPromises()
    expect(schedule.pending('timeout')).toEqual([])
    expect(coordinator.getState()).toEqual({
      generation: 2,
      pendingSignature: null,
      ready: true,
      signature: 'new-async',
      worlds: createWorlds(2),
    })
  })

  test('ignores an out-of-order async completion and applies only the latest bundle', async () => {
    const schedule = createDeterministicScheduleHost()
    const builds = new Map<string, ReturnType<typeof createDeferred<Worlds>>>()
    const errors: unknown[] = []
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: (input: Input) => {
        const build = createDeferred<Worlds>()
        builds.set(input.semanticKey, build)
        return build.promise
      },
      host: schedule.host,
      onError: (error) => errors.push(error),
      onStateChange: () => undefined,
      resolveSignature: (input: Input) => input.semanticKey,
    })

    coordinator.request({ semanticKey: 'old', value: 1 }, 'urgent')
    schedule.runNext('timeout')
    coordinator.request({ semanticKey: 'new', value: 2 }, 'urgent')
    schedule.runNext('timeout')

    builds.get('new')?.resolve(createWorlds(2))
    await flushPromises()
    expect(coordinator.getState()).toEqual({
      generation: 2,
      pendingSignature: null,
      ready: true,
      signature: 'new',
      worlds: createWorlds(2),
    })

    const superseded = new Error('Superseded by a newer worker request.')
    superseded.name = 'AbortError'
    builds.get('old')?.reject(superseded)
    await flushPromises()
    expect(coordinator.getState()).toEqual({
      generation: 2,
      pendingSignature: null,
      ready: true,
      signature: 'new',
      worlds: createWorlds(2),
    })
    expect(errors).toEqual([])
    expect(schedule.pending('timeout')).toEqual([])
  })

  test('revalidates the exact signature after awaiting compilation', async () => {
    const schedule = createDeterministicScheduleHost()
    const builds: Array<ReturnType<typeof createDeferred<Worlds>>> = []
    const input: Input = { semanticKey: 'before', value: 1 }
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: () => {
        const build = createDeferred<Worlds>()
        builds.push(build)
        return build.promise
      },
      host: schedule.host,
      onStateChange: () => undefined,
      resolveSignature: (candidate: Input) => candidate.semanticKey,
    })

    coordinator.request(input, 'urgent')
    schedule.runNext('timeout')
    ;(input as { semanticKey: string }).semanticKey = 'after'
    builds[0]?.resolve(createWorlds(1))
    await flushPromises()

    expect(coordinator.getState()).toMatchObject({
      generation: 2,
      pendingSignature: 'after',
      ready: false,
    })
    expect(schedule.pending('timeout')).toEqual([{ delayMs: 0, id: 3 }])

    schedule.runNext('timeout')
    builds[1]?.resolve(createWorlds(2))
    await flushPromises()
    expect(coordinator.getState()).toEqual({
      generation: 2,
      pendingSignature: null,
      ready: true,
      signature: 'after',
      worlds: createWorlds(2),
    })
  })

  test('routes synchronous-build signature revalidation errors to terminal not-ready state', () => {
    const schedule = createDeterministicScheduleHost()
    const errors: unknown[] = []
    let signatureCallCount = 0
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: (input: Input) => createWorlds(input.value),
      host: schedule.host,
      onError: (error) => errors.push(error),
      onStateChange: () => undefined,
      resolveSignature: (input: Input) => {
        signatureCallCount += 1
        if (signatureCallCount === 2) throw new Error('sync revalidation failure')
        return input.semanticKey
      },
      retryDelaysMs: [],
    })

    coordinator.request({ semanticKey: 'sync', value: 5 }, 'urgent')
    schedule.runNext('timeout')

    expect(errors).toHaveLength(1)
    expect(errors[0]).toEqual(new Error('sync revalidation failure'))
    expect(schedule.pending('timeout')).toEqual([])
    expect(coordinator.getState()).toEqual({
      generation: 1,
      pendingSignature: null,
      ready: false,
      signature: null,
      worlds: null,
    })
  })

  test('retries after asynchronous-build signature revalidation throws', async () => {
    const schedule = createDeterministicScheduleHost()
    const errors: unknown[] = []
    const firstBuild = createDeferred<Worlds>()
    let compileCount = 0
    let signatureCallCount = 0
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: (input: Input) => {
        compileCount += 1
        return compileCount === 1 ? firstBuild.promise : createWorlds(input.value)
      },
      host: schedule.host,
      onError: (error) => errors.push(error),
      onStateChange: () => undefined,
      resolveSignature: (input: Input) => {
        signatureCallCount += 1
        if (signatureCallCount === 2) throw new Error('async revalidation failure')
        return input.semanticKey
      },
      retryDelaysMs: [5],
    })

    coordinator.request({ semanticKey: 'async', value: 6 }, 'urgent')
    schedule.runNext('timeout')
    firstBuild.resolve(createWorlds(6))
    await flushPromises()

    expect(errors).toHaveLength(1)
    expect(errors[0]).toEqual(new Error('async revalidation failure'))
    expect(schedule.pending('timeout')).toEqual([{ delayMs: 5, id: 3 }])

    schedule.runNext('timeout')
    expect(compileCount).toBe(2)
    expect(coordinator.getState()).toEqual({
      generation: 1,
      pendingSignature: null,
      ready: true,
      signature: 'async',
      worlds: createWorlds(6),
    })
  })

  test('routes asynchronous failures through bounded retries and ignores disposal', async () => {
    const schedule = createDeterministicScheduleHost()
    const errors: unknown[] = []
    let attempts = 0
    const finalBuild = createDeferred<Worlds>()
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: () => {
        attempts += 1
        if (attempts === 1) return Promise.reject(new Error('worker constructor failed'))
        return finalBuild.promise
      },
      host: schedule.host,
      onError: (error) => errors.push(error),
      onStateChange: () => undefined,
      resolveSignature: (input: Input) => input.semanticKey,
    })

    coordinator.request({ semanticKey: 'current', value: 7 }, 'urgent')
    schedule.runNext('timeout')
    await flushPromises()
    expect(errors).toHaveLength(1)
    expect(schedule.pending('timeout')).toEqual([
      { delayMs: LANDRUSH_ZOMBIE_ESCAPE_COLLISION_WORLD_RETRY_DELAYS_MS[0], id: 3 },
    ])

    schedule.runNext('timeout')
    coordinator.dispose()
    finalBuild.resolve(createWorlds(7))
    await flushPromises()
    expect(coordinator.getState()).toMatchObject({ ready: false, signature: null, worlds: null })
  })

  test('times out a never-settling build once without restarting the same cold work', () => {
    const schedule = createDeterministicScheduleHost()
    const errors: unknown[] = []
    const signals: AbortSignal[] = []
    let compileCount = 0
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: (_input: Input, signal) => {
        compileCount += 1
        signals.push(signal)
        return new Promise<Worlds>(() => undefined)
      },
      executionTimeoutMs: 40,
      host: schedule.host,
      onError: (error) => errors.push(error),
      onStateChange: () => undefined,
      resolveSignature: (input: Input) => input.semanticKey,
      retryDelaysMs: [5, 7],
    })

    coordinator.request({ semanticKey: 'never', value: 1 }, 'urgent')
    schedule.runNext('timeout')
    expect(schedule.pending('timeout')).toEqual([{ delayMs: 40, id: 2 }])

    schedule.runNext('timeout')

    expect(compileCount).toBe(1)
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ name: 'TimeoutError' })
    expect(schedule.pending('timeout')).toEqual([])
    expect(coordinator.getState()).toEqual({
      generation: 1,
      pendingSignature: null,
      ready: false,
      signature: null,
      worlds: null,
    })
  })

  test('ignores a timed-out attempt that completes after terminal failure', async () => {
    const schedule = createDeterministicScheduleHost()
    const build = createDeferred<Worlds>()
    const errors: unknown[] = []
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: () => build.promise,
      executionTimeoutMs: 40,
      host: schedule.host,
      onError: (error) => errors.push(error),
      onStateChange: () => undefined,
      resolveSignature: (input: Input) => input.semanticKey,
      retryDelaysMs: [5],
    })

    coordinator.request({ semanticKey: 'late', value: 9 }, 'urgent')
    schedule.runNext('timeout')
    schedule.runNext('timeout')
    const terminalState = coordinator.getState()
    expect(terminalState).toEqual({
      generation: 1,
      pendingSignature: null,
      ready: false,
      signature: null,
      worlds: null,
    })
    expect(schedule.pending('timeout')).toEqual([])

    build.resolve(createWorlds(99))
    await flushPromises()
    expect(coordinator.getState()).toBe(terminalState)
    expect(errors).toHaveLength(1)
  })

  test('clears the execution watchdog when a normal async build succeeds', async () => {
    const schedule = createDeterministicScheduleHost()
    const errors: unknown[] = []
    const build = createDeferred<Worlds>()
    let signal: AbortSignal | null = null
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: (_input: Input, candidateSignal) => {
        signal = candidateSignal
        return build.promise
      },
      host: schedule.host,
      onError: (error) => errors.push(error),
      onStateChange: () => undefined,
      resolveSignature: (input: Input) => input.semanticKey,
    })

    coordinator.request({ semanticKey: 'normal', value: 10 }, 'urgent')
    schedule.runNext('timeout')
    expect(schedule.pending('timeout')).toEqual([
      { delayMs: LANDRUSH_ZOMBIE_ESCAPE_COLLISION_WORLD_EXECUTION_TIMEOUT_MS, id: 2 },
    ])

    build.resolve(createWorlds(10))
    await flushPromises()

    expect(signal?.aborted).toBe(false)
    expect(errors).toEqual([])
    expect(schedule.pending('timeout')).toEqual([])
    expect(coordinator.getState()).toEqual({
      generation: 1,
      pendingSignature: null,
      ready: true,
      signature: 'normal',
      worlds: createWorlds(10),
    })
  })

  test('aborts an active worker build immediately when semantics revert to the applied world', async () => {
    const schedule = createDeterministicScheduleHost()
    const errors: unknown[] = []
    let pendingBuild: ReturnType<typeof createAbortableBuild<Worlds>> | null = null
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: (input: Input, signal) => {
        if (input.semanticKey === 'applied') return createWorlds(input.value)
        pendingBuild = createAbortableBuild(signal)
        return pendingBuild.promise
      },
      host: schedule.host,
      onError: (error) => errors.push(error),
      onStateChange: () => undefined,
      resolveSignature: (input: Input) => input.semanticKey,
    })

    coordinator.request({ semanticKey: 'applied', value: 1 }, 'urgent')
    schedule.runNext('timeout')
    coordinator.request({ semanticKey: 'temporary', value: 2 }, 'urgent')
    schedule.runNext('timeout')
    expect(pendingBuild?.signal.aborted).toBe(false)

    coordinator.request({ semanticKey: 'applied', value: 99 }, 'background')
    expect(pendingBuild?.signal.aborted).toBe(true)
    await flushPromises()

    expect(errors).toEqual([])
    expect(schedule.pending('timeout')).toEqual([])
    expect(schedule.pending('idle')).toEqual([])
    expect(coordinator.getState()).toMatchObject({
      pendingSignature: null,
      ready: true,
      signature: 'applied',
      worlds: createWorlds(1),
    })
  })

  test('aborts active work before a newer background request finishes debouncing', async () => {
    const schedule = createDeterministicScheduleHost()
    const builds = new Map<string, ReturnType<typeof createAbortableBuild<Worlds>>>()
    const errors: unknown[] = []
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      backgroundDebounceMs: 25,
      compile: (input: Input, signal) => {
        const build = createAbortableBuild<Worlds>(signal)
        builds.set(input.semanticKey, build)
        return build.promise
      },
      host: schedule.host,
      idleTimeoutMs: 80,
      onError: (error) => errors.push(error),
      onStateChange: () => undefined,
      resolveSignature: (input: Input) => input.semanticKey,
    })

    coordinator.request({ semanticKey: 'active', value: 1 }, 'urgent')
    schedule.runNext('timeout')
    coordinator.request({ semanticKey: 'debounced', value: 2 }, 'background')

    expect(builds.get('active')?.signal.aborted).toBe(true)
    expect(builds.has('debounced')).toBe(false)
    expect(schedule.pending('timeout')).toEqual([{ delayMs: 25, id: 3 }])
    await flushPromises()
    expect(errors).toEqual([])
    expect(schedule.pending('timeout')).toEqual([{ delayMs: 25, id: 3 }])

    schedule.runNext('timeout')
    expect(schedule.pending('idle')).toEqual([{ delayMs: 80, id: 4 }])
    schedule.runNext('idle')
    builds.get('debounced')?.resolve(createWorlds(2))
    await flushPromises()
    expect(coordinator.getState()).toMatchObject({
      pendingSignature: null,
      ready: true,
      signature: 'debounced',
      worlds: createWorlds(2),
    })
  })

  test('aborts active work on dispose without reporting or retrying the cancellation', async () => {
    const schedule = createDeterministicScheduleHost()
    const errors: unknown[] = []
    let build: ReturnType<typeof createAbortableBuild<Worlds>> | null = null
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: (_input: Input, signal) => {
        build = createAbortableBuild(signal)
        return build.promise
      },
      host: schedule.host,
      onError: (error) => errors.push(error),
      onStateChange: () => undefined,
      resolveSignature: (input: Input) => input.semanticKey,
    })

    coordinator.request({ semanticKey: 'active', value: 1 }, 'urgent')
    schedule.runNext('timeout')
    coordinator.dispose()
    expect(build?.signal.aborted).toBe(true)
    await flushPromises()

    expect(errors).toEqual([])
    expect(schedule.pending('timeout')).toEqual([])
    expect(schedule.pending('idle')).toEqual([])
  })
})

function createWorlds(value: number): Worlds {
  return { combat: `combat:${String(value)}`, navigation: `navigation:${String(value)}` }
}

function createDeferred<T>() {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, reject, resolve }
}

function createAbortableBuild<T>(signal: AbortSignal) {
  const deferred = createDeferred<T>()
  signal.addEventListener(
    'abort',
    () => {
      const error = new Error('Worker compilation aborted.')
      error.name = 'AbortError'
      deferred.reject(error)
    },
    { once: true },
  )
  return { ...deferred, signal }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

function createDeterministicScheduleHost() {
  type Task = {
    callback: () => void
    delayMs: number
    id: number
    kind: 'idle' | 'timeout'
  }
  let nextId = 1
  const tasks = new Map<number, Task>()
  const schedule = (kind: Task['kind'], callback: () => void, delayMs: number) => {
    const id = nextId
    nextId += 1
    tasks.set(id, { callback, delayMs, id, kind })
    return id
  }
  const cancel = (id: number) => tasks.delete(id)
  const host: LandrushZombieEscapeCollisionWorldBuildScheduleHost = {
    cancelIdleCallback: cancel,
    clearTimeout: cancel,
    requestIdleCallback: (callback, options) => schedule('idle', callback, options.timeout),
    setTimeout: (callback, delayMs) => schedule('timeout', callback, delayMs),
  }
  const pending = (kind: Task['kind']) =>
    [...tasks.values()]
      .filter((task) => task.kind === kind)
      .sort((first, second) => first.id - second.id)
      .map(({ delayMs, id }) => ({ delayMs, id }))
  const runNext = (kind: Task['kind']) => {
    const task = [...tasks.values()]
      .filter((candidate) => candidate.kind === kind)
      .sort((first, second) => first.id - second.id)[0]
    if (!task) throw new Error(`No pending ${kind} task.`)
    tasks.delete(task.id)
    task.callback()
  }
  return { host, pending, runNext }
}
