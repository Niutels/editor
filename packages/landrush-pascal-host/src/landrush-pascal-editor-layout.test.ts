import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  LANDRUSH_PASCAL_EDITOR_LAYOUT_EASING,
  LANDRUSH_PASCAL_EDITOR_LAYOUT_TRANSITION_MS,
  LANDRUSH_PASCAL_EDITOR_MODE_TRANSITION_MS,
  LANDRUSH_PASCAL_EDITOR_RAIL_WIDTH,
  resolveLandrushPascalEditorLayoutTransition,
  resolveLandrushPascalEditorPresentationTransition,
  resolveLandrushPascalEditorViewportInset,
} from './landrush-pascal-editor-layout'

describe('Landrush Pascal editor layout', () => {
  test('resolves the visible editor inset from one shared rail and panel contract', () => {
    expect(
      resolveLandrushPascalEditorViewportInset({
        isCollapsed: false,
        open: false,
        panelWidth: 420,
      }),
    ).toBe(0)
    expect(
      resolveLandrushPascalEditorViewportInset({ isCollapsed: true, open: true, panelWidth: 420 }),
    ).toBe(LANDRUSH_PASCAL_EDITOR_RAIL_WIDTH)
    expect(
      resolveLandrushPascalEditorViewportInset({ isCollapsed: false, open: true, panelWidth: 420 }),
    ).toBe(LANDRUSH_PASCAL_EDITOR_RAIL_WIDTH + 420)
  })

  test('sanitizes invalid layout inputs', () => {
    expect(
      resolveLandrushPascalEditorViewportInset({
        isCollapsed: false,
        open: true,
        panelWidth: Number.NaN,
      }),
    ).toBe(LANDRUSH_PASCAL_EDITOR_RAIL_WIDTH)
    expect(resolveLandrushPascalEditorLayoutTransition(Number.NaN)).toStartWith('0ms ')
  })

  test('uses the dedicated camera-mode duration without changing settled layout timing', () => {
    expect(resolveLandrushPascalEditorPresentationTransition(false)).toBe(
      `${LANDRUSH_PASCAL_EDITOR_LAYOUT_TRANSITION_MS}ms ${LANDRUSH_PASCAL_EDITOR_LAYOUT_EASING}`,
    )
    expect(resolveLandrushPascalEditorPresentationTransition(true)).toBe(
      `${LANDRUSH_PASCAL_EDITOR_MODE_TRANSITION_MS}ms ${LANDRUSH_PASCAL_EDITOR_LAYOUT_EASING}`,
    )
  })

  test('keeps build-panel state diagnostic-only in the lifetime-stable viewer viewport', () => {
    const hostSource = readFileSync(join(import.meta.dir, 'landrush-pascal-host.tsx'), 'utf8')
    const viewportStart = hostSource.indexOf('function LandrushPascalViewerViewport')
    const viewportEnd = hostSource.indexOf('function LandrushWorldOwnedSitePresentation')
    const viewportSource = hostSource.slice(viewportStart, viewportEnd)

    expect(viewportStart).toBeGreaterThanOrEqual(0)
    expect(viewportEnd).toBeGreaterThan(viewportStart)
    expect(viewportSource).toContain('className="absolute inset-0 min-h-0 min-w-0 overflow-hidden"')
    expect(viewportSource).toContain('data-landrush-pascal-viewer-mode-transition=')
    expect(viewportSource).toContain('data-landrush-pascal-viewer-open=')
    expect(viewportSource).not.toContain('useSidebarStore(')
    expect(viewportSource).not.toContain('clipPath')
    expect(viewportSource).not.toContain('translate3d')
    expect(viewportSource).not.toContain('transition:')
    expect(viewportSource).not.toContain('style=')
  })
})
