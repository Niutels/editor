import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  createViewerSceneDrawSubmissionState,
  executeViewerSceneDraw,
  shouldRenderViewerEmptyScene,
} from './scene-draw-admission'

describe('Viewer scene draw admission', () => {
  test('renders the live scene only when neither the host nor diagnostics disable it', () => {
    expect(shouldRenderViewerEmptyScene(false, false)).toBe(false)
    expect(shouldRenderViewerEmptyScene(true, false)).toBe(true)
    expect(shouldRenderViewerEmptyScene(false, true)).toBe(true)
    expect(shouldRenderViewerEmptyScene(true, true)).toBe(true)
  })

  test('records successful real-scene attempts without React state', () => {
    const sceneDrawSubmissionRef = { current: createViewerSceneDrawSubmissionState() }

    expect(executeViewerSceneDraw(() => 'direct', sceneDrawSubmissionRef)).toBe('direct')
    expect(executeViewerSceneDraw(() => 'pipeline', sceneDrawSubmissionRef)).toBe('pipeline')
    expect(executeViewerSceneDraw(() => 'unobserved')).toBe('unobserved')

    expect(sceneDrawSubmissionRef.current).toEqual({
      attempts: 2,
      failures: 0,
      successfulSubmissions: 2,
    })
  })

  test('records a thrown real-scene draw as one attempt and one failure', () => {
    const sceneDrawSubmissionRef = { current: createViewerSceneDrawSubmissionState() }
    const failure = new Error('draw failed')

    expect(() =>
      executeViewerSceneDraw(() => {
        throw failure
      }, sceneDrawSubmissionRef),
    ).toThrow(failure)
    expect(sceneDrawSubmissionRef.current).toEqual({
      attempts: 1,
      failures: 1,
      successfulSubmissions: 0,
    })
  })

  test('wraps only real direct and pipeline renders, never the empty keepalive draw', () => {
    const postProcessingSource = readFileSync(
      new URL('./post-processing.tsx', import.meta.url),
      'utf8',
    ).replaceAll('\r\n', '\n')
    const emptyBranchStart = postProcessingSource.indexOf(
      'if (shouldRenderViewerEmptyScene(sceneDrawDisabled, PERF_DRAW_DISABLED))',
    )
    const emptyBranchEnd = postProcessingSource.indexOf('\n      return\n    }', emptyBranchStart)
    const emptyBranch = postProcessingSource.slice(emptyBranchStart, emptyBranchEnd)

    expect(emptyBranchStart).toBeGreaterThanOrEqual(0)
    expect(emptyBranchEnd).toBeGreaterThan(emptyBranchStart)
    expect(emptyBranch).not.toContain('executeViewerSceneDraw')
    expect(emptyBranch).toContain('if (sceneDrawDisabledKeepalive)')
    expect(postProcessingSource).toMatch(
      /executeViewerSceneDraw\(\s*\(\) => \(renderer as any\)\.render\(scene, camera\),\s*sceneDrawSubmissionRef,\s*\)/,
    )
    expect(postProcessingSource).toContain(
      'executeViewerSceneDraw(() => renderPipeline.render(), sceneDrawSubmissionRef)',
    )
    expect(postProcessingSource).toContain(';(renderer as any).render(scene, camera)')
    expect(postProcessingSource).toContain('renderPipeline.render()')
    expect(postProcessingSource.match(/if \(sceneDrawSubmissionRef\)/g)).toHaveLength(2)
  })

  test('reports renderer initialization failure through a generic Viewer callback', () => {
    const viewerSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')

    expect(viewerSource).toContain(
      'onRendererInitializationFailure?: (failure: ViewerRendererInitializationFailure) => void',
    )
    expect(viewerSource).toContain(
      'onRendererInitializationFailure?.(activeRendererInitializationFailure)',
    )
  })
})
