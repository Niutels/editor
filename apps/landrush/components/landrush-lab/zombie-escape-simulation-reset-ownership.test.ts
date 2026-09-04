import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  beginZombieEscapeSparseFlowSearch,
  getZombieEscapeSparseCommittedRouteGeneration,
  getZombieEscapeSparseRequestedTargetRevision,
  inspectZombieEscapeSparseAttachmentHeapLeases,
  type ZombieEscapeSparseFlowSearch,
  zombieEscapeSparseFlowSearchHasAttachmentHeapLease,
} from '@landrush/zombie-gameplay/zombie-escape-collision-world'
import {
  createZombieEscapeSimulation,
  setZombieEscapeGamePhase,
} from '@landrush/zombie-gameplay/zombie-escape-simulation'
import { createZombieEscapeArena } from '@landrush/zombie-gameplay/zombie-escape-world'

const simulationSource = readFileSync(
  new URL(
    '../../../../packages/landrush-zombie-gameplay/src/zombie-escape-simulation.ts',
    import.meta.url,
  ),
  'utf8',
)

function sourceBetween(startMarker: string, endMarker: string) {
  const start = simulationSource.indexOf(startMarker)
  const end = simulationSource.indexOf(endMarker, start + startMarker.length)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return simulationSource.slice(start, end)
}

function poisonSparseSearch(search: ZombieEscapeSparseFlowSearch) {
  search.phase = 'direct-visibility'
  search.routeCorridorGeneration = 17
  search.routeCorridorWorldRevision = 'stale-route'
  search.status = 'pending'
  search.totalCandidateVisits = 31
  search.totalCollisionPredicates = 37
  search.totalHeapOperations = 41
  search.worldRevision = 'stale-world'

  search.attachment.bestAttachmentBreachObjectOrdinals.add(43)
  search.attachment.bestNode = 47
  search.attachment.phase = 'collision'
  search.attachment.status = 'pending'
  search.attachment.totalCandidateVisits = 53
  search.attachment.worldRevision = 'stale-attachment'

  search.attachment.visibility.breakableObjectOrdinals.add(59)
  search.attachment.visibility.phase = 'collision-item'
  search.attachment.visibility.status = 'pending'
  search.attachment.visibility.totalCollisionPredicates = 61
  search.attachment.visibility.worldRevision = 'stale-visibility'
}

function expectSparseSearchReset(search: ZombieEscapeSparseFlowSearch) {
  expect(search.phase).toBe('complete')
  expect(search.routeCorridorGeneration).toBe(0)
  expect(search.routeCorridorWorldRevision).toBe('')
  expect(search.status).toBe('unreachable')
  expect(search.totalCandidateVisits).toBe(0)
  expect(search.totalCollisionPredicates).toBe(0)
  expect(search.totalHeapOperations).toBe(0)
  expect(search.worldRevision).toBe('')

  expect(search.attachment.bestAttachmentBreachObjectOrdinals.size).toBe(0)
  expect(search.attachment.bestNode).toBe(-1)
  expect(search.attachment.hierarchyHeapLeaseToken).toBe(0)
  expect(search.attachment.hierarchyHeapSlot).toBe(-1)
  expect(search.attachment.hierarchyHeapWorkspace).toBeNull()
  expect(search.attachment.phase).toBe('complete')
  expect(search.attachment.reverseFieldBankIndex).toBe(-1)
  expect(search.attachment.reverseFieldBankWorkspace).toBeNull()
  expect(search.attachment.status).toBe('unreachable')
  expect(search.attachment.totalCandidateVisits).toBe(0)
  expect(search.attachment.worldRevision).toBe('')

  expect(search.attachment.visibility.breakableObjectOrdinals.size).toBe(0)
  expect(search.attachment.visibility.phase).toBe('complete')
  expect(search.attachment.visibility.status).toBe('blocked')
  expect(search.attachment.visibility.totalCollisionPredicates).toBe(0)
  expect(search.attachment.visibility.worldRevision).toBe('')
}

describe('Zombie Escape simulation reset ownership', () => {
  test('gives the zombie pool sole ownership of lifecycle sparse-search cleanup', () => {
    const schedulerReset = sourceBetween(
      'function resetZombieEscapeNavigationIntentScheduler',
      'const ZOMBIE_ESCAPE_NAVIGATION_INTENT_ADMISSION_OBSTACLE',
    )
    const poolReset = sourceBetween('function resetZombiePool', 'function countActiveMuzzleFlashes')
    const lifecycleResets = [
      sourceBetween(
        'export function resetZombieEscapeSimulation',
        'export function setZombieEscapeWeaponPickupPlacements',
      ),
      sourceBetween('function enterZombieEscapeNight', 'function enterZombieEscapeBuild'),
      sourceBetween(
        'function enterZombieEscapeBuild',
        'function findNearbyZombieEscapeWeaponPickup',
      ),
    ]

    expect(schedulerReset).not.toContain('resetZombieEscapeSparseFlowSearch')
    expect(schedulerReset).not.toContain('navigationSparseCommittedFlowSearch')
    expect(schedulerReset).not.toMatch(
      /for \(const search of state\.zombies\.navigationSparseFlowSearch\)/,
    )
    expect(poolReset).toContain('zombies.navigationSparseCommittedFlowSearch')
    expect(poolReset).toContain('zombies.navigationSparseFlowSearch')
    expect(poolReset.match(/resetZombieEscapeSparseFlowSearch\(search\)/g)).toHaveLength(2)
    for (const lifecycleReset of lifecycleResets) {
      expect(lifecycleReset.match(/resetZombiePool\(state\.zombies\)/g)).toHaveLength(1)
      expect(
        lifecycleReset.match(/resetZombieEscapeNavigationIntentScheduler\(state\)/g),
      ).toHaveLength(1)
      expect(lifecycleReset).toMatch(
        /resetZombiePool\(state\.zombies\)[\s\S]*resetZombieEscapeNavigationIntentScheduler\(state\)/,
      )
    }
  })

  test('night entry releases pool-owned sparse searches and clears scheduler state', () => {
    const arena = createZombieEscapeArena(12_351)
    const state = createZombieEscapeSimulation(arena, 98_766, undefined, {
      requireSparseNavigation: true,
      zombieCapacity: 2,
    })
    const collisionWorld = state.collisionWorld
    const navigationField = state.navigationField
    const committedSearches = state.zombies.navigationSparseCommittedFlowSearch
    const flowSearches = state.zombies.navigationSparseFlowSearch
    const searchReferences = [...committedSearches, ...flowSearches]

    for (const search of searchReferences) {
      expect(
        beginZombieEscapeSparseFlowSearch(
          search,
          navigationField,
          arena.playerStartX,
          arena.playerStartZ,
          arena.escapeX,
          arena.escapeZ,
        ),
      ).toBe('pending')
      expect(zombieEscapeSparseFlowSearchHasAttachmentHeapLease(search, navigationField)).toBe(true)
      poisonSparseSearch(search)
    }
    expect(inspectZombieEscapeSparseAttachmentHeapLeases(navigationField)).toMatchObject({
      activeAgentLeases: 4,
      availableAgentLeases: 4,
      leaseInvariantViolationCount: 0,
    })

    state.zombies.pool.active.fill(1)
    state.zombies.pool.activeCount = state.zombies.pool.capacity
    state.zombies.x.fill(67)
    state.zombies.navigationSparseFlowSearchActive.fill(1)
    state.navigationIntentPendingCount = 2
    state.navigationIntentResolveCursor = 1
    state.navigationIntentResolveEligible.fill(1)
    state.navigationIntentAdmissionDeferredQueueHead = 0
    state.navigationIntentAdmissionDeferredQueueTail = 1
    state.navigationRouteTargetInitialized = true
    state.navigationSparseSearchPendingAgentCount = 2
    state.navigationSparseSearchStartedCount = 71

    setZombieEscapeGamePhase(state, 'night')

    expect(state.phase).toBe('night')
    expect(state.collisionWorld).toBe(collisionWorld)
    expect(state.navigationField).toBe(navigationField)
    expect(state.zombies.navigationSparseCommittedFlowSearch).toBe(committedSearches)
    expect(state.zombies.navigationSparseFlowSearch).toBe(flowSearches)
    expect([
      ...state.zombies.navigationSparseCommittedFlowSearch,
      ...state.zombies.navigationSparseFlowSearch,
    ]).toEqual(searchReferences)
    for (const search of searchReferences) expectSparseSearchReset(search)
    expect(inspectZombieEscapeSparseAttachmentHeapLeases(navigationField)).toMatchObject({
      activeAgentLeases: 0,
      availableAgentLeases: 8,
      leaseInvariantViolationCount: 0,
    })

    expect(state.zombies.pool.activeCount).toBe(0)
    expect([...state.zombies.pool.active]).toEqual([0, 0])
    expect([...state.zombies.x]).toEqual([0, 0])
    expect([...state.zombies.navigationSparseFlowSearchActive]).toEqual([0, 0])
    expect(state.navigationIntentPendingCount).toBe(0)
    expect(state.navigationIntentResolveCursor).toBe(0)
    expect([...state.navigationIntentResolveEligible]).toEqual([0, 0])
    expect(state.navigationIntentAdmissionDeferredQueueHead).toBe(-1)
    expect(state.navigationIntentAdmissionDeferredQueueTail).toBe(-1)
    expect(state.navigationRouteTargetInitialized).toBe(false)
    expect(state.navigationSparseSearchPendingAgentCount).toBe(0)
    expect(state.navigationSparseSearchStartedCount).toBe(0)
    expect(state.navigationTargetCommittedRouteGeneration).toBe(
      getZombieEscapeSparseCommittedRouteGeneration(navigationField),
    )
    expect(state.navigationTargetRequestedRevision).toBe(
      getZombieEscapeSparseRequestedTargetRevision(navigationField),
    )
  })
})
