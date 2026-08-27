export type LandrushIslandJumpEdgeBlurDebugMode = 'contribution' | 'final' | 'fixed' | 'mask'

export type LandrushIslandJumpEdgeBlurPresentationState = {
  debugMode: LandrushIslandJumpEdgeBlurDebugMode
  startedAtMs: number | null
}

export type LandrushIslandJumpEdgeBlurSample = {
  active: boolean
  amount: number
}

const LANDRUSH_ISLAND_JUMP_EDGE_BLUR_DEFAULT_STRENGTH = 2

export const LANDRUSH_ISLAND_JUMP_EDGE_BLUR = Object.freeze({
  attackEndMs: 80,
  endMs: 600,
  holdEndMs: 140,
  get radialStrength() {
    return readLandrushIslandJumpEdgeBlurDiagnosticStrength()
  },
  reducedMotionStrength: 0.25,
})

export function resolveLandrushIslandJumpEdgeBlurStrength(value: string | null) {
  if (value === null) return LANDRUSH_ISLAND_JUMP_EDGE_BLUR_DEFAULT_STRENGTH
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return LANDRUSH_ISLAND_JUMP_EDGE_BLUR_DEFAULT_STRENGTH
  return Math.min(LANDRUSH_ISLAND_JUMP_EDGE_BLUR_DEFAULT_STRENGTH, Math.max(0, parsed))
}

export function resolveLandrushIslandJumpEdgeBlurDebugMode(
  value: string | null,
): LandrushIslandJumpEdgeBlurDebugMode {
  if (value === 'contribution') return 'contribution'
  if (value === 'mask') return 'mask'
  if (value === '1' || value === 'fixed') return 'fixed'
  return 'final'
}

export function createLandrushIslandJumpEdgeBlurPresentationState(
  debugMode: LandrushIslandJumpEdgeBlurDebugMode = 'final',
): LandrushIslandJumpEdgeBlurPresentationState {
  return { debugMode, startedAtMs: null }
}

export function startLandrushIslandJumpEdgeBlur(
  state: LandrushIslandJumpEdgeBlurPresentationState,
  nowMs: number,
) {
  state.startedAtMs = Number.isFinite(nowMs) ? nowMs : null
}

export function clearLandrushIslandJumpEdgeBlur(
  state: LandrushIslandJumpEdgeBlurPresentationState,
) {
  state.startedAtMs = null
}

export function resolveLandrushIslandJumpEdgeBlurSample({
  nowMs,
  output = createLandrushIslandJumpEdgeBlurSample(),
  reducedMotion = false,
  state,
}: {
  nowMs: number
  output?: LandrushIslandJumpEdgeBlurSample
  reducedMotion?: boolean
  state: LandrushIslandJumpEdgeBlurPresentationState
}) {
  const deterministic = state.debugMode !== 'final'
  const elapsedMs =
    state.startedAtMs === null ? Number.POSITIVE_INFINITY : nowMs - state.startedAtMs
  const amount = deterministic ? 1 : resolveLandrushIslandJumpEdgeBlurAmount(elapsedMs)
  const impulseRunning =
    state.startedAtMs !== null && elapsedMs >= 0 && elapsedMs < LANDRUSH_ISLAND_JUMP_EDGE_BLUR.endMs
  const strength =
    reducedMotion && !deterministic ? LANDRUSH_ISLAND_JUMP_EDGE_BLUR.reducedMotionStrength : 1

  output.active = deterministic || impulseRunning
  output.amount = amount * strength
  return output
}

export function createLandrushIslandJumpEdgeBlurSample(): LandrushIslandJumpEdgeBlurSample {
  return {
    active: false,
    amount: 0,
  }
}

export function resolveLandrushIslandJumpEdgeBlurAmount(elapsedMs: number) {
  if (
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0 ||
    elapsedMs >= LANDRUSH_ISLAND_JUMP_EDGE_BLUR.endMs
  ) {
    return 0
  }

  const attack = smoothstep(0, LANDRUSH_ISLAND_JUMP_EDGE_BLUR.attackEndMs, elapsedMs)
  const release =
    1 -
    smoothstep(
      LANDRUSH_ISLAND_JUMP_EDGE_BLUR.holdEndMs,
      LANDRUSH_ISLAND_JUMP_EDGE_BLUR.endMs,
      elapsedMs,
    )
  return attack * release
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / Math.max(Number.EPSILON, edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function readLandrushIslandJumpEdgeBlurDiagnosticStrength() {
  if (typeof window === 'undefined' || window.location.hash.length <= 1) {
    return LANDRUSH_ISLAND_JUMP_EDGE_BLUR_DEFAULT_STRENGTH
  }
  return resolveLandrushIslandJumpEdgeBlurStrength(
    new URLSearchParams(window.location.hash.slice(1)).get('jumpBlurStrength'),
  )
}
