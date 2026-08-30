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

describe('zombie shoulder torch debug render ownership', () => {
  test('renders once after every positive-priority debug update', () => {
    const debugFramePriority = readRequiredNumber(
      clientSource,
      /useFrame\(\(\) => \{[\s\S]*?\},\s*(-?\d+(?:\.\d+)?)\s*\)/,
    )
    const robotFramePriority = readRequiredNumber(
      clientSource,
      /<LandrushRobot\s[\s\S]*?framePriority=\{(-?\d+(?:\.\d+)?)\}/,
    )
    const torchFramePriority = readRequiredNumber(
      clientSource,
      /<LandrushRobotShoulderTorchRig\s[\s\S]*?framePriority=\{(-?\d+(?:\.\d+)?)\}/,
    )
    const renderDriver = clientSource.slice(
      clientSource.indexOf('function ZombieShoulderTorchDebugManualRenderDriver'),
      clientSource.indexOf('function ZombieShoulderTorchBeamTargets'),
    )
    const renderPriority = readRequiredNumber(
      renderDriver,
      /useFrame\([\s\S]*?,\s*(-?\d+(?:\.\d+)?)\s*\)/,
    )

    expect(clientSource).toContain('<ZombieShoulderTorchDebugManualRenderDriver />')
    expect(renderDriver).toContain('gl.render(scene, camera)')
    expect(clientSource.match(/gl\.render\(scene, camera\)/g)).toHaveLength(1)
    expect(renderPriority).toBeGreaterThan(debugFramePriority)
    expect(renderPriority).toBeGreaterThan(robotFramePriority)
    expect(renderPriority).toBeGreaterThan(torchFramePriority)
  })

  test('accepts every deterministic origin close-up through the route query', () => {
    const viewResolver = routeSource.slice(
      routeSource.indexOf('function resolveDebugView'),
      routeSource.indexOf('function resolveDebugMode'),
    )

    for (const view of ['origin-front', 'origin-right', 'origin-rear', 'origin-top']) {
      expect(viewResolver).toContain(`requested === '${view}'`)
    }
  })
})

function readRequiredNumber(source: string, pattern: RegExp) {
  const match = source.match(pattern)
  expect(match).not.toBeNull()
  return Number(match?.[1])
}
