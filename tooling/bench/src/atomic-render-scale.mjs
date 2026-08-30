const DPR_TOLERANCE = 1e-6

function positiveDpr(value) {
  return Number.isFinite(value) && value > 0 ? value : null
}

export function summarizeAtomicRenderScale(captures, variants) {
  const samples = variants.flatMap((variant) => [
    { phase: 'before', value: captures[variant]?.bridge?.before, variant },
    { phase: 'after', value: captures[variant]?.bridge?.after, variant },
  ])
  const deviceDpr = samples.map((sample) => positiveDpr(sample.value?.dpr)).find(Boolean) ?? null
  const rendererSamples = samples
    .map((sample) => ({ ...sample, rendererDpr: positiveDpr(sample.value?.rendererDpr) }))
    .filter((sample) => sample.rendererDpr !== null)

  if (rendererSamples.length === 0) {
    return { deviceDpr, rendererDpr: null, stableAcrossVariants: null }
  }
  if (rendererSamples.length !== samples.length) {
    throw new Error('renderer DPR metadata is missing from one or more atomic captures')
  }

  const rendererDpr = rendererSamples[0].rendererDpr
  const mismatch = rendererSamples.find(
    (sample) => Math.abs(sample.rendererDpr - rendererDpr) > DPR_TOLERANCE,
  )
  if (mismatch) {
    throw new Error(
      `renderer DPR is not stable across atomic captures: ${mismatch.variant}/${mismatch.phase}=${mismatch.rendererDpr}`,
    )
  }
  return { deviceDpr, rendererDpr, stableAcrossVariants: true }
}

export function formatAtomicRenderScale(renderScale) {
  const deviceDpr = renderScale.deviceDpr === null ? 'unknown' : renderScale.deviceDpr.toFixed(2)
  const rendererDpr =
    renderScale.rendererDpr === null ? 'unknown' : renderScale.rendererDpr.toFixed(2)
  return `device DPR ${deviceDpr}; internal 3D renderer DPR ${rendererDpr}`
}
