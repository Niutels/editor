import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createZombieEnterRoomMeasurementContract,
  zombieEnterRoomPresentationIssues,
} from './landrush-zombie-enter-room.mjs'

const contract = createZombieEnterRoomMeasurementContract(16).presentation

function validPresentation(overrides = {}) {
  return {
    activeZombieCount: 100,
    authoredInstancedActiveCount: 84,
    authoredInstancedBatchCount: 10,
    detailedActiveCount: 16,
    detailedCapacity: 16,
    fallbackCount: 0,
    instancedActiveCount: 84,
    unpresentedActiveCount: 0,
    ...overrides,
  }
}

test('100-zombie presentation contract requires 16 detailed and 84 authored instances', () => {
  assert.equal(contract.authoredInstancedActiveCount, 84)
  assert.deepEqual(contract.authoredInstancedBatchCount, { maximum: 10, minimum: 1 })
  assert.equal(contract.fallbackCount, 0)
  assert.equal(contract.unpresentedActiveCount, 0)
  assert.deepEqual(
    zombieEnterRoomPresentationIssues({ presentation: validPresentation() }, contract),
    [],
  )
})

test('presentation reducer rejects fallback, omission, and authored-count substitution', () => {
  const cases = [
    validPresentation({ authoredInstancedActiveCount: 83, unpresentedActiveCount: 1 }),
    validPresentation({ authoredInstancedActiveCount: 83, fallbackCount: 1 }),
    validPresentation({ authoredInstancedActiveCount: 83 }),
  ]
  for (const presentation of cases) {
    assert.notDeepEqual(zombieEnterRoomPresentationIssues({ presentation }, contract), [])
  }
})

test('presentation reducer requires a nonzero batch count bounded by the ten variants', () => {
  for (const authoredInstancedBatchCount of [0, 11]) {
    const issues = zombieEnterRoomPresentationIssues(
      { presentation: validPresentation({ authoredInstancedBatchCount }) },
      contract,
    )
    assert.ok(issues.some((issue) => issue.includes('authoredInstancedBatchCount')))
  }
})
