import { describe, expect, it } from 'bun:test'
import { readLandrushZombieNavigationScaleProofTimeoutMs } from './run-zombie-navigation-scale-proof.mjs'

describe('headless Landrush Zombie Escape navigation proof command', () => {
  it('uses the production timeout default and accepts both CLI spellings', () => {
    expect(readLandrushZombieNavigationScaleProofTimeoutMs([])).toBe(120_000)
    expect(readLandrushZombieNavigationScaleProofTimeoutMs(['--timeout-ms=90000'])).toBe(90_000)
    expect(readLandrushZombieNavigationScaleProofTimeoutMs(['--', '--timeout-ms', '80000'])).toBe(
      80_000,
    )
  })

  it('fails closed on missing or invalid timeout values', () => {
    expect(() => readLandrushZombieNavigationScaleProofTimeoutMs(['--timeout-ms'])).toThrow()
    expect(() => readLandrushZombieNavigationScaleProofTimeoutMs(['--timeout-ms=0'])).toThrow()
    expect(() => readLandrushZombieNavigationScaleProofTimeoutMs(['--timeout-ms=nope'])).toThrow()
  })
})
