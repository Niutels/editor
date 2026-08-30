import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createLandrushExteriorEntryCandidates,
  discoverLandrushExteriorEntryCandidates,
} from '../scenario-utils.mjs'
import enterHouseScenario from './landrush-enter-house.mjs'

test('first-entry lifecycle performs no warmup, duplicate prepare, checkpoint, or settle', () => {
  assert.deepEqual(enterHouseScenario.lifecycle, {
    captureInitialCheckpoint: false,
    prepareAfterWarmup: false,
    settleBeforeMeasurement: false,
    warmupSeconds: 0,
  })
  assert.equal(enterHouseScenario.lifecycle.watchdog ?? true, true)
  assert.equal(enterHouseScenario.urlParams().includes('game=zombie-escape'), false)
  assert.equal(
    enterHouseScenario.urlParams({ args: { game: 'zombie-escape' } }).includes(
      'game=zombie-escape',
    ),
    true,
  )
})

test('doorway candidate discovery uses portal metadata without probing either side', async () => {
  let mutationCount = 0
  const navigation = {
    getState: () => ({
      doorPortals: [
        {
          baseY: 0,
          doorId: 'far-door',
          levelId: 'ground-b',
          sideA: { x: 20, z: 0 },
          sideB: { x: 21, z: 0 },
        },
        {
          baseY: 0,
          doorId: 'near-door',
          levelId: 'ground-a',
          sideA: { x: 3, z: 0 },
          sideB: { x: 2, z: 0 },
        },
      ],
      robot: { x: 0, y: 0, z: 0 },
    }),
    setupStart: () => {
      mutationCount += 1
      return true
    },
    startMove: () => {
      mutationCount += 1
      return true
    },
  }
  const previousWindow = globalThis.window
  globalThis.window = { __LANDRUSH_ISLAND_NAV_TEST__: navigation }
  const page = { evaluate: async (callback, argument) => callback(argument) }
  try {
    const candidates = await discoverLandrushExteriorEntryCandidates(page)
    assert.equal(mutationCount, 0)
    assert.deepEqual(
      candidates.map(({ doorId, inside, outside }) => ({ doorId, inside, outside })),
      [
        {
          doorId: 'near-door',
          inside: { x: 3, y: 0, z: 0 },
          outside: { x: 2, y: 0, z: 0 },
        },
        {
          doorId: 'far-door',
          inside: { x: 21, y: 0, z: 0 },
          outside: { x: 20, y: 0, z: 0 },
        },
      ],
    )
  } finally {
    globalThis.window = previousWindow
  }
})

test('measured staging admits a 0.36m stop without a long fixture approach and rejects false crossings', async () => {
  const setupRequests = []
  const moveRequests = []
  let frameIdx = 0
  let measurementStarted = false
  let movementCase = 'prepare'
  let movement = []
  let observedAtMs = 0
  let robot = { x: -40, y: 0, z: 2 }
  let stageBeaconCalls = 0
  let stagedObservationCount = 0
  const floorVisibility = {
    buildingScopeId: null,
    insideBuilding: false,
    levelId: null,
    regionSource: null,
    visibleLevelIds: ['ground-a', 'upper-a', 'roof-a'],
  }
  const setFloor = (inside, buildingScopeId = null) => {
    floorVisibility.buildingScopeId = buildingScopeId
    floorVisibility.insideBuilding = inside
    floorVisibility.levelId = inside ? 'ground-a' : null
    floorVisibility.regionSource = inside ? 'closed-walls' : null
  }
  const navigation = {
    getState: () => {
      if (movementCase === 'stale-floor-after-stage' && stageBeaconCalls > 0) {
        stagedObservationCount += 1
        if (stagedObservationCount >= 2) setFloor(false)
      }
      const next = movement.shift()
      if (next) {
        robot = { x: next.x, y: 0, z: next.z }
        setFloor(next.inside, next.inside ? 'parcel:house-a' : null)
      }
      return {
        doorPortals: [
          {
            baseY: 0,
            doorId: 'door-a',
            levelId: 'ground-a',
            sideA: { x: 60, z: 0 },
            sideB: { x: 61, z: 0 },
          },
        ],
        robot,
      }
    },
    setupStart: (request) => {
      setupRequests.push(request)
      movement = []
      robot = { x: request.start.x, y: request.start.y ?? 0, z: request.start.z }
      if (movementCase !== 'prepare') {
        assert.equal(measurementStarted, true)
        stageBeaconCalls = 0
        stagedObservationCount = 0
        robot.x -= 0.36
        if (movementCase === 'stale-floor-after-stage') {
          setFloor(true, 'parcel:stale-house')
        } else if (movementCase === 'wrong-side' && request.label.includes('-stage-near-')) {
          setFloor(true, 'parcel:unrelated-house')
        } else {
          setFloor(false)
        }
      }
      return true
    },
    startMove: (request) => {
      moveRequests.push(request)
      assert.notEqual(movementCase, 'prepare')
      assert.equal(measurementStarted, true)
      robot = { x: request.start.x, y: request.start.y ?? 0, z: request.start.z }
      setFloor(false)
      const deltaX = request.target.x - request.start.x
      const deltaZ = request.target.z - request.start.z
      const fractions = movementCase === 'teleport-cross' ? [1] : [0.25, 0.55, 0.85, 1]
      movement = fractions.map((fraction) => ({
        inside: fraction === 1,
        x: request.start.x + deltaX * fraction,
        z: request.start.z + deltaZ * fraction,
      }))
      return true
    },
  }
  const previousDocument = globalThis.document
  const previousWindow = globalThis.window
  globalThis.document = {
    querySelector: (selector) => {
      if (selector === 'main[data-landrush-loading-handed-off]') {
        return { dataset: {}, getAttribute: () => 'true' }
      }
      if (selector === '[role="progressbar"]') {
        return {
          getAttribute: (name) => (name === 'aria-hidden' ? 'true' : null),
          hasAttribute: (name) => name === 'hidden',
          querySelector: () => null,
        }
      }
      return null
    },
  }
  globalThis.window = {
    __LANDRUSH_BENCHMARK_FIXTURE__: {
      player: { heading: 0, position: [-40, 0, 2] },
    },
    __LANDRUSH_ISLAND_NAV_TEST__: navigation,
    __LANDRUSH_ISLAND_RUNTIME_PROBE__: { floorVisibility },
    __PASCAL_BENCH__: {
      beacon: () => {
        if (movementCase !== 'stale-floor-after-stage') return { frameIdx: ++frameIdx }
        stageBeaconCalls += 1
        if (stageBeaconCalls === 1) frameIdx += 1
        if (stageBeaconCalls >= 3) frameIdx += 1
        return { frameIdx }
      },
    },
  }
  const page = {
    evaluate: async (callback, argument) => {
      const value = callback(argument)
      if (Object.hasOwn(value ?? {}, 'observedAtMs')) {
        observedAtMs += 100
        value.observedAtMs = observedAtMs
      }
      return value
    },
  }
  try {
    await enterHouseScenario.prepare({
      bridge: { setCameraPose: async () => {} },
      page,
      sleep: async () => {},
    })
    assert.deepEqual(
      setupRequests.map(({ label, start }) => ({ label, start })),
      [{ label: 'benchmark-fixture', start: { x: -40, y: 0, z: 2 } }],
    )
    assert.deepEqual(moveRequests, [])
    assert.deepEqual(robot, { x: -40, y: 0, z: 2 })
    assert.equal(floorVisibility.insideBuilding, false)

    const executeMovementCase = async (nextMovementCase) => {
      movementCase = nextMovementCase
      measurementStarted = false
      movement = []
      moveRequests.length = 0
      setupRequests.length = 0
      robot = { x: -40, y: 0, z: 2 }
      setFloor(false)
      const originalDateNow = Date.now
      let now = 1_000
      Date.now = () => now
      const traceEvents = []
      try {
        await enterHouseScenario.execute({
          mark: async (name) => {
            if (name === 'enter-house-start') measurementStarted = true
          },
          minutes: 0,
          page,
          sleep: async (durationMs) => {
            now += durationMs
          },
          trace: { write: (event) => traceEvents.push(event) },
        })
      } finally {
        Date.now = originalDateNow
      }
      return {
        labels: moveRequests.map(({ label }) => label),
        setupLabels: setupRequests.map(({ label }) => label),
        traceEvents,
      }
    }

    const normal = await executeMovementCase('normal')
    assert.deepEqual(normal.setupLabels, ['benchmark-enter-house-stage-near-door-a'])
    assert.deepEqual(normal.labels, ['benchmark-enter-house-near-cross-door-a'])
    assert.ok(normal.labels.every((label) => !label.includes('approach')))
    assert.ok(normal.traceEvents.some(({ name }) => name === 'entered-house'))

    const staleFloor = await executeMovementCase('stale-floor-after-stage')
    assert.deepEqual(staleFloor.setupLabels, ['benchmark-enter-house-stage-near-door-a'])
    assert.deepEqual(staleFloor.labels, ['benchmark-enter-house-near-cross-door-a'])
    assert.ok(staleFloor.traceEvents.some(({ name }) => name === 'entered-house'))
    assert.equal(
      staleFloor.traceEvents.some(
        ({ name, reason }) =>
          name === 'enter-house-orientation-rejected' && reason === 'staged-side-inside',
      ),
      false,
    )

    const wrongSide = await executeMovementCase('wrong-side')
    assert.deepEqual(wrongSide.setupLabels, [
      'benchmark-enter-house-stage-near-door-a',
      'benchmark-enter-house-stage-far-door-a',
    ])
    assert.deepEqual(wrongSide.labels, ['benchmark-enter-house-far-cross-door-a'])
    assert.ok(
      wrongSide.traceEvents.some(
        ({ name, orientation, reason }) =>
          name === 'enter-house-orientation-rejected' &&
          orientation === 'near' &&
          reason === 'staged-side-inside',
      ),
    )
    const enteredEvent = wrongSide.traceEvents.find(({ name }) => name === 'entered-house')
    assert.equal(enteredEvent?.doorId, 'door-a')
    assert.equal(enteredEvent?.floor?.buildingScopeId, 'parcel:house-a')

    await assert.rejects(
      executeMovementCase('teleport-cross'),
      /player never entered the captured house/,
    )
  } finally {
    globalThis.document = previousDocument
    globalThis.window = previousWindow
  }
})

test('candidate construction rejects upper-floor and malformed portals', () => {
  assert.deepEqual(
    createLandrushExteriorEntryCandidates({
      portals: [
        {
          baseY: 3,
          doorId: 'upper-door',
          levelId: 'upper',
          sideA: { x: 0, z: 0 },
          sideB: { x: 1, z: 0 },
        },
        {
          baseY: 0,
          doorId: 'broken-door',
          levelId: 'ground',
          sideA: { x: Number.NaN, z: 0 },
          sideB: { x: 1, z: 0 },
        },
      ],
      start: { x: 0, y: 0, z: 0 },
    }),
    [],
  )
})
