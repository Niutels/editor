import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  isLandrushBuildGamepadNavigationInputReady,
  isLandrushBuildGamepadPaletteInputReady,
  type LandrushBuildGamepadNavigationRect,
  resolveLandrushBuildGamepadCirclePressAction,
  resolveLandrushBuildGamepadDirectionalIndex,
  resolveLandrushBuildGamepadFocusAfterActivation,
  resolveLandrushBuildGamepadNavigationAction,
  resolveLandrushBuildGamepadPalettePanel,
  resolveLandrushBuildGamepadPlacementSquareOwnership,
  resolveLandrushBuildGamepadSidebarActivation,
  resolveLandrushBuildGamepadSidebarIndex,
  resolveLandrushBuildGamepadSquarePressAction,
  shouldApplyLandrushBuildGamepadPaletteAutofocus,
  shouldAutofocusLandrushBuildGamepadPalette,
  shouldShowLandrushBuildGamepadPlacementCursor,
  wasLandrushBuildGamepadPlacementConfirmPressed,
} from './landrush-build-gamepad-navigation'
import { resolveLandrushIslandCameraOwner } from './landrush-island-camera-owner'

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

  test('lets Square/X enter Build but never race a placement into exiting Build', () => {
    expect(resolveLandrushBuildGamepadSquarePressAction(false)).toBe('toggle-build')
    expect(resolveLandrushBuildGamepadSquarePressAction(true)).toBe('confirm-placement')
    expect(islandClientSource).toContain("squareAction === 'toggle-build'")
    expect(islandClientSource).toContain(
      'const gamepadBuildPlacementSquareOwnedRef = useRef(false)',
    )
    expect(islandClientSource).toContain('resolveLandrushBuildGamepadPlacementSquareOwnership({')
    const squareCommandSource = islandClientSource.slice(
      islandClientSource.indexOf('const activateGamepadSquareCommand'),
      islandClientSource.indexOf('const activateGamepadTriangleCommand'),
    )
    expect(squareCommandSource).toMatch(
      /resolveLandrushBuildGamepadSquarePressAction\(\s+buildModeRef\.current,\s+gamepadBuildPlacementSquareOwnedRef\.current,\s+\) !== 'toggle-build'/,
    )
    expect(squareCommandSource).not.toContain('enterPlayerView')
    expect(squareCommandSource.indexOf("!== 'toggle-build'")).toBeLessThan(
      squareCommandSource.indexOf("gamepadBuildFocusModeRef.current = 'palette'"),
    )
    expect(islandClientSource).toMatch(
      /const squareAction = resolveLandrushBuildGamepadSquarePressAction\(\s+buildMode,\s+gamepadBuildPlacementSquareOwnedRef\.current,\s+\)/,
    )
    expect(islandClientSource).toContain(
      "focusModeRef.current !== 'placement' || activeTool === null",
    )
    expect(islandClientSource).toContain('square: buildMode')
    expect(islandClientSource).toContain("label: 'Place'")
    expect(islandClientSource).toContain("label: 'Build'")
    expect(islandClientSource).not.toContain("buildMode ? 'Exit build' : 'Build'")
  })

  test('enters Build inside Build content without preactivating a main tab', () => {
    const prepareChromeSource = islandClientSource.slice(
      islandClientSource.indexOf('function prepareLandrushIslandBuildEditorChrome'),
      islandClientSource.indexOf('function readLandrushIslandGamepadButtonState'),
    )
    expect(prepareChromeSource).toContain(
      "if (editor.activeSidebarPanel !== 'build') editor.setActiveSidebarPanel('build')",
    )

    const squareCommandSource = islandClientSource.slice(
      islandClientSource.indexOf('const activateGamepadSquareCommand'),
      islandClientSource.indexOf('const activateGamepadTriangleCommand'),
    )
    expect(squareCommandSource).toContain("gamepadBuildFocusModeRef.current = 'palette'")
    expect(
      squareCommandSource.indexOf("gamepadBuildFocusModeRef.current = 'palette'"),
    ).toBeLessThan(squareCommandSource.indexOf('enterBuildView(localOwnedParcel.id)'))

    const directionalNavigationSource = islandClientSource.slice(
      islandClientSource.indexOf('if (paletteDirection) {'),
      islandClientSource.indexOf('if (crossPressed && !paletteDirection) {'),
    )
    expect(directionalNavigationSource).not.toContain('activateLandrushIslandGamepadSidebarButton(')
    expect(directionalNavigationSource).not.toContain('setActiveSidebarPanel(')
  })

  test('keeps final wall Square/X placement-owned until release without changing camera owner', () => {
    let placementSquareOwned = false
    let exitCount = 0
    let viewMode: 'build' | 'player' = 'build'
    const advanceHeldSquare = (editorPlacementActive: boolean) => {
      placementSquareOwned = resolveLandrushBuildGamepadPlacementSquareOwnership({
        editorPlacementActive,
        placementSquareOwned,
        squareHeld: true,
      })
      const action = resolveLandrushBuildGamepadSquarePressAction(
        viewMode === 'build',
        placementSquareOwned,
      )
      if (action === 'toggle-build') {
        exitCount += 1
        viewMode = 'player'
      }
      return action
    }

    expect(advanceHeldSquare(true)).toBe('confirm-placement')
    expect(advanceHeldSquare(false)).toBe('confirm-placement')
    expect(exitCount).toBe(0)
    expect(
      resolveLandrushIslandCameraOwner({
        viewMode,
        zombieEscapeNightActive: false,
      }),
    ).toBe('build')

    placementSquareOwned = resolveLandrushBuildGamepadPlacementSquareOwnership({
      editorPlacementActive: false,
      placementSquareOwned,
      squareHeld: false,
    })
    expect(placementSquareOwned).toBe(false)
    expect(resolveLandrushBuildGamepadSquarePressAction(false, placementSquareOwned)).toBe(
      'toggle-build',
    )
  })

  test('keeps an auto-armed Wall cursor hidden until deliberate gamepad engagement', () => {
    expect(
      shouldShowLandrushBuildGamepadPlacementCursor({
        editorPlacementActive: true,
        focusMode: 'palette',
        gamepadPlacementEngaged: false,
        parcelAvailable: true,
        visible: true,
      }),
    ).toBe(false)
    expect(
      shouldShowLandrushBuildGamepadPlacementCursor({
        editorPlacementActive: true,
        focusMode: 'placement',
        gamepadPlacementEngaged: false,
        parcelAvailable: true,
        visible: true,
      }),
    ).toBe(false)
    expect(
      shouldShowLandrushBuildGamepadPlacementCursor({
        editorPlacementActive: true,
        focusMode: 'placement',
        gamepadPlacementEngaged: true,
        parcelAvailable: true,
        visible: false,
      }),
    ).toBe(false)
    expect(
      shouldShowLandrushBuildGamepadPlacementCursor({
        editorPlacementActive: true,
        focusMode: 'placement',
        gamepadPlacementEngaged: true,
        parcelAvailable: true,
        visible: true,
      }),
    ).toBe(true)
    expect(islandClientSource).toContain('shouldShowLandrushBuildGamepadPlacementCursor({')
    expect(islandClientSource).toContain('gamepadPlacementEngagedRef.current = false')
    expect(islandClientSource).toContain(
      'if (input.strength > 0 || confirmPressed) gamepadPlacementEngagedRef.current = true',
    )
    expect(islandClientSource).toContain('<ringGeometry args={[0.72, 1, 32]} />')
    expect(islandClientSource).not.toContain('<circleGeometry args={[1, 32]} />')
  })

  test('treats Cross/A and Square/X as one rearmable placement-confirm edge', () => {
    let confirmHeld = false
    const advance = (crossHeld: boolean, squareHeld: boolean) => {
      const pressed = wasLandrushBuildGamepadPlacementConfirmPressed(
        crossHeld,
        squareHeld,
        confirmHeld,
      )
      confirmHeld = crossHeld || squareHeld
      return pressed
    }

    expect(advance(false, true)).toBe(true)
    expect(advance(true, true)).toBe(false)
    expect(advance(true, false)).toBe(false)
    expect(advance(false, false)).toBe(false)
    expect(advance(true, false)).toBe(true)
    expect(advance(true, true)).toBe(false)
    expect(advance(false, false)).toBe(false)
    expect(advance(true, true)).toBe(true)
    expect(islandClientSource).toContain('wasLandrushBuildGamepadPlacementConfirmPressed(')
  })

  test('lets palette navigation replace an auto-armed Wall with Door', () => {
    expect(isLandrushBuildGamepadNavigationInputReady(true, 'palette', true)).toBe(true)
    expect(isLandrushBuildGamepadNavigationInputReady(true, 'sidebar', true)).toBe(true)
    expect(isLandrushBuildGamepadNavigationInputReady(true, 'placement', true)).toBe(false)
    expect(isLandrushBuildGamepadNavigationInputReady(true, 'palette', false)).toBe(false)
    expect(isLandrushBuildGamepadNavigationInputReady(false, 'palette', true)).toBe(false)
    expect(islandClientSource).toContain('isLandrushBuildGamepadNavigationInputReady(')
    expect(islandClientSource).not.toContain(
      'isLandrushBuildGamepadNavigationInputReady(\n          buildMode,\n          gamepadBuildFocusModeRef.current,\n          buildEditorInteractionReady,\n          editorPlacementActive,',
    )
  })

  test('uses Circle alone to move out through placement, palette, tabs, and Build', () => {
    expect(resolveLandrushBuildGamepadCirclePressAction('placement')).toBe('cancel-placement')
    expect(resolveLandrushBuildGamepadCirclePressAction('palette')).toBe('enter-sidebar')
    expect(resolveLandrushBuildGamepadCirclePressAction('sidebar')).toBe('exit-build')

    const circleCommandSource = islandClientSource.slice(
      islandClientSource.indexOf('const activateGamepadCircleCommand'),
      islandClientSource.indexOf('const activateGamepadBuildPaletteCommand'),
    )
    expect(circleCommandSource).toContain('resolveLandrushBuildGamepadCirclePressAction(')
    expect(circleCommandSource).toContain("circleAction === 'cancel-placement'")
    expect(circleCommandSource).toContain("circleAction === 'enter-sidebar'")
    expect(circleCommandSource).toContain("gamepadBuildFocusModeRef.current = 'sidebar'")
    expect(circleCommandSource).toContain('focusLandrushIslandCurrentGamepadSidebarButton(')
    expect(circleCommandSource).toContain('enterPlayerView')
  })

  test('locks D-pad navigation inside either the current palette or the main tab rail', () => {
    for (const direction of ['down', 'left', 'right', 'up'] as const) {
      expect(resolveLandrushBuildGamepadNavigationAction({ direction, focusMode: 'palette' })).toBe(
        'move-palette',
      )
      expect(
        resolveLandrushBuildGamepadNavigationAction({ direction, focusMode: 'placement' }),
      ).toBeNull()
    }
    expect(
      resolveLandrushBuildGamepadNavigationAction({ direction: 'down', focusMode: 'sidebar' }),
    ).toBe('move-sidebar')
    expect(
      resolveLandrushBuildGamepadNavigationAction({ direction: 'up', focusMode: 'sidebar' }),
    ).toBe('move-sidebar')
    expect(
      resolveLandrushBuildGamepadNavigationAction({ direction: 'left', focusMode: 'sidebar' }),
    ).toBeNull()
    expect(
      resolveLandrushBuildGamepadNavigationAction({ direction: 'right', focusMode: 'sidebar' }),
    ).toBeNull()
  })

  test('browses the main tab rail without opening tabs, then enters all three with Cross', () => {
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
    ).toEqual({ palettePanel: 'settings', selectPanel: true })
    expect(resolveLandrushBuildGamepadPalettePanel('build')).toBe('build')
    expect(resolveLandrushBuildGamepadPalettePanel('items')).toBe('items')
    expect(resolveLandrushBuildGamepadPalettePanel('settings')).toBe('settings')
    expect(resolveLandrushBuildGamepadPalettePanel('site')).toBeNull()
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
    expect(islandClientSource).not.toContain("navigationAction === 'enter-sidebar'")
    expect(islandClientSource).not.toContain("navigationAction === 'leave-sidebar'")
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
    expect(islandClientSource).toContain("circleAction === 'cancel-placement'")
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

  test('does not let a delayed palette autofocus clobber controller placement intent', () => {
    expect(
      shouldApplyLandrushBuildGamepadPaletteAutofocus({
        autofocusReady: true,
        focusMode: 'palette',
      }),
    ).toBe(true)
    expect(
      shouldApplyLandrushBuildGamepadPaletteAutofocus({
        autofocusReady: true,
        focusMode: 'placement',
      }),
    ).toBe(false)
    expect(
      shouldApplyLandrushBuildGamepadPaletteAutofocus({
        autofocusReady: true,
        focusMode: 'sidebar',
      }),
    ).toBe(false)
    expect(
      shouldApplyLandrushBuildGamepadPaletteAutofocus({
        autofocusReady: false,
        focusMode: 'palette',
      }),
    ).toBe(false)
    expect(islandClientSource).toContain('shouldApplyLandrushBuildGamepadPaletteAutofocus({')
    const scheduledPaletteFocusSource = islandClientSource.slice(
      islandClientSource.indexOf('function scheduleLandrushIslandCurrentGamepadBuildPaletteFocus'),
      islandClientSource.indexOf('function moveLandrushIslandGamepadBuildPaletteFocus'),
    )
    expect(scheduledPaletteFocusSource).toContain(
      'focusModeRef: { current: LandrushBuildGamepadFocusMode }',
    )
    expect(scheduledPaletteFocusSource).toMatch(
      /window\.requestAnimationFrame\(\(\) => \{\s+if \(focusModeRef\.current !== 'palette'\) return\s+focusLandrushIslandCurrentGamepadBuildPaletteButton\(buttonRef\)/,
    )
    expect(
      islandClientSource.match(
        /scheduleLandrushIslandCurrentGamepadBuildPaletteFocus\(\s+gamepadBuildPaletteButtonRef,\s+gamepadBuildFocusModeRef,?\s+\)/g,
      ),
    ).toHaveLength(4)
    expect(islandClientSource).not.toContain(
      "gamepadBuildFocusModeRef.current = 'palette'\n    gamepadBuildSidebarButtonRef.current = null\n    scheduleLandrushIslandCurrentGamepadBuildPaletteFocus",
    )
  })

  test('preserves a held placement confirm across parcel changes', () => {
    expect(islandClientSource).toContain(
      'placementConfirmHeldRef.current = Boolean(input?.cross || input?.square)',
    )
    expect(islandClientSource).not.toContain(
      'cursorRef.current = parcel?.centroid ? { ...parcel.centroid } : null\n    emittedCursorRef.current = null\n    gamepadPlacementEngagedRef.current = false\n    placementConfirmHeldRef.current = false',
    )
  })
})
