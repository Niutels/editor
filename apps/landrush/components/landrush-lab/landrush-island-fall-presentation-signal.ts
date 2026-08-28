export type LandrushIslandFallPresentationState = {
  active: boolean
  amount: number
  slowMotionFactor: number
  wiggleAmount: number
}

export type LandrushIslandFallScreenSnapshot = Readonly<{
  active: boolean
  amount: number
}>

export type LandrushIslandFallPresentationSignal = {
  current: LandrushIslandFallPresentationState
  getServerSnapshot: () => LandrushIslandFallScreenSnapshot
  getSnapshot: () => LandrushIslandFallScreenSnapshot
  publish: (next: LandrushIslandFallPresentationState) => void
  subscribe: (listener: () => void) => () => void
}

const LANDRUSH_ISLAND_FALL_SCREEN_AMOUNT_STEP = 0.012
const LANDRUSH_ISLAND_FALL_SCREEN_INACTIVE_SNAPSHOT: LandrushIslandFallScreenSnapshot = {
  active: false,
  amount: 0,
}

export function createLandrushIslandFallPresentationState(): LandrushIslandFallPresentationState {
  return {
    active: false,
    amount: 0,
    slowMotionFactor: 1,
    wiggleAmount: 0,
  }
}

export function createLandrushIslandFallPresentationSignal(): LandrushIslandFallPresentationSignal {
  const listeners = new Set<() => void>()
  let snapshot = LANDRUSH_ISLAND_FALL_SCREEN_INACTIVE_SNAPSHOT

  const signal: LandrushIslandFallPresentationSignal = {
    current: createLandrushIslandFallPresentationState(),
    getServerSnapshot: () => LANDRUSH_ISLAND_FALL_SCREEN_INACTIVE_SNAPSHOT,
    getSnapshot: () => snapshot,
    publish(next) {
      signal.current = next

      const terminalInactive = !next.active && next.amount === 0
      const shouldPublish =
        snapshot.active !== next.active ||
        Math.abs(snapshot.amount - next.amount) >= LANDRUSH_ISLAND_FALL_SCREEN_AMOUNT_STEP ||
        (terminalInactive && (snapshot.active || snapshot.amount !== 0))
      if (!shouldPublish) return

      snapshot = terminalInactive
        ? LANDRUSH_ISLAND_FALL_SCREEN_INACTIVE_SNAPSHOT
        : { active: next.active, amount: next.amount }
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }

  return signal
}
