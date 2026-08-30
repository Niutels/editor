import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolveViewerRenderDpr } from './viewer-render-dpr'

describe('Viewer render DPR', () => {
  test('preserves the existing device-aware defaults when no host override is supplied', () => {
    expect(resolveViewerRenderDpr(undefined, false)).toEqual([1, 1.5])
    expect(resolveViewerRenderDpr(undefined, true)).toEqual([1, 1.25])
  })

  test('uses an explicit sub-native render scale without clamping it to the default minimum', () => {
    expect(resolveViewerRenderDpr(0.7, false)).toBe(0.7)
    expect(resolveViewerRenderDpr(0.7, true)).toBe(0.7)
  })

  test('passes the resolved backing-buffer DPR to the canvas', () => {
    const viewerSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')

    expect(viewerSource).toContain(
      'const canvasDpr = resolveViewerRenderDpr(renderDpr, coarsePointer)',
    )
    expect(viewerSource).toContain('dpr={canvasDpr}')
  })
})
