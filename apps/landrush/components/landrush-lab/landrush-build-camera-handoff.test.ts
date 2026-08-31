import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { advanceLandrushBuildCameraHandoff } from './landrush-build-camera-handoff'

describe('Landrush build camera handoff', () => {
  test('keeps the settled transition pose until camera interaction is ready', () => {
    expect(
      advanceLandrushBuildCameraHandoff({
        cameraControlsAvailable: true,
        cameraControlsReady: false,
        controlHandoffFrames: 0,
      }),
    ).toEqual({
      applySettledPose: true,
      controlHandoffFrames: 0,
      handoffComplete: false,
      seedCameraControls: false,
    })
  })

  test('releases the transition immediately when no camera controls exist', () => {
    expect(
      advanceLandrushBuildCameraHandoff({
        cameraControlsAvailable: false,
        cameraControlsReady: true,
        controlHandoffFrames: 0,
      }),
    ).toEqual({
      applySettledPose: false,
      controlHandoffFrames: 0,
      handoffComplete: true,
      seedCameraControls: false,
    })
  })

  test('seeds available camera controls for three frames before releasing', () => {
    let controlHandoffFrames = 0

    for (const handoffComplete of [false, false, true]) {
      const step = advanceLandrushBuildCameraHandoff({
        cameraControlsAvailable: true,
        cameraControlsReady: true,
        controlHandoffFrames,
      })
      controlHandoffFrames = step.controlHandoffFrames

      expect(step).toEqual({
        applySettledPose: true,
        controlHandoffFrames,
        handoffComplete,
        seedCameraControls: true,
      })
    }

    expect(controlHandoffFrames).toBe(3)
  })

  test('preserves the settled build pose while the active parcel is temporarily unavailable', () => {
    const source = readFileSync(new URL('./landrush-island-client.tsx', import.meta.url), 'utf8')
    const rigStart = source.indexOf('function LandrushIslandBuildCameraRig')
    const rigEnd = source.indexOf('function LandrushIslandBuildCameraPointerController', rigStart)

    expect(rigStart).toBeGreaterThanOrEqual(0)
    expect(rigEnd).toBeGreaterThan(rigStart)
    expect(source.slice(rigStart, rigEnd)).not.toContain('buildCameraPoseRef.current = null')
    expect(source).toContain('buildCameraPoseRef.current ?? playerCameraPoseRef.current')
  })

  test('keeps one host-owned default camera across wall placement remounts', () => {
    const islandSource = readFileSync(
      new URL('./landrush-island-client.tsx', import.meta.url),
      'utf8',
    )
    const viewerSource = readFileSync(
      new URL('../../../../packages/viewer/src/components/viewer/index.tsx', import.meta.url),
      'utf8',
    )
    const hostSource = readFileSync(
      new URL(
        '../../../../packages/landrush-pascal-host/src/landrush-pascal-host.tsx',
        import.meta.url,
      ),
      'utf8',
    )
    const hostMountStart = islandSource.indexOf('<LandrushPascalHost')
    const hostMountEnd = islandSource.indexOf('</LandrushPascalHost>', hostMountStart)
    const viewerComponentStart = viewerSource.indexOf('const Viewer = forwardRef')
    const viewerCanvasStart = viewerSource.indexOf('<Canvas', viewerComponentStart)
    const viewerCanvasEnd = viewerSource.indexOf('</Canvas>', viewerCanvasStart)
    const playerLayerStart = islandSource.indexOf('function LandrushIslandPlayerLayer')
    const playerLayerEnd = islandSource.indexOf(
      'function LandrushIslandRevealProofOccluder',
      playerLayerStart,
    )

    expect(viewerSource).toContain('defaultCamera = <ViewerCamera />')
    expect(viewerSource).toContain('{defaultCamera}')
    expect(hostSource).toContain('defaultCamera={defaultCamera}')
    expect(hostMountStart).toBeGreaterThanOrEqual(0)
    expect(hostMountEnd).toBeGreaterThan(hostMountStart)
    expect(viewerComponentStart).toBeGreaterThanOrEqual(0)
    expect(viewerCanvasStart).toBeGreaterThan(viewerComponentStart)
    expect(viewerCanvasEnd).toBeGreaterThan(viewerCanvasStart)
    expect(playerLayerStart).toBeGreaterThanOrEqual(0)
    expect(playerLayerEnd).toBeGreaterThan(playerLayerStart)

    const hostMount = islandSource.slice(hostMountStart, hostMountEnd)
    const viewerCanvas = viewerSource.slice(viewerCanvasStart, viewerCanvasEnd)
    const playerLayer = islandSource.slice(playerLayerStart, playerLayerEnd)
    expect(viewerSource.match(/<ViewerCamera\s*\/>/g) ?? []).toHaveLength(1)
    expect(viewerCanvas.match(/\{defaultCamera\}/g) ?? []).toHaveLength(1)
    expect(viewerCanvas).not.toContain('<ViewerCamera')
    expect(islandSource.match(/<PerspectiveCamera\b/g) ?? []).toHaveLength(1)
    expect(islandSource.match(/<LandrushIslandPoseCamera\b/g) ?? []).toHaveLength(1)
    expect(hostMount).toMatch(/defaultCamera=\{\s*<LandrushIslandPoseCamera\b/)
    expect(playerLayer).not.toContain('<LandrushIslandPoseCamera')
  })
})
