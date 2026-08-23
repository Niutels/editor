export type LandrushBuildGamepadDirection = 'down' | 'left' | 'right' | 'up'
export type LandrushBuildGamepadFocusMode = 'palette' | 'placement'
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
