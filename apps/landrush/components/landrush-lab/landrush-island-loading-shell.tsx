import { LANDRUSH_ISLAND_LOADING_SHELL_FILL_ATTRIBUTE } from './landrush-island-loading-shell-bootstrap'
import { LandrushIslandLoadingShellClientBridge } from './landrush-island-loading-shell-client-bridge'
import { LANDRUSH_ISLAND_LOADING_INITIAL_STATUS } from './landrush-island-loading-status'

export function LandrushIslandLoadingShell() {
  return (
    <main
      aria-label="Loading Landrush island"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={0}
      aria-valuetext={`${LANDRUSH_ISLAND_LOADING_INITIAL_STATUS}, 0%`}
      className="fixed inset-0 z-[230] grid place-items-center bg-[#0f1720] text-white [contain:strict] [font-family:Arial,sans-serif]"
      data-landrush-island-loading-shell
      role="progressbar"
      suppressHydrationWarning
    >
      <LandrushIslandLoadingShellClientBridge />
      <div className="w-[50vw] max-w-[760px]">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-semibold text-sm" data-landrush-island-loading-shell-status>
            {LANDRUSH_ISLAND_LOADING_INITIAL_STATUS}
          </span>
          <span
            aria-hidden
            className="w-[4ch] text-right text-sm tabular-nums"
            data-landrush-island-loading-shell-percent
            data-landrush-island-loading-shell-percent-value="0"
          >
            0%
          </span>
        </div>
        <div className="h-2 overflow-hidden bg-[#27313d]">
          <div
            className="h-full w-full bg-[#fde68a]"
            {...{ [LANDRUSH_ISLAND_LOADING_SHELL_FILL_ATTRIBUTE]: '' }}
          />
        </div>
      </div>
    </main>
  )
}
