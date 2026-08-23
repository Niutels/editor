export function isBVHEcctrlSupportCandidateEligible({
  candidateHeight,
  currentFootHeight,
  grounded,
  landingSkin,
  maxStepHeight,
  previousFootHeight,
  verticalVelocity,
}: {
  candidateHeight: number
  currentFootHeight: number
  grounded: boolean
  landingSkin: number
  maxStepHeight: number
  previousFootHeight: number
  verticalVelocity: number
}) {
  const safeLandingSkin = Math.max(0, landingSkin)
  const safeStepHeight = Math.max(0, maxStepHeight)
  if (grounded) {
    const stepDelta = candidateHeight - currentFootHeight
    return stepDelta >= -safeStepHeight && stepDelta <= safeStepHeight
  }
  if (verticalVelocity > 0) return false
  if (currentFootHeight > previousFootHeight) return false

  const sweptFootMinimum = Math.min(previousFootHeight, currentFootHeight) - safeLandingSkin
  const sweptFootMaximum = Math.max(previousFootHeight, currentFootHeight) + safeLandingSkin
  return candidateHeight >= sweptFootMinimum && candidateHeight <= sweptFootMaximum
}
