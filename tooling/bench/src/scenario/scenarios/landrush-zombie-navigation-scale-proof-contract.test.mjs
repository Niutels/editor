import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as contract from './landrush-zombie-navigation-scale-proof-contract.mjs'
import * as scenario from './landrush-zombie-navigation-scale-proof.mjs'

test('browser scenario and headless runner share one proof-result contract', () => {
  assert.equal(
    scenario.zombieNavigationScaleProofIssues,
    contract.zombieNavigationScaleProofIssues,
  )
  assert.equal(
    scenario.summarizeZombieNavigationScaleProof,
    contract.summarizeZombieNavigationScaleProof,
  )
  const invalid = { fixedDeltaSeconds: 1 / 60, populations: [], schemaVersion: 5 }
  assert.deepEqual(
    scenario.zombieNavigationScaleProofIssues(invalid),
    contract.zombieNavigationScaleProofIssues(invalid),
  )
  assert.deepEqual(
    scenario.summarizeZombieNavigationScaleProof(invalid),
    contract.summarizeZombieNavigationScaleProof(invalid),
  )
})

test('transition demand accounting is independent from the post-publication repair cohort', () => {
  const counterDelta = {
    attachmentWork: 6_971,
    cachedAnchorLost: 0,
    inlineRecoveryWithoutFirstService: 4,
    intentCanceled: 0,
    intentFirstService: 15,
    intentIssued: 19,
    intentResolved: 19,
    intentResolveSlices: 19,
    routePublishedDemand: 19,
    searchRestarted: 3,
    searchStarted: 17,
    searchUncausedStartViolations: 0,
  }
  assert.deepEqual(
    contract.zombieNavigationScaleProofTransitionDemandAccountingIssues(
      counterDelta,
      'transition',
    ),
    [],
  )
  assert.notDeepEqual(
    contract.zombieNavigationScaleProofTransitionDemandAccountingIssues(
      { ...counterDelta, intentResolved: 18 },
      'transition',
    ),
    [],
  )
  assert.notDeepEqual(
    contract.zombieNavigationScaleProofTransitionDemandAccountingIssues(
      { ...counterDelta, searchStarted: 23 },
      'transition',
    ),
    [],
  )
})
