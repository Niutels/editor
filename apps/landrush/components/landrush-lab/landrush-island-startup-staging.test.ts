import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  advanceLandrushIslandZombieStartupState,
  canAdvanceLandrushIslandZombieStartupLifecycle,
  canTerminateLandrushIslandZombieStartupLifecycle,
  createLandrushIslandZombieStartupState,
  LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MAXIMUM_ATTEMPTS,
  LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MAXIMUM_SUBMISSIONS,
  LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MAXIMUM_WAIT_MS,
  LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MINIMUM_SUBMISSIONS,
  LANDRUSH_ISLAND_ZOMBIE_STARTUP_TERMINAL_DEADLINE_MS,
  reconcileLandrushIslandZombieStartupLifecycle,
  resolveLandrushIslandZombieScenePrimeAction,
  resolveLandrushIslandZombieStartupGates,
} from './landrush-island-startup-staging'

describe('Landrush island Zombie startup staging', () => {
  test('keeps every runtime gate closed through scene prime and fade', () => {
    const critical = createLandrushIslandZombieStartupState()
    const prime = advanceLandrushIslandZombieStartupState(critical, 'critical-ready')
    const fade = advanceLandrushIslandZombieStartupState(prime, 'scene-prime-ready')

    expect(critical).toEqual({ admission: 'blocked', phase: 'critical-loading' })
    expect(prime).toEqual({ admission: 'blocked', phase: 'scene-prime' })
    expect(fade).toEqual({ admission: 'blocked', phase: 'fade' })
    expect(resolveLandrushIslandZombieStartupGates(critical)).toEqual({
      ambientLifeAdmitted: false,
      colliderRebuildAdmitted: false,
      coreGameplayAdmitted: false,
      cosmeticAssetsAdmitted: false,
      deferredRuntimeAdmitted: false,
      loadingOverlayVisible: true,
      sceneDrawDisabled: true,
    })
    for (const visibleState of [prime, fade]) {
      expect(resolveLandrushIslandZombieStartupGates(visibleState)).toEqual({
        ambientLifeAdmitted: false,
        colliderRebuildAdmitted: false,
        coreGameplayAdmitted: false,
        cosmeticAssetsAdmitted: false,
        deferredRuntimeAdmitted: false,
        loadingOverlayVisible: true,
        sceneDrawDisabled: false,
      })
    }
    const renderError = advanceLandrushIslandZombieStartupState(prime, 'scene-prime-failed')
    expect(resolveLandrushIslandZombieStartupGates(renderError)).toEqual({
      ambientLifeAdmitted: false,
      colliderRebuildAdmitted: false,
      coreGameplayAdmitted: false,
      cosmeticAssetsAdmitted: false,
      deferredRuntimeAdmitted: false,
      loadingOverlayVisible: true,
      sceneDrawDisabled: true,
    })
  })

  test('admits live work in separate ordered transitions', () => {
    let state = createLandrushIslandZombieStartupState()
    for (const event of ['critical-ready', 'scene-prime-ready', 'fade-finished'] as const) {
      state = advanceLandrushIslandZombieStartupState(state, event)
    }
    expect(resolveLandrushIslandZombieStartupGates(state)).toEqual({
      ambientLifeAdmitted: false,
      colliderRebuildAdmitted: false,
      coreGameplayAdmitted: true,
      cosmeticAssetsAdmitted: false,
      deferredRuntimeAdmitted: false,
      loadingOverlayVisible: false,
      sceneDrawDisabled: false,
    })

    state = advanceLandrushIslandZombieStartupState(state, 'admit-collider')
    expect(resolveLandrushIslandZombieStartupGates(state).colliderRebuildAdmitted).toBe(true)
    expect(resolveLandrushIslandZombieStartupGates(state).ambientLifeAdmitted).toBe(false)
    state = advanceLandrushIslandZombieStartupState(state, 'admit-ambient')
    expect(resolveLandrushIslandZombieStartupGates(state).ambientLifeAdmitted).toBe(true)
    expect(resolveLandrushIslandZombieStartupGates(state).deferredRuntimeAdmitted).toBe(false)
    state = advanceLandrushIslandZombieStartupState(state, 'admit-deferred')
    expect(resolveLandrushIslandZombieStartupGates(state).deferredRuntimeAdmitted).toBe(true)
    expect(resolveLandrushIslandZombieStartupGates(state).cosmeticAssetsAdmitted).toBe(false)
    state = advanceLandrushIslandZombieStartupState(state, 'admit-cosmetics')
    expect(resolveLandrushIslandZombieStartupGates(state).cosmeticAssetsAdmitted).toBe(true)
  })

  test('requires successful real-scene submissions and a settled GPU fence', () => {
    expect(
      resolveLandrushIslandZombieScenePrimeAction({
        attempts: 0,
        elapsedMs: 0,
        fenceStatus: 'settled',
        successfulSubmissions: 0,
      }),
    ).toBe('wait')
    for (const fenceStatus of ['unavailable', 'failed'] as const) {
      expect(
        resolveLandrushIslandZombieScenePrimeAction({
          attempts: 0,
          elapsedMs: 0,
          fenceStatus,
          successfulSubmissions: 0,
        }),
      ).toBe('fail')
    }
    expect(
      resolveLandrushIslandZombieScenePrimeAction({
        attempts: LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MINIMUM_SUBMISSIONS - 1,
        elapsedMs: 0,
        fenceStatus: 'unavailable',
        successfulSubmissions: LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MINIMUM_SUBMISSIONS - 1,
      }),
    ).toBe('fail')
    expect(
      resolveLandrushIslandZombieScenePrimeAction({
        attempts: LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MINIMUM_SUBMISSIONS,
        elapsedMs: 0,
        fenceStatus: 'missing',
        successfulSubmissions: LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MINIMUM_SUBMISSIONS,
      }),
    ).toBe('insert-fence')
    expect(
      resolveLandrushIslandZombieScenePrimeAction({
        attempts: LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MINIMUM_SUBMISSIONS + 1,
        elapsedMs: 0,
        fenceStatus: 'pending',
        successfulSubmissions: LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MINIMUM_SUBMISSIONS + 1,
      }),
    ).toBe('wait')
    expect(
      resolveLandrushIslandZombieScenePrimeAction({
        attempts: LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MINIMUM_SUBMISSIONS + 1,
        elapsedMs: 0,
        fenceStatus: 'settled',
        successfulSubmissions: LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MINIMUM_SUBMISSIONS + 1,
      }),
    ).toBe('settle')
    for (const fenceStatus of ['missing', 'pending', 'failed', 'unavailable'] as const) {
      expect(
        resolveLandrushIslandZombieScenePrimeAction({
          attempts: LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MAXIMUM_SUBMISSIONS,
          elapsedMs: 0,
          fenceStatus,
          successfulSubmissions: LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MAXIMUM_SUBMISSIONS,
        }),
      ).toBe('fail')
    }
  })

  test('turns repeated render failures or a wall-clock stall into a terminal error, never live', () => {
    for (const bounds of [
      {
        attempts: LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MAXIMUM_ATTEMPTS,
        elapsedMs: 1,
      },
      {
        attempts: 0,
        elapsedMs: LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MAXIMUM_WAIT_MS,
      },
    ]) {
      expect(
        resolveLandrushIslandZombieScenePrimeAction({
          ...bounds,
          fenceStatus: 'failed',
          successfulSubmissions: 0,
        }),
      ).toBe('fail')
    }

    const prime = advanceLandrushIslandZombieStartupState(
      advanceLandrushIslandZombieStartupState(
        createLandrushIslandZombieStartupState(),
        'critical-ready',
      ),
      'scene-prime-failed',
    )
    expect(prime).toEqual({ admission: 'blocked', phase: 'render-error' })
    expect(advanceLandrushIslandZombieStartupState(prime, 'scene-prime-ready')).toBe(prime)
    expect(advanceLandrushIslandZombieStartupState(prime, 'fade-finished')).toBe(prime)
    expect(resolveLandrushIslandZombieStartupGates(prime).coreGameplayAdmitted).toBe(false)
  })

  test('lets renderer failure and the outer deadline terminate every visible startup phase', () => {
    const critical = createLandrushIslandZombieStartupState()
    const prime = advanceLandrushIslandZombieStartupState(critical, 'critical-ready')
    const fade = advanceLandrushIslandZombieStartupState(prime, 'scene-prime-ready')
    for (const state of [critical, prime, fade]) {
      expect(advanceLandrushIslandZombieStartupState(state, 'startup-failed')).toEqual({
        admission: 'blocked',
        phase: 'render-error',
      })
    }

    const live = advanceLandrushIslandZombieStartupState(fade, 'fade-finished')
    expect(advanceLandrushIslandZombieStartupState(live, 'startup-failed')).toBe(live)
    expect(LANDRUSH_ISLAND_ZOMBIE_STARTUP_TERMINAL_DEADLINE_MS).toBe(110_000)
    expect(LANDRUSH_ISLAND_ZOMBIE_STARTUP_TERMINAL_DEADLINE_MS).toBeLessThan(120_000)
  })

  test('still settles normally after four successful submissions', () => {
    expect(
      resolveLandrushIslandZombieScenePrimeAction({
        attempts: LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MINIMUM_SUBMISSIONS,
        elapsedMs: 32,
        fenceStatus: 'settled',
        successfulSubmissions: LANDRUSH_ISLAND_ZOMBIE_SCENE_PRIME_MINIMUM_SUBMISSIONS,
      }),
    ).toBe('settle')
  })

  test('invalidates every stale callback generation across mode, authority, run, and retry resets', () => {
    let reconciliation = reconcileLandrushIslandZombieStartupLifecycle({
      authorityKey: 'authority:a',
      current: null,
      enabled: true,
      readinessReady: false,
      runKey: 'run:a',
    })
    expect(reconciliation.reset).toBe(false)
    expect(reconciliation.lifecycle.generation).toBe(0)

    reconciliation = reconcileLandrushIslandZombieStartupLifecycle({
      authorityKey: 'authority:a',
      current: reconciliation.lifecycle,
      enabled: true,
      readinessReady: true,
      runKey: 'run:a',
    })
    expect(reconciliation.reset).toBe(false)
    expect(canAdvanceLandrushIslandZombieStartupLifecycle(reconciliation.lifecycle, 0)).toBe(true)
    expect(canTerminateLandrushIslandZombieStartupLifecycle(reconciliation.lifecycle, 0)).toBe(true)

    for (const next of [
      { authorityKey: 'authority:a', enabled: true, readinessReady: false, runKey: 'run:a' },
      { authorityKey: 'authority:b', enabled: true, readinessReady: true, runKey: 'run:a' },
      { authorityKey: 'authority:b', enabled: true, readinessReady: true, runKey: 'run:b' },
      { authorityKey: 'authority:b', enabled: false, readinessReady: true, runKey: 'run:b' },
      { authorityKey: 'authority:b', enabled: true, readinessReady: true, runKey: 'run:b' },
    ] as const) {
      const staleGeneration = reconciliation.lifecycle.generation
      reconciliation = reconcileLandrushIslandZombieStartupLifecycle({
        ...next,
        current: reconciliation.lifecycle,
      })
      expect(reconciliation.reset).toBe(true)
      expect(
        canAdvanceLandrushIslandZombieStartupLifecycle(reconciliation.lifecycle, staleGeneration),
      ).toBe(false)
    }
  })

  test('does not perturb the dormant Zombie lifecycle while Day readiness changes', () => {
    const disabled = reconcileLandrushIslandZombieStartupLifecycle({
      authorityKey: 'authority:a',
      current: null,
      enabled: false,
      readinessReady: true,
      runKey: 'day:a',
    }).lifecycle
    const dayWithdrawal = reconcileLandrushIslandZombieStartupLifecycle({
      authorityKey: 'authority:b',
      current: disabled,
      enabled: false,
      readinessReady: false,
      runKey: 'day:b',
    })

    expect(dayWithdrawal.reset).toBe(false)
    expect(dayWithdrawal.lifecycle.generation).toBe(disabled.generation)
    expect(canAdvanceLandrushIslandZombieStartupLifecycle(dayWithdrawal.lifecycle, 0)).toBe(false)
    expect(canAdvanceLandrushIslandZombieStartupLifecycle(null, 0)).toBe(false)
  })

  test('wires the Zombie-only renderer, opaque shell, and cosmetic admission path', () => {
    const client = readFileSync(new URL('./landrush-island-client.tsx', import.meta.url), 'utf8')
    const mode = readFileSync(new URL('./landrush-zombie-escape-mode.tsx', import.meta.url), 'utf8')
    const actors = readFileSync(new URL('./zombie-escape-actors.tsx', import.meta.url), 'utf8')
    const globalCss = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')

    expect(client).toContain('antialias={!zombieEscapeEnabled}')
    expect(client).toContain('sceneDrawDisabledKeepalive={!zombieEscapeEnabled}')
    expect(client).toContain("rendererBackend={zombieEscapeEnabled ? 'webgl' : undefined}")
    expect(client).toContain(
      'zombieEscapeEnabled ? handleZombieRendererInitializationFailure : undefined',
    )
    expect(client).toContain('zombieEscapeEnabled ? null : (')
    expect(client).toContain(
      'presentationEffectRef={zombieEscapeEnabled ? undefined : viewerPresentationEffectRef}',
    )
    expect(client).toContain("id: 'zombie-scene-prime'")
    expect(client).toContain('bg-[#0f1720]')
    expect(client).toContain('cosmeticAssetsAdmitted={cosmeticAssetsAdmitted}')
    expect(client).toContain('key={loadingOverlayKey}')
    expect(client).toContain(
      'handoffFadeMs={zombieEscapeEnabled ? 0 : LANDRUSH_ISLAND_LOADING_HANDOFF_FADE_MS}',
    )
    expect(client).toContain('lifecycleGeneration={zombieStartupLifecycleGeneration}')
    expect(client).toMatch(
      /sceneDrawSubmissionRef=\{\s*zombieEscapeEnabled \? sceneDrawSubmissionRef : undefined\s*\}/,
    )
    expect(client).toContain('sceneDrawSubmissionRef={sceneDrawSubmissionRef}')
    expect(client).toContain('queue.onSubmittedWorkDone()')
    expect(client).toContain('context.fenceSync(context.SYNC_GPU_COMMANDS_COMPLETE, 0)')
    expect(client).toMatch(/zombieEscapeEnabled \? \(\s*<LandrushIslandZombieScenePrimeReporter/)
    expect(client).toContain('LANDRUSH_ISLAND_ZOMBIE_STARTUP_TERMINAL_DEADLINE_MS')
    expect(client).toContain('zombieStartupDeadlineStartedAtRef.current ??= now')
    expect(client).not.toContain(
      'zombieStartupDeadlineRef.current?.generation !== zombieStartupLifecycleGeneration',
    )
    expect(client).toMatch(/current\.successfulSubmissions\s*-\s*baseline\.successfulSubmissions/)
    expect(client).toContain("terminateZombieStartup('scene-prime-failed', expectedGeneration)")
    expect(client).toContain('data-landrush-zombie-render-error')
    expect(client).not.toContain('renderedFramesRef.current += 1')
    expect(client).toContain('cancelZombieStartupAdmissions()')
    expect(client).toContain('zombieStartupLifecycleRef.current = null')
    expect(mode).toContain('cosmeticAssetsAdmitted={cosmeticAssetsAdmitted}')
    expect(actors).toContain('cosmeticAssetsAdmitted={cosmeticAssetsAdmitted}')
    expect(globalCss).not.toContain('body:has([data-landrush-island-world-frame-ready])')
    expect(globalCss).not.toContain('background-color 500ms ease-out')
  })
})
