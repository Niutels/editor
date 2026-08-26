'use client'

import { useCallback } from 'react'
import {
  bootstrapLandrushIslandLoadingShellClient,
  LANDRUSH_ISLAND_LOADING_SHELL_FILL_ATTRIBUTE,
  LANDRUSH_ISLAND_LOADING_SHELL_PERCENT_REEL_ATTRIBUTE,
  startLandrushIslandLoadingShellMotion,
} from './landrush-island-loading-shell-bootstrap'

export function LandrushIslandLoadingShellClientBridge() {
  const bindMarker = useCallback((marker: HTMLSpanElement | null) => {
    const shell = marker?.closest<HTMLElement>('[data-landrush-island-loading-shell]')
    if (!shell) return
    const run = bootstrapLandrushIslandLoadingShellClient(shell)
    const fill = shell.querySelector<HTMLElement>(
      `[${LANDRUSH_ISLAND_LOADING_SHELL_FILL_ATTRIBUTE}]`,
    )
    const percentReel = shell.querySelector<HTMLElement>(
      `[${LANDRUSH_ISLAND_LOADING_SHELL_PERCENT_REEL_ATTRIBUTE}]`,
    )
    if (fill) startLandrushIslandLoadingShellMotion(fill, run, undefined, percentReel)
  }, [])

  return (
    <span aria-hidden data-landrush-island-loading-shell-client-bridge hidden ref={bindMarker} />
  )
}
