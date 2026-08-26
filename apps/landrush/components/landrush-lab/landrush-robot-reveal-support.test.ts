import { describe, expect, test } from 'bun:test'
import {
  advanceLandrushRobotRevealObjectTransitions,
  isLandrushRobotRevealObjectPresented,
  LANDRUSH_ROBOT_REVEAL_AMOUNT_USER_DATA_KEY,
  readLandrushRobotRevealObjectAmount,
  shouldKeepLandrushRobotRevealSlabOpaque,
  shouldKeepLandrushRobotRevealStairOpaque,
} from './landrush-robot-reveal-support'

const reportedStairSegmentFootprint = [
  { x: -7, z: -8.5 },
  { x: -6, z: -8.5 },
  { x: -6, z: -5.5 },
  { x: -7, z: -5.5 },
] as const

function shouldKeepReportedStairOpaque({
  cameraPoint,
  robotPoint,
}: {
  cameraPoint: { x: number; z: number }
  robotPoint: { x: number; z: number }
}) {
  return shouldKeepLandrushRobotRevealStairOpaque({
    cameraPoint,
    footprints: [reportedStairSegmentFootprint],
    robotPoint,
    standingTolerance: 0.16,
  })
}

describe('Landrush robot reveal support slabs', () => {
  test('keeps the current support floor opaque', () => {
    expect(
      shouldKeepLandrushRobotRevealSlabOpaque({
        robotLevelBaseY: 2.8,
        slabLevelBaseY: 2.8,
        tolerance: 0.08,
      }),
    ).toBe(true)
  })

  test('keeps lower floors opaque while allowing an upper floor to cut away', () => {
    expect(
      shouldKeepLandrushRobotRevealSlabOpaque({
        robotLevelBaseY: 2.8,
        slabLevelBaseY: 0,
        tolerance: 0.08,
      }),
    ).toBe(true)
    expect(
      shouldKeepLandrushRobotRevealSlabOpaque({
        robotLevelBaseY: 2.8,
        slabLevelBaseY: 5.6,
        tolerance: 0.08,
      }),
    ).toBe(false)
  })
})

describe('Landrush robot reveal stair eligibility', () => {
  test('keeps the hiding_a_bit report stair opaque because the camera path misses it', () => {
    expect(
      shouldKeepReportedStairOpaque({
        cameraPoint: { x: 0.21084142717642432, z: -16.20872419434368 },
        robotPoint: { x: -5.32524387381096, z: -6.211350250472211 },
      }),
    ).toBe(true)
  })

  test('keeps the not_hiding report stair opaque because the camera path misses it', () => {
    expect(
      shouldKeepReportedStairOpaque({
        cameraPoint: { x: -0.21291469871516489, z: -16.084167412469505 },
        robotPoint: { x: -5.749, z: -6.086793468352119 },
      }),
    ).toBe(true)
  })

  test('allows reveal when the camera path crosses the reported stair run', () => {
    expect(
      shouldKeepReportedStairOpaque({
        cameraPoint: { x: -6.5, z: -16 },
        robotPoint: { x: -6.5, z: -4.5 },
      }),
    ).toBe(false)
  })

  test('applies one 0.16 meter standing tolerance to the physical footprint', () => {
    const cameraPoint = { x: -6.8, z: -12 }

    expect(
      shouldKeepReportedStairOpaque({
        cameraPoint,
        robotPoint: { x: -5.85, z: -7 },
      }),
    ).toBe(true)
    expect(
      shouldKeepReportedStairOpaque({
        cameraPoint,
        robotPoint: { x: -5.76, z: -7 },
      }),
    ).toBe(false)
  })
})

describe('Landrush robot reveal object scope', () => {
  test('does not present a reveal material during its delay or after fade-out reaches epsilon', () => {
    const owner = { material: 'wall-finish' }
    const states = new Map()
    const advance = (active: boolean, deltaSeconds: number) =>
      advanceLandrushRobotRevealObjectTransitions({
        activeObjects: active ? new Set([owner]) : new Set<typeof owner>(),
        deltaSeconds,
        epsilon: 0.01,
        fadeInDelaySeconds: 0.08,
        response: 5.5,
        states,
      })

    advance(true, 0.05)
    expect(states.get(owner)?.amount).toBe(0)
    expect(isLandrushRobotRevealObjectPresented(states.get(owner)?.amount ?? 0, 0.01)).toBe(false)

    advance(true, 0.05)
    expect(isLandrushRobotRevealObjectPresented(states.get(owner)?.amount ?? 0, 0.01)).toBe(true)

    for (let frame = 0; frame < 180 && states.has(owner); frame += 1) advance(false, 1 / 60)
    expect(states.has(owner)).toBe(false)
    expect(isLandrushRobotRevealObjectPresented(states.get(owner)?.amount ?? 0, 0.01)).toBe(false)
  })

  test('does not reveal a rear mesh that shares a foreground mesh material', () => {
    const foregroundMesh = { material: 'shared-wall-finish' }
    const rearMesh = { material: 'shared-wall-finish' }
    const states = new Map()

    advanceLandrushRobotRevealObjectTransitions({
      activeObjects: new Set([foregroundMesh]),
      deltaSeconds: 0.05,
      epsilon: 0.001,
      fadeInDelaySeconds: 0,
      response: 12,
      states,
    })

    expect(states.get(foregroundMesh)?.amount).toBeGreaterThan(0)
    expect(states.has(rearMesh)).toBe(false)
    expect(readLandrushRobotRevealObjectAmount(rearMesh)).toBe(0)
  })

  test('fades a departing foreground mesh before removing its state', () => {
    const mesh = { [LANDRUSH_ROBOT_REVEAL_AMOUNT_USER_DATA_KEY]: 1 }
    const states = new Map([[mesh, { amount: 1, fadeInDelaySeconds: 0 }]])

    advanceLandrushRobotRevealObjectTransitions({
      activeObjects: new Set(),
      deltaSeconds: 0.05,
      epsilon: 0.001,
      fadeInDelaySeconds: 0,
      response: 12,
      states,
    })

    expect(states.get(mesh)?.amount).toBeGreaterThan(0)
    expect(states.get(mesh)?.amount).toBeLessThan(1)
  })

  test('fades symmetrically and reverses without resetting with equal responses', () => {
    const mesh = { material: 'wall-finish' }
    const response = 5.5
    const transition = (
      states: Map<typeof mesh, { amount: number; fadeInDelaySeconds: number }>,
      active: boolean,
    ) =>
      advanceLandrushRobotRevealObjectTransitions({
        activeObjects: active ? new Set([mesh]) : new Set<typeof mesh>(),
        deltaSeconds: 1 / 60,
        epsilon: 0,
        fadeInDelaySeconds: 0,
        response,
        states,
      })

    const enteringStates = new Map<typeof mesh, { amount: number; fadeInDelaySeconds: number }>()
    const exitingStates = new Map([[mesh, { amount: 1, fadeInDelaySeconds: 0 }] as const])
    for (let frame = 0; frame < 18; frame += 1) {
      transition(enteringStates, true)
      transition(exitingStates, false)
    }

    const enteringAmount = enteringStates.get(mesh)?.amount ?? 0
    const exitingAmount = exitingStates.get(mesh)?.amount ?? 0
    expect(enteringAmount).toBeCloseTo(1 - exitingAmount, 10)

    const stateBeforeReversal = enteringStates.get(mesh)
    for (let frame = 0; frame < 6; frame += 1) transition(enteringStates, false)
    const amountAfterExit = enteringStates.get(mesh)?.amount ?? 0
    for (let frame = 0; frame < 6; frame += 1) transition(enteringStates, true)
    const amountAfterReentry = enteringStates.get(mesh)?.amount ?? 0

    expect(amountAfterExit).toBeLessThan(enteringAmount)
    expect(amountAfterReentry).toBeGreaterThan(amountAfterExit)
    expect(amountAfterReentry).toBeLessThan(1)
    expect(enteringStates.get(mesh)).toBe(stateBeforeReversal)
  })
})
