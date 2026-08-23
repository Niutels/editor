import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  isLandrushBuildGamepadPaletteInputReady,
  type LandrushBuildGamepadNavigationRect,
  resolveLandrushBuildGamepadDirectionalIndex,
  resolveLandrushBuildGamepadFocusAfterActivation,
  shouldAutofocusLandrushBuildGamepadPalette,
} from './landrush-build-gamepad-navigation'

const buildTabSource = readFileSync(join(import.meta.dir, '../build-tab.tsx'), 'utf8').replaceAll(
  '\r\n',
  '\n',
)
const islandClientSource = readFileSync(
  join(import.meta.dir, 'landrush-island-client.tsx'),
  'utf8',
).replaceAll('\r\n', '\n')

const rects: LandrushBuildGamepadNavigationRect[] = [
  { bottom: 50, left: 0, right: 50, top: 0 },
  { bottom: 50, left: 60, right: 110, top: 0 },
  { bottom: 110, left: 0, right: 50, top: 60 },
  { bottom: 110, left: 60, right: 110, top: 60 },
]

describe('Landrush build gamepad navigation', () => {
  test('moves spatially through a two-dimensional palette without activating controls', () => {
    expect(
      resolveLandrushBuildGamepadDirectionalIndex({ currentIndex: 0, direction: 'right', rects }),
    ).toBe(1)
    expect(
      resolveLandrushBuildGamepadDirectionalIndex({ currentIndex: 0, direction: 'down', rects }),
    ).toBe(2)
    expect(
      resolveLandrushBuildGamepadDirectionalIndex({ currentIndex: 3, direction: 'left', rects }),
    ).toBe(2)
    expect(
      resolveLandrushBuildGamepadDirectionalIndex({ currentIndex: 3, direction: 'up', rects }),
    ).toBe(1)
  })

  test('keeps focus in place when no candidate exists in the requested direction', () => {
    expect(
      resolveLandrushBuildGamepadDirectionalIndex({ currentIndex: 0, direction: 'left', rects }),
    ).toBe(-1)
    expect(
      resolveLandrushBuildGamepadDirectionalIndex({ currentIndex: 1, direction: 'up', rects }),
    ).toBe(-1)
  })

  test('enters placement only for controls that declare placement semantics', () => {
    expect(resolveLandrushBuildGamepadFocusAfterActivation('placement')).toBe('placement')
    expect(resolveLandrushBuildGamepadFocusAfterActivation('palette')).toBe('palette')
    expect(resolveLandrushBuildGamepadFocusAfterActivation(undefined)).toBe('palette')
  })

  test('routes canvas modes through placement while keeping MEP as a palette drill-down', () => {
    expect(buildTabSource).toContain(
      `data-editor-build-controller-action={
                      type.id === 'mep' ? 'palette' : 'placement'
                    }`,
    )
    expect(buildTabSource).toContain(
      `{ id: 'terrain', label: 'Terrain', iconSrc: '/icons/mesh.webp', mode: 'terrain-sculpt' }`,
    )
    expect(resolveLandrushBuildGamepadFocusAfterActivation('placement')).toBe('placement')
    expect(islandClientSource).toContain(
      "buildMode && gamepadBuildFocusModeRef.current === 'placement'",
    )
    expect(islandClientSource).toContain('cancelLandrushPascalEditingRuntime()')
    expect(islandClientSource).toContain("gamepadBuildFocusModeRef.current = 'palette'")
  })

  test('keeps palette input inert until the build interaction is ready', () => {
    expect(
      isLandrushBuildGamepadPaletteInputReady({
        buildMode: true,
        focusMode: 'palette',
        interactionReady: false,
      }),
    ).toBe(false)
    expect(
      isLandrushBuildGamepadPaletteInputReady({
        buildMode: true,
        focusMode: 'palette',
        interactionReady: true,
      }),
    ).toBe(true)
    expect(
      isLandrushBuildGamepadPaletteInputReady({
        buildMode: true,
        focusMode: 'placement',
        interactionReady: true,
      }),
    ).toBe(false)
  })

  test('autofocuses the palette only after real controller input', () => {
    expect(
      shouldAutofocusLandrushBuildGamepadPalette({
        buildMode: true,
        controllerInputActive: false,
        interactionReady: true,
      }),
    ).toBe(false)
    expect(
      shouldAutofocusLandrushBuildGamepadPalette({
        buildMode: true,
        controllerInputActive: true,
        interactionReady: true,
      }),
    ).toBe(true)
    expect(islandClientSource).toContain('shouldAutofocusLandrushBuildGamepadPalette({')
  })
})
