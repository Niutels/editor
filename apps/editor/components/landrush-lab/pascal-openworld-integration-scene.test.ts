import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  createPascalOpenworldIntegrationScene,
  PASCAL_OPENWORLD_INTEGRATION_CELLS,
} from './pascal-openworld-integration-scene'
import { parsePascalOpenworldIntegrationSnapshot } from './pascal-openworld-integration-snapshot'

describe('Pascal open-world integration sidecar', () => {
  test.each(PASCAL_OPENWORLD_INTEGRATION_CELLS)('%s graph is deterministic and closed', (cell) => {
    const first = createPascalOpenworldIntegrationScene(cell)
    const second = createPascalOpenworldIntegrationScene(cell)

    expect(first).toEqual(second)
    expect(first.graph.rootNodeIds).toHaveLength(1)
    expect(first.manifest.networkEnabled).toBe(false)
    expect(first.manifest.rendererContract).toBe('one-pascal-viewer')

    for (const node of Object.values(first.graph.nodes)) {
      if (!('children' in node) || !Array.isArray(node.children)) continue
      for (const childId of node.children) {
        const child = first.graph.nodes[childId]
        expect(child, `${node.id} references missing child ${childId}`).toBeDefined()
        expect(child?.parentId).toBe(node.id)
      }
    }
  })

  test('Pascal cell contains a distinct two-level 90 m² house and no world', () => {
    const scene = createPascalOpenworldIntegrationScene('pascal')

    expect(scene.manifest.levelCount).toBe(2)
    expect(scene.manifest.floorAreaSquareMeters).toBe(90)
    expect(scene.manifest.worldNodeCount).toBe(0)
    expect(scene.manifest.constructionNodeCount).toBeGreaterThan(0)
    expect(nodesOfType(scene, 'level').map((node) => node.level)).toEqual([0, 1])
  })

  test('world cell contains only the deterministic Landrush world fixture', () => {
    const scene = createPascalOpenworldIntegrationScene('world')

    expect(scene.manifest.levelCount).toBe(1)
    expect(scene.manifest.floorAreaSquareMeters).toBe(0)
    expect(scene.manifest.worldNodeCount).toBe(1)
    expect(scene.manifest.constructionNodeCount).toBe(0)
    expect(nodesOfType(scene, 'landrush-world')).toHaveLength(1)
  })

  test('combined cell composes the unchanged contracts in one graph', () => {
    const baseline = createPascalOpenworldIntegrationScene('pascal')
    const combined = createPascalOpenworldIntegrationScene('combined')

    expect(combined.manifest.levelCount).toBe(baseline.manifest.levelCount)
    expect(combined.manifest.floorAreaSquareMeters).toBe(baseline.manifest.floorAreaSquareMeters)
    expect(combined.manifest.constructionNodeCount).toBe(baseline.manifest.constructionNodeCount)
    expect(combined.manifest.worldNodeCount).toBe(1)
  })

  test('fixture and full-scene runtimes stay separate while the full route reuses Landrush', () => {
    const clientSource = readFileSync(
      join(import.meta.dir, 'pascal-openworld-integration-client.tsx'),
      'utf8',
    )
    const runtimeSource = readFileSync(
      join(import.meta.dir, 'pascal-openworld-integration-runtime.tsx'),
      'utf8',
    )
    const fullRuntimeSource = readFileSync(
      join(import.meta.dir, 'pascal-openworld-full-scene-runtime.tsx'),
      'utf8',
    )

    expect(clientSource).not.toContain('@pascal-app/')
    expect(clientSource).not.toContain("from 'three'")
    expect(clientSource).toContain("import('./pascal-openworld-integration-runtime')")
    expect(clientSource).not.toContain('pascal-openworld-full-scene-runtime')
    expect(clientSource).toContain("cell === 'combined'")
    expect(clientSource).toContain('data-renderer-state')
    expect(runtimeSource).not.toContain('landrush-island-client')
    expect(runtimeSource).not.toContain('world-multiplayer-lab-client')
    expect(runtimeSource).not.toContain('WebSocket')
    expect(runtimeSource).not.toContain('<Canvas')
    expect(runtimeSource.match(/<Viewer\b/g)).toHaveLength(1)
    expect(fullRuntimeSource).toContain("from './landrush-island-client'")
    expect(fullRuntimeSource).toContain('<LandrushIslandClient')
    expect(fullRuntimeSource).toContain('useState')
    expect(fullRuntimeSource).toContain('writeOfflineParcelWorldState(')
    expect(fullRuntimeSource).not.toContain('data-landrush-full-scene-sidecar')
    expect(fullRuntimeSource).not.toContain('<aside')
    expect(fullRuntimeSource).not.toContain('Preparing the isolated Landrush scene')
    expect(fullRuntimeSource).not.toContain('WebSocket')
  })

  test('persisted server state is reduced to the current island snapshot', () => {
    const snapshot = parsePascalOpenworldIntegrationSnapshot({
      savedAt: 42,
      schemaVersion: 1,
      worlds: [
        {
          builds: [],
          ownerships: [],
          tvMediaStates: [],
          worldId: 'unrelated-world',
        },
        {
          builds: [
            {
              nodes: [
                { id: 'level_1', type: 'level' },
                { id: 'wall_1', type: 'wall' },
              ],
              parcelId: 'parcel-1',
              updatedAt: 40,
              updatedBy: 'builder-1',
              worldId: 'landrush-world:landrush-island:test',
            },
          ],
          ownerships: [
            {
              claimedAt: 30,
              owner: { color: '#fff', id: 'builder-1', name: 'Builder' },
              parcelId: 'parcel-1',
              worldId: 'landrush-world:landrush-island:test',
            },
          ],
          tvMediaStates: [],
          worldId: 'landrush-world:landrush-island:test',
        },
      ],
    })

    expect(snapshot?.worldId).toBe('landrush-world:landrush-island:test')
    expect(snapshot?.builds).toHaveLength(1)
    expect(snapshot?.ownerships).toHaveLength(1)
    expect(snapshot?.buildNodeCount).toBe(2)
    expect(snapshot?.savedAt).toBe(42)
  })

  test('fixture route redirects localhost and sends the full cell to its direct route', () => {
    const source = readFileSync(
      join(import.meta.dir, '../../app/landrush-lab/pascal-openworld-integration-lab/page.tsx'),
      'utf8',
    )

    expect(source).toContain("host.toLowerCase().startsWith('localhost')")
    expect(source).toContain('http://127.0.0.1:')
    expect(source).toContain('/landrush-lab/pascal-openworld-integration-sidecar.html')
    expect(source).toContain("initialCell === 'combined'")
    expect(source).toContain('/landrush-lab/pascal-openworld-integration-full-scene.html')
    expect(source).toContain("initialCell === 'combined' && !initialRunning")
    expect(source.indexOf('redirect(')).toBeLessThan(
      source.indexOf('<PascalOpenworldIntegrationClient'),
    )
  })

  test('full-scene route preserves the normal player view while loading the persisted layout', () => {
    const source = readFileSync(
      join(
        import.meta.dir,
        '../../app/landrush-lab/pascal-openworld-integration-full-scene/page.tsx',
      ),
      'utf8',
    )

    expect(source).toContain("query.set('offline', '1')")
    expect(source).not.toContain("query.set('map', '1')")
    expect(source).toContain("query.set('integrationSidecar', '1')")
    expect(source).toContain("query.delete('rendererBackend')")
    expect(source).not.toContain("query.set('rendererBackend'")
    expect(source).toContain("query.set('embedded', '1')")
    expect(source).toContain('loadPascalOpenworldIntegrationSnapshot()')
    expect(source).toContain('loadLandrushBenchmarkReport(')
    expect(source).toContain('<PascalOpenworldFullSceneRuntime')
  })

  test('full-scene shell runs the real localhost scene in a credentialless frame', () => {
    const source = readFileSync(
      join(
        import.meta.dir,
        '../../public/landrush-lab/pascal-openworld-integration-full-scene.html',
      ),
      'utf8',
    )

    expect(source).toContain('<iframe')
    expect(source).toContain('credentialless')
    expect(source).toContain('http://localhost:')
    expect(source).toContain("params.set('offline', '1')")
    expect(source).toContain("params.set('embedded', '1')")
    expect(source).not.toContain("params.set('map', '1')")
    expect(source).toContain("params.delete('rendererBackend')")
    expect(source).not.toContain("params.set('rendererBackend'")
    expect(source).not.toContain('data-boundary-status')
    expect(source).not.toContain('class="boundary"')
    expect(source).not.toContain('WebSocket')
  })

  test('standalone launcher performs no app, GPU, storage, or multiplayer bootstrap', () => {
    const source = readFileSync(
      join(import.meta.dir, '../../public/landrush-lab/pascal-openworld-integration-sidecar.html'),
      'utf8',
    )

    expect(source).toContain('data-renderer-state="parked"')
    expect(source).toContain("runtime.searchParams.set('run', '1')")
    expect(source).toContain("runtime.searchParams.set('offline', '1')")
    expect(source).not.toContain("runtime.searchParams.set('map', '1')")
    expect(source).not.toContain("runtime.searchParams.set('rendererBackend'")
    expect(source).toContain('/landrush-lab/pascal-openworld-integration-full-scene.html')
    expect(source).toContain('Same full page composition')
    expect(source).not.toContain('<script src=')
    expect(source).not.toContain('<canvas')
    expect(source).not.toContain('localStorage')
    expect(source).not.toContain('WebSocket')
  })
})

function nodesOfType(
  scene: ReturnType<typeof createPascalOpenworldIntegrationScene>,
  type: string,
) {
  return Object.values(scene.graph.nodes).filter((node) => node.type === type) as Array<{
    level?: number
  }>
}
