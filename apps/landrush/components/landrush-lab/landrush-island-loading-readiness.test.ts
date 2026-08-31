import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  createLandrushIslandLoadingProgressController,
  LANDRUSH_ISLAND_LOADING_RESPONSE_MS,
} from './landrush-island-loading-progress-controller'
import {
  advanceLandrushGeneratedAssetMountGeneration,
  createLandrushInitialParcelAuthorityKey,
  createLandrushIslandLoadingHandoffGate,
  createLandrushIslandPaintReadinessGate,
  reconcileLandrushGeneratedAssetReadinessStatus,
  resolveLandrushAuthorityResyncActive,
  resolveLandrushGeneratedAssetsReady,
  resolveLandrushInitialParcelMaterializationReadiness,
  shouldPersistLandrushIslandOfflineState,
  wasLandrushInitialParcelAuthorityMaterialized,
} from './landrush-island-loading-readiness'
import {
  LANDRUSH_ISLAND_LOADING_SHELL_INITIAL_PROGRESS,
  LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS,
  STREAMED_SHELL_VELOCITY_PER_SECOND,
} from './landrush-island-loading-shell-bootstrap'
import {
  createLandrushIslandLoadingCompletionGate,
  LANDRUSH_ISLAND_LOADING_COMPLETION_DEADLINE_MS,
  LANDRUSH_ISLAND_LOADING_MAXIMUM_APP_PRESENTATION_GAP_MS,
} from './landrush-island-loading-timeline-react'
import {
  type LandrushZombieEscapeNavigationReadiness,
  reconcileLandrushZombieEscapeNavigationReadiness,
  resolveLandrushZombieEscapeNavigationReady,
} from './landrush-zombie-escape-navigation-readiness'

function createFrameScheduler() {
  let nextId = 1
  const callbacks = new Map<number, FrameRequestCallback>()

  return {
    flushFrame() {
      const pending = [...callbacks.entries()]
      callbacks.clear()
      for (const [, callback] of pending) callback(0)
    },
    pendingCount() {
      return callbacks.size
    },
    scheduler: {
      cancelFrame(frameId: number) {
        callbacks.delete(frameId)
      },
      requestFrame(callback: FrameRequestCallback) {
        const frameId = nextId
        nextId += 1
        callbacks.set(frameId, callback)
        return frameId
      },
    },
  }
}

function createTimeoutScheduler() {
  let nextId = 1
  const callbacks = new Map<number, () => void>()

  return {
    flush() {
      const pending = [...callbacks.values()]
      callbacks.clear()
      for (const callback of pending) callback()
    },
    pendingCount() {
      return callbacks.size
    },
    scheduler: {
      clearTimeout(timeoutId: number) {
        callbacks.delete(timeoutId)
      },
      setTimeout(callback: () => void) {
        const timeoutId = nextId
        nextId += 1
        callbacks.set(timeoutId, callback)
        return timeoutId
      },
    },
  }
}

describe('Landrush island paint readiness', () => {
  test('hydrates cached parcel authority only in explicit non-clean offline mode', () => {
    expect(shouldPersistLandrushIslandOfflineState({ clean: false, offline: true })).toBe(true)
    expect(shouldPersistLandrushIslandOfflineState({ clean: true, offline: true })).toBe(false)
    expect(shouldPersistLandrushIslandOfflineState({ clean: false, offline: false })).toBe(false)
    expect(shouldPersistLandrushIslandOfflineState({ clean: true, offline: false })).toBe(false)
  })

  test('requires the matching authoritative parcel snapshot and every terminal update', () => {
    const updates = [
      { parcelId: 'parcel-a', sequence: 2, worldId: 'world-a' },
      { parcelId: 'parcel-b', sequence: 4, worldId: 'world-a' },
    ]
    const applied = new Map([
      ['parcel-a', 2],
      ['parcel-b', 3],
    ])
    const resolve = (snapshotWorldId: string | null) =>
      resolveLandrushInitialParcelMaterializationReadiness({
        appliedSequenceForUpdate: (update) => applied.get(update.parcelId) ?? 0,
        authorityEpoch: 7,
        snapshotWorldId,
        updates,
        worldId: 'world-a',
      })

    expect(resolve('world-b').ready).toBe(false)
    expect(resolve('world-a').ready).toBe(false)
    applied.set('parcel-b', 4)
    expect(resolve('world-a')).toEqual({ authorityKey: '7:world-a', ready: true })
  })

  test('accepts an empty matching snapshot and invalidates readiness across authority epochs', () => {
    const readiness = resolveLandrushInitialParcelMaterializationReadiness({
      appliedSequenceForUpdate: () => 0,
      authorityEpoch: 3,
      snapshotWorldId: 'world-a',
      updates: [],
      worldId: 'world-a',
    })

    expect(readiness.ready).toBe(true)
    expect(readiness.authorityKey).not.toBe(createLandrushInitialParcelAuthorityKey(4, 'world-a'))
  })

  test('stays unresolved from online-pending through profile authority until the server snapshot', () => {
    const resolve = (authorityEpoch: number, snapshotWorldId: string | null) =>
      resolveLandrushInitialParcelMaterializationReadiness({
        appliedSequenceForUpdate: () => 0,
        authorityEpoch,
        snapshotWorldId,
        updates: [],
        worldId: 'world-a',
      })

    expect(resolve(1, null)).toEqual({ authorityKey: '1:world-a', ready: false })
    expect(resolve(2, null)).toEqual({ authorityKey: '2:world-a', ready: false })
    expect(resolve(2, 'world-a')).toEqual({ authorityKey: '2:world-a', ready: true })
  })

  test('does not evict a pending authority generation that never materialized', () => {
    expect(
      wasLandrushInitialParcelAuthorityMaterialized({
        authorityEpoch: 1,
        readyAuthorityKey: null,
        worldId: 'world-a',
      }),
    ).toBe(false)
    expect(
      wasLandrushInitialParcelAuthorityMaterialized({
        authorityEpoch: 1,
        readyAuthorityKey: '1:world-a',
        worldId: 'world-a',
      }),
    ).toBe(true)
  })

  test('accepts generated assets only for their current mount generation', () => {
    const currentGeneration = 'assets:2:world-a'
    const ready = reconcileLandrushGeneratedAssetReadinessStatus({
      current: null,
      currentGeneration,
      ready: true,
      reportedGeneration: currentGeneration,
    })
    const afterLateCleanup = reconcileLandrushGeneratedAssetReadinessStatus({
      current: ready,
      currentGeneration,
      ready: false,
      reportedGeneration: 'assets:1:world-a',
    })

    expect(afterLateCleanup).toBe(ready)
    expect(
      resolveLandrushGeneratedAssetsReady({
        enabled: true,
        generation: currentGeneration,
        status: afterLateCleanup,
      }),
    ).toBe(true)
    expect(
      resolveLandrushGeneratedAssetsReady({
        enabled: true,
        generation: 'assets:3:world-a',
        status: afterLateCleanup,
      }),
    ).toBe(false)
  })

  test('advances the generated-asset generation only when its owning mode remounts', () => {
    const mounted = { enabled: true, generation: 4 }

    expect(advanceLandrushGeneratedAssetMountGeneration(mounted, true)).toBe(mounted)
    expect(advanceLandrushGeneratedAssetMountGeneration(mounted, false)).toEqual({
      enabled: false,
      generation: 5,
    })
  })

  test('gives in-place Zombie selection a fresh loader and generated-asset readiness generation', () => {
    const day = { enabled: false, generation: 4 }
    const zombie = advanceLandrushGeneratedAssetMountGeneration(day, true)
    expect(zombie).toEqual({ enabled: true, generation: 5 })
    expect(advanceLandrushGeneratedAssetMountGeneration(zombie, true)).toBe(zombie)
    const exited = advanceLandrushGeneratedAssetMountGeneration(zombie, false)
    const reentered = advanceLandrushGeneratedAssetMountGeneration(exited, true)
    expect(reentered.generation).toBeGreaterThan(zombie.generation)
    expect(
      resolveLandrushGeneratedAssetsReady({
        enabled: true,
        generation: `zombie-assets:${reentered.generation}`,
        status: { generation: `zombie-assets:${zombie.generation}`, ready: true },
      }),
    ).toBe(false)

    const clientSource = readFileSync(
      new URL('./landrush-island-client.tsx', import.meta.url),
      'utf8',
    )
    expect(clientSource).toMatch(
      /useLayoutEffect\(\(\) => \{\s+const previousEnabled = previousLoadingZombieEnabledRef\.current\s+previousLoadingZombieEnabledRef\.current = zombieEscapeEnabled\s+if \(!previousEnabled && zombieEscapeEnabled\) setLoadingActive\(true\)\s+\}, \[zombieEscapeEnabled\]\)/,
    )
    expect(clientSource).toMatch(
      /const loadingRunGeneration = .*LANDRUSH_ISLAND_LOADING_RUN_GENERATION.*zombieEscapeGeneratedAssetMountGenerationRef\.current\.generation/,
    )
    const phaseReadyStart = clientSource.indexOf(
      'const zombieEscapeBasePhaseReady = resolveLandrushZombieEscapePhaseReady({',
    )
    const phaseReadyEnd = clientSource.indexOf('const selectedLevelId = useViewer', phaseReadyStart)
    expect(phaseReadyStart).toBeGreaterThanOrEqual(0)
    expect(phaseReadyEnd).toBeGreaterThan(phaseReadyStart)
    const phaseReadySource = clientSource.slice(phaseReadyStart, phaseReadyEnd)
    expect(phaseReadySource).toContain('loadingActive,')
    expect(phaseReadySource).toContain('generatedAssetsReady: zombieEscapeGeneratedAssetsReady,')
  })

  test('shows a compact resync veil only while a replacement authority is not ready', () => {
    expect(
      resolveLandrushAuthorityResyncActive({
        authorityKey: '2:world-a',
        handedOff: false,
        presentedAuthorityKey: null,
        ready: false,
      }),
    ).toBe(false)
    expect(
      resolveLandrushAuthorityResyncActive({
        authorityKey: '2:world-a',
        handedOff: true,
        presentedAuthorityKey: '2:world-a',
        ready: false,
      }),
    ).toBe(false)
    expect(
      resolveLandrushAuthorityResyncActive({
        authorityKey: '3:world-a',
        handedOff: true,
        presentedAuthorityKey: '2:world-a',
        ready: false,
      }),
    ).toBe(true)
    expect(
      resolveLandrushAuthorityResyncActive({
        authorityKey: '3:world-a',
        handedOff: true,
        presentedAuthorityKey: '2:world-a',
        ready: true,
      }),
    ).toBe(false)
    expect(
      resolveLandrushAuthorityResyncActive({
        authorityKey: '3:world-a',
        handedOff: true,
        presentedAuthorityKey: '3:world-a',
        ready: true,
      }),
    ).toBe(false)
  })

  test('holds paint through missing, mismatched, and failed navigation until a current installation settles', () => {
    const frames = createFrameScheduler()
    const changes: boolean[] = []
    const gate = createLandrushIslandPaintReadinessGate({
      onReadyChange: (ready) => changes.push(ready),
      scheduler: frames.scheduler,
    })
    const scope = { authorityKey: '2:world-a', mountGeneration: 'zombie-assets:5' }
    const pending: LandrushZombieEscapeNavigationReadiness = {
      ...scope,
      error: null,
      generation: 7,
      installedSignature: null,
      requestedSignature: 'world:current',
      status: 'pending',
    }
    let current: LandrushZombieEscapeNavigationReadiness | null = null
    const update = (reported: LandrushZombieEscapeNavigationReadiness) => {
      current = reconcileLandrushZombieEscapeNavigationReadiness({ ...scope, current, reported })
      const ready = resolveLandrushZombieEscapeNavigationReady({
        ...scope,
        admitted: true,
        enabled: true,
        status: current,
      })
      gate.setPrerequisitesReady(ready)
      return ready
    }
    expect(update(pending)).toBe(false)
    expect(
      update({ ...pending, generation: 8, installedSignature: 'world:old', status: 'ready' }),
    ).toBe(false)
    const failure = { ...pending, error: 'Worker failed', generation: 9, status: 'failed' as const }
    expect(update(failure)).toBe(false)
    frames.flushFrame()
    frames.flushFrame()
    expect(changes).toEqual([])
    const retry = { ...pending, generation: 10 }
    expect(update(retry)).toBe(false)
    expect(update({ ...failure, installedSignature: 'world:current', status: 'ready' })).toBe(false)
    expect(current).toEqual(retry)
    expect(
      update({
        ...retry,
        generation: 11,
        installedSignature: 'world:current',
        mountGeneration: 'zombie-assets:4',
        status: 'ready',
      }),
    ).toBe(false)
    expect(
      update({
        ...retry,
        authorityKey: '1:world-a',
        generation: 11,
        installedSignature: 'world:current',
        status: 'ready',
      }),
    ).toBe(false)
    expect(
      update({ ...retry, generation: 11, installedSignature: 'world:current', status: 'ready' }),
    ).toBe(true)
    frames.flushFrame()
    expect(changes).toEqual([])
    frames.flushFrame()
    expect(changes).toEqual([true])
    expect(
      resolveLandrushZombieEscapeNavigationReady({
        ...scope,
        admitted: false,
        enabled: true,
        status: current,
      }),
    ).toBe(false)
    expect(
      resolveLandrushZombieEscapeNavigationReady({
        ...scope,
        admitted: false,
        enabled: false,
        status: null,
      }),
    ).toBe(true)
  })

  test('wires navigation into loading independently of gameplay phase readiness', () => {
    const source = readFileSync(new URL('./landrush-island-client.tsx', import.meta.url), 'utf8')
    const gateStart = source.indexOf('const zombieEscapeNavigationReady =')
    const gateEnd = source.indexOf('const authorityResyncActive =', gateStart)
    expect(gateStart).toBeGreaterThanOrEqual(0)
    expect(gateEnd).toBeGreaterThan(gateStart)
    const navigationGate = source.slice(gateStart, gateEnd)
    expect(navigationGate).toContain('resolveLandrushZombieEscapeNavigationReady({')
    expect(navigationGate).toContain('admitted: authorityPresentationReady,')
    expect(navigationGate).toContain('authorityKey: initialParcelAuthorityKey,')
    expect(navigationGate).toContain('enabled: zombieEscapeEnabled,')
    expect(navigationGate).toContain('mountGeneration: zombieEscapeGeneratedAssetGeneration,')
    expect(navigationGate).not.toContain('loadingActive')
    expect(navigationGate).not.toContain('phaseReady')
    expect(navigationGate).not.toContain('nightStartReady')
    const prerequisiteSource = source.slice(
      source.indexOf('const loadingAssetsReady ='),
      source.indexOf('const loadingPaintReady ='),
    )
    expect(prerequisiteSource).toContain('zombieEscapeNavigationReady &&')
    expect(source).toContain('reconcileLandrushZombieEscapeNavigationReadiness({')
    expect(source).toContain('authorityKey: currentInitialParcelAuthorityKeyRef.current,')
    expect(source).toContain(
      'mountGeneration: currentZombieEscapeGeneratedAssetGenerationRef.current,',
    )
    expect(source).toContain(
      'zombieEscapeNavigationMountGeneration={zombieEscapeGeneratedAssetGeneration}',
    )
    expect(source).toContain('navigationAuthorityKey={colliderAuthorityKey}')
    expect(source).toContain('navigationMountGeneration={zombieEscapeNavigationMountGeneration}')
    expect(source).toContain(
      'onCollisionWorldReadinessChange={onZombieEscapeCollisionWorldReadinessChange}',
    )
    expect(source).toMatch(
      /completed: zombieEscapeNavigationReady \? 1 : 0,\s+id: 'zombie-navigation',\s+ready: zombieEscapeNavigationReady,\s+total: 1/,
    )
    expect(source).toContain('data-landrush-loading-zombie-navigation-ready=')
    expect(source).toContain('data-landrush-loading-zombie-navigation-status=')
    expect(source).toContain('data-landrush-loading-zombie-navigation-error=')
  })

  test('maps partial Zombie pipeline work into a fixed 100-unit task without admitting it early', () => {
    const source = readFileSync(new URL('./landrush-island-client.tsx', import.meta.url), 'utf8')
    const taskIdOffset = source.indexOf("id: 'zombie-pipeline'")
    expect(taskIdOffset).toBeGreaterThanOrEqual(0)
    const pipelineTask = source.slice(
      source.lastIndexOf('{', taskIdOffset),
      source.indexOf('}', taskIdOffset) + 1,
    )

    expect(pipelineTask).toMatch(
      /completed:\s*zombieEscapeGeneratedAssetReadiness\?\.pipelineReady === true\s*\? 100/,
    )
    expect(pipelineTask).toContain('zombieEscapeGeneratedAssetReadiness?.pipelineCompleted ?? 0')
    expect(pipelineTask).toContain('Math.floor(')
    expect(pipelineTask).toMatch(/Math\.min\(\s*100,/)
    expect(pipelineTask).toMatch(/Math\.max\(\s*0,/)
    expect(pipelineTask).toMatch(
      /Math\.max\(\s*1,\s*zombieEscapeGeneratedAssetReadiness\?\.pipelineTotal \?\? 1\s*\)/,
    )
    expect(pipelineTask).toMatch(
      /ready: zombieEscapeGeneratedAssetReadiness\?\.pipelineReady === true/,
    )
    expect(pipelineTask).toMatch(/total: 100\s*,/)
    expect(pipelineTask).not.toMatch(/total:\s*zombieEscapeGeneratedAssetReadiness/)
  })

  test('withdraws readiness when a reconnect removes the same-epoch snapshot', () => {
    const resolve = (snapshotWorldId: string | null) =>
      resolveLandrushInitialParcelMaterializationReadiness({
        appliedSequenceForUpdate: () => 0,
        authorityEpoch: 9,
        snapshotWorldId,
        updates: [],
        worldId: 'world-a',
      })

    expect(resolve('world-a')).toEqual({ authorityKey: '9:world-a', ready: true })
    expect(resolve(null)).toEqual({ authorityKey: '9:world-a', ready: false })
    expect(resolve('world-a')).toEqual({ authorityKey: '9:world-a', ready: true })
  })

  test('withdraws readiness when the current update list advances before materialization', () => {
    let appliedSequence = 3
    const resolve = (sequence: number) =>
      resolveLandrushInitialParcelMaterializationReadiness({
        appliedSequenceForUpdate: () => appliedSequence,
        authorityEpoch: 9,
        snapshotWorldId: 'world-a',
        updates: [{ parcelId: 'parcel-a', sequence, worldId: 'world-a' }],
        worldId: 'world-a',
      })

    expect(resolve(3).ready).toBe(true)
    expect(resolve(4).ready).toBe(false)
    appliedSequence = 4
    expect(resolve(4).ready).toBe(true)
  })

  test('waits for two browser presentation frames after every prerequisite is ready', () => {
    const frames = createFrameScheduler()
    const changes: boolean[] = []
    const gate = createLandrushIslandPaintReadinessGate({
      onReadyChange: (ready) => changes.push(ready),
      scheduler: frames.scheduler,
    })

    gate.setPrerequisitesReady(true)
    expect(frames.pendingCount()).toBe(1)
    frames.flushFrame()
    expect(changes).toEqual([])
    expect(frames.pendingCount()).toBe(1)
    frames.flushFrame()

    expect(changes).toEqual([true])
    expect(frames.pendingCount()).toBe(0)
  })

  test('cancels the paint handoff when readiness is withdrawn', () => {
    const frames = createFrameScheduler()
    const changes: boolean[] = []
    const gate = createLandrushIslandPaintReadinessGate({
      onReadyChange: (ready) => changes.push(ready),
      scheduler: frames.scheduler,
    })

    gate.setPrerequisitesReady(true)
    frames.flushFrame()
    gate.setPrerequisitesReady(false)
    frames.flushFrame()

    expect(changes).toEqual([])
    expect(frames.pendingCount()).toBe(0)
  })

  test('resets immediately after a previously presented scene becomes unready', () => {
    const frames = createFrameScheduler()
    const changes: boolean[] = []
    const gate = createLandrushIslandPaintReadinessGate({
      onReadyChange: (ready) => changes.push(ready),
      scheduler: frames.scheduler,
    })

    gate.setPrerequisitesReady(true)
    frames.flushFrame()
    frames.flushFrame()
    gate.setPrerequisitesReady(false)

    expect(changes).toEqual([true, false])
  })

  test('cancels loader completion and hands off only the renewed readiness generation', () => {
    const timeouts = createTimeoutScheduler()
    const handoffs: string[] = []
    const resets: Array<{ generation: string; generationChanged: boolean }> = []
    const gate = createLandrushIslandLoadingHandoffGate({
      fadeMs: 500,
      onHandoff: (generation) => handoffs.push(generation),
      onReset: (reset) => resets.push(reset),
      scheduler: timeouts.scheduler,
    })

    gate.setReadiness('pending:world-a', true)
    expect(gate.requestHandoff('pending:world-a')).toBe(true)
    gate.setReadiness('online:world-a', false)

    expect(timeouts.pendingCount()).toBe(0)
    expect(resets).toEqual([{ generation: 'online:world-a', generationChanged: true }])

    gate.setReadiness('online:world-a', true)
    expect(gate.requestHandoff('pending:world-a')).toBe(false)
    expect(gate.requestHandoff('online:world-a')).toBe(true)
    timeouts.flush()

    expect(handoffs).toEqual(['online:world-a'])
  })

  test('cancels an in-flight loader fade when same-generation readiness withdraws', () => {
    const timeouts = createTimeoutScheduler()
    const handoffs: string[] = []
    const resets: Array<{ generation: string; generationChanged: boolean }> = []
    const gate = createLandrushIslandLoadingHandoffGate({
      fadeMs: 500,
      onHandoff: (generation) => handoffs.push(generation),
      onReset: (reset) => resets.push(reset),
      scheduler: timeouts.scheduler,
    })

    gate.setReadiness('online:world-a', true)
    gate.requestHandoff('online:world-a')
    gate.setReadiness('online:world-a', false)
    timeouts.flush()

    expect(resets).toEqual([{ generation: 'online:world-a', generationChanged: false }])
    expect(handoffs).toEqual([])
  })

  test.each([
    0, 367,
  ])('requires smooth completion and a later visible 100-percent frame after a %i-ms observation delay', (startDelayMs) => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.05 })
    const gate = createLandrushIslandLoadingCompletionGate()
    const frameGapMs = LANDRUSH_ISLAND_LOADING_MAXIMUM_APP_PRESENTATION_GAP_MS
    const completionTimeMs = startDelayMs + LANDRUSH_ISLAND_LOADING_RESPONSE_MS
    const observeFrame = (frameTimeMs: number) =>
      gate.observeFrame({
        frameTimeMs,
        ready: controller.readyToDismiss(),
        renderedProgress: controller.getSnapshot().displayedProgress,
        visible: true,
      })

    controller.complete(startDelayMs)
    expect(observeFrame(0)).toBe(false)
    controller.step(startDelayMs)
    expect(controller.getSnapshot().displayedProgress).toBe(0.05)
    expect(observeFrame(startDelayMs)).toBe(false)
    controller.step(LANDRUSH_ISLAND_LOADING_RESPONSE_MS - frameGapMs)
    expect(controller.getSnapshot().displayedProgress).toBeLessThan(1)
    expect(observeFrame(completionTimeMs - frameGapMs)).toBe(false)
    controller.step(frameGapMs)
    expect(controller.getSnapshot().displayedProgress).toBe(1)
    expect(observeFrame(completionTimeMs)).toBe(false)
    expect(gate.hasPresentedCompletion()).toBe(false)
    expect(observeFrame(completionTimeMs)).toBe(false)
    controller.step(frameGapMs)
    expect(observeFrame(completionTimeMs + frameGapMs)).toBe(true)
    expect(gate.hasPresentedCompletion()).toBe(true)
    expect(completionTimeMs + frameGapMs - startDelayMs).toBeLessThanOrEqual(
      LANDRUSH_ISLAND_LOADING_COMPLETION_DEADLINE_MS,
    )
  })

  test('withdrawn readiness revokes the visible completion gate until readiness returns', () => {
    const controller = createLandrushIslandLoadingProgressController({ initialProgress: 0.9 })
    const gate = createLandrushIslandLoadingCompletionGate()
    const observeFrame = (frameTimeMs: number) =>
      gate.observeFrame({
        frameTimeMs,
        ready: controller.readyToDismiss(),
        renderedProgress: controller.getSnapshot().displayedProgress,
        visible: true,
      })

    controller.complete()
    controller.step(LANDRUSH_ISLAND_LOADING_RESPONSE_MS)
    expect(observeFrame(LANDRUSH_ISLAND_LOADING_RESPONSE_MS)).toBe(false)
    controller.step(50)
    expect(observeFrame(LANDRUSH_ISLAND_LOADING_RESPONSE_MS + 50)).toBe(true)
    controller.cancelCompletion()
    gate.reset()
    expect(gate.hasPresentedCompletion()).toBe(false)
    controller.step(50)
    expect(observeFrame(LANDRUSH_ISLAND_LOADING_RESPONSE_MS + 100)).toBe(false)
    controller.complete(150)
    expect(controller.getSnapshot().displayedProgress).toBe(1)
    expect(observeFrame(LANDRUSH_ISLAND_LOADING_RESPONSE_MS + 100)).toBe(false)
    controller.step(149)
    expect(observeFrame(LANDRUSH_ISLAND_LOADING_RESPONSE_MS + 249)).toBe(false)
    controller.step(1)
    expect(observeFrame(LANDRUSH_ISLAND_LOADING_RESPONSE_MS + 250)).toBe(false)
    controller.step(50)
    expect(observeFrame(LANDRUSH_ISLAND_LOADING_RESPONSE_MS + 300)).toBe(true)
  })

  test('wires the loader to a Landrush world frame and the presentation gate', () => {
    const clientPath = fileURLToPath(new URL('./landrush-island-client.tsx', import.meta.url))
    const clientSource = readFileSync(clientPath, 'utf8')

    expect(clientSource).toContain('<LandrushIslandWorldFrameReporter')
    expect(clientSource).toContain('useLandrushIslandPaintReadiness(loadingAssetsReady)')
    expect(clientSource).toContain('ambientLoadReadiness?.ready === true &&')
    expect(clientSource).toContain('builtCollidersReady &&')
    expect(clientSource).not.toContain(
      '(zombieEscapeEnabled || ambientLoadReadiness?.ready === true)',
    )
    expect(clientSource).toContain('runGeneration={loadingRunGeneration}')
    expect(clientSource).toContain('sampleInvalidationKey={initialParcelAuthorityKey}')
    expect(clientSource).toContain('topologySignature={loadingTopologySignature}')
    expect(clientSource).toContain('profileKey={loadingProfileKey}')
    expect(clientSource).toContain('tasks={loadingTasks}')
    expect(clientSource).toContain('useLandrushIslandLoadingTimeline({')
    expect(clientSource).toContain('ref={fillRef}')
    expect(clientSource).toContain('ref={overlayRef}')
    expect(clientSource).toContain("id: 'ambient-assets'")
    expect(clientSource).not.toMatch(
      /if \(!zombieEscapeEnabled\) \{\s+tasks\.push\(\{\s+completed: ambientLoadReadiness\?\.completed \?\? 0,\s+id: 'ambient-assets'/,
    )
    expect(clientSource).toContain("id: 'built-colliders'")
    expect(clientSource).toContain("id: 'natural-road-plan'")
    expect(clientSource).toContain("id: 'procedural-cliffs'")
    expect(clientSource).toContain("id: 'zombie-assets'")
    expect(clientSource).toContain("id: 'zombie-pipeline'")
    expect(clientSource).toContain('total: LANDRUSH_ISLAND_AMBIENT_LOAD_UNIT_IDS.length')
    expect(clientSource).toContain('total: ZOMBIE_ESCAPE_BALANCED_GENERATED_ASSET_KEYS.length')
    expect(clientSource).toContain('LANDRUSH_ISLAND_LOADING_DAY_PROFILE_KEY')
    expect(clientSource).toContain('LANDRUSH_ISLAND_LOADING_ZOMBIE_PROFILE_KEY')
    expect(clientSource).toContain('LANDRUSH_ISLAND_LOADING_DAY_TOPOLOGY_SIGNATURE')
    expect(clientSource).toContain('LANDRUSH_ISLAND_LOADING_ZOMBIE_TOPOLOGY_SIGNATURE')
    const dayTopologyDefinition = clientSource
      .split('\n')
      .find((line) => line.startsWith('const LANDRUSH_ISLAND_LOADING_DAY_TOPOLOGY_SIGNATURE'))
    const zombieTopologyDefinition = clientSource
      .split('\n')
      .find((line) => line.startsWith('const LANDRUSH_ISLAND_LOADING_ZOMBIE_TOPOLOGY_SIGNATURE'))
    expect(dayTopologyDefinition).toContain('LANDRUSH_ISLAND_AMBIENT_LOAD_CATALOG_SIGNATURE')
    expect(zombieTopologyDefinition).toContain('LANDRUSH_ISLAND_AMBIENT_LOAD_CATALOG_SIGNATURE')
    expect(clientSource).toContain('|natural-road-plan:${')
    expect(clientSource).toContain("naturalRoadPlanRequired ? 'required' : 'omitted'")
    expect(clientSource).toContain('|procedural-cliffs:')
    expect(clientSource).toContain('loadingActive ? (')
    expect(clientSource).not.toContain('generation={initialParcelAuthorityKey}')
    expect(clientSource).not.toContain('function useLandrushIslandLoadingProgress')
    expect(clientSource).not.toContain('LANDRUSH_ISLAND_LOADING_EXPECTED_MS')
    expect(clientSource).toContain('<LandrushIslandAuthorityResyncVeil')
    expect(clientSource).toContain('Syncing world…')
    expect(clientSource).toContain('currentInitialParcelReadiness.ready')
    expect(clientSource).toContain('admitted={initialParcelMaterializationReady}')
    expect(clientSource).not.toContain('{!zombieEscapeEnabled || !loadingActive ? (')
    expect(clientSource).toMatch(
      /\{initialParcelReadyAuthorityKey === initialParcelAuthorityKey \? \(\s+<LandrushIslandAmbientLife\s+key=\{initialParcelAuthorityKey\}/,
    )
    expect(clientSource).toContain('ambientLoadStatus?.authorityKey === initialParcelAuthorityKey')
    expect(clientSource).toContain(
      'if (authorityKey !== currentInitialParcelAuthorityKeyRef.current) return current',
    )
    expect(clientSource).toContain('onLoadReadinessChange={handleAmbientLoadReadinessChange}')
    expect(clientSource).toContain(
      'onLoadReadinessChange={handleProceduralCliffsLoadReadinessChange}',
    )
    expect(clientSource).toContain(
      'const naturalRoadPlanResource = useNaturalRoadPlanResource(naturalRoadPlanInput)',
    )
    expect(clientSource).toContain(
      'if (naturalRoadPlanResource.error) throw naturalRoadPlanResource.error',
    )
    expect(clientSource).not.toContain('createNaturalRoadPlan({')
    expect(clientSource).toContain('naturalRoadPlanReady &&')
    expect(clientSource).toContain('proceduralCliffsReady &&')
    expect(clientSource).toContain('const reportedGeneration = proceduralCliffsLoadGeneration')
    expect(clientSource).toContain(
      'currentGeneration: currentProceduralCliffsLoadGenerationRef.current',
    )
    expect(clientSource).not.toContain('admitted={!loadingActive}')
    expect(clientSource).toContain('deferBuiltColliderRebuild={!authorityPresentationReady}')
    expect(clientSource).toContain(
      "deferRebuild ? 'deferred' : createLandrushIslandPhysicsNodeSignature(state.nodes)",
    )
    expect(clientSource).toContain('if (deferRebuild) return')
    expect(clientSource).toContain(
      'const authorityPresentationReady = initialParcelMaterializationReady && viewerSceneReady',
    )
    expect(clientSource).toContain('colliderAuthorityKey={initialParcelAuthorityKey}')
    expect(clientSource).toContain(
      'onBuiltCollidersReadinessChange={handleBuiltCollidersReadinessChange}',
    )
    expect(clientSource).toContain('colliderAuthorityKey={colliderAuthorityKey}')
    expect(clientSource).toContain(
      'onBuiltCollidersReadinessChange={onBuiltCollidersReadinessChange}',
    )
    expect(clientSource).toContain(
      'sceneReadyPrerequisitesReady={initialParcelMaterializationReady}',
    )
    const colliderHookSource = clientSource.slice(
      clientSource.indexOf('function useLandrushIslandBuiltColliderWorlds('),
      clientSource.indexOf('function createLandrushIslandDoorAnimationSignature('),
    )
    expect(colliderHookSource).toContain('installedVersion: string | null')
    expect(colliderHookSource).toContain('authorityKey,\n    physicsSignature,')
    expect(colliderHookSource).toContain('useLayoutEffect(() => {\n    if (deferRebuild) return')
    expect(colliderHookSource).toContain('if (cancelled) return')
    expect(colliderHookSource).toContain(
      'replaceWorlds({ ...nextWorlds, installedVersion: colliderWorldVersion })',
    )
    expect(colliderHookSource).toContain(
      'installedVersion: deferRebuild ? null : worlds.installedVersion',
    )
    const localRobotSource = clientSource.slice(
      clientSource.indexOf('function LocalLandrushIslandRobot('),
    )
    expect(localRobotSource).toMatch(
      /useLayoutEffect\(\(\) => \{\s+onBuiltCollidersReadinessChange\(builtColliderReadiness\)\s+return \(\) =>\s+onBuiltCollidersReadinessChange\(\{ \.\.\.builtColliderReadiness, installedVersion: null \}\)/,
    )
    expect(localRobotSource).toContain('builtColliderWorlds.collision?.mesh')
    expect(localRobotSource).toContain(
      'fallPresentationActive ? LANDRUSH_ISLAND_ROBOT_FALL_COLLIDER_MESHES : colliderMeshes',
    )
    expect(clientSource).toContain(
      "data-landrush-loading-built-colliders-ready={builtCollidersReady ? 'true' : 'false'}",
    )
    expect(clientSource).toMatch(
      /data-landrush-loading-ambient-ready=\{\s*ambientLoadReadiness\?\.ready === true \? 'true' : 'false'\s*\}/,
    )
    expect(clientSource).toContain(
      "data-landrush-loading-handed-off={!loadingActive ? 'true' : 'false'}",
    )
    expect(clientSource).toMatch(
      /data-landrush-loading-initial-parcel-ready=\{\s*initialParcelMaterializationReady \? 'true' : 'false'\s*\}/,
    )
    expect(clientSource).toContain(
      "data-landrush-loading-paint-ready={loadingPaintReady ? 'true' : 'false'}",
    )
    expect(clientSource).toContain(
      "data-landrush-loading-natural-road-ready={naturalRoadPlanReady ? 'true' : 'false'}",
    )
    expect(clientSource).toContain(
      'data-landrush-loading-natural-road-status={naturalRoadPlanResource.status}',
    )
    expect(clientSource).toContain(
      "data-landrush-loading-procedural-cliffs-ready={proceduralCliffsReady ? 'true' : 'false'}",
    )
    expect(clientSource).toContain(
      'data-landrush-loading-procedural-cliffs-generation={proceduralCliffsLoadGeneration}',
    )
    expect(clientSource).toMatch(
      /data-landrush-loading-stylized-ground-ready=\{\s*stylizedGroundTextureReady \? 'true' : 'false'\s*\}/,
    )
    expect(clientSource).toMatch(
      /data-landrush-loading-stylized-ground-required=\{\s*stylizedGroundTextureRequired \? 'true' : 'false'\s*\}/,
    )
    expect(clientSource).toContain(
      "data-landrush-loading-viewer-scene-ready={viewerSceneReady ? 'true' : 'false'}",
    )
    expect(clientSource).toContain(
      "data-landrush-loading-world-frame-ready={worldFrameReady ? 'true' : 'false'}",
    )
    expect(clientSource).toMatch(
      /data-landrush-loading-zombie-assets-ready=\{\s*zombieEscapeGeneratedAssetsReady \? 'true' : 'false'\s*\}/,
    )

    const timelineSource = readFileSync(
      new URL('./landrush-island-loading-timeline-react.tsx', import.meta.url),
      'utf8',
    )
    expect(timelineSource).toContain("document.readyState !== 'loading'")
    expect(timelineSource).toContain('createLandrushIslandLoadingVisualPreview(')
    expect(timelineSource).toContain('fadingOut: true')
    const runtimeHookSource = timelineSource.slice(
      timelineSource.indexOf('export function useLandrushIslandLoadingTimeline({'),
      timelineSource.indexOf('export function createLandrushIslandLoadingCompletionGate'),
    )
    expect(runtimeHookSource).toMatch(
      /inheritedVelocityHoldMs:\s*resolveLandrushIslandLoadingObservationDelay\(\s*readNow\(\),\s*lastClockMs,?\s*\)/,
    )
    expect(runtimeHookSource).toMatch(
      /const startDelayMs = resolveLandrushIslandLoadingObservationDelay\(\s*nowMs,\s*lastClockMs,?\s*\)/,
    )
    expect(runtimeHookSource).toMatch(
      /completionRequested = true\s+controller\.complete\(startDelayMs\)/,
    )
    expect(runtimeHookSource).toMatch(
      /controller\.setConfirmedProgress\(stage\.confirmedProgress,\s*\{\s*\.\.\.stage,\s*startDelayMs,?\s*\}\)/,
    )
    expect(runtimeHookSource).toContain('evidenceProgress: update.presentationProgress')
    expect(runtimeHookSource).toContain(
      'maximumProgress: LANDRUSH_ISLAND_LOADING_PENDING_PRESENTATION_CEILING',
    )
    expect(runtimeHookSource).not.toContain('forecastProgress:')
    expect(runtimeHookSource).not.toMatch(/completionRequested = true\s+beginHandoffFade\(\)/)
    expect(runtimeHookSource).toContain(
      'const completionGate = createLandrushIslandLoadingCompletionGate()',
    )
    expect(runtimeHookSource).toContain('allReady && controller.readyToDismiss()')
    expect(runtimeHookSource).toContain('completionGate.observeFrame({')
    expect(runtimeHookSource).toContain("visible: document.visibilityState === 'visible'")
    expect(runtimeHookSource).toMatch(
      /renderedProgress:\s*completed && fill \? readLandrushIslandLoadingRenderedProgress\(fill\) : 0/,
    )
    expect(runtimeHookSource).toMatch(
      /if \(completionPresented\) \{[\s\S]*?'data-landrush-island-loading-100-presented'[\s\S]*?beginHandoffFade\(\)/,
    )
    expect(runtimeHookSource).toContain('if (!allReady && completionRequested) resetCompletion()')
    expect(runtimeHookSource).toContain('completionGate.reset()')
    expect(runtimeHookSource).not.toContain('scheduleCompositorRefresh')
    expect(runtimeHookSource).not.toContain('retargetLandrushIslandLoadingPreview')
    expect(runtimeHookSource).not.toContain('setKeyframes')
    expect(runtimeHookSource).toContain('animateLandrushIslandLoadingPreview(fill, nextSegment)')
    expect(runtimeHookSource).toContain('nextAnimation.startTime = lastClockMs')
    expect(runtimeHookSource).toContain('const fadeDurationMs = reducedMotion ? 0')
    expect(runtimeHookSource).not.toMatch(/if \(!?reducedMotion\)/)
    expect(runtimeHookSource).not.toContain('reconcileDisplayedProgress(')
    const finishHandoffSource = timelineSource.slice(
      timelineSource.indexOf('const finishHandoff = (expectedAttempt: number) => {'),
      timelineSource.indexOf('const beginHandoffFade = () => {'),
    )
    expect(finishHandoffSource).toContain(
      '!run.update(runGeneration, readTasks(), readNow()).allReady',
    )
    expect(finishHandoffSource).toContain('!controller.readyToDismiss()')
    const presentedGuardOffset = finishHandoffSource.indexOf(
      '!completionGate.hasPresentedCompletion()',
    )
    const completeFillOffset = finishHandoffSource.indexOf("fill.style.transform = 'scaleX(1)'")
    const hideOffset = finishHandoffSource.indexOf("overlay.setAttribute('hidden', '')")
    expect(presentedGuardOffset).toBeGreaterThanOrEqual(0)
    expect(completeFillOffset).toBeGreaterThan(presentedGuardOffset)
    expect(hideOffset).toBeGreaterThan(completeFillOffset)
    expect(finishHandoffSource).not.toContain('snapToComplete()')
    expect(timelineSource).not.toContain('PerformanceObserver')
  })

  test('keeps one streamed gauge through runtime ownership and final fade', () => {
    const layoutPath = fileURLToPath(
      new URL('../../app/landrush-lab/pascal-multiplayer-island/layout.tsx', import.meta.url),
    )
    const pagePath = fileURLToPath(
      new URL('../../app/landrush-lab/pascal-multiplayer-island/page.tsx', import.meta.url),
    )
    const globalsPath = fileURLToPath(new URL('../../app/globals.css', import.meta.url))
    const routeLoadingPath = fileURLToPath(
      new URL('../../app/landrush-lab/pascal-multiplayer-island/loading.tsx', import.meta.url),
    )
    const startupGatePath = fileURLToPath(
      new URL('./landrush-island-startup-presentation-gate.tsx', import.meta.url),
    )
    const deferredClientPath = fileURLToPath(
      new URL('./landrush-island-deferred-client.tsx', import.meta.url),
    )
    const shellPath = fileURLToPath(new URL('./landrush-island-loading-shell.tsx', import.meta.url))
    const globalsSource = readFileSync(globalsPath, 'utf8').replaceAll('\r\n', '\n')
    const shellSource = readFileSync(shellPath, 'utf8')
    const percentSource = readFileSync(
      new URL('./landrush-island-loading-percent.tsx', import.meta.url),
      'utf8',
    )
    const startupGateSource = readFileSync(startupGatePath, 'utf8')
    const deferredClientSource = readFileSync(deferredClientPath, 'utf8').replaceAll('\r\n', '\n')

    const layoutSource = readFileSync(layoutPath, 'utf8')
    const pageSource = readFileSync(pagePath, 'utf8')
    expect(layoutSource).toContain('<LandrushIslandLoadingShell />')
    expect(layoutSource.indexOf('<LandrushIslandLoadingShell />')).toBeLessThan(
      layoutSource.indexOf('{children}'),
    )
    expect(layoutSource).not.toContain('<LandrushIslandLoadingBootScript />')
    expect(pageSource).toContain('<Suspense fallback={null}>')
    expect(pageSource).toContain('<LandrushIslandDeferredClient />')
    expect(pageSource).not.toContain("from '@/components/landrush-lab/landrush-island-client'")
    expect(pageSource).not.toContain('<LandrushIslandLoadingBootScript />')
    expect(pageSource).not.toContain('<LandrushIslandLoadingShell />')
    expect(deferredClientSource).toMatch(/lazy\(\(\) =>\s+import\('\.\/landrush-island-client'\)/)
    expect(deferredClientSource.indexOf('<LandrushIslandStartupPresentationGate>')).toBeLessThan(
      deferredClientSource.indexOf('<DeferredLandrushIslandClient'),
    )
    expect(startupGateSource).toContain('LANDRUSH_ISLAND_STARTUP_PRESENTATION_FRAME_COUNT = 2')
    expect(startupGateSource).toContain('scheduleLandrushIslandStartupAfterPresentationFrames({')
    expect(startupGateSource).toContain('startLandrushIslandLoadingShellMotion(')
    expect(startupGateSource).toContain('currentTimeMs > observedCurrentTimeMs')
    expect(readFileSync(routeLoadingPath, 'utf8')).toContain('return null')
    expect(shellSource).toContain('bg-slate-950/58')
    expect(shellSource).not.toContain('bg-[#0f1720]')
    expect(shellSource).toContain('data-landrush-island-loading-shell')
    expect(shellSource).not.toContain('<script')
    expect(shellSource).not.toContain('LandrushIslandLoadingBootScript')
    expect(shellSource).toContain('<LandrushIslandLoadingShellClientBridge />')
    expect(shellSource).toContain('LANDRUSH_ISLAND_LOADING_SHELL_FILL_ATTRIBUTE')
    expect(shellSource).toContain(
      'const initialPercent = LANDRUSH_ISLAND_LOADING_SHELL_INITIAL_PROGRESS * 100',
    )
    expect(shellSource).toContain('aria-valuenow={initialPercent}')
    expect(shellSource).toContain('<LandrushIslandLoadingPercent streamed />')
    expect(shellSource).not.toMatch(/<span\b[^>]*>\s*\{initialPercent\}%\s*<\/span>/)
    expect(percentSource).toContain('LandrushIslandLoadingPercent({ streamed = false }')
    expect(percentSource).toContain(
      'const initialPercent = streamed ? LANDRUSH_ISLAND_LOADING_SHELL_INITIAL_PROGRESS * 100 : 0',
    )
    expect(percentSource).toContain(
      'data-landrush-island-loading-shell-percent-value={String(initialPercent)}',
    )
    expect(percentSource).toContain('data-landrush-island-loading-shell-percent')
    expect(percentSource).toContain('LANDRUSH_ISLAND_LOADING_SHELL_PERCENT_REEL_ATTRIBUTE')
    expect(percentSource).toContain('Array.from({ length: 101 }, (_, percent) => percent)')
    expect(percentSource).toContain('PERCENT_VALUES.map((percent) => (')
    expect(percentSource).toContain('data-landrush-island-loading-percent-row={percent}')
    expect(percentSource).toContain('className="h-4 shrink-0 leading-4"')
    expect(percentSource).toContain(
      "style={streamed ? undefined : { animation: 'none', transform: 'translate3d(0, 0, 0)' }}",
    )
    expect(percentSource).not.toContain('data-landrush-island-loading-shell-percent-strip')
    expect(globalsSource).not.toContain('body:has([data-landrush-island-loading-runtime-owned])')
    expect(globalsSource).not.toContain('body:has([data-landrush-island-world-frame-ready])')
    expect(globalsSource).not.toContain('background-color: transparent')
    expect(globalsSource).toContain('@keyframes landrush-island-loading-shell-progress')
    expect(globalsSource).toContain(
      'animation: landrush-island-loading-shell-progress 120s linear both',
    )
    expect(globalsSource).toContain(
      'animation-delay: var(--landrush-island-loading-shell-delay, 0ms)',
    )
    expect(globalsSource).toContain('@keyframes landrush-island-loading-shell-percent')
    expect(globalsSource).not.toContain('[data-landrush-island-loading-shell] {\n  display: none;')
    const reducedMotionCss = globalsSource.slice(
      globalsSource.indexOf('@media (prefers-reduced-motion: reduce)'),
      globalsSource.indexOf('/* Loaders */'),
    )
    expect(reducedMotionCss).toContain(
      '[data-landrush-island-loading-shell-fill] {\n    animation-duration: 120s !important;',
    )
    expect(reducedMotionCss).toContain(
      '[data-landrush-island-loading-shell-percent-reel] {\n    animation-duration: 120s !important;',
    )
    expect(reducedMotionCss).not.toContain('animation: none')
    expect(reducedMotionCss).not.toContain('scaleX(0.2)')
    expect(reducedMotionCss).not.toContain('translate3d(0, -20rem, 0)')
    const shellProgressKeyframes = globalsSource.slice(
      globalsSource.indexOf('@keyframes landrush-island-loading-shell-progress'),
      globalsSource.indexOf('@keyframes landrush-island-loading-shell-percent'),
    )
    expect(LANDRUSH_ISLAND_LOADING_SHELL_INITIAL_PROGRESS).toBe(0.08)
    expect(shellProgressKeyframes).toContain('transform: scaleX(0.08)')
    expect(shellProgressKeyframes).toContain('transform: scaleX(0.8)')
    expect(STREAMED_SHELL_VELOCITY_PER_SECOND).toBe(0.006)
    expect(
      (0.8 - LANDRUSH_ISLAND_LOADING_SHELL_INITIAL_PROGRESS) /
        (LANDRUSH_ISLAND_LOADING_SHELL_MOTION_DURATION_MS / 1_000),
    ).toBeCloseTo(STREAMED_SHELL_VELOCITY_PER_SECOND, 12)
  })

  test('reveals the blurred mounted island through a transparent runtime overlay', () => {
    const clientPath = fileURLToPath(new URL('./landrush-island-client.tsx', import.meta.url))
    const clientSource = readFileSync(clientPath, 'utf8')
    const backdropStart = clientSource.indexOf('aria-hidden={loadingActive}')
    const backdropEnd = clientSource.indexOf('<LandrushIslandStartupReactProfiler', backdropStart)
    const overlayStart = clientSource.indexOf('function LandrushIslandLoadingOverlay')
    const overlayEnd = clientSource.indexOf('function LandrushIslandTunePanel', overlayStart)

    expect(backdropStart).toBeGreaterThanOrEqual(0)
    expect(backdropEnd).toBeGreaterThan(backdropStart)
    expect(overlayStart).toBeGreaterThanOrEqual(0)
    expect(overlayEnd).toBeGreaterThan(overlayStart)

    const loadingBackdropSource = clientSource.slice(backdropStart, backdropEnd)
    const runtimeOverlaySource = clientSource.slice(overlayStart, overlayEnd)

    expect(loadingBackdropSource).toContain('scale-[1.01] blur-[7px]')
    expect(clientSource).toContain('<LandrushIslandWorldFrameReporter')
    expect(
      readFileSync(new URL('./landrush-island-loading-readiness.tsx', import.meta.url), 'utf8'),
    ).toContain("setAttribute('data-landrush-island-world-frame-ready', '')")
    expect(runtimeOverlaySource).toContain('bg-transparent')
    expect(runtimeOverlaySource).not.toContain('bg-[#0f1720]')
    expect(clientSource).toContain(
      "import { LandrushIslandLoadingPercent } from './landrush-island-loading-percent'",
    )
    expect(runtimeOverlaySource).toContain('<LandrushIslandLoadingPercent />')
    expect(runtimeOverlaySource).not.toMatch(/<span\b[^>]*>\s*\{percent\}%\s*<\/span>/)
  })

  test('keeps eager Zombie Escape weapon assets behind a local suspense boundary', () => {
    const generatedAssetsPath = fileURLToPath(
      new URL('./zombie-escape-generated-assets.tsx', import.meta.url),
    )
    const generatedAssetsSource = readFileSync(generatedAssetsPath, 'utf8')
    const boundaryStart = generatedAssetsSource.indexOf(
      'export const GeneratedWeaponModel = memo(function GeneratedWeaponModel',
    )
    const loaderStart = generatedAssetsSource.indexOf(
      'function LoadedGeneratedWeaponModel',
      boundaryStart,
    )
    const nextFunctionStart = generatedAssetsSource.indexOf(
      'const ZombieEscapeGeneratedZombies = memo(function ZombieEscapeGeneratedZombies',
      loaderStart,
    )

    expect(boundaryStart).toBeGreaterThanOrEqual(0)
    expect(loaderStart).toBeGreaterThan(boundaryStart)
    expect(nextFunctionStart).toBeGreaterThan(loaderStart)

    const boundarySource = generatedAssetsSource.slice(boundaryStart, loaderStart)
    const loaderSource = generatedAssetsSource.slice(loaderStart, nextFunctionStart)
    expect(boundarySource).toContain('<GeneratedAssetErrorBoundary')
    expect(boundarySource).toContain('<Suspense fallback={null}>')
    expect(boundarySource).toContain('<LoadedGeneratedWeaponModel')
    expect(boundarySource).toContain('onAssetStatusChange={onAssetStatusChange}')
    expect(boundarySource).not.toContain('useGLTF(')
    expect(loaderSource).toContain('useGLTF(weapon.assetPath)')
  })

  test('keeps zombie startup pending until the complete generated catalog settles', () => {
    const clientSource = readFileSync(
      new URL('./landrush-island-client.tsx', import.meta.url),
      'utf8',
    )
    const generatedAssetsSource = readFileSync(
      new URL('./zombie-escape-generated-assets.tsx', import.meta.url),
      'utf8',
    )

    expect(clientSource).toContain('zombieEscapeGeneratedAssetsReady &&')
    expect(clientSource).not.toContain('setZombieEscapeGeneratedAssetsReady(!zombieEscapeEnabled)')
    expect(clientSource).toContain(
      'reportedMountGeneration !== currentZombieEscapeGeneratedAssetGenerationRef.current',
    )
    expect(clientSource).toContain(
      'onGeneratedAssetsReadinessChange={onZombieEscapeGeneratedAssetsReadinessChange}',
    )
    expect(generatedAssetsSource).toContain('ZOMBIE_ESCAPE_BALANCED_GENERATED_ASSET_KEYS')
    expect(generatedAssetsSource).toContain(
      'ZOMBIE_ESCAPE_BALANCED_GENERATED_ASSET_CATALOG_SIGNATURE',
    )
    expect(generatedAssetsSource).toContain('...GENERATED_WEAPON_ASSET_KEYS')
    expect(generatedAssetsSource).toContain('...GENERATED_ZOMBIE_ASSET_KEYS')
    expect(generatedAssetsSource).toContain('resolveZombieEscapeGeneratedAssetSettlement(')
    expect(generatedAssetsSource).toContain('resolveZombieEscapeGeneratedAssetReadinessSnapshot({')
    expect(generatedAssetsSource).toContain('onGeneratedAssetsReadinessChange?.(')
    expect(generatedAssetsSource).toContain("onAssetStatusChange(assetKey, { state: 'ready' })")
    expect(generatedAssetsSource).not.toContain('representativePrewarmQueue.waitForSettled()')
    expect(generatedAssetsSource).toContain(
      'representatives: renderReadinessSnapshot.representatives',
    )
    expect(generatedAssetsSource).toContain('window.requestAnimationFrame(() => resolve())')
    expect(generatedAssetsSource).not.toContain('scheduler.yield()')
    expect(generatedAssetsSource).toContain(
      'waitForBuildSlice: yieldZombieEscapeAuthoredBuildSlice',
    )
    expect(generatedAssetsSource).toContain(
      'ZOMBIE_VARIANT_INDICES.slice(0, admittedVariantCount).map',
    )
    expect(generatedAssetsSource).not.toContain('if (!admitted) return null')
  })
})
