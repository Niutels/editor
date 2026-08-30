import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  isLandrushBuildGamepadPaletteInputReady,
  type LandrushBuildGamepadNavigationRect,
  resolveLandrushBuildGamepadDirectionalIndex,
  resolveLandrushBuildGamepadFocusAfterActivation,
  resolveLandrushBuildGamepadNavigationAction,
  resolveLandrushBuildGamepadPalettePanel,
  resolveLandrushBuildGamepadSidebarActivation,
  resolveLandrushBuildGamepadSidebarIndex,
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
const itemCatalogSource = readFileSync(
  join(
    import.meta.dir,
    '../../../../packages/editor/src/components/ui/item-catalog/item-catalog.tsx',
  ),
  'utf8',
).replaceAll('\r\n', '\n')
const itemsPanelSource = readFileSync(
  join(
    import.meta.dir,
    '../../../../packages/editor/src/components/ui/sidebar/panels/items-panel/index.tsx',
  ),
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

  test('enters the tab rail without opening a tab, then browses and activates separately', () => {
    expect(
      resolveLandrushBuildGamepadNavigationAction({ direction: 'left', focusMode: 'palette' }),
    ).toBe('enter-sidebar')
    expect(
      resolveLandrushBuildGamepadNavigationAction({ direction: 'down', focusMode: 'sidebar' }),
    ).toBe('move-sidebar')
    expect(
      resolveLandrushBuildGamepadNavigationAction({ direction: 'left', focusMode: 'sidebar' }),
    ).toBeNull()
    expect(
      resolveLandrushBuildGamepadNavigationAction({ direction: 'right', focusMode: 'sidebar' }),
    ).toBe('leave-sidebar')
    expect(
      resolveLandrushBuildGamepadSidebarIndex({
        currentIndex: 0,
        direction: 'down',
        itemCount: 3,
      }),
    ).toBe(1)
    expect(
      resolveLandrushBuildGamepadSidebarIndex({
        currentIndex: 2,
        direction: 'down',
        itemCount: 3,
      }),
    ).toBe(0)
    expect(
      resolveLandrushBuildGamepadSidebarIndex({
        currentIndex: 0,
        direction: 'up',
        itemCount: 3,
      }),
    ).toBe(2)
    expect(
      resolveLandrushBuildGamepadSidebarIndex({
        currentIndex: 0,
        direction: 'up',
        itemCount: 0,
      }),
    ).toBe(-1)
    expect(
      resolveLandrushBuildGamepadSidebarActivation({
        activePanel: 'build',
        focusedPanel: 'build',
        sidebarCollapsed: false,
      }),
    ).toEqual({ palettePanel: 'build', selectPanel: false })
    expect(
      resolveLandrushBuildGamepadSidebarActivation({
        activePanel: 'build',
        focusedPanel: 'items',
        sidebarCollapsed: false,
      }),
    ).toEqual({ palettePanel: 'items', selectPanel: true })
    expect(
      resolveLandrushBuildGamepadSidebarActivation({
        activePanel: 'items',
        focusedPanel: 'items',
        sidebarCollapsed: true,
      }),
    ).toEqual({ palettePanel: 'items', selectPanel: true })
    expect(
      resolveLandrushBuildGamepadSidebarActivation({
        activePanel: 'build',
        focusedPanel: 'settings',
        sidebarCollapsed: false,
      }),
    ).toEqual({ palettePanel: null, selectPanel: true })
    expect(resolveLandrushBuildGamepadPalettePanel('build')).toBe('build')
    expect(resolveLandrushBuildGamepadPalettePanel('items')).toBe('items')
    expect(resolveLandrushBuildGamepadPalettePanel('settings')).toBeNull()
    expect(islandClientSource).toContain("gamepadBuildFocusModeRef.current = 'sidebar'")
    expect(islandClientSource).toContain('activateLandrushIslandGamepadSidebarButton(')
    expect(islandClientSource).toContain(
      "'[data-landrush-editor-sidebar-nav] [data-editor-sidebar-tab]'",
    )
    expect(islandClientSource).not.toContain(
      'resolveLandrushBuildGamepadPalettePanel(button.dataset.editorSidebarTab)',
    )
    expect(islandClientSource).toContain('return activation.palettePanel')
    expect(islandClientSource).toContain("gamepadBuildFocusModeRef.current = 'palette'")
    expect(islandClientSource).toContain('scheduleLandrushIslandCurrentGamepadBuildPaletteFocus(')
    expect(islandClientSource).not.toContain('activateLandrushIslandGamepadSidebarPanel(')
  })

  test('drills Build and Items into their palettes without treating categories as placement', () => {
    expect(islandClientSource).toContain(
      'const activePanel = resolveLandrushBuildGamepadPalettePanel(',
    )
    expect(islandClientSource).toContain('data-landrush-editor-panel=')
    expect(itemsPanelSource).toContain('data-editor-build-controller-action="palette"')
    expect(itemsPanelSource).toContain('data-editor-build-controller-item')
    expect(itemCatalogSource).toContain('data-editor-build-controller-action="placement"')
    expect(itemCatalogSource).toContain('data-editor-build-controller-item')
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
    expect(islandClientSource).toContain("editor.setContinuation('point', 'repeat')")
    expect(islandClientSource).toContain("useEditor.getState().setContinuation('point', 'once')")
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
    expect(
      isLandrushBuildGamepadPaletteInputReady({
        buildMode: true,
        focusMode: 'sidebar',
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
