import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  createLandrushZombieEscapeCollisionWorldBuildCoordinator,
  createLandrushZombieEscapeCollisionWorldBuildState,
  type LandrushZombieEscapeCollisionWorldBuildScheduleHost,
  type LandrushZombieEscapeCollisionWorldBuildState,
  resolveLandrushZombieEscapeCollisionWorldPhaseReady,
} from './landrush-zombie-escape-collision-world-lifecycle'
import {
  createLandrushZombieEscapeNavigationReadiness,
  isLandrushZombieEscapeCollisionWorldInstalled,
  type LandrushZombieEscapeNavigationReadiness,
  reconcileLandrushZombieEscapeNavigationReadiness,
  resolveLandrushZombieEscapeNavigationReady,
  resolveLandrushZombieEscapeRecoveryPresentation,
} from './landrush-zombie-escape-navigation-readiness'

type World = { name: string }
type Worlds = { combat: World; navigation: World }
const scope = { authorityKey: 'world:authority:1', mountGeneration: 'zombie-assets:1' }

function worlds(name = 'current'): Worlds {
  return { combat: { name: `${name}:combat` }, navigation: { name: `${name}:navigation` } }
}

function readyState(bundle = worlds()): LandrushZombieEscapeCollisionWorldBuildState<Worlds> {
  return {
    generation: 1,
    pendingSignature: null,
    ready: true,
    signature: 'current',
    worlds: bundle,
  }
}

function snapshot(
  state: LandrushZombieEscapeCollisionWorldBuildState<Worlds>,
  overrides: Partial<
    Parameters<typeof createLandrushZombieEscapeNavigationReadiness<World>>[0]
  > = {},
) {
  return createLandrushZombieEscapeNavigationReadiness({
    ...scope,
    currentBuild: true,
    error: null,
    generation: 1,
    installedCombatWorld: state.worlds?.combat ?? null,
    installedNavigationWorld: state.worlds?.navigation ?? null,
    requestedSignature: 'current',
    state,
    ...overrides,
  })
}

function ready(status: LandrushZombieEscapeNavigationReadiness | null) {
  return resolveLandrushZombieEscapeNavigationReady({
    ...scope,
    admitted: true,
    enabled: true,
    status,
  })
}

describe('installed Zombie navigation readiness', () => {
  test('does not finish a cold load when every other task is ready but navigation is pending', () => {
    const initial = snapshot(createLandrushZombieEscapeCollisionWorldBuildState<Worlds>())
    expect(initial.status).toBe('pending')
    expect(initial.error).toBeNull()
    expect(ready(initial)).toBe(false)
    expect(ready(null)).toBe(false)
    expect([true, true, true, ready(initial)].every(Boolean)).toBe(false)
  })

  test('requires both exact source objects to be installed after worker completion', () => {
    const state = readyState()
    expect(
      ready(snapshot(state, { installedCombatWorld: null, installedNavigationWorld: null })),
    ).toBe(false)
    expect(ready(snapshot(state, { installedCombatWorld: null }))).toBe(false)
    expect(
      ready(snapshot(state, { installedNavigationWorld: { name: 'current:navigation' } })),
    ).toBe(false)
    expect(ready(snapshot(state, { installedCombatWorld: { name: 'current:combat' } }))).toBe(false)
    const installed = snapshot(state)
    expect(installed.status).toBe('ready')
    expect(installed.installedSignature).toBe('current')
    expect(ready(installed)).toBe(true)
  })

  test('rejects stale signatures, pending replacements, and replaced coordinator ownership', () => {
    const state = readyState()
    for (const report of [
      snapshot(state, { requestedSignature: 'new' }),
      snapshot({ ...state, pendingSignature: 'new' }),
      snapshot({ ...state, ready: false, pendingSignature: 'current' }),
      snapshot(state, { currentBuild: false }),
      snapshot({ ...state, worlds: null }),
    ]) {
      expect(ready(report)).toBe(false)
      expect(report.installedSignature).toBeNull()
      expect(report.status).toBe('pending')
    }
  })

  test('a failed installation never grants readiness even if it partially assigned the sources', () => {
    const failed = snapshot(readyState(), { error: 'Invalid sparse navigation world' })
    expect(failed.status).toBe('failed')
    expect(failed.error).toBe('Invalid sparse navigation world')
    expect(failed.installedSignature).toBeNull()
    expect(ready(failed)).toBe(false)
  })

  test('blocks post-handoff gameplay after a partial installation failure and recovers after a successful install', () => {
    const state = readyState()
    const bundle = state.worlds!
    const installed = (error: string | null, navigation = bundle.navigation) =>
      isLandrushZombieEscapeCollisionWorldInstalled({
        error,
        installedCombatWorld: bundle.combat,
        installedNavigationWorld: navigation,
        worlds: bundle,
      })
    for (const expectedPhase of ['build', 'night'] as const) {
      const phaseReady = resolveLandrushZombieEscapeCollisionWorldPhaseReady({
        desiredSignature: 'current',
        expectedPhase,
        phaseReady: true,
        state,
      })
      expect(phaseReady).toBe(true)
      expect(phaseReady && installed('installation failed')).toBe(false)
      expect(phaseReady && installed(null, { name: 'stale' })).toBe(false)
      expect(phaseReady && installed(null)).toBe(true)
    }
    const pending = { ...state, pendingSignature: 'replacement', ready: false }
    expect(
      installed(null) &&
        resolveLandrushZombieEscapeCollisionWorldPhaseReady({
          desiredSignature: 'replacement',
          expectedPhase: 'build',
          phaseReady: true,
          state: pending,
        }),
    ).toBe(true)
    expect(
      installed(null) &&
        resolveLandrushZombieEscapeCollisionWorldPhaseReady({
          desiredSignature: 'replacement',
          expectedPhase: 'night',
          phaseReady: true,
          state: pending,
        }),
    ).toBe(false)
    expect(
      isLandrushZombieEscapeCollisionWorldInstalled({
        error: null,
        installedCombatWorld: null,
        installedNavigationWorld: null,
        worlds: null,
      }),
    ).toBe(false)
  })

  test('only bypasses the gate for non-Zombie mode and still requires authority admission', () => {
    expect(
      resolveLandrushZombieEscapeNavigationReady({
        ...scope,
        admitted: false,
        enabled: false,
        status: null,
      }),
    ).toBe(true)
    expect(
      resolveLandrushZombieEscapeNavigationReady({
        ...scope,
        admitted: false,
        enabled: true,
        status: snapshot(readyState()),
      }),
    ).toBe(false)
    expect(
      resolveLandrushZombieEscapeNavigationReady({
        ...scope,
        admitted: true,
        enabled: true,
        status: {
          ...snapshot(readyState()),
          installedSignature: 'different',
        },
      }),
    ).toBe(false)
  })

  test('rejects old authority, mount, and out-of-order report generations', () => {
    const current = snapshot(readyState(), { generation: 10 })
    for (const reported of [
      { ...current, authorityKey: 'old', generation: 99 },
      { ...current, mountGeneration: 'old', generation: 99 },
      { ...current, generation: 9, status: 'pending' as const },
      { ...current, generation: 10, status: 'pending' as const },
    ]) {
      expect(
        reconcileLandrushZombieEscapeNavigationReadiness({ ...scope, current, reported }),
      ).toBe(current)
    }
    expect(ready({ ...current, authorityKey: 'old' })).toBe(false)
    expect(ready({ ...current, mountGeneration: 'old' })).toBe(false)
    const next = {
      ...current,
      generation: 11,
      installedSignature: null,
      status: 'pending' as const,
    }
    expect(
      reconcileLandrushZombieEscapeNavigationReadiness({ ...scope, current, reported: next }),
    ).toBe(next)
    const newScope = { ...scope, mountGeneration: 'zombie-assets:2' }
    const remounted = { ...next, ...newScope, generation: 1 }
    expect(
      reconcileLandrushZombieEscapeNavigationReadiness({
        ...newScope,
        current,
        reported: remounted,
      }),
    ).toBe(remounted)
  })

  test('accepts a fresh coordinator after cleanup without reusing its reset build counter as report generation', () => {
    const first = snapshot({ ...readyState(), generation: 20 }, { generation: 40 })
    const cleanup = {
      ...first,
      generation: 41,
      installedSignature: null,
      status: 'pending' as const,
    }
    let current = reconcileLandrushZombieEscapeNavigationReadiness({
      ...scope,
      current: first,
      reported: cleanup,
    })
    expect(ready(current)).toBe(false)
    current = reconcileLandrushZombieEscapeNavigationReadiness({
      ...scope,
      current,
      reported: first,
    })
    expect(current).toBe(cleanup)
    const restarted = snapshot(readyState(worlds('restarted')), { generation: 42 })
    expect(restarted.generation).toBeGreaterThan(first.generation)
    current = reconcileLandrushZombieEscapeNavigationReadiness({
      ...scope,
      current,
      reported: restarted,
    })
    expect(current).toBe(restarted)
    expect(ready(current)).toBe(true)
  })

  test('waits for a genuinely delayed worker, then still waits for installation', async () => {
    const schedule = createSchedule()
    const pending = deferred<Worlds>()
    let state = createLandrushZombieEscapeCollisionWorldBuildState<Worlds>()
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: () => pending.promise,
      host: schedule.host,
      onStateChange: (next) => {
        state = next
      },
      resolveSignature: (input: string) => input,
    })
    coordinator.request('current', 'background')
    schedule.runNext()
    for (let unrelatedCompletedTask = 0; unrelatedCompletedTask < 12; unrelatedCompletedTask += 1) {
      expect(ready(snapshot(state))).toBe(false)
    }
    const bundle = worlds()
    pending.resolve(bundle)
    await flush()
    expect(state.ready).toBe(true)
    expect(
      ready(snapshot(state, { installedCombatWorld: null, installedNavigationWorld: null })),
    ).toBe(false)
    expect(
      ready(
        snapshot(state, {
          installedCombatWorld: bundle.combat,
          installedNavigationWorld: bundle.navigation,
        }),
      ),
    ).toBe(true)
    coordinator.dispose()
  })

  test('a stale worker completion cannot satisfy a newer requested world', async () => {
    const schedule = createSchedule()
    const first = deferred<Worlds>()
    const second = deferred<Worlds>()
    let state = createLandrushZombieEscapeCollisionWorldBuildState<Worlds>()
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: (input: string) => (input === 'old' ? first.promise : second.promise),
      host: schedule.host,
      onStateChange: (next) => {
        state = next
      },
      resolveSignature: (input: string) => input,
    })
    coordinator.request('old', 'urgent')
    schedule.runNext()
    coordinator.request('current', 'urgent')
    schedule.runNext()
    first.resolve(worlds('old'))
    await flush()
    expect(state.pendingSignature).toBe('current')
    expect(ready(snapshot(state))).toBe(false)
    second.resolve(worlds())
    await flush()
    expect(ready(snapshot(state))).toBe(true)
    coordinator.dispose()
  })

  test('exhausted worker failure is explicit and a new retry can become ready', async () => {
    const schedule = createSchedule()
    let state = createLandrushZombieEscapeCollisionWorldBuildState<Worlds>()
    let error: string | null = null
    const failedCoordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: () => {
        throw new Error('worker unavailable')
      },
      host: schedule.host,
      onError: (cause) => {
        error = (cause as Error).message
      },
      onStateChange: (next) => {
        state = next
      },
      resolveSignature: (input: string) => input,
      retryDelaysMs: [],
    })
    failedCoordinator.request('current', 'urgent')
    schedule.runNext()
    const failed = snapshot(state, { error, generation: 5 })
    expect(failed.status).toBe('failed')
    expect(failed.error).toBe('worker unavailable')
    expect(ready(failed)).toBe(false)
    failedCoordinator.dispose()

    const pending = deferred<Worlds>()
    const retryCoordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: () => pending.promise,
      host: schedule.host,
      onStateChange: (next) => {
        state = next
      },
      resolveSignature: (input: string) => input,
    })
    retryCoordinator.request('current', 'urgent')
    schedule.runNext()
    const retry = snapshot(state, { generation: 6 })
    expect(retry.status).toBe('pending')
    expect(ready(retry)).toBe(false)
    pending.resolve(worlds('retry'))
    await flush()
    const completed = snapshot(state, { generation: 7 })
    expect(state.generation).toBe(1)
    expect(
      ready(
        reconcileLandrushZombieEscapeNavigationReadiness({
          ...scope,
          current: failed,
          reported: completed,
        }),
      ),
    ).toBe(true)
    retryCoordinator.dispose()
  })

  test('a timed-out worker remains a visible failure instead of granting readiness', () => {
    const schedule = createSchedule()
    let state = createLandrushZombieEscapeCollisionWorldBuildState<Worlds>()
    const coordinator = createLandrushZombieEscapeCollisionWorldBuildCoordinator({
      compile: () => new Promise<Worlds>(() => {}),
      executionTimeoutMs: 10,
      host: schedule.host,
      onStateChange: (next) => {
        state = next
      },
      resolveSignature: (input: string) => input,
    })
    coordinator.request('current', 'urgent')
    schedule.runNext()
    schedule.runNext()
    expect(snapshot(state).status).toBe('failed')
    expect(ready(snapshot(state))).toBe(false)
    coordinator.dispose()
  })

  test('keeps recovery above both loading shells through failure, retry, and success', () => {
    const normal = {
      generatedAssetFailureCount: 0,
      generatedAssetsRetrying: false,
      navigationError: null,
      navigationRetrying: false,
    }
    const failed = resolveLandrushZombieEscapeRecoveryPresentation({
      ...normal,
      navigationError: 'failed',
    })
    expect(failed).toEqual({ retrying: false, visible: true, zIndex: '240' })
    expect(Number(failed.zIndex)).toBeGreaterThan(230)
    const retrying = resolveLandrushZombieEscapeRecoveryPresentation({
      ...normal,
      navigationRetrying: true,
    })
    expect(retrying).toEqual({ retrying: true, visible: true, zIndex: '240' })
    expect(
      resolveLandrushZombieEscapeRecoveryPresentation({ ...normal, generatedAssetFailureCount: 1 })
        .visible,
    ).toBe(true)
    expect(
      resolveLandrushZombieEscapeRecoveryPresentation({ ...normal, generatedAssetsRetrying: true })
        .zIndex,
    ).toBe('240')
    expect(resolveLandrushZombieEscapeRecoveryPresentation(normal)).toEqual({
      retrying: false,
      visible: false,
      zIndex: '120',
    })
  })

  test('wires reports after installation and keeps recovery independent of loader and phase readiness', () => {
    const source = readFileSync(
      new URL('./landrush-zombie-escape-mode.tsx', import.meta.url),
      'utf8',
    )
    const portalSource = readFileSync(
      new URL('../../lib/zombie-escape-hud-portal.tsx', import.meta.url),
      'utf8',
    )
    const installation = source.indexOf(
      'setZombieEscapeCollisionWorld(simulation, collisionWorlds.navigation, collisionWorlds.combat)',
    )
    const report = source.indexOf(
      'const readiness = createLandrushZombieEscapeNavigationReadiness({',
    )
    expect(installation).toBeGreaterThan(0)
    expect(report).toBeGreaterThan(installation)
    expect(source.slice(installation, report)).toContain(
      'collisionWorldInstallationFailureRef.current = { error: message, worlds: collisionWorlds }',
    )
    const reportEffect = source.slice(
      report,
      source.indexOf('synchronizeZombieEscapePassableObstacleIds(', report),
    )
    expect(reportEffect).not.toContain('phaseReady')
    expect(reportEffect).not.toContain('nightStartReady')
    expect(reportEffect).not.toContain('loadingActive')
    expect(reportEffect).toContain('owner.retryGeneration === generatedAssetRetryGeneration')
    expect(reportEffect).toContain('owner.state === collisionWorldBuildState')
    expect(reportEffect).toContain(
      'installationFailure?.worlds === collisionWorldBuildState.worlds',
    )
    expect(reportEffect.match(/\+\+collisionWorldReadinessGenerationRef.current/g)).toHaveLength(2)
    expect(source).toContain('if (collisionWorldBuildOwnerRef.current !== owner) return')
    expect(source).toContain(
      'const hudPortalZIndex = resolveLandrushZombieEscapeRecoveryPresentation({',
    )
    expect(source).toMatch(
      /publishLandrushZombieEscapeHudPortal\(\{[\s\S]*?zIndex: hudPortalZIndex,[\s\S]*?\}\)/,
    )
    expect(portalSource).toContain('zIndex: entry.zIndex,')
    expect(source).toContain('data-testid="landrush-zombie-escape-loading-recovery"')
    expect(source).toContain('disabled={recovery.retrying}')
    expect(source).toContain('navigationError={collisionWorldBuildError}')
    expect(source).toContain('navigationRetrying={collisionWorldRetrying}')
    expect(source).toContain('setInstalledCollisionWorlds(collisionWorlds)')
    expect(source).toContain('setInstalledCollisionWorlds(null)')
    expect(source).toMatch(/const runtimePhaseReady =\s*collisionWorldInstalled &&/)
    const nightStartReadiness = source.slice(
      source.indexOf('const nightStartCandidateReady ='),
      source.indexOf('const interactionActionable ='),
    )
    expect(nightStartReadiness).toContain(
      'phaseReady && desiredCollisionWorldReady && collisionWorldInstalled',
    )
    expect(nightStartReadiness).toContain(
      'const resolvedNightStartReadiness = reconcileLandrushZombieEscapeNightStartReadiness({',
    )
    expect(nightStartReadiness).toContain('candidateReady: nightStartCandidateReady')
    expect(nightStartReadiness).toContain('setNightStartReadiness((current) =>')
    expect(nightStartReadiness).toContain(
      'const sharedNightStartReady = resolvedNightStartReadiness.ready',
    )
    const startHandler = source.slice(
      source.indexOf('const startZombie = useCallback(() => {'),
      source.indexOf('const renderHud = useCallback(', source.indexOf('const startZombie =')),
    )
    expect(startHandler).toContain('!sharedNightStartReady')
    expect(startHandler).toContain('phaseReady: sharedNightStartReady')
    expect(startHandler).not.toContain('nightStartCandidateReady')
    expect(startHandler).not.toContain('collisionWorldInstalled')
    expect(startHandler).not.toContain('isCurrentCollisionWorldInstalled()')
    expect(source).toContain('const frameRuntimePhaseReady = runtimePhaseReady && installed')
    expect(source).toContain(
      'const frameInteractionActionable = interactionActionable && installed',
    )
    const retry = source.slice(
      source.indexOf('const beginGeneratedAssetsRetry ='),
      source.indexOf('const retryGeneratedAssets ='),
    )
    expect(retry).toContain('setCollisionWorldRetrying(true)')
    expect(retry).toContain('collisionWorldBuildCoordinatorRef.current?.dispose()')
    expect(retry).toContain('setGeneratedAssetRetryGeneration((generation) => generation + 1)')
    expect(retry).toContain('failures.map((failure) => failure.key)')
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((finish) => {
    resolve = finish
  })
  return { promise, resolve }
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
}

function createSchedule() {
  let nextId = 0
  const tasks = new Map<number, () => void>()
  const host: LandrushZombieEscapeCollisionWorldBuildScheduleHost = {
    clearTimeout: (id) => {
      tasks.delete(id)
    },
    setTimeout: (callback) => {
      const id = ++nextId
      tasks.set(id, callback)
      return id
    },
  }
  return {
    host,
    runNext: () => {
      const task = tasks.entries().next().value
      if (!task) throw new Error('No scheduled build task')
      tasks.delete(task[0])
      task[1]()
    },
  }
}
