import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const clientSource = readFileSync(
  new URL('./zombie-shoulder-torch-debug-client.tsx', import.meta.url),
  'utf8',
)
const routeSource = readFileSync(
  new URL('../../app/landrush-lab/zombie-shoulder-torch-debug/page.tsx', import.meta.url),
  'utf8',
)
const stateSource = readFileSync(
  new URL('./zombie-shoulder-torch-debug-state.ts', import.meta.url),
  'utf8',
)
const robotSource = readFileSync(
  new URL(
    '../../../../packages/landrush-pascal-plugin/src/landrush-world/landrush-robot.tsx',
    import.meta.url,
  ),
  'utf8',
)

describe('zombie shoulder torch debug render ownership', () => {
  test('renders once after every scene and camera mutation, then samples metrics', () => {
    const robotFramePriority = readRequiredNumber(
      clientSource,
      /<LandrushRobot\s[\s\S]*?framePriority=\{(-?\d+(?:\.\d+)?)\}/,
    )
    const torchFramePriority = readRequiredNumber(
      clientSource,
      /<LandrushRobotShoulderTorchRig\s[\s\S]*?framePriority=\{(-?\d+(?:\.\d+)?)\}/,
    )
    const subjectPriority = readComponentFramePriority(
      clientSource,
      'ZombieShoulderTorchRobotSubject',
      'ZombieShoulderTorchDebugManualRenderDriver',
    )
    const cameraPriority = readComponentFramePriority(
      clientSource,
      'ZombieShoulderTorchDebugCameraRig',
      'ZombieShoulderTorchDebugWorld',
    )
    const renderPriority = readComponentFramePriority(
      clientSource,
      'ZombieShoulderTorchDebugManualRenderDriver',
      'ZombieShoulderTorchDebugMetricsReporter',
    )
    const metricsPriority = readComponentFramePriority(
      clientSource,
      'ZombieShoulderTorchDebugMetricsReporter',
      'ZombieShoulderTorchBeamTargets',
    )

    expect(clientSource).toContain('<ZombieShoulderTorchDebugManualRenderDriver')
    expect(clientSource.match(/gl\.render\(scene, camera\)/g)).toHaveLength(1)
    expect(renderPriority).toBeGreaterThan(robotFramePriority)
    expect(renderPriority).toBeGreaterThan(torchFramePriority)
    expect(renderPriority).toBeGreaterThan(subjectPriority)
    expect(renderPriority).toBeGreaterThan(cameraPriority)
    expect(metricsPriority).toBeGreaterThan(renderPriority)
  })

  test('changes fixed views without remounting the canvas and supports lossless captures', () => {
    const canvasStart = clientSource.indexOf('<Canvas')
    const canvasEnd = clientSource.indexOf('\n      >', canvasStart)
    expect(canvasStart).toBeGreaterThan(-1)
    expect(canvasEnd).toBeGreaterThan(canvasStart)
    const canvasOpeningTag = clientSource.slice(canvasStart, canvasEnd)
    expect(canvasOpeningTag).not.toContain('key=')
    expect(clientSource).toContain('preserveDrawingBuffer: true')
    expect(clientSource).toContain("canvas.toBlob(resolve, 'image/png')")
    expect(clientSource).toContain("url.searchParams.set('camera', debugState.cameraDistance)")
    expect(clientSource).toContain("url.searchParams.set('angle', debugState.angle)")
    expect(clientSource).toContain("url.searchParams.set('mode', debugState.mode)")
    expect(clientSource).toContain("beamOpacityScale={mode === 'volume' ? 4 : 1}")
    expect(clientSource).toContain('animationPace={0}')
    expect(robotSource).toMatch(/animationPace === 0\s*\? 0\s*: MathUtils\.clamp/)

    for (const prop of ['initialAngle', 'initialCameraDistance', 'initialMode']) {
      expect(routeSource).toContain(`${prop}={`)
    }
    for (const literal of [
      'near',
      'design',
      'far',
      'front',
      'side',
      'top',
      'rear',
      'final',
      'no-post',
      'volume',
      'surface',
    ]) {
      expect(stateSource).toContain(`'${literal}'`)
    }
  })

  test('acknowledges captures and metrics only after the complete selected state renders', () => {
    expect(clientSource).toMatch(/const stateKey = `\$\{cameraKey\}:\$\{debugState\.mode\}`/)
    expect(clientSource).toMatch(/const renderToken = `\$\{stateKey\}:\$\{selection\.revision\}`/)
    expect(clientSource).toContain('renderedToken === renderToken')
    expect(clientSource).toContain('onRendered={setRenderedToken}')
    expect(clientSource).toContain('settledFrameCountRef.current < 3')
    expect(clientSource).toContain('metrics.renderToken === renderToken')
    expect(clientSource).toContain('sampledRenderTokenRef.current !== renderToken')
    expect(clientSource).toContain('revision: current.revision + 1')
  })

  test('keeps the production beam and physical surface-light paths independently inspectable', () => {
    expect(clientSource).toContain('<LandrushRobotShoulderTorchRig')
    expect(clientSource).toContain('emitSpotLights={presentation.emitSpotLights}')
    expect(clientSource).toContain('showBeams={presentation.showBeams}')
    expect(clientSource).toContain('showFixtures={presentation.showFixtures}')
    expect(stateSource).toContain('surface: {\n    emitSpotLights: true')
    expect(stateSource).toContain('volume: {\n    emitSpotLights: false')
  })
})

function readComponentFramePriority(source: string, component: string, nextComponent: string) {
  const section = source.slice(
    source.indexOf(`function ${component}`),
    source.indexOf(`function ${nextComponent}`),
  )
  return readRequiredNumber(section, /useFrame\([\s\S]*?,\s*(-?\d+(?:\.\d+)?)\s*\)/)
}

function readRequiredNumber(source: string, pattern: RegExp) {
  const match = source.match(pattern)
  expect(match).not.toBeNull()
  return Number(match?.[1])
}
