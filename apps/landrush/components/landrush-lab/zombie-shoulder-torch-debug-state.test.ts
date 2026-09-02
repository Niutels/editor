import { describe, expect, test } from 'bun:test'
import {
  createZombieShoulderTorchDebugScreenshotFilename,
  parseZombieShoulderTorchDebugAngle,
  parseZombieShoulderTorchDebugCameraDistance,
  parseZombieShoulderTorchDebugMode,
  parseZombieShoulderTorchDebugQuery,
  resolveZombieShoulderTorchDebugCameraPose,
  ZOMBIE_SHOULDER_TORCH_DEBUG_ANGLES,
  ZOMBIE_SHOULDER_TORCH_DEBUG_CAMERA_DISTANCES,
  ZOMBIE_SHOULDER_TORCH_DEBUG_DEFAULT_ANGLE,
  ZOMBIE_SHOULDER_TORCH_DEBUG_DEFAULT_CAMERA_DISTANCE,
  ZOMBIE_SHOULDER_TORCH_DEBUG_DEFAULT_MODE,
  ZOMBIE_SHOULDER_TORCH_DEBUG_MODES,
  ZOMBIE_SHOULDER_TORCH_DEBUG_VISUAL_CONTRACT,
} from './zombie-shoulder-torch-debug-state'

function distanceBetween(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2])
}

function crossLength(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
) {
  const x = left[1] * right[2] - left[2] * right[1]
  const y = left[2] * right[0] - left[0] * right[2]
  const z = left[0] * right[1] - left[1] * right[0]
  return Math.hypot(x, y, z)
}

describe('zombie shoulder torch debug state', () => {
  test('accepts every exact camera, angle, and mode literal', () => {
    for (const distance of ZOMBIE_SHOULDER_TORCH_DEBUG_CAMERA_DISTANCES) {
      expect(parseZombieShoulderTorchDebugCameraDistance(distance)).toBe(distance)
    }
    for (const angle of ZOMBIE_SHOULDER_TORCH_DEBUG_ANGLES) {
      expect(parseZombieShoulderTorchDebugAngle(angle)).toBe(angle)
    }
    for (const mode of ZOMBIE_SHOULDER_TORCH_DEBUG_MODES) {
      expect(parseZombieShoulderTorchDebugMode(mode)).toBe(mode)
    }
  })

  test('rejects aliases, malformed values, and duplicate query values to stable defaults', () => {
    for (const invalid of [undefined, '', 'NEAR', 'near ', 'mounted', ['near', 'far']]) {
      expect(parseZombieShoulderTorchDebugCameraDistance(invalid)).toBe(
        ZOMBIE_SHOULDER_TORCH_DEBUG_DEFAULT_CAMERA_DISTANCE,
      )
    }
    for (const invalid of [undefined, '', 'RIGHT', 'right', 'origin-rear', ['front', 'rear']]) {
      expect(parseZombieShoulderTorchDebugAngle(invalid)).toBe(
        ZOMBIE_SHOULDER_TORCH_DEBUG_DEFAULT_ANGLE,
      )
    }
    for (const invalid of [
      undefined,
      '',
      'FINAL',
      'fixture-only',
      'light-only',
      ['final', 'surface'],
    ]) {
      expect(parseZombieShoulderTorchDebugMode(invalid)).toBe(
        ZOMBIE_SHOULDER_TORCH_DEBUG_DEFAULT_MODE,
      )
    }
    expect(parseZombieShoulderTorchDebugQuery({})).toEqual({
      angle: 'top',
      cameraDistance: 'design',
      mode: 'final',
    })
  })

  test('provides twelve finite, distinct, projection-valid fixed camera poses', () => {
    const serializedPoses = new Set<string>()
    for (const cameraDistance of ZOMBIE_SHOULDER_TORCH_DEBUG_CAMERA_DISTANCES) {
      for (const angle of ZOMBIE_SHOULDER_TORCH_DEBUG_ANGLES) {
        const pose = resolveZombieShoulderTorchDebugCameraPose(cameraDistance, angle)
        expect(
          [...pose.position, ...pose.target, ...pose.up, pose.fov, pose.near, pose.far].every(
            Number.isFinite,
          ),
        ).toBe(true)
        expect(pose.near).toBeGreaterThan(0)
        expect(pose.far).toBeGreaterThan(pose.near)
        expect(pose.fov).toBeGreaterThan(0)
        expect(pose.fov).toBeLessThan(180)
        const viewDirection = [
          pose.target[0] - pose.position[0],
          pose.target[1] - pose.position[1],
          pose.target[2] - pose.position[2],
        ] as const
        expect(distanceBetween(pose.position, pose.target)).toBeGreaterThan(0)
        expect(crossLength(viewDirection, pose.up)).toBeGreaterThan(0.001)
        serializedPoses.add(JSON.stringify(pose))
      }
    }
    expect(serializedPoses.size).toBe(12)
  })

  test('uses near for the paired origins and wider distances for the complete beam', () => {
    for (const angle of ZOMBIE_SHOULDER_TORCH_DEBUG_ANGLES) {
      const near = resolveZombieShoulderTorchDebugCameraPose('near', angle)
      const design = resolveZombieShoulderTorchDebugCameraPose('design', angle)
      const far = resolveZombieShoulderTorchDebugCameraPose('far', angle)
      expect(distanceBetween(near.position, near.target)).toBeLessThan(
        distanceBetween(design.position, design.target),
      )
      expect(distanceBetween(design.position, design.target)).toBeLessThan(
        distanceBetween(far.position, far.target),
      )
      expect(near.target[2]).toBeLessThan(design.target[2])
      expect(design.target).toEqual(far.target)
    }
  })

  test('uses a non-degenerate top-camera up vector', () => {
    for (const cameraDistance of ZOMBIE_SHOULDER_TORCH_DEBUG_CAMERA_DISTANCES) {
      const pose = resolveZombieShoulderTorchDebugCameraPose(cameraDistance, 'top')
      expect(pose.up).toEqual([0, 0, -1])
      expect(
        crossLength(
          [
            pose.target[0] - pose.position[0],
            pose.target[1] - pose.position[1],
            pose.target[2] - pose.position[2],
          ],
          pose.up,
        ),
      ).toBeGreaterThan(0.001)
    }
  })

  test('creates a stable descriptive PNG filename', () => {
    expect(
      createZombieShoulderTorchDebugScreenshotFilename({
        angle: 'side',
        cameraDistance: 'near',
        mode: 'surface',
      }),
    ).toBe('landrush-torch-near-side-surface.png')
  })

  test('publishes observable torch identity and performance invariants', () => {
    expect(ZOMBIE_SHOULDER_TORCH_DEBUG_VISUAL_CONTRACT.frameBudgetMs).toBe(16.67)
    expect(ZOMBIE_SHOULDER_TORCH_DEBUG_VISUAL_CONTRACT.invariants).toEqual(
      expect.arrayContaining([
        expect.stringContaining('two origins'),
        expect.stringContaining('filled pre-merge'),
        expect.stringContaining('single merged lobe'),
        expect.stringContaining('monotonic diffuse edge'),
        expect.stringContaining('surface footprint is identical'),
      ]),
    )
  })
})
