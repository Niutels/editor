import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  accumulateLandrushZombieEscapeFrameTime,
  areLandrushZombieEscapeHudSnapshotsSemanticallyEqual,
  createLandrushZombieEscapeIntegratedDebugBridge,
  createLandrushZombieEscapeRoomSoakState,
  installLandrushZombieEscapeAmbientHandoffAtNightBoundary,
  LANDRUSH_ZOMBIE_ESCAPE_MAXIMUM_RECOVERY_SUBSTEPS,
} from './landrush-zombie-escape-mode'
import type { ZombieEscapeAmbientNpcPresentationRegistry } from './zombie-escape-ambient-npc-presentation-registry'
import { ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'
import {
  createZombieEscapeHudSnapshot,
  createZombieEscapeSimulation,
  type ZombieEscapeSimulation,
} from './zombie-escape-simulation'
import { createZombieEscapeArena } from './zombie-escape-world'
import { ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS } from './zombie-escape-zombie-roster'

describe('Landrush Zombie Escape frame-budget policy', () => {
  test('captures and installs all ten ambient candidates at a night boundary', () => {
    const simulation = createZombieEscapeSimulation(createZombieEscapeArena(58_210))
    const count = ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS.length
    let captureCount = 0
    const source = {
      locomotionMode: new Uint8Array(count),
      locomotionPhase: new Float32Array(count),
      sourceNpcIds: ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS,
      valid: new Uint8Array(count).fill(1),
      variant: new Uint8Array(count),
      x: new Float32Array(count),
      y: new Float32Array(count),
      yaw: new Float32Array(count),
      z: new Float32Array(count),
    }
    source.variant.set(simulation.variantByPoolSlot.subarray(0, count))
    const registry = {
      captureSource: () => {
        captureCount += 1
        return source
      },
    } as ZombieEscapeAmbientNpcPresentationRegistry

    expect(count).toBe(10)
    expect(installLandrushZombieEscapeAmbientHandoffAtNightBoundary(registry, simulation)).toBe(10)
    expect(captureCount).toBe(1)
    expect(simulation.ambientHandoff.candidateCount).toBe(10)
  })

  test('defers a canonical night boundary when any ambient capture is incomplete', () => {
    const simulation = createZombieEscapeSimulation(createZombieEscapeArena(58_212))
    const count = ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS.length
    const source = {
      locomotionMode: new Uint8Array(count),
      locomotionPhase: new Float32Array(count),
      sourceNpcIds: ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS,
      valid: new Uint8Array(count).fill(1),
      variant: new Uint8Array(count),
      x: new Float32Array(count),
      y: new Float32Array(count),
      yaw: new Float32Array(count),
      z: new Float32Array(count),
    }
    source.variant.set(simulation.variantByPoolSlot.subarray(0, count))
    source.valid[4] = 0
    const registry = {
      captureSource: () => source,
    } as ZombieEscapeAmbientNpcPresentationRegistry

    expect(installLandrushZombieEscapeAmbientHandoffAtNightBoundary(registry, simulation)).toBe(0)
    expect(simulation.phase).toBe('build')
    expect(simulation.ambientHandoff.candidateCount).toBe(0)
  })

  test('installs a complete handoff before requests and authoritative night transitions', () => {
    const modeSource = readFileSync(
      new URL('./landrush-zombie-escape-mode.tsx', import.meta.url),
      'utf8',
    )
    const offlineBoundaryStart = modeSource.indexOf('const startZombie = useCallback')
    const onlineInstall = modeSource.indexOf(
      'installAmbientHandoffAtNightBoundary()',
      offlineBoundaryStart,
    )
    const onlineRequest = modeSource.indexOf('startZombieEscapeNight()', offlineBoundaryStart)
    const offlineTransition = modeSource.indexOf(
      'requestLandrushZombieEscapeNightStart({',
      offlineBoundaryStart,
    )
    const offlineInstall = modeSource.lastIndexOf(
      'installAmbientHandoffAtNightBoundary()',
      offlineTransition,
    )
    expect(offlineBoundaryStart).toBeGreaterThanOrEqual(0)
    expect(onlineInstall).toBeGreaterThan(offlineBoundaryStart)
    expect(onlineInstall).toBeLessThan(onlineRequest)
    expect(offlineInstall).toBeGreaterThan(offlineBoundaryStart)
    expect(offlineInstall).toBeLessThan(offlineTransition)

    const canonicalBoundaryStart = modeSource.indexOf(
      "simulation.phase === 'build' &&\n        zombieEscapeRoomStateObservation.state.phase === 'night'",
    )
    const canonicalInstall = modeSource.indexOf(
      'installAmbientHandoffAtNightBoundary()',
      canonicalBoundaryStart,
    )
    const canonicalTransition = modeSource.indexOf(
      'applyLandrushZombieEscapeRoomState({',
      canonicalBoundaryStart,
    )
    expect(canonicalBoundaryStart).toBeGreaterThanOrEqual(0)
    expect(canonicalInstall).toBeGreaterThan(canonicalBoundaryStart)
    expect(canonicalInstall).toBeLessThan(canonicalTransition)
    expect(modeSource.slice(canonicalBoundaryStart, canonicalTransition)).toMatch(
      /installAmbientHandoffAtNightBoundary\(\)[\s\S]*?renderScheduler\.requestFrame\('animation'\)[\s\S]*?return/,
    )
  })

  test('shares one lazy torch state with the ambient and generated presentations', () => {
    const modeSource = readFileSync(
      new URL('./landrush-zombie-escape-mode.tsx', import.meta.url),
      'utf8',
    )
    const runtimeBinding = modeSource.match(
      /ambientNpcPresentationRegistry\.bindRuntime\(\{[\s\S]*?\n\s*\}\)/,
    )?.[0]
    const ambientSource = readFileSync(
      new URL('./landrush-island-ambient-life.tsx', import.meta.url),
      'utf8',
    )

    expect(modeSource).toContain(
      'const [shoulderTorchLightingState] = useState(createLandrushRobotShoulderTorchLightingState)',
    )
    expect(modeSource).toContain(
      'const shoulderTorchLightingStateRef = useRef(shoulderTorchLightingState)',
    )
    expect(
      modeSource.match(/shoulderTorchLightingStateRef=\{shoulderTorchLightingStateRef\}/g),
    ).toHaveLength(3)
    expect(runtimeBinding).toContain(
      'readShoulderTorchLighting: () => shoulderTorchLightingStateRef.current',
    )
    expect(runtimeBinding).not.toContain('impactVisualRegistry')
    expect(modeSource).not.toContain('ambientNpcPresentationRegistry.setGroundY(')
    expect(
      ambientSource.match(
        /ambientNpcPresentationRegistry\.setGroundY\(surface\.grassSurfaceElevation\)/g,
      ),
    ).toHaveLength(1)
  })

  test('creates one stable ambient presentation registry and threads the same instance', () => {
    const islandSource = readFileSync(
      new URL('./landrush-island-client.tsx', import.meta.url),
      'utf8',
    )
    expect(islandSource.match(/createZombieEscapeAmbientNpcPresentationRegistry\(/g)).toHaveLength(
      1,
    )
    expect(islandSource).toMatch(
      /const ambientNpcPresentationRegistry = useMemo\([\s\S]*?ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS\),\n\s*\[\],\n\s*\)/,
    )
    expect(
      islandSource.match(/ambientNpcPresentationRegistry=\{ambientNpcPresentationRegistry\}/g),
    ).toHaveLength(3)
    expect(islandSource).toContain('zombieEscapeHandoffEnabled={zombieEscapeEnabled}')
  })

  test('keeps the integrated mode on the authored instanced zombie path', () => {
    const source = readFileSync(
      new URL('./landrush-zombie-escape-mode.tsx', import.meta.url),
      'utf8',
    )
    expect(source).toMatch(/<ZombieEscapeActors\s+\n?\s*detailedZombies=\{false\}/)
  })

  test('does not return store setter results from mount notification effects', () => {
    const source = readFileSync(
      new URL('./landrush-zombie-escape-mode.tsx', import.meta.url),
      'utf8',
    )

    expect(source).toMatch(
      /useEffect\(\(\) => \{\s+onPhaseChange\(snapshotRef\.current\.phase\)\s+\}, \[onPhaseChange\]\)/,
    )
    expect(source).toMatch(
      /useEffect\(\(\) => \{\s+onStatusChange\(snapshotRef\.current\.status\)\s+\}, \[onStatusChange\]\)/,
    )
  })

  test('keeps the global mode keyboard listener stable across the night transition', () => {
    const source = readFileSync(new URL('./landrush-island-client.tsx', import.meta.url), 'utf8')
    expect(source).toContain('modeKeyDownHandlerRef.current = handleKeyDown')
    expect(source).toMatch(
      /window\.addEventListener\('keydown', handleKeyDown, true\)[\s\S]+?window\.removeEventListener\('keydown', handleKeyDown, true\)[\s\S]+?\}, \[\]\)/,
    )
  })

  test('claims combat wheel input before the island camera capture handler', () => {
    const source = readFileSync(
      new URL('./landrush-zombie-escape-mode.tsx', import.meta.url),
      'utf8',
    )

    expect(source).toContain("window.addEventListener('wheel', handleWheel, {")
    expect(source).toContain('capture: true, passive: false')
    expect(source).toMatch(
      /if \(event\.target !== canvas\) return\s+event\.preventDefault\(\)\s+event\.stopPropagation\(\)/,
    )
    expect(source).toContain("window.removeEventListener('wheel', handleWheel, true)")
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
    ).toBe(true)
    expect(
      areLandrushZombieEscapeHudSnapshotsSemanticallyEqual(first, {
        ...diagnosticOnly,
        weaponInventoryMask: first.weaponInventoryMask | 0b10,
      }),
    ).toBe(false)
    expect(
      areLandrushZombieEscapeHudSnapshotsSemanticallyEqual(first, {
        ...diagnosticOnly,
        weaponIndex: first.weaponIndex + 1,
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
