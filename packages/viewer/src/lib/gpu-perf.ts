// GPU work-time measurement, gated by `?perf`, `?fps`, or known debug scene paths.
//
// We can't use WebGPU timestamp queries here because the editor renders via
// a custom `RenderPipeline.render()` path that bypasses three.js's built-in
// timestamp infrastructure. Instead we use `device.queue.onSubmittedWorkDone()`,
// which resolves when the GPU finishes all submitted work. Measuring the
// CPU-to-GPU-done delta gives a clean approximation of per-frame GPU duration
// regardless of which render path produced it.

export function isPerfOverlayEnabled() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return (
    params.has('perf') ||
    params.has('fps') ||
    window.location.pathname === '/scene/codex-robot-download-layout'
  )
}

const MAX_SAMPLES = 256
const samples: number[] = []

export function pushGpuSample(ms: number): void {
  samples.push(ms)
  if (samples.length > MAX_SAMPLES) samples.shift()
}

export function drainGpuSamples(): number[] {
  if (samples.length === 0) return []
  const out = samples.slice()
  samples.length = 0
  return out
}
