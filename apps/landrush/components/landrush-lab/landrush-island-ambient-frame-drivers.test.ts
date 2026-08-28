import { describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

describe('Landrush island ambient frame drivers', () => {
  test('retains the host and registers only active frame drivers', () => {
    const fixturePath = fileURLToPath(
      new URL('./landrush-island-ambient-frame-drivers.fixture.tsx', import.meta.url),
    )
    const run = Bun.spawnSync({ cmd: [process.execPath, fixturePath] })
    const stderr = new TextDecoder().decode(run.stderr)

    expect({ exitCode: run.exitCode, stderr }).toEqual({ exitCode: 0, stderr: '' })
    expect(JSON.parse(new TextDecoder().decode(run.stdout))).toEqual({
      dormant: { hostMounted: true, priorities: [] },
      fishAndPlanner: { hostMounted: true, priorities: [-6, -5.5] },
      fishOnly: { hostMounted: true, priorities: [-6] },
    })
  })

  test('retains a loaded boat while removing its dormant frame driver', () => {
    const fixturePath = fileURLToPath(
      new URL('./landrush-island-ambient-boat-driver.fixture.tsx', import.meta.url),
    )
    const run = Bun.spawnSync({ cmd: [process.execPath, fixturePath] })
    const stderr = new TextDecoder().decode(run.stderr)

    expect({ exitCode: run.exitCode, stderr }).toEqual({ exitCode: 0, stderr: '' })
    expect(JSON.parse(new TextDecoder().decode(run.stdout))).toEqual({
      active: { hostMounted: true, priorities: [-6] },
      dormant: { hostMounted: true, priorities: [] },
    })
  })
})
