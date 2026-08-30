export type LandrushBuildGamepadDirection = 'down' | 'left' | 'right' | 'up'
export type LandrushBuildGamepadFocusMode = 'palette' | 'placement' | 'sidebar'
export type LandrushBuildGamepadPalettePanel = 'build' | 'items'
export type LandrushBuildGamepadNavigationAction =
  | 'enter-sidebar'
  | 'leave-sidebar'
  | 'move-palette'
  | 'move-sidebar'
export type LandrushBuildGamepadNavigationRect = {
  bottom: number
  left: number
  right: number
  top: number
}

export function resolveLandrushBuildGamepadDirectionalIndex({
  currentIndex,
  direction,
  rects,
}: {
  currentIndex: number
  direction: LandrushBuildGamepadDirection
  rects: readonly LandrushBuildGamepadNavigationRect[]
}) {
  const current = rects[currentIndex]
  if (!current) return -1

  const currentX = (current.left + current.right) / 2
  const currentY = (current.top + current.bottom) / 2
  let bestIndex = -1
  let bestScore = Number.POSITIVE_INFINITY

  for (let index = 0; index < rects.length; index += 1) {
    if (index === currentIndex) continue
    const candidate = rects[index]
    if (!candidate) continue
    const deltaX = (candidate.left + candidate.right) / 2 - currentX
    const deltaY = (candidate.top + candidate.bottom) / 2 - currentY
    const primaryDelta =
      direction === 'left'
        ? -deltaX
        : direction === 'right'
          ? deltaX
          : direction === 'up'
            ? -deltaY
            : deltaY
    if (primaryDelta <= 0) continue

    const crossAxisDelta = direction === 'left' || direction === 'right' ? deltaY : deltaX
    const score = primaryDelta + Math.abs(crossAxisDelta) * 2
    if (score < bestScore) {
      bestIndex = index
      bestScore = score
    }
  }

  return bestIndex
}

export function resolveLandrushBuildGamepadFocusAfterActivation(
  action: string | undefined,
): LandrushBuildGamepadFocusMode {
  return action === 'placement' ? 'placement' : 'palette'
}

export function resolveLandrushBuildGamepadNavigationAction({
  direction,
  focusMode,
}: {
  direction: LandrushBuildGamepadDirection
  focusMode: LandrushBuildGamepadFocusMode
}): LandrushBuildGamepadNavigationAction | null {
  if (focusMode === 'placement') return null
  if (focusMode === 'palette') return direction === 'left' ? 'enter-sidebar' : 'move-palette'
  if (direction === 'right') return 'leave-sidebar'
  if (direction === 'up' || direction === 'down') return 'move-sidebar'
  return null
}

export function resolveLandrushBuildGamepadSidebarIndex({
  currentIndex,
  direction,
  itemCount,
}: {
  currentIndex: number
  direction: 'down' | 'up'
  itemCount: number
}) {
  if (itemCount <= 0) return -1
  const safeIndex = currentIndex >= 0 && currentIndex < itemCount ? currentIndex : 0
  return (safeIndex + (direction === 'down' ? 1 : -1) + itemCount) % itemCount
}

export function resolveLandrushBuildGamepadPalettePanel(
  panel: string | undefined,
): LandrushBuildGamepadPalettePanel | null {
  return panel === 'build' || panel === 'items' ? panel : null
}

export function resolveLandrushBuildGamepadSidebarActivation({
  activePanel,
  focusedPanel,
  sidebarCollapsed,
}: {
  activePanel: string
  focusedPanel: string | undefined
  sidebarCollapsed: boolean
}) {
  if (!focusedPanel) return null
  return {
    palettePanel: resolveLandrushBuildGamepadPalettePanel(focusedPanel),
    selectPanel: sidebarCollapsed || activePanel !== focusedPanel,
  }
}

export function isLandrushBuildGamepadPaletteInputReady({
  buildMode,
  focusMode,
  interactionReady,
}: {
  buildMode: boolean
  focusMode: LandrushBuildGamepadFocusMode
  interactionReady: boolean
}) {
  return buildMode && interactionReady && focusMode === 'palette'
}

export function shouldAutofocusLandrushBuildGamepadPalette({
  buildMode,
  controllerInputActive,
  interactionReady,
}: {
  buildMode: boolean
  controllerInputActive: boolean
  interactionReady: boolean
}) {
  return buildMode && controllerInputActive && interactionReady
}
