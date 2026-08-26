import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'bun:test'
import {
  assertLandrushZombieNavigationScaleProofKernelResult,
  assertPinnedLandrushProofChromium,
  runLandrushZombieNavigationScaleProofChromiumKernel,
} from './run-zombie-navigation-scale-proof.mjs'

const pinnedChromium = {
  jsVersion: '14.9.207.21',
  product: 'Chrome/149.0.7827.55',
  revision: '@3188f8a607ae7e067593be8aab7f02d2451fec07',
}

function createExitedChild(code, signal = null) {
  const child = new EventEmitter()
  child.kill = () => true
  queueMicrotask(() => child.emit('close', code, signal))
  return child
}

describe('Landrush Zombie Escape isolated Chromium proof launcher', () => {
  it('preserves a worker-build failure, skips later phases, and cleans up', async () => {
    const calls = []
    const removals = []
    const signalTarget = new EventEmitter()
    const result = await runLandrushZombieNavigationScaleProofChromiumKernel({
      argv: ['--timeout-ms=90000'],
      bunExecutable: 'test-bun',
      createTempDirectory: async () =>
        'C:\\temp\\landrush-zombie-navigation-proof-test',
      removeTempDirectory: async (directory) => removals.push(directory),
      repoRoot: 'C:\\repo',
      runtimeVersions: { v8: 'test-v8' },
      signalTarget,
      spawnProcess(command, args, options) {
        calls.push({ args, command, options })
        return createExitedChild(17)
      },
      tempRoot: 'C:\\temp',
    })

    expect(result).toEqual({ code: 17, output: null, signal: null })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      args: [
        'C:\\repo\\apps\\landrush\\scripts\\build-landrush-runtime-workers.mjs',
        '--minify',
        '--outdir=C:\\temp\\landrush-zombie-navigation-proof-test\\workers',
      ],
      command: 'test-bun',
      options: {
        cwd: 'C:\\repo',
        stdio: ['ignore', 'ignore', 'inherit'],
        windowsHide: true,
      },
    })
    expect(removals).toEqual(['C:\\temp\\landrush-zombie-navigation-proof-test'])
    expect(signalTarget.listenerCount('SIGINT')).toBe(0)
    expect(signalTarget.listenerCount('SIGTERM')).toBe(0)
  })

  it('fails closed on non-Node runtimes before creating a temporary directory', async () => {
    let created = false
    await expect(
      runLandrushZombieNavigationScaleProofChromiumKernel({
        createTempDirectory: async () => {
          created = true
          return 'unused'
        },
        runtimeVersions: { bun: '1.3.1', v8: 'spoofed' },
      }),
    ).rejects.toThrow('requires the Node runtime')
    expect(created).toBe(false)
  })

  it('does not let cleanup failure mask the primary launcher failure', async () => {
    await expect(
      runLandrushZombieNavigationScaleProofChromiumKernel({
        createTempDirectory: async () =>
          'C:\\temp\\landrush-zombie-navigation-proof-test',
        removeTempDirectory: async () => {
          throw new Error('cleanup failed')
        },
        runtimeVersions: { v8: 'test-v8' },
        signalTarget: new EventEmitter(),
        spawnProcess() {
          throw new Error('spawn failed')
        },
        tempRoot: 'C:\\temp',
      }),
    ).rejects.toMatchObject({
      errors: [{ message: 'spawn failed' }, { message: 'cleanup failed' }],
    })
  })

  it('pins the exact Chromium/V8 runtime', () => {
    expect(() => assertPinnedLandrushProofChromium(pinnedChromium)).not.toThrow()
    for (const key of ['jsVersion', 'product', 'revision']) {
      expect(() =>
        assertPinnedLandrushProofChromium({ ...pinnedChromium, [key]: 'different' }),
      ).toThrow(`requires pinned Chromium ${key}`)
    }
  })

  it('rejects missing, malformed, and noncanonical proof JSON', () => {
    expect(() => assertLandrushZombieNavigationScaleProofKernelResult('')).toThrow('no JSON')
    expect(() => assertLandrushZombieNavigationScaleProofKernelResult('{')).toThrow(
      'malformed JSON',
    )
    expect(() => assertLandrushZombieNavigationScaleProofKernelResult('{}')).toThrow(
      'canonical browser world',
    )
  })
})
