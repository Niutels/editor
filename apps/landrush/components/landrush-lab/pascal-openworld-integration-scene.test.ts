import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Pascal multiplayer-island composition', () => {
  test('canonical route composes the Landrush client through one Pascal viewer host', () => {
    const routeSource = readFileSync(
      join(import.meta.dir, '../../app/landrush-lab/pascal-multiplayer-island/page.tsx'),
      'utf8',
    )
    const clientSource = readFileSync(join(import.meta.dir, 'landrush-island-client.tsx'), 'utf8')
    const hostSource = readFileSync(
      join(
        import.meta.dir,
        '../../../../packages/landrush-pascal-host/src/landrush-pascal-host.tsx',
      ),
      'utf8',
    )

    expect(routeSource).toContain("from '@/components/landrush-lab/landrush-island-client'")
    expect(routeSource).toContain('<LandrushIslandClient')
    expect(routeSource).not.toContain('progressive')
    expect(clientSource).toContain("from '@landrush/pascal-host'")
    expect(clientSource.match(/<LandrushPascalHost\b/g)).toHaveLength(1)
    expect(clientSource).not.toContain('<Viewer')
    expect(clientSource).toContain(
      'const [viewerSceneReady, setViewerSceneReady] = useState(false)',
    )
    expect(clientSource).toMatch(/const loadingAssetsReady =\s+viewerSceneReady &&/)
    expect(clientSource).toContain('onSceneReadyChange={setViewerSceneReady}')
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
    expect(hostSource.match(/<Viewer\b/g)).toHaveLength(1)
    expect(hostSource).toContain('{children}')
    expect(hostSource).toContain('onSceneReadyChange: (ready: boolean) => void')
    expect(hostSource).toContain('onSceneReadyChange={onSceneReadyChange}')
  })
})
