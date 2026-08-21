import { describe, expect, test } from 'bun:test'
import {
  captureZombieEscapeImpactAttachment,
  createZombieEscapeBallisticSample,
  createZombieEscapeImpactAttachment,
  resolveZombieEscapeBallisticSample,
  resolveZombieEscapeImpactAttachment,
} from './zombie-escape-impact-attachment'
import {
  createZombieEscapePresentationPose,
  resolveZombieEscapePresentationPose,
} from './zombie-escape-presentation-pose'

describe('Zombie Escape impact attachment', () => {
  test('keeps a hit surface-local through the full hit-reaction root pose', () => {
    const captured = createZombieEscapeImpactAttachment()
    const output = createZombieEscapeImpactAttachment()
    const initialPose = resolveZombieEscapePresentationPose(
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      createZombieEscapePresentationPose(),
    )
    captureZombieEscapeImpactAttachment(0.4, 1.1, 0, 1, 0, 0, initialPose, captured)
    const reactedPose = resolveZombieEscapePresentationPose(
      3,
      0,
      -2,
      Math.PI / 2,
      0.8,
      0.6,
      0.18,
      -1,
      createZombieEscapePresentationPose(),
    )
    resolveZombieEscapeImpactAttachment(
      captured.x,
      captured.y,
      captured.z,
      captured.normalX,
      captured.normalY,
      captured.normalZ,
      reactedPose,
      output,
    )

    expect(output.x).not.toBeCloseTo(0.4, 3)
    expect(output.y).not.toBeCloseTo(1.1, 3)
    expect(Math.hypot(output.normalX, output.normalY, output.normalZ)).toBeCloseTo(1, 6)
  })

  test('reuses the caller-owned output without allocating a frame object', () => {
    const output = createZombieEscapeImpactAttachment()
    const pose = createZombieEscapePresentationPose()
    expect(resolveZombieEscapeImpactAttachment(0, 1, 0.2, 0, 0, 1, pose, output)).toBe(output)
    expect(captureZombieEscapeImpactAttachment(0, 1, 0.2, 0, 0, 1, pose, output)).toBe(output)
  })

  test('keeps detached particles on the immutable world-space ballistic path', () => {
    const output = createZombieEscapeBallisticSample()
    expect(
      resolveZombieEscapeBallisticSample(4, 1, -2, 1, 0, 0, 0.03, 2, 3, -1, 8, 0.25, output),
    ).toBe(output)
    expect(output).toEqual({
      velocityX: 2,
      velocityY: 1,
      velocityZ: -1,
      x: 4.53,
      y: 1.5,
      z: -2.25,
    })
  })
})
