import {
  frameIndependentResponseAmount,
  REMOTE_PRESENTATION_INTERPOLATION_DELAY_MS,
  REMOTE_PRESENTATION_MAX_EXTRAPOLATION_MS,
  reconcileRemotePresentationTimeline,
  resolveRemotePresentationSnapshot,
  shouldContinueRemotePresentation,
  viewAnglesFromDirection,
} from '@landrush/runtime'
import { describe, expect, it } from 'vitest'

function converge(responsePerSecond: number, frameRate: number, seconds: number) {
  const deltaSeconds = 1 / frameRate
  let value = 0
  for (let frame = 0; frame < frameRate * seconds; frame += 1) {
    value += (1 - value) * frameIndependentResponseAmount(responsePerSecond, deltaSeconds)
  }
  return value
}

describe('multiplayer presentation timing', () => {
  it('converges consistently across frame rates', () => {
    const at30Fps = converge(12, 30, 1)
    const at120Fps = converge(12, 120, 1)

    expect(at30Fps).toBeCloseTo(at120Fps, 10)
    expect(at30Fps).toBeCloseTo(1 - Math.exp(-12), 10)
  })

  it('keeps frames alive only for movement, reconciliation, or blend settling', () => {
    expect(
      shouldContinueRemotePresentation({
        animationSettleSeconds: 0,
        headingErrorRadians: 0,
        moving: false,
        positionErrorSq: 0,
      }),
    ).toBe(false)

    for (const activity of [
      {
        animationSettleSeconds: 0,
        headingErrorRadians: 0,
        moving: true,
        positionErrorSq: 0,
      },
      {
        animationSettleSeconds: 0.1,
        headingErrorRadians: 0,
        moving: false,
        positionErrorSq: 0,
      },
      {
        animationSettleSeconds: 0,
        headingErrorRadians: 0.01,
        moving: false,
        positionErrorSq: 0,
      },
      {
        animationSettleSeconds: 0,
        headingErrorRadians: 0,
        moving: false,
        positionErrorSq: 0.01,
      },
    ]) {
      expect(shouldContinueRemotePresentation(activity)).toBe(true)
    }
  })

  it('recovers first-person yaw and pitch from the active camera direction', () => {
    const yaw = Math.PI / 3
    const pitch = -Math.PI / 6
    const pitchCos = Math.cos(pitch)
    const angles = viewAnglesFromDirection({
      x: Math.sin(yaw) * pitchCos,
      y: Math.sin(pitch),
      z: Math.cos(yaw) * pitchCos,
    })

    expect(angles.yaw).toBeCloseTo(yaw, 10)
    expect(angles.pitch).toBeCloseTo(pitch, 10)
  })

  it('interpolates buffered server snapshots instead of chasing each packet', () => {
    const first = reconcileRemotePresentationTimeline(null, snapshot(1000, 0), 1000, 1000)
    const second = reconcileRemotePresentationTimeline(
      first.timeline,
      snapshot(1080, 0.8),
      1080,
      1080,
    )
    const presented = resolveRemotePresentationSnapshot(
      second.timeline,
      1040 + REMOTE_PRESENTATION_INTERPOLATION_DELAY_MS,
    )

    expect(presented?.position[0]).toBeCloseTo(0.4, 10)
  })

  it('rejects stale snapshots during reconciliation', () => {
    const first = reconcileRemotePresentationTimeline(null, snapshot(1000, 1), 1000, 1000)
    const stale = reconcileRemotePresentationTimeline(first.timeline, snapshot(999, 8), 1001, 1001)

    expect(stale.accepted).toBe(false)
    expect(stale.timeline.samples).toHaveLength(1)
    expect(stale.timeline.samples[0]?.snapshot.position[0]).toBe(1)
  })

  it('retimes packet bursts so reconciliation does not create a speed spike', () => {
    const first = reconcileRemotePresentationTimeline(null, snapshot(1000, 0), 1000, 1000)
    const second = reconcileRemotePresentationTimeline(
      first.timeline,
      snapshot(1080, 0.8),
      1080,
      1080,
    )
    const burst = reconcileRemotePresentationTimeline(
      second.timeline,
      snapshot(1085, 1.6),
      1085,
      1085,
    )

    expect(burst.timeline.samples[2]?.presentationTime).toBeCloseTo(1160, 10)
    const presented = resolveRemotePresentationSnapshot(
      burst.timeline,
      1120 + REMOTE_PRESENTATION_INTERPOLATION_DELAY_MS,
    )
    expect(presented?.position[0]).toBeCloseTo(1.2, 10)
  })

  it('snaps intentional large teleports and resets old history', () => {
    const first = reconcileRemotePresentationTimeline(null, snapshot(1000, 0, 2), 1000, 1000)
    const teleport = reconcileRemotePresentationTimeline(
      first.timeline,
      snapshot(1080, 20, 2),
      1080,
      1080,
    )

    expect(teleport.teleported).toBe(true)
    expect(teleport.timeline.samples).toHaveLength(1)
    expect(resolveRemotePresentationSnapshot(teleport.timeline, 1080)?.position[0]).toBe(20)
  })

  it('bounds extrapolation when packets stop arriving', () => {
    const first = reconcileRemotePresentationTimeline(null, snapshot(1000, 0), 1000, 1000)
    const second = reconcileRemotePresentationTimeline(
      first.timeline,
      snapshot(1080, 0.8),
      1080,
      1080,
    )
    const presented = resolveRemotePresentationSnapshot(
      second.timeline,
      1080 + REMOTE_PRESENTATION_INTERPOLATION_DELAY_MS + 10_000,
    )

    expect(presented?.position[0]).toBeCloseTo(
      0.8 + (10 * REMOTE_PRESENTATION_MAX_EXTRAPOLATION_MS) / 1000,
      10,
    )
  })

  it('anchors a late correction at the currently presented pose', () => {
    const first = reconcileRemotePresentationTimeline(null, snapshot(1000, 0), 1000, 1000)
    const second = reconcileRemotePresentationTimeline(
      first.timeline,
      snapshot(1080, 0.8),
      1080,
      1080,
    )
    const receivedAt = 1480
    const beforeCorrection = resolveRemotePresentationSnapshot(second.timeline, receivedAt)
    const correction = reconcileRemotePresentationTimeline(
      second.timeline,
      snapshot(1480, 4.8),
      1480,
      receivedAt,
    )
    const afterCorrection = resolveRemotePresentationSnapshot(correction.timeline, receivedAt)

    expect(afterCorrection?.position[0]).toBeCloseTo(beforeCorrection?.position[0] ?? 0, 10)
    expect(correction.timeline.samples.at(-1)?.presentationTime).toBeGreaterThan(1480)
  })

  it('interpolates heading across the shortest side of the wrap boundary', () => {
    const first = reconcileRemotePresentationTimeline(
      null,
      snapshot(1000, 0, 10, degrees(170)),
      1000,
      1000,
    )
    const second = reconcileRemotePresentationTimeline(
      first.timeline,
      snapshot(1080, 0.8, 10, degrees(-170)),
      1080,
      1080,
    )
    const presented = resolveRemotePresentationSnapshot(
      second.timeline,
      1040 + REMOTE_PRESENTATION_INTERPOLATION_DELAY_MS,
    )

    expect(Math.abs(presented?.heading ?? 0)).toBeCloseTo(Math.PI, 10)
  })
})

function snapshot(updatedAt: number, x: number, speed = 10, heading = 0) {
  return {
    heading,
    moving: speed > 0,
    position: [x, 0, 0] as [number, number, number],
    speed,
    updatedAt,
  }
}

function degrees(value: number) {
  return (value * Math.PI) / 180
}
