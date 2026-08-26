import {
  LANDRUSH_ISLAND_LOADING_SHELL_FILL_ATTRIBUTE,
  LANDRUSH_ISLAND_LOADING_SHELL_PERCENT_REEL_ATTRIBUTE,
} from './landrush-island-loading-shell-bootstrap'
import { LandrushIslandLoadingShellClientBridge } from './landrush-island-loading-shell-client-bridge'
import { LANDRUSH_ISLAND_LOADING_INITIAL_STATUS } from './landrush-island-loading-status'

const LANDRUSH_ISLAND_LOADING_PERCENT_VALUES = Array.from({ length: 101 }, (_, percent) => percent)

export function LandrushIslandLoadingShell() {
  return (
    <main
      aria-label="Loading Landrush island"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={0}
      aria-valuetext={`${LANDRUSH_ISLAND_LOADING_INITIAL_STATUS}, 0%`}
      className="fixed inset-0 z-[230] grid place-items-center bg-[#0f1720] text-white"
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
          <span
            aria-hidden
            className="inline-block h-4 w-[4ch] overflow-hidden text-right font-mono text-sm leading-4 tabular-nums"
            data-landrush-island-loading-shell-percent
            data-landrush-island-loading-shell-percent-value="0"
          >
            <span
              className="flex flex-col will-change-transform"
              {...{ [LANDRUSH_ISLAND_LOADING_SHELL_PERCENT_REEL_ATTRIBUTE]: '' }}
            >
              {LANDRUSH_ISLAND_LOADING_PERCENT_VALUES.map((percent) => (
                <span className="h-4 shrink-0 leading-4" key={percent}>
                  {percent}%
                </span>
              ))}
            </span>
          </span>
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
