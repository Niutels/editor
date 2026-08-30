import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  accumulateLandrushZombieEscapeFrameTime,
  areLandrushZombieEscapeHudSnapshotsSemanticallyEqual,
  createLandrushZombieEscapeIntegratedDebugBridge,
  createLandrushZombieEscapeRoomSoakState,
  LANDRUSH_ZOMBIE_ESCAPE_MAXIMUM_RECOVERY_SUBSTEPS,
} from './landrush-zombie-escape-mode'
import { ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'
import {
  createZombieEscapeHudSnapshot,
  type ZombieEscapeSimulation,
} from './zombie-escape-simulation'

describe('Landrush Zombie Escape frame-budget policy', () => {
  test('keeps the integrated mode on the authored instanced zombie path', () => {
    const source = readFileSync(
      new URL('./landrush-zombie-escape-mode.tsx', import.meta.url),
      'utf8',
    )
    expect(source).toMatch(/<ZombieEscapeActors\s+\n?\s*detailedZombies=\{false\}/)
  })

  test('keeps the global mode keyboard listener stable across the night transition', () => {
    const source = readFileSync(new URL('./landrush-island-client.tsx', import.meta.url), 'utf8')
    expect(source).toContain('modeKeyDownHandlerRef.current = handleKeyDown')
    expect(source).toMatch(
      /window\.addEventListener\('keydown', handleKeyDown, true\)[\s\S]+?window\.removeEventListener\('keydown', handleKeyDown, true\)[\s\S]+?\}, \[\]\)/,
    )
  })

  test('keeps ordinary integrated simulation frame work allocation-free and single-sync', () => {
    const source = readFileSync(
      new URL('./landrush-zombie-escape-mode.tsx', import.meta.url),
      'utf8',
    )
    const inputFrame = source.match(
      /useFrame\(\(\) => \{[\s\S]+?\}, LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER\.input\)/,
    )?.[0]
    const simulationFrame = source.match(
      /useFrame\(\(state, delta\) => \{[\s\S]+?\}, LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER\.simulation\)/,
    )?.[0]

    expect(inputFrame).not.toContain('syncIntegratedPlayerPose(')
    expect(simulationFrame?.match(/syncIntegratedPlayerPose\(/g)).toHaveLength(2)
    expect(simulationFrame).toMatch(
      /const economyCheckpoint = onProfileMoneyOperation\s+\? captureLandrushZombieEscapeEconomyCheckpoint\(simulation\)\s+: null/,
    )
    expect(simulationFrame).toMatch(
      /if \(economyCheckpoint\) \{\s+applyLandrushZombieEscapeProfileMoneyOperations/,
    )
  })

  test('bounds hitch recovery without discarding the ordinary fractional remainder', () => {
    const fixedDelta = ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds
    let accumulator = accumulateLandrushZombieEscapeFrameTime(fixedDelta * 0.75, 0.05)
    let substeps = 0
    while (
      accumulator >= fixedDelta &&
      substeps < LANDRUSH_ZOMBIE_ESCAPE_MAXIMUM_RECOVERY_SUBSTEPS
    ) {
      accumulator -= fixedDelta
      substeps += 1
    }

    expect(substeps).toBe(2)
    expect(accumulator).toBeGreaterThanOrEqual(0)
    expect(accumulator).toBeLessThan(fixedDelta)
  })

  test('treats diagnostic-only HUD sample changes as semantically unchanged', () => {
    const first = createZombieEscapeHudSnapshot()
    const diagnosticOnly = {
      ...first,
      elapsedSeconds: 4.3,
      frameMs: 41,
      phaseSecondsRemaining: first.phaseSecondsRemaining - 0.2,
      renderCalls: 99,
      triangles: 1_000_000,
    }

    expect(areLandrushZombieEscapeHudSnapshotsSemanticallyEqual(first, diagnosticOnly)).toBe(true)
    expect(
      areLandrushZombieEscapeHudSnapshotsSemanticallyEqual(first, {
        ...diagnosticOnly,
        money: first.money + 10,
      }),
    ).toBe(false)
    expect(
      areLandrushZombieEscapeHudSnapshotsSemanticallyEqual(first, {
        ...diagnosticOnly,
        phaseSecondsRemaining: first.phaseSecondsRemaining - 1.2,
      }),
    ).toBe(false)
  })

  test('publishes terminal elapsed time only when its displayed tenth changes', () => {
    const terminal = {
      ...createZombieEscapeHudSnapshot(),
      elapsedSeconds: 10.01,
      status: 'won' as const,
    }
    expect(
      areLandrushZombieEscapeHudSnapshotsSemanticallyEqual(terminal, {
        ...terminal,
        elapsedSeconds: 10.04,
      }),
    ).toBe(true)
    expect(
      areLandrushZombieEscapeHudSnapshotsSemanticallyEqual(terminal, {
        ...terminal,
        elapsedSeconds: 10.06,
      }),
    ).toBe(false)
  })

  test('exposes benchmark state through live getters without periodic snapshot construction', () => {
    const state = {
      night: 0,
      phase: 'build',
      phaseSecondsRemaining: 60,
      status: 'playing',
    }
    let expectedPhase = 'build' as 'build' | 'night'
    let phaseReady = false
    const bridge = createLandrushZombieEscapeIntegratedDebugBridge({
      arena: { playRadius: 10 } as never,
      groundY: 0,
      navigationScaleProofFixtureCapture: null,
      navigationScaleProofRunner: null,
      readExpectedPhase: () => expectedPhase,
      readMuzzlePose: () => ({ ready: false }) as never,
      readPhaseReady: () => phaseReady,
      roomSoakState: createLandrushZombieEscapeRoomSoakState(),
      simulation: state as unknown as ZombieEscapeSimulation,
      spawn: { x: 2, z: 3 },
    })

    expect(bridge.phase).toBe('build')
    expect(bridge.expectedPhase).toBe('build')
    expect(bridge.phaseReady).toBe(false)
    expect(typeof Object.getOwnPropertyDescriptor(bridge, 'performance')?.get).toBe('function')

    state.phase = 'night'
    expectedPhase = 'night'
    phaseReady = true
    expect(bridge.phase).toBe('night')
    expect(bridge.expectedPhase).toBe('night')
    expect(bridge.phaseReady).toBe(true)
  })
})
