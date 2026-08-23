import { describe, expect, test } from 'bun:test'
import {
  LANDRUSH_ISLAND_ROBOT_STANCE_PROFILE,
  resolveLandrushIslandRobotStancePresentation,
} from './landrush-robot-stance'

describe('Landrush robot stance profile', () => {
  test('publishes the standing and crouching physical-clearance contract', () => {
    expect(LANDRUSH_ISLAND_ROBOT_STANCE_PROFILE.standing.totalClearance).toBe(1.8)
    expect(LANDRUSH_ISLAND_ROBOT_STANCE_PROFILE.crouching.totalClearance).toBe(0.9)
    expect(LANDRUSH_ISLAND_ROBOT_STANCE_PROFILE.crouching.cameraTargetHeight).toBe(0.64)
    expect(LANDRUSH_ISLAND_ROBOT_STANCE_PROFILE.crouching.fpvEyeHeight).toBe(0.79)
    expect(LANDRUSH_ISLAND_ROBOT_STANCE_PROFILE.crouching.cameraTargetHeight).toBeLessThan(0.9)
    expect(LANDRUSH_ISLAND_ROBOT_STANCE_PROFILE.crouching.fpvEyeHeight).toBeLessThan(0.9)
  })

  test('keeps camera presentation on the same semantic stance interpolation', () => {
    expect(resolveLandrushIslandRobotStancePresentation(0)).toEqual(
      LANDRUSH_ISLAND_ROBOT_STANCE_PROFILE.standing,
    )
    expect(resolveLandrushIslandRobotStancePresentation(1)).toEqual(
      LANDRUSH_ISLAND_ROBOT_STANCE_PROFILE.crouching,
    )
    expect(resolveLandrushIslandRobotStancePresentation(0.5)).toEqual({
      cameraTargetHeight: 0.96,
      fpvEyeHeight: 1.185,
      totalClearance: 1.35,
    })
  })

  test('clamps invalid and out-of-range presentation amounts', () => {
    expect(resolveLandrushIslandRobotStancePresentation(Number.NaN)).toEqual(
      LANDRUSH_ISLAND_ROBOT_STANCE_PROFILE.standing,
    )
    expect(resolveLandrushIslandRobotStancePresentation(-1)).toEqual(
      LANDRUSH_ISLAND_ROBOT_STANCE_PROFILE.standing,
    )
    expect(resolveLandrushIslandRobotStancePresentation(2)).toEqual(
      LANDRUSH_ISLAND_ROBOT_STANCE_PROFILE.crouching,
    )
  })
})
