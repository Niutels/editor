'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type NavPoint = { x: number; z: number }
type NavStartPoint = NavPoint & { y?: number }
type DoorPortal = {
  center: NavPoint
  halfWidth: number
  normal: NavPoint
  sideA: NavPoint
  sideB: NavPoint
  tangent: NavPoint
}
type StairPortal = DoorPortal & { halfRun: number }
type NavigationBridge = {
  getState: () => {
    doorPortals: readonly DoorPortal[]
    stairPortals: readonly StairPortal[]
  }
  setupStart: (request: { label?: string; start: NavStartPoint }) => boolean
  startMove: (request: {
    label?: string
    mode?: 'direct' | 'stair-resolved'
    start: NavStartPoint
    target: NavPoint
  }) => boolean
}

type NavigationDebugWindow = Window & {
  __PASCAL_WATER_NAV_TEST__?: NavigationBridge
}

function getNavigationBridge() {
  return (window as NavigationDebugWindow).__PASCAL_WATER_NAV_TEST__
}

const DEBUG_ROUTE = '/landrush-lab/pascal-multiplayer-island-navigation-debug'
const SIDE_OFFSET_DOOR_WIDTHS = 3

function addPoint(point: NavPoint, direction: NavPoint, amount: number): NavPoint {
  return {
    x: point.x + direction.x * amount,
    z: point.z + direction.z * amount,
  }
}

function debugHref(scenario: 'room' | 'stair') {
  const params = new URLSearchParams({
    clean: '1',
    landrushProbe: '1',
    navDebug: '1',
    navDebugLiveScenario: scenario,
    navDebugLiveScenarioAuto: '0',
    navDebugLiveScenarioImmediate: '1',
    offline: '1',
  })
  return `${DEBUG_ROUTE}?${params}`
}

export function PascalNavigationDebugControls() {
  const [ready, setReady] = useState(false)
  const [scenario, setScenario] = useState<'room' | 'stair'>('room')
  const [lastRun, setLastRun] = useState('idle')

  useEffect(() => {
    const update = () => {
      setReady(Boolean(getNavigationBridge()))
      const params = new URLSearchParams(window.location.search)
      setScenario(params.get('navDebugLiveScenario') === 'stair' ? 'stair' : 'room')
    }
    update()
    const timer = window.setInterval(update, 350)
    return () => window.clearInterval(timer)
  }, [])

  const scenarioLinks = useMemo(
    () => [
      { href: debugHref('room'), key: 'room' as const, label: 'Door room' },
      { href: debugHref('stair'), key: 'stair' as const, label: 'Stairs' },
    ],
    [],
  )

  const runDoorCase = useCallback((side: 'sideA' | 'sideB', lateral: -1 | 0 | 1) => {
    const bridge = getNavigationBridge()
    const portal = bridge?.getState().doorPortals[0]
    if (!bridge || !portal) return

    const doorWidth = portal.halfWidth * 2
    const offset = doorWidth * SIDE_OFFSET_DOOR_WIDTHS * lateral
    const startSide = side === 'sideA' ? portal.sideA : portal.sideB
    const targetSide = side === 'sideA' ? portal.sideB : portal.sideA
    const targetDirection = side === 'sideA' ? -0.95 : 0.95
    const start = addPoint(startSide, portal.tangent, offset)
    const target = addPoint(targetSide, portal.normal, targetDirection)
    const label = `${side}-${lateral < 0 ? 'left' : lateral > 0 ? 'right' : 'center'}-3x`

    bridge.startMove({ label, start, target })
    setLastRun(label)
  }, [])

  const runStairCase = useCallback((side: 'top' | 'bottom', lateral: -1 | 0 | 1) => {
    const bridge = getNavigationBridge()
    const portal = bridge?.getState().stairPortals[0]
    if (!bridge || !portal) return

    const stairWidth = portal.halfWidth * 2
    const offset = stairWidth * SIDE_OFFSET_DOOR_WIDTHS * lateral
    const sidePoint = side === 'top' ? portal.sideA : portal.sideB
    const start = addPoint(sidePoint, portal.tangent, offset) as NavStartPoint
    if (side === 'top') start.y = 1.16
    const label = `${side}-${lateral < 0 ? 'left' : lateral > 0 ? 'right' : 'center'}-3x`

    bridge.startMove({
      label,
      mode: 'stair-resolved',
      start,
      target: portal.center,
    })
    setLastRun(label)
  }, [])

  const resetCurrentStart = useCallback(() => {
    const bridge = getNavigationBridge()
    const state = bridge?.getState()
    if (!bridge || !state) return

    const portal = scenario === 'stair' ? state.stairPortals[0] : state.doorPortals[0]
    if (!portal) return

    bridge.setupStart({
      label: 'reset-3x-left',
      start: addPoint(
        portal.sideA,
        portal.tangent,
        -portal.halfWidth * 2 * SIDE_OFFSET_DOOR_WIDTHS,
      ),
    })
    setLastRun('reset')
  }, [scenario])

  return (
    <div className="pointer-events-auto fixed right-4 top-4 z-[10000] w-[276px] rounded-md border border-white/15 bg-zinc-950/82 p-3 text-xs text-white shadow-xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold">Nav debug</span>
        <span className={ready ? 'text-emerald-300' : 'text-amber-300'}>
          {ready ? 'ready' : 'loading'}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        {scenarioLinks.map((link) => (
          <a
            className={`rounded border px-2 py-1 text-center font-semibold transition ${
              scenario === link.key
                ? 'border-amber-300 bg-amber-300/20 text-amber-100'
                : 'border-white/15 bg-white/8 text-white/80 hover:bg-white/14'
            }`}
            href={link.href}
            key={link.key}
          >
            {link.label}
          </a>
        ))}
      </div>

      {scenario === 'room' ? (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1">
            <button
              className="rounded bg-white/10 px-2 py-1 font-semibold"
              onClick={() => runDoorCase('sideA', -1)}
              type="button"
            >
              A-L
            </button>
            <button
              className="rounded bg-white/10 px-2 py-1 font-semibold"
              onClick={() => runDoorCase('sideA', 0)}
              type="button"
            >
              A-C
            </button>
            <button
              className="rounded bg-white/10 px-2 py-1 font-semibold"
              onClick={() => runDoorCase('sideA', 1)}
              type="button"
            >
              A-R
            </button>
            <button
              className="rounded bg-white/10 px-2 py-1 font-semibold"
              onClick={() => runDoorCase('sideB', -1)}
              type="button"
            >
              B-L
            </button>
            <button
              className="rounded bg-white/10 px-2 py-1 font-semibold"
              onClick={() => runDoorCase('sideB', 0)}
              type="button"
            >
              B-C
            </button>
            <button
              className="rounded bg-white/10 px-2 py-1 font-semibold"
              onClick={() => runDoorCase('sideB', 1)}
              type="button"
            >
              B-R
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1">
            <button
              className="rounded bg-white/10 px-2 py-1 font-semibold"
              onClick={() => runStairCase('top', -1)}
              type="button"
            >
              T-L
            </button>
            <button
              className="rounded bg-white/10 px-2 py-1 font-semibold"
              onClick={() => runStairCase('top', 0)}
              type="button"
            >
              T-C
            </button>
            <button
              className="rounded bg-white/10 px-2 py-1 font-semibold"
              onClick={() => runStairCase('top', 1)}
              type="button"
            >
              T-R
            </button>
            <button
              className="rounded bg-white/10 px-2 py-1 font-semibold"
              onClick={() => runStairCase('bottom', -1)}
              type="button"
            >
              B-L
            </button>
            <button
              className="rounded bg-white/10 px-2 py-1 font-semibold"
              onClick={() => runStairCase('bottom', 0)}
              type="button"
            >
              B-C
            </button>
            <button
              className="rounded bg-white/10 px-2 py-1 font-semibold"
              onClick={() => runStairCase('bottom', 1)}
              type="button"
            >
              B-R
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          className="rounded border border-white/15 px-2 py-1 text-white/80"
          onClick={resetCurrentStart}
          type="button"
        >
          Reset
        </button>
        <span className="truncate text-white/60">{lastRun}</span>
      </div>
    </div>
  )
}
