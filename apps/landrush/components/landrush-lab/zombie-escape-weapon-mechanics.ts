export type ZombieEscapeWeaponDirection = {
  x: number
  y: number
  z: number
}

export function writeZombieEscapeSymmetricSpreadDirection(
  forwardX: number,
  forwardY: number,
  forwardZ: number,
  pelletOrdinal: number,
  pelletCount: number,
  halfSpreadRadians: number,
  output: ZombieEscapeWeaponDirection,
) {
  const forwardLength = Math.hypot(forwardX, forwardY, forwardZ)
  if (forwardLength <= 0.000_001) {
    output.x = 0
    output.y = 0
    output.z = -1
    return output
  }
  const inverseForwardLength = 1 / forwardLength
  const normalizedForwardX = forwardX * inverseForwardLength
  const normalizedForwardY = forwardY * inverseForwardLength
  const normalizedForwardZ = forwardZ * inverseForwardLength
  const normalizedPelletCount = Math.max(1, Math.trunc(pelletCount))
  const normalizedPelletOrdinal = Math.max(
    0,
    Math.min(normalizedPelletCount - 1, Math.trunc(pelletOrdinal)),
  )
  const pairCount = Math.floor(normalizedPelletCount / 2)
  const pairOrdinal = Math.ceil(normalizedPelletOrdinal / 2)
  const side = normalizedPelletOrdinal === 0 ? 0 : normalizedPelletOrdinal % 2 === 1 ? -1 : 1
  const spreadAmount = pairCount > 0 ? (side * pairOrdinal) / pairCount : 0
  const angle = Math.max(0, halfSpreadRadians) * spreadAmount

  let rightX = -normalizedForwardZ
  let rightY = 0
  let rightZ = normalizedForwardX
  let rightLength = Math.hypot(rightX, rightY, rightZ)
  if (rightLength <= 0.000_001) {
    rightX = normalizedForwardY
    rightY = -normalizedForwardX
    rightZ = 0
    rightLength = Math.hypot(rightX, rightY, rightZ)
  }
  const inverseRightLength = 1 / Math.max(0.000_001, rightLength)
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  output.x = normalizedForwardX * cosine + rightX * inverseRightLength * sine
  output.y = normalizedForwardY * cosine + rightY * inverseRightLength * sine
  output.z = normalizedForwardZ * cosine + rightZ * inverseRightLength * sine
  return output
}

export function resolveZombieEscapeRadialDamageScale(
  distanceMeters: number,
  radiusMeters: number,
  minimumDamageScale: number,
) {
  const radius = Math.max(0, radiusMeters)
  if (radius <= 0 || distanceMeters > radius) return 0
  const distanceRatio = Math.max(0, distanceMeters) / radius
  const minimum = Math.max(0, Math.min(1, minimumDamageScale))
  return minimum + (1 - minimum) * (1 - distanceRatio)
}

export function zombieEscapeTargetPrecedesByDistance(
  candidateDistanceSquared: number,
  candidateSlot: number,
  incumbentDistanceSquared: number,
  incumbentSlot: number,
) {
  return (
    candidateDistanceSquared < incumbentDistanceSquared ||
    (candidateDistanceSquared === incumbentDistanceSquared &&
      (incumbentSlot < 0 || candidateSlot < incumbentSlot))
  )
}
