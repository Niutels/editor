export const LANDRUSH_PASCAL_EDITOR_RAIL_WIDTH = 56
export const LANDRUSH_PASCAL_EDITOR_LAYOUT_TRANSITION_MS = 150
export const LANDRUSH_PASCAL_EDITOR_MODE_TRANSITION_MS = 500
export const LANDRUSH_PASCAL_EDITOR_LAYOUT_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'

export function resolveLandrushPascalEditorViewportInset({
  isCollapsed,
  open,
  panelWidth,
}: {
  isCollapsed: boolean
  open: boolean
  panelWidth: number
}) {
  if (!open) return 0
  const safePanelWidth = Number.isFinite(panelWidth) ? Math.max(0, panelWidth) : 0
  return LANDRUSH_PASCAL_EDITOR_RAIL_WIDTH + (isCollapsed ? 0 : safePanelWidth)
}

export function resolveLandrushPascalEditorLayoutTransition(durationMs: number) {
  const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0
  return `${safeDuration}ms ${LANDRUSH_PASCAL_EDITOR_LAYOUT_EASING}`
}

export function resolveLandrushPascalEditorPresentationTransition(modeTransitionActive: boolean) {
  return resolveLandrushPascalEditorLayoutTransition(
    modeTransitionActive
      ? LANDRUSH_PASCAL_EDITOR_MODE_TRANSITION_MS
      : LANDRUSH_PASCAL_EDITOR_LAYOUT_TRANSITION_MS,
  )
}
