import path from 'node:path'
import { describe, expect, it } from 'bun:test'
import { readLandrushRuntimeWorkerOutputDirectory } from './build-landrush-runtime-workers.mjs'

describe('Landrush runtime-worker build arguments', () => {
  it('accepts both explicit output-directory spellings', () => {
    expect(readLandrushRuntimeWorkerOutputDirectory(['--outdir=proof-workers'])).toBe(
      path.resolve('proof-workers'),
    )
    expect(readLandrushRuntimeWorkerOutputDirectory(['--outdir', 'proof-workers'])).toBe(
      path.resolve('proof-workers'),
    )
  })

  it('fails closed when the output-directory value is missing', () => {
    expect(() => readLandrushRuntimeWorkerOutputDirectory(['--outdir'])).toThrow(
      'requires a path',
    )
    expect(() => readLandrushRuntimeWorkerOutputDirectory(['--outdir='])).toThrow(
      'requires a path',
    )
  })
})
