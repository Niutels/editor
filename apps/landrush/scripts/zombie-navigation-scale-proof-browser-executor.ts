import {
  summarizeZombieNavigationScaleProof,
  zombieNavigationScaleProofIssues,
} from '../../../tooling/bench/src/scenario/scenarios/landrush-zombie-navigation-scale-proof-contract.mjs'
import { createLandrushZombieEscapeIntegratedArenaFromPlayRadius } from '../components/landrush-lab/landrush-zombie-escape-arena'
import type { ZombieEscapeCollisionWorld } from '../components/landrush-lab/zombie-escape-collision-world'
import { ZOMBIE_ESCAPE_SIMULATION } from '../components/landrush-lab/zombie-escape-config'
import { runLandrushZombieEscapeNavigationScaleProof } from '../components/landrush-lab/zombie-escape-navigation-scale-proof'
import {
  assertLandrushZombieEscapeNavigationScaleProofFixture,
  assertLandrushZombieEscapeNavigationScaleProofFixtureWorld,
  serializeLandrushZombieEscapeNavigationScaleProofPayload,
} from '../components/landrush-lab/zombie-escape-navigation-scale-proof-fixture'

export async function runLandrushZombieNavigationScaleProofBrowserExecutor({
  collisionWorld,
  fixtureValue,
  payloadSha256,
  replaySha256,
  timeoutMs,
}: {
  collisionWorld: ZombieEscapeCollisionWorld
  fixtureValue: unknown
  payloadSha256: string
  replaySha256: string
  timeoutMs: number
}) {
  const startedAt = performance.now()
  const fixture = assertLandrushZombieEscapeNavigationScaleProofFixture(fixtureValue, {
    payloadSha256,
    replaySha256,
  })
  if (
    JSON.stringify(fixture.compilation.payload) !==
    serializeLandrushZombieEscapeNavigationScaleProofPayload(fixture.compilation.payload)
  ) {
    throw new Error('Navigation scale proof fixture payload did not round-trip canonically.')
  }
  const world = assertLandrushZombieEscapeNavigationScaleProofFixtureWorld(collisionWorld, fixture)
  const result = await runLandrushZombieEscapeNavigationScaleProof({
    arena: createLandrushZombieEscapeIntegratedArenaFromPlayRadius(
      fixture.compilation.payload.playRadius,
    ),
    collisionWorld,
    collisionWorldGeneration: fixture.proofInput.collisionWorldGeneration,
    collisionWorldSignature: fixture.compilation.signature,
    fixedDeltaSeconds: ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds,
    timeoutMs,
    worldOrigin: fixture.proofInput.worldOrigin,
  })
  const issues = zombieNavigationScaleProofIssues(result)
  if (issues.length > 0) {
    throw new Error(`Navigation scale proof result contract failed: ${issues.join('; ')}`)
  }
  return {
    durationMs: performance.now() - startedAt,
    fixture: {
      capturedAt: fixture.source.capturedAt,
      payloadSha256: fixture.compilation.payloadSha256,
      replaySha256: fixture.source.replaySha256,
      worldId: fixture.source.worldId,
    },
    result,
    summary: summarizeZombieNavigationScaleProof(result),
    world,
  }
}
