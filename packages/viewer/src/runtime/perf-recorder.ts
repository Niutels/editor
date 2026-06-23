import { readViewerPerfFlagsFromUrl } from './perf-flags'
import type { RenderProfile } from './render-profiles'

type PerfTagValue = string | number | boolean | null | undefined

export type PerfSample = {
  name: string
  value: number
  at: number
  profile?: RenderProfile
  tags?: Record<string, PerfTagValue>
}

export type PerfSummary = {
  count: number
  min: number
  max: number
  mean: number
  p50: number
  p95: number
  p99: number
}

const MAX_SAMPLES = 5000

export class PerfRecorder {
  private samples: PerfSample[] = []

  isEnabled(): boolean {
    return readViewerPerfFlagsFromUrl().collectPerfMetrics
  }

  record(
    name: string,
    value: number,
    options: { profile?: RenderProfile; tags?: Record<string, PerfTagValue> } = {},
  ): void {
    if (!this.isEnabled()) return
    this.samples.push({
      name,
      value,
      at: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      profile: options.profile,
      tags: options.tags,
    })
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.splice(0, this.samples.length - MAX_SAMPLES)
    }
  }

  getSamples(name?: string): PerfSample[] {
    return name ? this.samples.filter((sample) => sample.name === name) : [...this.samples]
  }

  clear(): void {
    this.samples.length = 0
  }

  summarize(name: string): PerfSummary | null {
    const values = this.samples
      .filter((sample) => sample.name === name)
      .map((sample) => sample.value)
      .sort((a, b) => a - b)
    if (values.length === 0) return null

    const percentile = (p: number) => {
      const index = Math.min(values.length - 1, Math.floor((values.length - 1) * p))
      return values[index] ?? 0
    }
    const sum = values.reduce((total, value) => total + value, 0)

    return {
      count: values.length,
      min: values[0] ?? 0,
      max: values[values.length - 1] ?? 0,
      mean: sum / values.length,
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
    }
  }
}

export const perfRecorder = new PerfRecorder()

declare global {
  interface Window {
    __PASCAL_PERF__?: PerfRecorder
  }
}

if (typeof window !== 'undefined') {
  window.__PASCAL_PERF__ = perfRecorder
}
