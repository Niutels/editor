import * as React from 'react'

const MOBILE_BREAKPOINT = 768
const MOBILE_PLACEMENT_SELECTION_SUPPRESSION_MS = 900
let mobilePlacementSelectionSuppressUntil = 0

const subscribe = (callback: () => void): (() => void) => {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

export const isMobileViewport = (): boolean =>
  typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT

const getClientSnapshot = (): boolean => isMobileViewport()

// Server can't know the viewport — assume desktop. React's useSyncExternalStore
// reconciles the SSR / client snapshots without a hydration mismatch warning.
const getServerSnapshot = (): boolean => false

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)
}

export function shouldAutoSelectPlacedNode(): boolean {
  return !isMobileViewport()
}

export function suppressMobilePlacedNodeSelection(): void {
  if (!isMobileViewport()) return
  const now = globalThis.performance?.now?.() ?? Date.now()
  mobilePlacementSelectionSuppressUntil = now + MOBILE_PLACEMENT_SELECTION_SUPPRESSION_MS
}

export function consumeMobilePlacedNodeSelectionSuppression(): boolean {
  if (!isMobileViewport()) return false
  const now = globalThis.performance?.now?.() ?? Date.now()
  if (now > mobilePlacementSelectionSuppressUntil) return false
  mobilePlacementSelectionSuppressUntil = 0
  return true
}
