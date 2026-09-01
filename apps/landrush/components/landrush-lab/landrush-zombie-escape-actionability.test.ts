import { describe, expect, test } from 'bun:test'
import {
  createLandrushZombieEscapeNightStartReadiness,
  reconcileLandrushZombieEscapeNightStartReadiness,
  resolveLandrushZombieEscapeCombatFireEnabled,
  resolveLandrushZombieEscapeInteractionActionable,
  resolveLandrushZombieEscapeLocomotionBaseEnabled,
  resolveLandrushZombieEscapePhaseReady,
} from './landrush-zombie-escape-actionability'

const READY_NIGHT = {
  authorityResyncActive: false,
  buildMode: false,
  cameraOwner: 'zombie',
  fpvView: false,
  generatedAssetsReady: true,
  loadingActive: false,
  mapView: false,
  modeTransitionActive: false,
  phase: 'night',
  sceneViewMode: 'player',
  viewMode: 'player',
  zombieEscapeEnabled: true,
} as const

describe('Landrush Zombie Escape actionability', () => {
  test('latches attained start readiness through transient build-phase samples', () => {
    let readiness = createLandrushZombieEscapeNightStartReadiness()
    readiness = reconcileLandrushZombieEscapeNightStartReadiness({
      buildPhaseActive: true,
      candidateReady: false,
      contextKey: 'world-a:session-a',
      current: readiness,
    })
    expect(readiness.ready).toBe(false)

    readiness = reconcileLandrushZombieEscapeNightStartReadiness({
      buildPhaseActive: true,
      candidateReady: true,
      contextKey: 'world-a:session-a',
      current: readiness,
    })
    expect(readiness.ready).toBe(true)

    readiness = reconcileLandrushZombieEscapeNightStartReadiness({
      buildPhaseActive: true,
      candidateReady: false,
      contextKey: 'world-a:session-a',
      current: readiness,
    })
    expect(readiness.ready).toBe(true)

    readiness = reconcileLandrushZombieEscapeNightStartReadiness({
      buildPhaseActive: true,
      candidateReady: false,
      contextKey: 'world-b:session-b',
      current: readiness,
    })
    expect(readiness.ready).toBe(false)

    readiness = reconcileLandrushZombieEscapeNightStartReadiness({
      buildPhaseActive: false,
      candidateReady: true,
      contextKey: 'world-b:session-b',
      current: readiness,
    })
    expect(readiness.ready).toBe(false)
  })

  test('keeps ready Night interaction independent from the visual mode fade', () => {
    for (const modeTransitionActive of [false, true]) {
      expect(
        resolveLandrushZombieEscapePhaseReady({
          ...READY_NIGHT,
          modeTransitionActive,
        }),
      ).toBe(true)
    }
  })

  test('blocks Night movement for unsafe view, authority, and collision states', () => {
    for (const blockedState of [
      { buildMode: true },
      { cameraOwner: 'build' },
      { fpvView: true },
      { mapView: true },
      { sceneViewMode: 'build' },
      { viewMode: 'map' },
      { authorityResyncActive: true },
    ] as const) {
      const phaseReady = resolveLandrushZombieEscapePhaseReady({
        ...READY_NIGHT,
        ...blockedState,
      })
      const interactionActionable = resolveLandrushZombieEscapeInteractionActionable({
        collisionWorldReady: true,
        interactionEligible: phaseReady,
      })
      expect(
        resolveLandrushZombieEscapeLocomotionBaseEnabled({
          baseMovementEnabled: true,
          interactionActionable,
          phase: 'night',
          zombieEscapeEnabled: true,
        }),
      ).toBe(false)
    }

    const phaseReady = resolveLandrushZombieEscapePhaseReady(READY_NIGHT)
    expect(
      resolveLandrushZombieEscapeLocomotionBaseEnabled({
        baseMovementEnabled: true,
        interactionActionable: resolveLandrushZombieEscapeInteractionActionable({
          collisionWorldReady: false,
          interactionEligible: phaseReady,
        }),
        phase: 'night',
        zombieEscapeEnabled: true,
      }),
    ).toBe(false)
    expect(
      resolveLandrushZombieEscapeLocomotionBaseEnabled({
        baseMovementEnabled: true,
        interactionActionable: resolveLandrushZombieEscapeInteractionActionable({
          collisionWorldReady: true,
          interactionEligible: phaseReady,
        }),
        phase: 'night',
        zombieEscapeEnabled: true,
      }),
    ).toBe(true)
  })

  test('keeps combat fire guarded by both the exact collision world and muzzle readiness', () => {
    expect(
      resolveLandrushZombieEscapeCombatFireEnabled({
        collisionWorldReady: true,
        interactionEligible: true,
        muzzleReady: true,
        requested: true,
      }),
    ).toBe(true)

    for (const blockedState of [
      { collisionWorldReady: false },
      { interactionEligible: false },
      { muzzleReady: false },
      { requested: false },
    ] as const) {
      expect(
        resolveLandrushZombieEscapeCombatFireEnabled({
          collisionWorldReady: true,
          interactionEligible: true,
          muzzleReady: true,
          requested: true,
          ...blockedState,
        }),
      ).toBe(false)
    }
  })
})
