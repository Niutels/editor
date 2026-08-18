'use client'

import { Box, Hammer, Map as MapIcon, Move3d, Paintbrush, UserRound, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  LandrushBuildTool,
  LandrushModeSnapshot,
  LandrushRenderSlot,
  LandrushScreenPoint,
} from '../types'

const DEFAULT_BUILD_TOOLS: readonly LandrushBuildTool[] = [
  {
    id: 'place',
    label: 'Place',
    icon: <Box className="h-4 w-4" />,
  },
  {
    id: 'move',
    label: 'Move',
    icon: <Move3d className="h-4 w-4" />,
  },
  {
    id: 'paint',
    label: 'Paint',
    icon: <Paintbrush className="h-4 w-4" />,
  },
]

type LandrushModeOverlayProps = {
  snapshot: LandrushModeSnapshot
  introPanel?: LandrushRenderSlot
  buildMenu?: LandrushRenderSlot
  buildTools?: readonly LandrushBuildTool[]
  activeBuildToolId?: string
  onBuildToolSelect?: (tool: LandrushBuildTool) => void
  introTitle?: string
  introSubtitle?: string
  showModePill?: boolean
}

export function LandrushModeOverlay({
  snapshot,
  introPanel,
  buildMenu,
  buildTools,
  activeBuildToolId,
  onBuildToolSelect,
  introTitle,
  introSubtitle,
  showModePill = true,
}: LandrushModeOverlayProps) {
  return (
    <>
      {introPanel === undefined ? (
        <LandrushIntroPanel snapshot={snapshot} subtitle={introSubtitle} title={introTitle} />
      ) : (
        renderSlot(introPanel, snapshot)
      )}
      {buildMenu === undefined ? (
        <LandrushBuildMenu
          activeToolId={activeBuildToolId}
          onToolSelect={onBuildToolSelect}
          snapshot={snapshot}
          tools={buildTools}
        />
      ) : (
        renderSlot(buildMenu, snapshot)
      )}
      {showModePill ? <LandrushModePill snapshot={snapshot} /> : null}
    </>
  )
}

type LandrushIntroPanelProps = {
  snapshot: LandrushModeSnapshot
  title?: string
  subtitle?: string
}

export function LandrushIntroPanel({
  snapshot,
  title = 'Landrush',
  subtitle = 'Claim a buildable plot, walk it, then shape it.',
}: LandrushIntroPanelProps) {
  return (
    <div
      aria-hidden={!snapshot.isIntro}
      className={cn(
        'pointer-events-none absolute inset-0 z-30 flex items-end justify-start p-4 transition-opacity duration-500 md:p-6',
        snapshot.isIntro ? 'opacity-100' : 'opacity-0',
      )}
    >
      <section className="pointer-events-auto flex max-w-[min(92vw,28rem)] items-center gap-3 rounded-lg border border-white/15 bg-zinc-950/58 p-3 text-white shadow-2xl backdrop-blur-sm">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-400 text-zinc-950">
          <MapIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold text-lg leading-tight">{title}</h1>
          <p className="truncate text-white/60 text-xs">{subtitle}</p>
        </div>
        <button
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-white px-3 font-medium text-sm text-zinc-950 transition hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
          onClick={snapshot.join}
          type="button"
        >
          <UserRound className="h-4 w-4" />
          Join
        </button>
      </section>
    </div>
  )
}

type LandrushBuildMenuProps = {
  snapshot: LandrushModeSnapshot
  tools?: readonly LandrushBuildTool[]
  activeToolId?: string
  onToolSelect?: (tool: LandrushBuildTool) => void
}

export function LandrushBuildMenu({
  snapshot,
  tools = DEFAULT_BUILD_TOOLS,
  activeToolId,
  onToolSelect,
}: LandrushBuildMenuProps) {
  return (
    <div
      aria-hidden={!snapshot.isBuildMode}
      className={cn(
        'absolute bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-white/12 bg-zinc-950/86 p-2 text-white shadow-2xl backdrop-blur-md transition duration-300',
        snapshot.isBuildMode
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-3 opacity-0',
      )}
      style={{ opacity: snapshot.buildMenuOpacity }}
    >
      {tools.map((tool) => {
        const isActive = activeToolId === tool.id

        return (
          <button
            aria-pressed={isActive}
            className={cn(
              'flex h-10 min-w-20 items-center justify-center gap-2 rounded-md px-3 font-medium text-sm transition',
              isActive
                ? 'bg-emerald-400 text-zinc-950'
                : 'bg-white/8 text-white/80 hover:bg-white/14 hover:text-white',
              tool.disabled && 'cursor-not-allowed opacity-40 hover:bg-white/8 hover:text-white/80',
            )}
            disabled={tool.disabled}
            key={tool.id}
            onClick={() => onToolSelect?.(tool)}
            type="button"
          >
            {tool.icon}
            <span>{tool.label}</span>
          </button>
        )
      })}
      <span className="mx-1 h-7 w-px bg-white/14" />
      <button
        aria-label="Exit build mode"
        className="flex h-10 w-10 items-center justify-center rounded-md text-white/70 transition hover:bg-white/10 hover:text-white"
        onClick={snapshot.exitBuildMode}
        type="button"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
export function LandrushIslandFadeLayer({ snapshot }: { snapshot: LandrushModeSnapshot }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-500"
      style={{
        opacity: snapshot.islandFadeOpacity,
        background:
          'radial-gradient(circle at 50% 52%, transparent 0 24%, rgb(2 6 23 / 0.12) 32%, rgb(2 6 23 / 0.58) 100%)',
      }}
    />
  )
}

type LandrushCharacterMarkerProps = {
  snapshot: LandrushModeSnapshot
  point: LandrushScreenPoint
}

export function LandrushCharacterMarker({ snapshot, point }: LandrushCharacterMarkerProps) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-30 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-300 text-zinc-950 shadow-lg ring-2 ring-white/80 transition-transform duration-100"
      style={{
        left: point.x,
        top: point.y,
        transform: `translate(-50%, -50%) rotate(${snapshot.character.heading}rad)`,
      }}
    >
      <UserRound className="h-4 w-4" />
    </div>
  )
}

function LandrushModePill({ snapshot }: { snapshot: LandrushModeSnapshot }) {
  if (snapshot.isIntro) return null

  return (
    <div className="pointer-events-none absolute top-4 left-1/2 z-40 -translate-x-1/2">
      <div className="flex h-8 items-center gap-2 rounded-full border border-white/12 bg-zinc-950/82 px-3 font-medium text-white text-xs shadow-xl backdrop-blur-md">
        <Hammer className="h-3.5 w-3.5 text-emerald-300" />
        <span>{snapshot.isBuildMode ? 'Build' : 'Walk'}</span>
      </div>
    </div>
  )
}

function renderSlot(slot: LandrushRenderSlot, snapshot: LandrushModeSnapshot) {
  return typeof slot === 'function' ? slot(snapshot) : slot
}
