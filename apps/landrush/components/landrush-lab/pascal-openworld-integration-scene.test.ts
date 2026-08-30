import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Pascal multiplayer-island composition', () => {
  test('canonical route composes the Landrush client through one Pascal viewer host', () => {
    const routeSource = readFileSync(
      join(import.meta.dir, '../../app/landrush-lab/pascal-multiplayer-island/page.tsx'),
      'utf8',
    )
    const deferredClientSource = readFileSync(
      join(import.meta.dir, 'landrush-island-deferred-client.tsx'),
      'utf8',
    )
    const clientSource = readFileSync(join(import.meta.dir, 'landrush-island-client.tsx'), 'utf8')
    const ambientLifeSource = readFileSync(
      join(import.meta.dir, 'landrush-island-ambient-life.tsx'),
      'utf8',
    )
    const hostSource = readFileSync(
      join(
        import.meta.dir,
        '../../../../packages/landrush-pascal-host/src/landrush-pascal-host.tsx',
      ),
      'utf8',
    )

    expect(routeSource).toContain(
      "from '@/components/landrush-lab/landrush-island-deferred-client'",
    )
    expect(routeSource).toContain('<LandrushIslandDeferredClient')
    expect(deferredClientSource).toContain("import('./landrush-island-client')")
    expect(deferredClientSource).toContain('<DeferredLandrushIslandClient')
    expect(routeSource).not.toContain('progressive')
    expect(clientSource).toContain("from '@landrush/pascal-host'")
    expect(clientSource.match(/<LandrushPascalHost\b/g)).toHaveLength(1)
    expect(clientSource).not.toMatch(/<Viewer\b/)
    expect(clientSource).toContain(
      'const [viewerSceneReady, setViewerSceneReady] = useState(false)',
    )
    expect(clientSource).toMatch(
      /const loadingAssetsReady =\s+initialParcelMaterializationReady &&\s+viewerSceneReady &&\s+floorPresentationReady &&\s+dayMaterialPresentationReady &&\s+worldFrameReady &&\s+ambientLoadReadiness\?\.ready === true &&\s+builtCollidersReady &&/,
    )
    expect(clientSource).toMatch(
      /tasks\.push\(\s+\{\s+completed: ambientLoadReadiness\?\.completed \?\? 0,\s+id: 'ambient-assets'/,
    )
    expect(clientSource).toContain('onSceneReadyChange={setViewerSceneReady}')
    expect(clientSource).toContain(
      'sceneReadyPrerequisitesReady={initialParcelMaterializationReady}',
    )
    expect(clientSource).toContain('sceneReadyKey={initialParcelAuthorityKey}')
    expect(clientSource).toContain('const LANDRUSH_ISLAND_RENDER_DPR = 0.7')
    expect(clientSource).toContain('renderDpr={LANDRUSH_ISLAND_RENDER_DPR}')
    expect(clientSource).toContain(
      'sceneReadyMaxWaitMs={LANDRUSH_ISLAND_INITIAL_SCENE_READY_MAX_WAIT_MS}',
    )
    const runtimeOverlayStart = clientSource.indexOf('function LandrushIslandLoadingOverlay')
    const runtimeOverlayEnd = clientSource.indexOf(
      'function LandrushIslandTunePanel',
      runtimeOverlayStart,
    )
    expect(runtimeOverlayStart).toBeGreaterThanOrEqual(0)
    expect(runtimeOverlayEnd).toBeGreaterThan(runtimeOverlayStart)
    const runtimeOverlaySource = clientSource.slice(runtimeOverlayStart, runtimeOverlayEnd)
    expect(runtimeOverlaySource).toContain('bg-transparent')
    expect(runtimeOverlaySource).not.toContain('bg-[#0f1720]')
    expect(clientSource.match(/createLandrushIslandPalmLayout\(\{/g)).toHaveLength(1)
    expect(clientSource).toContain('roadClearance: liveNaturalRoadPlan?.footprints.clearance ?? []')
    expect(clientSource.match(/palmLayout=\{livePalmLayout\}/g)).toHaveLength(2)
    expect(clientSource.match(/palmLayout=\{visiblePalmLayout\}/g)).toHaveLength(1)
    expect(
      clientSource.match(/blockedPalmInstanceIndices=\{blockedPalmInstanceIndices\}/g),
    ).toHaveLength(2)
    expect(ambientLifeSource).not.toContain('createLandrushIslandPalmLayout')
    expect(ambientLifeSource).toContain('palmLayout: readonly LandrushIslandPalmPlacement[]')
    expect(clientSource).toContain("window.addEventListener('blur', handleBlur)")
    expect(clientSource).toContain(
      "document.addEventListener('visibilitychange', handleVisibilityChange)",
    )
    const clearHeldInputStart = clientSource.indexOf('const clearHeldInput = useCallback(() => {')
    const clearHeldInputEnd = clientSource.indexOf('\n  }, [])', clearHeldInputStart)
    expect(clearHeldInputStart).toBeGreaterThanOrEqual(0)
    expect(clearHeldInputEnd).toBeGreaterThan(clearHeldInputStart)
    const clearHeldInputSource = clientSource.slice(clearHeldInputStart, clearHeldInputEnd)
    expect(clearHeldInputSource).toContain('keyboardJumpRawHeldRef.current = false')
    expect(clearHeldInputSource).toContain('keyboardJumpButtonStateRef.current.armed = false')
    expect(clearHeldInputSource).toContain('gamepadJumpButtonStateRef.current.armed = false')
    expect(clearHeldInputSource).toContain(
      'resetLandrushIslandJumpRequestState(jumpRequestRef.current)',
    )
    expect(clearHeldInputSource).toMatch(
      /setMovement\(\{\s+crouch: false,\s+jump: false,\s+run: false,\s+worldDirection: null,/,
    )
    expect(clientSource).toContain('motion.crouching = physicsController.crouching')
    expect(clientSource).toContain('const webGLClippingPlanesRef = useRef([')
    expect(clientSource).toContain('updateLandrushRobotScreenRevealWebGLDepthPlane({')
    expect(clientSource.match(/clippingPlanes: webGLClippingPlanesRef\.current/g)).toHaveLength(1)
    expect(clientSource).not.toContain('clippingPlanes: clippingPlanesRef.current')
    expect(clientSource).not.toContain('renderer.clippingPlanes')
    expect(hostSource.match(/<Viewer\b/g)).toHaveLength(1)
    expect(hostSource).toContain('{children}')
    expect(hostSource).toContain('onSceneReadyChange: (ready: boolean) => void')
    expect(hostSource).toContain('onSceneReadyChange={onSceneReadyChange}')
    expect(hostSource).toContain('sceneReadyKey={viewerSceneReadyKey}')
    expect(hostSource).toContain('JSON.stringify([sceneReadyKey, sceneLoadRevision])')
    expect(hostSource).toContain('sceneReadyPrerequisitesReady={sceneReadyPrerequisitesReady}')
    expect(hostSource).toContain('sceneReadyMaxWaitMs={sceneReadyMaxWaitMs}')
    expect(hostSource).toContain('renderDpr?: ViewerRenderDpr')
    expect(hostSource).toContain('renderDpr={renderDpr}')
  })
})
