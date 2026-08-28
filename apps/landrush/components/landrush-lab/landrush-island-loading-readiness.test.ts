import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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

  test('wires the loader to a Landrush world frame and the presentation gate', () => {
    const clientPath = fileURLToPath(new URL('./landrush-island-client.tsx', import.meta.url))
    const clientSource = readFileSync(clientPath, 'utf8')

    expect(clientSource).toContain('<LandrushIslandWorldFrameReporter')
    expect(clientSource).toContain('useLandrushIslandPaintReadiness(loadingAssetsReady)')
    expect(clientSource).toContain('(zombieEscapeEnabled || ambientLoadReadiness?.ready === true)')
    expect(clientSource).toContain('runGeneration={loadingRunGeneration}')
    expect(clientSource).toContain('sampleInvalidationKey={initialParcelAuthorityKey}')
    expect(clientSource).toContain('topologySignature={loadingTopologySignature}')
    expect(clientSource).toContain('profileKey={loadingProfileKey}')
    expect(clientSource).toContain('tasks={loadingTasks}')
    expect(clientSource).toContain('useLandrushIslandLoadingTimeline({')
    expect(clientSource).toContain('ref={fillRef}')
    expect(clientSource).toContain('ref={overlayRef}')
    expect(clientSource).toContain("id: 'ambient-assets'")
    expect(clientSource).toMatch(
      /if \(!zombieEscapeEnabled\) \{\s+tasks\.push\(\{\s+completed: ambientLoadReadiness\?\.completed \?\? 0,\s+id: 'ambient-assets'/,
    )
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
    expect(zombieTopologyDefinition).not.toContain('LANDRUSH_ISLAND_AMBIENT_LOAD_CATALOG_SIGNATURE')
    expect(clientSource).toContain('|natural-road-plan:${')
    expect(clientSource).toContain("naturalRoadPlanRequired ? 'required' : 'omitted'")
    expect(clientSource).toContain('|procedural-cliffs:')
    expect(clientSource).toContain('loadingPresentationActive ? (')
    expect(clientSource).not.toContain('generation={initialParcelAuthorityKey}')
    expect(clientSource).not.toContain('function useLandrushIslandLoadingProgress')
    expect(clientSource).not.toContain('LANDRUSH_ISLAND_LOADING_EXPECTED_MS')
    expect(clientSource).toContain('<LandrushIslandAuthorityResyncVeil')
    expect(clientSource).toContain('Syncing world…')
    expect(clientSource).toContain('currentInitialParcelReadiness.ready')
    expect(clientSource).toContain('admitted={initialParcelMaterializationReady}')
    expect(clientSource).toContain('{ambientLifeAdmitted ? (')
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
    expect(clientSource).toMatch(
      /deferBuiltColliderRebuild=\{\s*zombieEscapeEnabled && !colliderRebuildAdmitted\s*\}/,
    )
    expect(clientSource).toContain(
      "deferRebuild ? 'deferred' : createLandrushIslandPhysicsNodeSignature(state.nodes)",
    )
    expect(clientSource).toContain('if (deferRebuild) return')
    expect(clientSource).toMatch(
      /data-landrush-loading-ambient-ready=\{\s*ambientLoadReadiness\?\.ready === true \? 'true' : 'false'\s*\}/,
    )
    expect(clientSource).toContain(
      "data-landrush-loading-handed-off={coreGameplayAdmitted ? 'true' : 'false'}",
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
      timelineSource.indexOf('export function createLandrushIslandLoadingProgressPresentation'),
    )
    expect(runtimeHookSource).toMatch(/completionRequested = true\s+beginHandoffFade\(\)/)
    expect(runtimeHookSource).not.toContain('readyToDismiss()')
    expect(runtimeHookSource).not.toContain('scheduleCompositorRefresh')
    expect(runtimeHookSource).not.toContain('retargetLandrushIslandLoadingPreview')
    expect(runtimeHookSource).not.toContain('setKeyframes')
    expect(runtimeHookSource).toContain('createLandrushIslandLoadingAppliedVisualSegment(')
    expect(runtimeHookSource).toContain('const fadeDurationMs = reducedMotion ? 0')
    expect(runtimeHookSource).not.toMatch(/if \(!?reducedMotion\)/)
    expect(runtimeHookSource).not.toContain('reconcileDisplayedProgress(')
    const finishHandoffSource = timelineSource.slice(
      timelineSource.indexOf('const finishHandoff = (expectedFadeAttempt: number) => {'),
      timelineSource.indexOf('const beginHandoffFade = () => {'),
    )
    expect(
      finishHandoffSource.indexOf("presentationOverlay.setAttribute('hidden', '')"),
    ).toBeLessThan(finishHandoffSource.indexOf('progressController.snapToComplete()'))
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
    const globalsSource = readFileSync(globalsPath, 'utf8')
    const shellSource = readFileSync(shellPath, 'utf8')
    const startupGateSource = readFileSync(startupGatePath, 'utf8')
    const deferredClientSource = readFileSync(deferredClientPath, 'utf8')

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
    expect(shellSource).toContain('bg-[#0f1720]')
    expect(shellSource).toContain('data-landrush-island-loading-shell')
    expect(shellSource).not.toContain('<script')
    expect(shellSource).not.toContain('LandrushIslandLoadingBootScript')
    expect(shellSource).toContain('<LandrushIslandLoadingShellClientBridge />')
    expect(shellSource).toContain('LANDRUSH_ISLAND_LOADING_SHELL_FILL_ATTRIBUTE')
    expect(shellSource).toContain('data-landrush-island-loading-shell-percent')
    expect(shellSource).toContain('LANDRUSH_ISLAND_LOADING_SHELL_PERCENT_REEL_ATTRIBUTE')
    expect(shellSource).not.toContain('data-landrush-island-loading-shell-percent-strip')
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
    expect(globalsSource).toContain('transform: scaleX(0.72)')
    expect(0.72 / 120).toBe(0.006)
  })

  test('keeps scene priming opaque while preserving the day-mode backdrop treatment', () => {
    const clientPath = fileURLToPath(new URL('./landrush-island-client.tsx', import.meta.url))
    const clientSource = readFileSync(clientPath, 'utf8')
    const backdropStart = clientSource.indexOf('aria-hidden={loadingPresentationActive}')
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
    expect(runtimeOverlaySource).toContain('bg-[#0f1720]')
    expect(runtimeOverlaySource).not.toContain('bg-transparent')
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

  test('blocks startup on core generated assets while deferring cosmetic presentation', () => {
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
    expect(generatedAssetsSource).toContain('expectedKeys: GENERATED_WEAPON_ASSET_KEYS')
    expect(generatedAssetsSource).toContain(
      'reportingRef.current.onGeneratedAssetsReadinessChange',
    )
    expect(generatedAssetsSource).toContain('report?.(')
    expect(generatedAssetsSource).toContain("onAssetStatusChange(assetKey, { state: 'ready' })")
    expect(generatedAssetsSource).not.toContain('representativePrewarmQueue.waitForSettled()')
    expect(generatedAssetsSource).toContain('representatives: []')
    expect(generatedAssetsSource).toContain('window.requestAnimationFrame(() => resolve())')
    expect(generatedAssetsSource).not.toContain('scheduler.yield()')
    expect(generatedAssetsSource).toContain(
      'waitForBuildSlice: yieldZombieEscapeAuthoredBuildSlice',
    )
    expect(generatedAssetsSource).toContain(
      'ZOMBIE_VARIANT_INDICES.slice(0, admittedVariantCount).map',
    )
    expect(generatedAssetsSource).toContain('cosmeticAssetsAdmitted')
    expect(generatedAssetsSource).not.toContain('if (!admitted) return null')
  })
})
