import { describe, expect, test } from 'bun:test'
import { runBVHEcctrlContactStep } from './bvh-ecctrl-contact-step'
import { isBVHEcctrlSupportCandidateEligible } from './bvh-ecctrl-support'

const CAPSULE_LENGTH = 0.8
const CAPSULE_RADIUS = 0.25
const FLOAT_HEIGHT = 0.5
const ROOT_FROM_FOOT = CAPSULE_LENGTH / 2 + CAPSULE_RADIUS + FLOAT_HEIGHT
const SUPPORT_SENSOR_RADIUS = 0.15
const TABLE_HALF_WIDTH = 1.25
const TABLE_MINIMUM_Y = 0.72
const TABLE_TOP_Y = 0.8

type ContactState = {
  footY: number
  grounded: boolean
  rootX: number
  rootY: number
  supportHeight: number | null
  velocityY: number
}

function createLandingSimulation(rootX: number) {
  const previousFootY = 0.85
  const state: ContactState = {
    footY: 0.28,
    grounded: false,
    rootX,
    rootY: 0.28 + ROOT_FROM_FOOT,
    supportHeight: null,
    velocityY: -34.2,
  }
  let collisionCorrections = 0
  let supportPasses = 0

  const synchronizeSpatialState = () => {
    state.footY = state.rootY - ROOT_FROM_FOOT
  }
  const resolveSupport = () => {
    supportPasses += 1
    const horizontallySupported = Math.abs(state.rootX) <= TABLE_HALF_WIDTH + SUPPORT_SENSOR_RADIUS
    if (
      !horizontallySupported ||
      !isBVHEcctrlSupportCandidateEligible({
        candidateHeight: TABLE_TOP_Y,
        currentFootHeight: state.footY,
        grounded: state.grounded,
        landingSkin: 0.03,
        maxStepHeight: 0.28,
        previousFootHeight: previousFootY,
        verticalVelocity: state.velocityY,
      })
    ) {
      state.grounded = false
      state.supportHeight = null
      return
    }

    state.rootY = TABLE_TOP_Y + ROOT_FROM_FOOT
    state.velocityY = 0
    state.grounded = true
    state.supportHeight = TABLE_TOP_Y
  }
  const resolveSolidCapsuleCollision = () => {
    const capsuleBottomSphereCenterY = state.rootY - CAPSULE_LENGTH / 2
    const closestX = Math.max(-TABLE_HALF_WIDTH, Math.min(TABLE_HALF_WIDTH, state.rootX))
    const closestY = Math.max(TABLE_MINIMUM_Y, Math.min(TABLE_TOP_Y, capsuleBottomSphereCenterY))
    const deltaX = state.rootX - closestX
    const deltaY = capsuleBottomSphereCenterY - closestY
    const distance = Math.hypot(deltaX, deltaY)
    if (distance >= CAPSULE_RADIUS) return false

    const correctionDistance = CAPSULE_RADIUS - distance
    state.rootX += (deltaX / distance) * correctionDistance
    state.rootY += (deltaY / distance) * correctionDistance
    collisionCorrections += 1
    return true
  }

  return {
    resolveSolidCapsuleCollision,
    resolveSupport,
    run: () =>
      runBVHEcctrlContactStep(
        null,
        1 / 60,
        synchronizeSpatialState,
        resolveSupport,
        resolveSolidCapsuleCollision,
      ),
    state,
    synchronizeSpatialState,
    telemetry: () => ({ collisionCorrections, supportPasses }),
  }
}

describe('BVHEcctrl contact-step ordering', () => {
  test.each([
    ['center', 0],
    ['edge', TABLE_HALF_WIDTH + 0.05],
  ] as const)('lands swept feet on a thin 0.8m support at its %s', (_label, rootX) => {
    const simulation = createLandingSimulation(rootX)

    expect(simulation.run()).toBe(false)
    simulation.synchronizeSpatialState()

    expect(simulation.state.rootX).toBe(rootX)
    expect(simulation.state.rootY).toBeCloseTo(TABLE_TOP_Y + ROOT_FROM_FOOT, 10)
    expect(simulation.state.footY).toBeCloseTo(TABLE_TOP_Y, 10)
    expect(simulation.state.supportHeight).toBe(TABLE_TOP_Y)
    expect(simulation.state.grounded).toBe(true)
    expect(simulation.telemetry()).toEqual({ collisionCorrections: 0, supportPasses: 1 })
  })

  test('prevents the lateral edge displacement produced by collision-first ordering', () => {
    const rootX = TABLE_HALF_WIDTH + 0.05
    const collisionFirst = createLandingSimulation(rootX)

    expect(collisionFirst.resolveSolidCapsuleCollision()).toBe(true)
    collisionFirst.synchronizeSpatialState()
    collisionFirst.resolveSupport()

    expect(collisionFirst.state.rootX).toBeGreaterThan(rootX)

    const supportFirst = createLandingSimulation(rootX)
    supportFirst.run()
    expect(supportFirst.state.rootX).toBe(rootX)
  })

  test('revalidates support only when collision depenetration changes position', () => {
    const order: string[] = []
    let collisionCorrected = false
    const run = () =>
      runBVHEcctrlContactStep(
        null,
        1 / 60,
        () => order.push('spatial'),
        () => order.push('support'),
        () => {
          order.push('collision')
          return collisionCorrected
        },
      )

    expect(run()).toBe(false)
    expect(order).toEqual(['spatial', 'support', 'spatial', 'collision'])

    order.length = 0
    collisionCorrected = true
    expect(run()).toBe(true)
    expect(order).toEqual(['spatial', 'support', 'spatial', 'collision', 'spatial', 'support'])
  })
})
