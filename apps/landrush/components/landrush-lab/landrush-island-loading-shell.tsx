import { LandrushIslandLoadingPercent } from './landrush-island-loading-percent'
import {
  LANDRUSH_ISLAND_LOADING_SHELL_FILL_ATTRIBUTE,
  LANDRUSH_ISLAND_LOADING_SHELL_INITIAL_PROGRESS,
} from './landrush-island-loading-shell-bootstrap'
import { LandrushIslandLoadingShellClientBridge } from './landrush-island-loading-shell-client-bridge'
import { LANDRUSH_ISLAND_LOADING_INITIAL_STATUS } from './landrush-island-loading-status'

export function LandrushIslandLoadingShell() {
  const initialPercent = LANDRUSH_ISLAND_LOADING_SHELL_INITIAL_PROGRESS * 100
  return (
    <main
      aria-label="Loading Landrush island"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={initialPercent}
      aria-valuetext={`${LANDRUSH_ISLAND_LOADING_INITIAL_STATUS}, ${initialPercent}%`}
      className="fixed inset-0 z-[230] grid place-items-center bg-slate-950/58 text-white [contain:strict]"
      data-landrush-island-loading-shell
      role="progressbar"
      suppressHydrationWarning
    >
      <LandrushIslandLoadingShellClientBridge />
      <div className="w-[50vw] max-w-[760px]">
        <div className="mb-3 flex items-center justify-between">
          <span
            className="font-medium text-sm tracking-[0.18em] uppercase"
            data-landrush-island-loading-shell-status
          >
            {LANDRUSH_ISLAND_LOADING_INITIAL_STATUS}
          </span>
          <LandrushIslandLoadingPercent streamed />
        </div>
        <div className="h-3 overflow-hidden rounded-full border border-white/24 bg-slate-950/70 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
          <div
            className="h-full w-full rounded-full bg-amber-200 opacity-70"
            {...{ [LANDRUSH_ISLAND_LOADING_SHELL_FILL_ATTRIBUTE]: '' }}
          />
        </div>
      </div>
    </main>
  )
}
