import { describe, expect, test } from 'bun:test'
import { Box3, BoxGeometry, Line3, type Mesh, Vector3 } from 'three'
import {
  advanceBVHEcctrlBallisticStep,
  BVH_ECCTRL_FIXED_STEP_SECONDS,
  canRequestBVHEcctrlJump,
  consumeBVHEcctrlJump,
  createBVHEcctrlLocomotionState,
  requestBVHEcctrlJump,
  resolveBVHEcctrlCapsuleCenterFromFoot,
  resolveBVHEcctrlCapsuleTotalClearance,
  resolveBVHEcctrlCrouchingState,
  resolveBVHEcctrlFixedSteps,
  resolveBVHEcctrlPresentationAlpha,
  resolveBVHEcctrlStanceShape,
  setBVHEcctrlGrounded,
} from './bvh-ecctrl-locomotion'
import { buildFirstPersonColliderWorld } from './first-person-collider-world'

const JUMP_HEIGHT = 1.1875
const AIRBORNE_SECONDS = 1.28 * (0.78 - 0.18)
const GRAVITY = (8 * JUMP_HEIGHT) / AIRBORNE_SECONDS ** 2
const JUMP_VELOCITY = (GRAVITY * AIRBORNE_SECONDS) / 2

type TestStanceShape = {
  capsuleLength: number
  floatHeight: number
}

function hasTestBVHStanceClearance({
  capsuleRadius,
  characterPosition,
  currentShape,
  mesh,
  standingClearanceSkin,
  targetShape,
}: {
  capsuleRadius: number
  characterPosition: Vector3
  currentShape: TestStanceShape
  mesh: Mesh
  standingClearanceSkin: number
  targetShape: TestStanceShape
}) {
  const currentCenterFromFoot = resolveBVHEcctrlCapsuleCenterFromFoot({
    ...currentShape,
    capsuleRadius,
  })
  const targetCenterFromFoot = resolveBVHEcctrlCapsuleCenterFromFoot({
    ...targetShape,
    capsuleRadius,
  })
  const targetRoot = characterPosition
    .clone()
    .add(new Vector3(0, targetCenterFromFoot - currentCenterFromFoot, 0))
  const segment = new Line3(
    targetRoot.clone().add(new Vector3(0, targetShape.capsuleLength / 2, 0)),
    targetRoot.clone().add(new Vector3(0, -targetShape.capsuleLength / 2, 0)),
  )
  const inverseMatrix = mesh.matrixWorld.clone().invert()
  const scale = new Vector3()
  mesh.getWorldScale(scale)
  segment.applyMatrix4(inverseMatrix)
  const localRadius = new Vector3(
    (capsuleRadius + standingClearanceSkin) / scale.x,
    (capsuleRadius + standingClearanceSkin) / scale.y,
    (capsuleRadius + standingClearanceSkin) / scale.z,
  )
  const bounds = new Box3().setFromPoints([segment.start, segment.end])
  bounds.min.addScaledVector(localRadius, -1)
  bounds.max.add(localRadius)
  const trianglePoint = new Vector3()
  const capsulePoint = new Vector3()
  let blocked = false

  mesh.geometry.boundsTree?.shapecast({
    intersectsBounds: (box) => box.intersectsBox(bounds),
    intersectsTriangle: (triangle) => {
      triangle.closestPointToSegment(segment, trianglePoint, capsulePoint)
      trianglePoint.sub(capsulePoint).divide(localRadius)
      if (trianglePoint.lengthSq() >= 1 - 1e-6) return false
      blocked = true
      return true
    },
  })
  return !blocked
}

describe('BVHEcctrl locomotion', () => {
  test('resolves the half-height crouch by reducing the segment before the support gap', () => {
    const standingShape = resolveBVHEcctrlStanceShape({
      capsuleLength: 0.8,
      capsuleRadius: 0.25,
      floatHeight: 0.5,
      totalClearance: 1.8,
    })
    const intermediateShape = resolveBVHEcctrlStanceShape({
      capsuleLength: 0.8,
      capsuleRadius: 0.25,
      floatHeight: 0.5,
      totalClearance: 1.2,
    })
    const crouchingShape = resolveBVHEcctrlStanceShape({
      capsuleLength: 0.8,
      capsuleRadius: 0.25,
      floatHeight: 0.5,
      totalClearance: 0.9,
    })

    expect(standingShape).toEqual({ capsuleLength: 0.8, floatHeight: 0.5 })
    expect(intermediateShape.capsuleLength).toBeCloseTo(0.2)
    expect(intermediateShape.floatHeight).toBe(0.5)
    expect(crouchingShape.capsuleLength).toBe(0)
    expect(crouchingShape.floatHeight).toBeCloseTo(0.4)
    expect(
      resolveBVHEcctrlCapsuleTotalClearance({
        ...crouchingShape,
        capsuleRadius: 0.25,
      }),
    ).toBeCloseTo(0.9)
  })

  test('keeps a zero-segment stance foot-anchored when both shape fields change', () => {
    const standingShape = { capsuleLength: 0.8, floatHeight: 0.5 }
    const crouchingShape = resolveBVHEcctrlStanceShape({
      ...standingShape,
      capsuleRadius: 0.25,
      totalClearance: 0.9,
    })
    const standingCenter = resolveBVHEcctrlCapsuleCenterFromFoot({
      ...standingShape,
      capsuleRadius: 0.25,
    })
    const crouchingCenter = resolveBVHEcctrlCapsuleCenterFromFoot({
      ...crouchingShape,
      capsuleRadius: 0.25,
    })
    const standingRootY = 4
    const footY = standingRootY - standingCenter
    const crouchingRootY = standingRootY + crouchingCenter - standingCenter

    expect(standingCenter).toBeCloseTo(1.15)
    expect(crouchingCenter).toBeCloseTo(0.65)
    expect(standingCenter - crouchingCenter).toBeCloseTo(0.5)
    expect(crouchingRootY - crouchingCenter).toBeCloseTo(footY)
  })

  test('clamps an impossible target to the fixed capsule-cap diameter', () => {
    expect(
      resolveBVHEcctrlStanceShape({
        capsuleLength: 0.8,
        capsuleRadius: 0.25,
        floatHeight: 0.5,
        totalClearance: 0.4,
      }),
    ).toEqual({ capsuleLength: 0, floatHeight: 0 })
  })

  test('keeps crouching after input release until standing clearance is available', () => {
    expect(
      resolveBVHEcctrlCrouchingState({
        crouching: true,
        crouchRequested: false,
        standingClear: false,
      }),
    ).toBe(true)
    expect(
      resolveBVHEcctrlCrouchingState({
        crouching: true,
        crouchRequested: false,
        standingClear: true,
      }),
    ).toBe(false)
  })

  test('blocks standing under a low BVH ceiling and stands after moving clear', () => {
    const capsuleRadius = 0.25
    const standingShape = resolveBVHEcctrlStanceShape({
      capsuleLength: 0.8,
      capsuleRadius,
      floatHeight: 0.5,
      totalClearance: 1.8,
    })
    const crouchingShape = resolveBVHEcctrlStanceShape({
      capsuleLength: 0.8,
      capsuleRadius,
      floatHeight: 0.5,
      totalClearance: 0.9,
    })
    const ceiling = new BoxGeometry(2, 0.1, 2).translate(0, 1.15, 0).toNonIndexed()
    const world = buildFirstPersonColliderWorld([ceiling])
    expect(world).not.toBeNull()
    if (!world) return

    try {
      const crouchingCenterFromFoot = resolveBVHEcctrlCapsuleCenterFromFoot({
        ...crouchingShape,
        capsuleRadius,
      })
      const characterPosition = new Vector3(0, crouchingCenterFromFoot, 0)
      expect(
        hasTestBVHStanceClearance({
          capsuleRadius,
          characterPosition,
          currentShape: crouchingShape,
          mesh: world.mesh,
          standingClearanceSkin: 0.015,
          targetShape: crouchingShape,
        }),
      ).toBe(true)

      const standingClearUnderCeiling = hasTestBVHStanceClearance({
        capsuleRadius,
        characterPosition,
        currentShape: crouchingShape,
        mesh: world.mesh,
        standingClearanceSkin: 0.015,
        targetShape: standingShape,
      })
      expect(standingClearUnderCeiling).toBe(false)
      expect(
        resolveBVHEcctrlCrouchingState({
          crouching: true,
          crouchRequested: false,
          standingClear: standingClearUnderCeiling,
        }),
      ).toBe(true)

      characterPosition.x = 2
      const standingClearOutside = hasTestBVHStanceClearance({
        capsuleRadius,
        characterPosition,
        currentShape: crouchingShape,
        mesh: world.mesh,
        standingClearanceSkin: 0.015,
        targetShape: standingShape,
      })
      expect(standingClearOutside).toBe(true)
      expect(
        resolveBVHEcctrlCrouchingState({
          crouching: true,
          crouchRequested: false,
          standingClear: standingClearOutside,
        }),
      ).toBe(false)

      const standingCenterFromFoot = resolveBVHEcctrlCapsuleCenterFromFoot({
        ...standingShape,
        capsuleRadius,
      })
      const crouchingFootY = characterPosition.y - crouchingCenterFromFoot
      const standingRootY = characterPosition.y + standingCenterFromFoot - crouchingCenterFromFoot
      expect(standingRootY - standingCenterFromFoot).toBeCloseTo(crouchingFootY)
    } finally {
      world.dispose()
    }
  })

  test('defers both stance transitions while airborne and honors held input after landing', () => {
    expect(
      resolveBVHEcctrlCrouchingState({
        crouching: false,
        crouchRequested: true,
        stanceTransitionAllowed: false,
        standingClear: true,
      }),
    ).toBe(false)
    expect(
      resolveBVHEcctrlCrouchingState({
        crouching: true,
        crouchRequested: false,
        stanceTransitionAllowed: false,
        standingClear: true,
      }),
    ).toBe(true)
    expect(
      resolveBVHEcctrlCrouchingState({
        crouching: false,
        crouchRequested: true,
        stanceTransitionAllowed: true,
        standingClear: true,
      }),
    ).toBe(true)
  })

  test('rejects air jumps until this controller instance establishes real support', () => {
    const state = createBVHEcctrlLocomotionState()

    expect(canRequestBVHEcctrlJump(state, 1)).toBe(false)
    expect(requestBVHEcctrlJump(state, 1)).toBe(false)

    setBVHEcctrlGrounded(state, true)
    setBVHEcctrlGrounded(state, false)
    expect(canRequestBVHEcctrlJump(state, 1)).toBe(true)
  })

  test('accepts one ground jump and one set-velocity air jump per landing', () => {
    const state = createBVHEcctrlLocomotionState()
    setBVHEcctrlGrounded(state, true)

    expect(requestBVHEcctrlJump(state, 1)).toBe(true)
    expect(requestBVHEcctrlJump(state, 1)).toBe(false)
    expect(
      consumeBVHEcctrlJump({
        airJumpVelocityMultiplier: 0.7,
        jumpVelocity: JUMP_VELOCITY,
        maxAirJumps: 1,
        state,
      }),
    ).toEqual({ kind: 'ground', velocity: JUMP_VELOCITY })
    expect(state.jumpsUsed).toBe(1)

    expect(requestBVHEcctrlJump(state, 1)).toBe(true)
    expect(
      consumeBVHEcctrlJump({
        airJumpVelocityMultiplier: 0.7,
        jumpVelocity: JUMP_VELOCITY,
        maxAirJumps: 1,
        state,
      }),
    ).toEqual({ kind: 'air', velocity: JUMP_VELOCITY * 0.7 })
    expect(state.jumpsUsed).toBe(2)
    expect(canRequestBVHEcctrlJump(state, 1)).toBe(false)
    expect(requestBVHEcctrlJump(state, 1)).toBe(false)

    setBVHEcctrlGrounded(state, true)
    expect(state.jumpsUsed).toBe(0)
    expect(canRequestBVHEcctrlJump(state, 1)).toBe(true)
  })

  test('does not reset air-jump allowance without a support landing', () => {
    const state = createBVHEcctrlLocomotionState()
    setBVHEcctrlGrounded(state, true)
    requestBVHEcctrlJump(state, 1)
    consumeBVHEcctrlJump({
      airJumpVelocityMultiplier: 0.7,
      jumpVelocity: JUMP_VELOCITY,
      maxAirJumps: 1,
      state,
    })
    requestBVHEcctrlJump(state, 1)
    consumeBVHEcctrlJump({
      airJumpVelocityMultiplier: 0.7,
      jumpVelocity: JUMP_VELOCITY,
      maxAirJumps: 1,
      state,
    })

    setBVHEcctrlGrounded(state, false)
    expect(canRequestBVHEcctrlJump(state, 1)).toBe(false)
  })

  test('preserves 100ms elapsed time and equivalent frame partitions', () => {
    const wholeFrame = resolveBVHEcctrlFixedSteps({
      accumulatedSeconds: 0,
      elapsedSeconds: 0.1,
    })
    const firstPartition = resolveBVHEcctrlFixedSteps({
      accumulatedSeconds: 0,
      elapsedSeconds: 0.04,
    })
    const secondPartition = resolveBVHEcctrlFixedSteps({
      accumulatedSeconds: firstPartition.remainderSeconds,
      elapsedSeconds: 0.06,
    })

    expect(wholeFrame.steps).toBe(6)
    expect(wholeFrame.droppedSeconds).toBe(0)
    expect(wholeFrame.remainderSeconds).toBeCloseTo(0, 10)
    expect(firstPartition.steps + secondPartition.steps).toBe(wholeFrame.steps)
    expect(secondPartition.remainderSeconds).toBeCloseTo(wholeFrame.remainderSeconds, 10)
  })

  test('keeps pace at 10fps and 15fps without dropping simulation time', () => {
    for (const renderRate of [10, 15]) {
      let accumulator = 0
      let droppedSeconds = 0
      let steps = 0
      for (let frame = 0; frame < renderRate; frame += 1) {
        const result = resolveBVHEcctrlFixedSteps({
          accumulatedSeconds: accumulator,
          elapsedSeconds: 1 / renderRate,
        })
        accumulator = result.remainderSeconds
        droppedSeconds += result.droppedSeconds
        steps += result.steps
      }

      expect(steps).toBe(60)
      expect(accumulator).toBeCloseTo(0, 10)
      expect(droppedSeconds).toBe(0)
    }
  })

  test('interpolates continuous fixed-step presentation at 144Hz without changing partition results', () => {
    const speed = 3
    const samplePresentation = (renderRate: number) => {
      let accumulator = 0
      let currentPosition = 0
      let previousPosition = 0
      const samples: number[] = []
      for (let frame = 0; frame < renderRate; frame += 1) {
        const result = resolveBVHEcctrlFixedSteps({
          accumulatedSeconds: accumulator,
          elapsedSeconds: 1 / renderRate,
        })
        accumulator = result.remainderSeconds
        for (let step = 0; step < result.steps; step += 1) {
          previousPosition = currentPosition
          currentPosition += speed * BVH_ECCTRL_FIXED_STEP_SECONDS
        }
        const alpha = resolveBVHEcctrlPresentationAlpha(accumulator)
        samples.push(previousPosition + (currentPosition - previousPosition) * alpha)
      }
      return samples
    }

    const highRateSamples = samplePresentation(144)
    for (let sample = 3; sample < highRateSamples.length; sample += 1) {
      expect(highRateSamples[sample]! - highRateSamples[sample - 1]!).toBeCloseTo(speed / 144, 10)
    }

    const finalAt60Hz = samplePresentation(60).at(-1)!
    expect(samplePresentation(120).at(-1)).toBeCloseTo(finalAt60Hz, 10)
    expect(highRateSamples.at(-1)).toBeCloseTo(finalAt60Hz, 10)
  })

  test('bounds exceptional hitch backlog explicitly instead of silently dropping each frame excess', () => {
    const result = resolveBVHEcctrlFixedSteps({
      accumulatedSeconds: 0,
      elapsedSeconds: 1,
    })

    expect(result.steps).toBe(8)
    expect(result.remainderSeconds).toBeCloseTo(0.25 - 8 / 60, 10)
    expect(result.droppedSeconds).toBeCloseTo(0.75, 10)
  })

  test('preserves the authored first-jump apex and flight time across render rates', () => {
    for (const renderRate of [10, 15, 30, 60, 120]) {
      let accumulator = 0
      let position = 0
      let previousPosition = 0
      let velocity = JUMP_VELOCITY
      let peak = 0
      let simulatedSeconds = 0
      let landed = false
      const renderDelta = 1 / renderRate

      while (!landed) {
        const fixedSteps = resolveBVHEcctrlFixedSteps({
          accumulatedSeconds: accumulator,
          elapsedSeconds: renderDelta,
        })
        accumulator = fixedSteps.remainderSeconds
        for (let step = 0; step < fixedSteps.steps; step += 1) {
          previousPosition = position
          const next = advanceBVHEcctrlBallisticStep({
            acceleration: -GRAVITY,
            deltaSeconds: BVH_ECCTRL_FIXED_STEP_SECONDS,
            position,
            velocity,
          })
          position = next.position
          velocity = next.velocity
          peak = Math.max(peak, position)
          simulatedSeconds += BVH_ECCTRL_FIXED_STEP_SECONDS
          if (position <= 0) {
            landed = true
            break
          }
        }
      }

      expect(peak).toBeCloseTo(JUMP_HEIGHT, 5)
      expect(previousPosition).toBeGreaterThanOrEqual(0)
      expect(position).toBeLessThanOrEqual(0)
      expect(Math.abs(simulatedSeconds - AIRBORNE_SECONDS)).toBeLessThanOrEqual(
        BVH_ECCTRL_FIXED_STEP_SECONDS,
      )
    }
  })

  test('makes the authored air jump sufficient for a standard fence without stacking velocity', () => {
    const capsuleBottomFromRoot = 0.5
    const fenceHeight = 1.8
    const airJumpVelocity = JUMP_VELOCITY * 0.7
    const doubleJumpPeak = JUMP_HEIGHT + airJumpVelocity ** 2 / (2 * GRAVITY)

    expect(JUMP_HEIGHT + capsuleBottomFromRoot).toBeLessThan(fenceHeight)
    expect(doubleJumpPeak + capsuleBottomFromRoot).toBeGreaterThan(fenceHeight)
    expect(doubleJumpPeak).toBeCloseTo(1.769375, 6)
  })
})
