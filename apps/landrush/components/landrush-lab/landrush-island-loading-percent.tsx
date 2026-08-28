import {
  LANDRUSH_ISLAND_LOADING_SHELL_INITIAL_PROGRESS,
  LANDRUSH_ISLAND_LOADING_SHELL_PERCENT_REEL_ATTRIBUTE,
} from './landrush-island-loading-shell-bootstrap'

const PERCENT_VALUES = Array.from({ length: 101 }, (_, percent) => percent)

export function LandrushIslandLoadingPercent({ streamed = false }: { streamed?: boolean }) {
  const initialPercent = streamed ? LANDRUSH_ISLAND_LOADING_SHELL_INITIAL_PROGRESS * 100 : 0
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-[4ch] overflow-hidden text-right font-mono text-sm leading-4 tabular-nums"
      data-landrush-island-loading-shell-percent
      data-landrush-island-loading-shell-percent-value={String(initialPercent)}
    >
      <span
        className="flex flex-col will-change-transform"
        {...{ [LANDRUSH_ISLAND_LOADING_SHELL_PERCENT_REEL_ATTRIBUTE]: '' }}
        style={streamed ? undefined : { animation: 'none', transform: 'translate3d(0, 0, 0)' }}
      >
        {PERCENT_VALUES.map((percent) => (
          <span
            className="h-4 shrink-0 leading-4"
            data-landrush-island-loading-percent-row={percent}
            key={percent}
          >
            {percent}%
          </span>
        ))}
      </span>
    </span>
  )
}
