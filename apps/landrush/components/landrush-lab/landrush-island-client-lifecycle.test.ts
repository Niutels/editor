import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('./landrush-island-client.tsx', import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n')

function sourceBetween(start: string, end: string) {
  const startIndex = source.indexOf(start)
  const endIndex = source.indexOf(end, startIndex + start.length)
  expect(startIndex).toBeGreaterThanOrEqual(0)
  expect(endIndex).toBeGreaterThan(startIndex)
  return source.slice(startIndex, endIndex)
}

describe('Landrush island client dormant runtime lifecycle', () => {
  test('keeps instrumentation opt-in while retaining the tiny rendered FPS recorder', () => {
    const fpsRecorder = sourceBetween(
      'function LandrushIslandRenderedFpsRecorder',
      'function LandrushIslandRuntimeCameraProbeDiagnostics',
    )
    const diagnostics = sourceBetween(
      'function LandrushIslandRuntimeCameraProbeDiagnostics',
      'function LandrushIslandPoseCamera',
    )

    expect(source).toContain(
      '<LandrushIslandRenderedFpsRecorder renderedFpsRef={renderedFpsRef} />',
    )
    expect(source).toContain(
      'runtimeProbeEnabled ? (\n                    <LandrushIslandRuntimeCameraProbeDiagnostics',
    )
    expect(fpsRecorder).toContain('useFrame(')
    expect(fpsRecorder).not.toContain('ResizeObserver')
    expect(fpsRecorder).not.toContain('PerformanceObserver')
    expect(diagnostics).toContain('new ResizeObserver')
    expect(diagnostics).toContain('window.setInterval(recordCurrentCamera, 50)')
    expect(diagnostics).toContain("entryTypes: ['longtask']")
    expect(diagnostics).toContain("type: 'long-animation-frame'")
  })

  test('publishes fall presentation snapshots without a private screen RAF', () => {
    const screenEffect = sourceBetween(
      'function LandrushIslandFallScreenEffect',
      'function LandrushIslandPresentationEffectDriver',
    )

    expect(source).toContain(
      'const fallPresentationSignal = useMemo(createLandrushIslandFallPresentationSignal, [])',
    )
    expect(source).toContain('fallPresentationRef.publish(next)')
    expect(screenEffect).toContain('useSyncExternalStore(')
    expect(screenEffect).not.toContain('requestAnimationFrame')
  })

  test('mounts map and build frame drivers only for their active lifecycle', () => {
    const buildGamepadHost = sourceBetween(
      'function LandrushIslandBuildGamepadPlacementController',
      'function LandrushIslandBuildGamepadPlacementDriver',
    )
    const buildGamepadDriver = sourceBetween(
      'function LandrushIslandBuildGamepadPlacementDriver',
      'function hideLandrushIslandGamepadBuildCursorVisual',
    )

    expect(source).toContain(
      'const mapGamepadActive = mapLabelsInteractive && mapView && !buildMode',
    )
    expect(source).toContain(
      '{mapGamepadActive ? (\n        <LandrushIslandParcelOwnershipGamepadDriver',
    )
    expect(source).toContain('{mapPresentationVisible || warmup.warming ? (')
    expect(source.match(/\{visible \|\| warmup\.warming \? \(/g)).toHaveLength(3)
    expect(source).toContain(
      '{visible && parcel ? (\n        <LandrushIslandBuildGamepadPlacementDriver',
    )
    expect(source).toContain('crossHeldRef.current = Boolean(readLandrushGamepadInput()?.cross)')
    expect(buildGamepadHost).toContain('const cursorRef = useRef<LandrushPoint2 | null>(null)')
    expect(buildGamepadHost).toContain(
      'cursorRef.current = parcel?.centroid ? { ...parcel.centroid } : null',
    )
    expect(buildGamepadDriver).not.toContain('cursorRef.current = { ...parcel.centroid }')
    expect(source).toContain(
      'previousButtonsRef.current = readLandrushIslandGamepadButtonState(readLandrushGamepadInput())',
    )
    expect(source).toContain(
      "effectivePresentationMode === 'hover' ? (\n        <LandrushIslandBuildRobotExitHotspotDriver",
    )
    expect(source).not.toContain('function LandrushIslandBuildRobotExitHotspot({')
  })

  test('keeps heavy visual hosts resident and removes the visual reveal scene traversal', () => {
    const ownershipLayer = sourceBetween(
      'function LandrushIslandParcelOwnershipLayer',
      'function LandrushIslandParcelOwnershipGamepadDriver',
    )
    const revealCollector = sourceBetween(
      'function collectLandrushIslandRobotRevealOccluders',
      'function refreshLandrushIslandRobotRevealOwnerBounds',
    )

    expect(ownershipLayer).toContain('{allocation.parcels.map((parcel) => (')
    expect(ownershipLayer).not.toContain('{!buildMode\n        ? allocation.parcels.map')
    expect(source).toContain('<MemoizedStandaloneOceanWorld')
    expect(source).toContain('<MemoizedProceduralRockCliffs')
    expect(source).toContain('<LandrushRobotRevealVisualRoot')
    expect(revealCollector).toContain('collectLandrushRobotRevealVisualRoots(scene)')
    expect(revealCollector).toContain('collectLandrushRobotRevealVisualOwners({')
    expect(revealCollector).not.toContain('scene.traverse(')
  })

  test('admits every map warmup only when the staged viewer can draw it', () => {
    expect(source).toContain(
      'const mapOverlayWarmupAdmitted = !zombieEscapeEnabled || !zombieStartupGates.sceneDrawDisabled',
    )
    expect(source.match(/mapOverlayWarmupAdmitted=\{mapOverlayWarmupAdmitted\}/g)).toHaveLength(2)
    expect(source.match(/warmupAdmitted=\{mapOverlayWarmupAdmitted\}/g)).toHaveLength(4)
    expect(source.match(/useLandrushIslandMapOverlayWarmup\(warmupAdmitted\)/g)).toHaveLength(4)
    const warmupHook = sourceBetween(
      'function useLandrushIslandMapOverlayWarmup',
      'function applyLandrushIslandMapOverlayWarmup',
    )
    expect(warmupHook).toContain("if (admitted && warming) renderScheduler.requestFrame('warmup')")
    expect(warmupHook).toContain('warming: admitted && warming')
    expect(warmupHook).toContain('[admitted, warming]')
    const buildMarker = sourceBetween(
      'function LandrushIslandParcelBuildMarker(',
      'function LandrushIslandParcelBuildMarkerVisualDriver',
    )
    expect(buildMarker).toContain('warmupAdmitted={warmupAdmitted}')
  })

  test('re-arms culling restoration after a strict-effects cleanup resumes warmup', () => {
    const applyWarmup = sourceBetween(
      'function applyLandrushIslandMapOverlayWarmup',
      'function restoreLandrushIslandMapOverlayWarmup',
    )
    const restoreWarmup = sourceBetween(
      'function restoreLandrushIslandMapOverlayWarmup',
      'function projectLandrushIslandScreenPoint',
    )

    expect(applyWarmup.indexOf('warmup.restored = false')).toBeGreaterThan(
      applyWarmup.indexOf('if (warmup.framesLeft <= 0)'),
    )
    expect(applyWarmup.indexOf('warmup.restored = false')).toBeLessThan(
      applyWarmup.indexOf('root.traverse('),
    )
    expect(restoreWarmup).toContain('if (warmup.restored) return')
    expect(restoreWarmup).toContain(
      'for (const object of warmup.culled) object.frustumCulled = true',
    )
    expect(restoreWarmup).toContain('warmup.culled = []')
  })
})
