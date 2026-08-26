import {
  type LandrushNavigationPoint2,
  landrushIslandNavigationSegmentIntersectsPolygon,
  pointInPolygonOrNearEdge,
} from '@landrush/runtime'

import { advanceLandrushRobotScreenRevealAmount } from './robot-screen-reveal-curve'

export const LANDRUSH_ROBOT_REVEAL_AMOUNT_USER_DATA_KEY = 'landrushRobotRevealAmount'

export type LandrushRobotRevealObjectTransitionState = {
  amount: number
  fadeInDelaySeconds: number
}

export function advanceLandrushRobotRevealObjectTransitions<T>({
  activeObjects,
  deltaSeconds,
  epsilon,
  fadeInDelaySeconds,
  response,
  states,
}: {
  activeObjects: ReadonlySet<T>
  deltaSeconds: number
  epsilon: number
  fadeInDelaySeconds: number
  response: number
  states: Map<T, LandrushRobotRevealObjectTransitionState>
}) {
  const safeDeltaSeconds = Math.min(Math.max(deltaSeconds, 0), 0.05)
  for (const object of activeObjects) {
    if (!states.has(object)) {
      states.set(object, {
        amount: 0,
        fadeInDelaySeconds: Math.max(0, fadeInDelaySeconds),
      })
    }
  }

  let fadingInObjectCount = 0
  let fadingOutObjectCount = 0
  let maxAmount = 0
  let minAmount = 1
  let waitingObjectCount = 0
  for (const [object, state] of states) {
    const active = activeObjects.has(object)
    const target = active ? 1 : 0
    let transitionDeltaSeconds = safeDeltaSeconds
    if (active) {
      transitionDeltaSeconds = Math.max(0, safeDeltaSeconds - state.fadeInDelaySeconds)
      state.fadeInDelaySeconds = Math.max(0, state.fadeInDelaySeconds - safeDeltaSeconds)
      if (state.fadeInDelaySeconds > 0) waitingObjectCount += 1
    } else {
      state.fadeInDelaySeconds = 0
    }

    state.amount = advanceLandrushRobotScreenRevealAmount({
      amount: state.amount,
      deltaSeconds: transitionDeltaSeconds,
      response,
      target,
    })
    if (Math.abs(target - state.amount) <= Math.max(0, epsilon)) state.amount = target
    if (!active && state.amount === 0) {
      states.delete(object)
      continue
    }

    if (active && state.amount < 1) fadingInObjectCount += 1
    if (!active) fadingOutObjectCount += 1
    maxAmount = Math.max(maxAmount, state.amount)
    minAmount = Math.min(minAmount, state.amount)
  }

  return {
    activeObjectCount: activeObjects.size,
    fadingInObjectCount,
    fadingOutObjectCount,
    growthAmount: maxAmount,
    maxAmount,
    minAmount: states.size > 0 ? minAmount : 0,
    objectCount: states.size,
    waitingObjectCount,
  }
}

export function readLandrushRobotRevealObjectAmount(userData: Record<string, unknown> | undefined) {
  const amount = userData?.[LANDRUSH_ROBOT_REVEAL_AMOUNT_USER_DATA_KEY]
  return typeof amount === 'number' && Number.isFinite(amount)
    ? Math.min(1, Math.max(0, amount))
    : 0
}

export function isLandrushRobotRevealObjectPresented(amount: number, epsilon: number) {
  return Number.isFinite(amount) && amount > Math.max(0, epsilon)
}

export function shouldKeepLandrushRobotRevealSlabOpaque({
  robotLevelBaseY,
  slabLevelBaseY,
  tolerance,
}: {
  robotLevelBaseY: number
  slabLevelBaseY: number
  tolerance: number
}) {
  if (!Number.isFinite(robotLevelBaseY) || !Number.isFinite(slabLevelBaseY)) return false
  return slabLevelBaseY <= robotLevelBaseY + Math.max(0, tolerance)
}

export function shouldKeepLandrushRobotRevealStairOpaque({
  cameraPoint,
  footprints,
  robotPoint,
  standingTolerance,
}: {
  cameraPoint: LandrushNavigationPoint2
  footprints: readonly (readonly LandrushNavigationPoint2[])[]
  robotPoint: LandrushNavigationPoint2
  standingTolerance: number
}) {
  if (
    footprints.some((footprint) =>
      pointInPolygonOrNearEdge(robotPoint, footprint, Math.max(0, standingTolerance)),
    )
  ) {
    return true
  }

  return !footprints.some((footprint) =>
    landrushIslandNavigationSegmentIntersectsPolygon(cameraPoint, robotPoint, footprint),
  )
}
