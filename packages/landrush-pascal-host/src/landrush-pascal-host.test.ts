import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Landrush Pascal host', () => {
  test('forwards the mutable real-scene submission signal into Viewer', () => {
    const hostSource = readFileSync(join(import.meta.dir, 'landrush-pascal-host.tsx'), 'utf8')

    expect(hostSource).toContain('sceneDrawSubmissionRef?: ViewerSceneDrawSubmissionRef')
    expect(hostSource).toContain('sceneDrawSubmissionRef={sceneDrawSubmissionRef}')
    expect(hostSource).toContain('sceneDrawDisabledKeepalive?: boolean')
    expect(hostSource).toContain('sceneDrawDisabledKeepalive={sceneDrawDisabledKeepalive}')
    expect(hostSource).toContain('antialias?: boolean')
    expect(hostSource).toContain('antialias={antialias}')
    expect(hostSource).toContain(
      'onRendererInitializationFailure?: (failure: ViewerRendererInitializationFailure) => void',
    )
    expect(hostSource).toContain(
      'onRendererInitializationFailure={onRendererInitializationFailure}',
    )
  })
})
