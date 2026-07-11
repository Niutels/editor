import type { LandrushResolvedCameraPose, LandrushVector2 } from '../types'

export function resolveCameraRelativeMovementVector(
  keys: ReadonlySet<string>,
  cameraPose: Pick<LandrushResolvedCameraPose, 'position' | 'target'>,
): LandrushVector2 | null {
  const strafe =
    Number(keys.has('KeyD') || keys.has('ArrowRight')) -
    Number(keys.has('KeyA') || keys.has('ArrowLeft'))
  const forwardInput =
    Number(keys.has('KeyW') || keys.has('ArrowUp')) -
    Number(keys.has('KeyS') || keys.has('ArrowDown'))

  if (strafe === 0 && forwardInput === 0) return null

  const forward = normalize2(
    cameraPose.target.x - cameraPose.position.x,
    cameraPose.target.z - cameraPose.position.z,
  )
  const right = { x: -forward.z, z: forward.x }
  const x = right.x * strafe + forward.x * forwardInput
  const z = right.z * strafe + forward.z * forwardInput

  return normalize2(x, z)
}

function normalize2(x: number, z: number): LandrushVector2 {
  const length = Math.hypot(x, z)
  if (length < 0.000001) return { x: 0, z: -1 }
  return { x: x / length, z: z / length }
}
