import type { LandrushPoint2 } from '@/components/landrush/types'
import {
  advanceLandrushIslandAmbientWalkablePathSearch,
  createLandrushIslandAmbientWalkablePathSearch,
  findLandrushIslandAmbientWalkablePath,
  isLandrushIslandAmbientPointWalkable,
  isLandrushIslandAmbientSegmentPassable,
  type LandrushIslandAmbientDestinationPreference,
  type LandrushIslandAmbientNavigationWorld,
  type LandrushIslandAmbientWalkablePathSearch,
  resolveLandrushIslandAmbientDestination,
} from './landrush-island-ambient-navigation'

const NPC_COLLISION_DISTANCE_METERS = 0.72
const NPC_COLLISION_DISTANCE_SQUARED = NPC_COLLISION_DISTANCE_METERS * NPC_COLLISION_DISTANCE_METERS
const NPC_MAX_FRAME_DELTA_SECONDS = 0.1
const NPC_SPAWN_CLEARANCE_METERS = 0.9
const NPC_WAYPOINT_RADIUS_METERS = 0.000_01
const NPC_JOURNEY_ATTEMPT_COUNT = 12
const NPC_JOURNEY_PLANNER_JOB_SLICE_OPERATIONS = 16

export const LANDRUSH_ISLAND_AMBIENT_NPC_PLANNING_OPERATIONS_PER_FRAME = 128

export type LandrushIslandAmbientNpcMotionPhase = 'idle' | 'run' | 'walk'

export type LandrushIslandAmbientNpcMotionState = {
  destinationPreference: LandrushIslandAmbientDestinationPreference
  destinationSequence: number
  idleSeconds: number
  path: readonly LandrushPoint2[]
  pathIndex: number
  phase: LandrushIslandAmbientNpcMotionPhase
  position: LandrushPoint2
  seed: string
  speedMetersPerSecond: number
  target: LandrushPoint2 | null
  yaw: number
}

export type LandrushIslandAmbientNpcNeighbor = {
  id: string
  position: LandrushPoint2
}

export type LandrushIslandAmbientNpcNeighborQuery = {
  positionHasClearance: (point: LandrushPoint2) => boolean
}

export type LandrushIslandAmbientNpcNeighborIndex = {
  createQuery: (ownId: string) => LandrushIslandAmbientNpcNeighborQuery
  delete: (id: string) => void
  set: (id: string, position: LandrushPoint2) => void
}

type LandrushIslandAmbientNpcNeighborSource =
  | readonly LandrushIslandAmbientNpcNeighbor[]
  | LandrushIslandAmbientNpcNeighborQuery

type MutableLandrushPoint2 = {
  x: number
  z: number
}

type LandrushIslandAmbientNpcMotionScratch = {
  desired: MutableLandrushPoint2
  direction: MutableLandrushPoint2
  side: -1 | 1
  sideSequence: number
  sidestep: MutableLandrushPoint2
}

const EMPTY_AMBIENT_NPC_NEIGHBORS: readonly LandrushIslandAmbientNpcNeighbor[] = Object.freeze([])
const AMBIENT_NPC_MOTION_SCRATCH = new WeakMap<
  LandrushIslandAmbientNpcMotionState,
  LandrushIslandAmbientNpcMotionScratch
>()

export type LandrushIslandAmbientNpcJourneyPlannerAdvanceResult = {
  operations: number
  pendingCount: number
}

export type LandrushIslandAmbientNpcJourneyPlannerSnapshot = {
  jobs: readonly {
    operations: number
    seed: string
  }[]
  pendingCount: number
}

export type LandrushIslandAmbientNpcJourneyPlanner = {
  advance: (operationBudget: number) => LandrushIslandAmbientNpcJourneyPlannerAdvanceResult
  dispose: () => void
  getSnapshot: () => LandrushIslandAmbientNpcJourneyPlannerSnapshot
  request: (state: LandrushIslandAmbientNpcMotionState) => boolean
}

type LandrushIslandAmbientNpcJourneySearch = {
  preference: LandrushIslandAmbientDestinationPreference
  running: boolean
  search: LandrushIslandAmbientWalkablePathSearch
  sequence: number
  speedMetersPerSecond: number
  target: LandrushPoint2
}

type LandrushIslandAmbientNpcJourneyJob = {
  advanceResult: {
    done: boolean
    operations: number
  }
  attempt: number
  baseSequence: number
  operations: number
  origin: LandrushPoint2
  search: LandrushIslandAmbientNpcJourneySearch | null
  state: LandrushIslandAmbientNpcMotionState
}

export function createLandrushIslandAmbientNpcMotionState(
  index: number,
  world: LandrushIslandAmbientNavigationWorld,
): LandrushIslandAmbientNpcMotionState {
  const seed = `ambient-npc-${index}`
  const position = resolveInitialNpcPosition(index, world)
  const state: LandrushIslandAmbientNpcMotionState = {
    destinationPreference: 'grass',
    destinationSequence: 0,
    idleSeconds: 1.8 + hashUnit(`${seed}:initial-idle`) * 2.6,
    path: [],
    pathIndex: 0,
    phase: 'idle',
    position: { ...position },
    seed,
    speedMetersPerSecond: 0,
    target: null,
    yaw: hashUnit(`${seed}:initial-yaw`) * Math.PI * 2,
  }
  AMBIENT_NPC_MOTION_SCRATCH.set(state, createLandrushIslandAmbientNpcMotionScratch())
  return state
}

export function createLandrushIslandAmbientNpcNeighborIndex(
  world: LandrushIslandAmbientNavigationWorld,
  maximumNpcCount: number,
): LandrushIslandAmbientNpcNeighborIndex {
  const capacity = Math.max(1, Math.trunc(maximumNpcCount))
  const bounds = resolveLandrushIslandAmbientNpcGridBounds(world)
  const bucketHeads = new Int32Array(bounds.columnCount * bounds.rowCount)
  const entryBuckets = new Int32Array(capacity)
  const entryNext = new Int32Array(capacity)
  const entryPrevious = new Int32Array(capacity)
  const entryX = new Float64Array(capacity)
  const entryZ = new Float64Array(capacity)
  bucketHeads.fill(-1)
  entryBuckets.fill(-1)
  entryNext.fill(-1)
  entryPrevious.fill(-1)
  const slotById = new Map<string, number>()
  let registeredCount = 0

  const resolveBucket = (x: number, z: number) => {
    const column = Math.min(
      bounds.columnCount - 1,
      Math.max(0, Math.floor(x / NPC_COLLISION_DISTANCE_METERS) - bounds.minimumCellX),
    )
    const row = Math.min(
      bounds.rowCount - 1,
      Math.max(0, Math.floor(z / NPC_COLLISION_DISTANCE_METERS) - bounds.minimumCellZ),
    )
    return row * bounds.columnCount + column
  }

  const removeFromBucket = (slot: number) => {
    const bucket = entryBuckets[slot]!
    if (bucket < 0) return
    const previous = entryPrevious[slot]!
    const next = entryNext[slot]!
    if (previous >= 0) entryNext[previous] = next
    else bucketHeads[bucket] = next
    if (next >= 0) entryPrevious[next] = previous
    entryBuckets[slot] = -1
    entryNext[slot] = -1
    entryPrevious[slot] = -1
  }

  const positionHasClearance = (point: LandrushPoint2, ownId: string) => {
    const ownSlot = slotById.get(ownId) ?? -1
    const minimumColumn = Math.max(
      0,
      Math.floor((point.x - NPC_COLLISION_DISTANCE_METERS) / NPC_COLLISION_DISTANCE_METERS) -
        bounds.minimumCellX,
    )
    const maximumColumn = Math.min(
      bounds.columnCount - 1,
      Math.floor((point.x + NPC_COLLISION_DISTANCE_METERS) / NPC_COLLISION_DISTANCE_METERS) -
        bounds.minimumCellX,
    )
    const minimumRow = Math.max(
      0,
      Math.floor((point.z - NPC_COLLISION_DISTANCE_METERS) / NPC_COLLISION_DISTANCE_METERS) -
        bounds.minimumCellZ,
    )
    const maximumRow = Math.min(
      bounds.rowCount - 1,
      Math.floor((point.z + NPC_COLLISION_DISTANCE_METERS) / NPC_COLLISION_DISTANCE_METERS) -
        bounds.minimumCellZ,
    )
    for (let row = minimumRow; row <= maximumRow; row += 1) {
      for (let column = minimumColumn; column <= maximumColumn; column += 1) {
        let slot = bucketHeads[row * bounds.columnCount + column]!
        while (slot >= 0) {
          if (slot !== ownSlot) {
            const dx = point.x - entryX[slot]!
            const dz = point.z - entryZ[slot]!
            if (dx * dx + dz * dz < NPC_COLLISION_DISTANCE_SQUARED) return false
          }
          slot = entryNext[slot]!
        }
      }
    }
    return true
  }

  return {
    createQuery(ownId) {
      return {
        positionHasClearance: (point) => positionHasClearance(point, ownId),
      }
    },
    delete(id) {
      const slot = slotById.get(id)
      if (slot !== undefined) removeFromBucket(slot)
    },
    set(id, position) {
      let slot = slotById.get(id)
      if (slot === undefined) {
        if (registeredCount >= capacity) {
          throw new Error(`Ambient NPC neighbor index capacity ${capacity} exceeded.`)
        }
        slot = registeredCount
        registeredCount += 1
        slotById.set(id, slot)
      }
      const bucket = resolveBucket(position.x, position.z)
      entryX[slot] = position.x
      entryZ[slot] = position.z
      if (entryBuckets[slot] === bucket) return
      removeFromBucket(slot)
      const previousHead = bucketHeads[bucket]!
      entryBuckets[slot] = bucket
      entryNext[slot] = previousHead
      entryPrevious[slot] = -1
      if (previousHead >= 0) entryPrevious[previousHead] = slot
      bucketHeads[bucket] = slot
    },
  }
}

export function createLandrushIslandAmbientNpcJourneyPlanner(
  world: LandrushIslandAmbientNavigationWorld,
): LandrushIslandAmbientNpcJourneyPlanner {
  const jobs: LandrushIslandAmbientNpcJourneyJob[] = []
  const jobByState = new Map<
    LandrushIslandAmbientNpcMotionState,
    LandrushIslandAmbientNpcJourneyJob
  >()
  let cursor = 0
  let disposed = false
  const advanceResult: LandrushIslandAmbientNpcJourneyPlannerAdvanceResult = {
    operations: 0,
    pendingCount: 0,
  }

  const removeJob = (job: LandrushIslandAmbientNpcJourneyJob) => {
    const index = jobs.indexOf(job)
    if (index < 0) return
    jobs.splice(index, 1)
    jobByState.delete(job.state)
    if (jobs.length === 0) cursor = 0
    else if (index < cursor || cursor >= jobs.length) cursor = Math.max(0, cursor - 1) % jobs.length
  }

  return {
    advance(operationBudget) {
      const budget = Math.max(0, Math.trunc(operationBudget))
      let operations = 0
      let consecutiveZeroWorkJobs = 0
      while (!disposed && jobs.length > 0 && operations < budget) {
        if (cursor >= jobs.length) cursor = 0
        const job = jobs[cursor]
        if (!job) break
        const result = advanceLandrushIslandAmbientNpcJourneyJob(
          job,
          world,
          Math.min(NPC_JOURNEY_PLANNER_JOB_SLICE_OPERATIONS, Math.max(1, budget - operations)),
        )
        operations += result.operations
        job.operations += result.operations
        if (result.done) {
          removeJob(job)
          consecutiveZeroWorkJobs = 0
          continue
        }
        cursor = (cursor + 1) % jobs.length
        consecutiveZeroWorkJobs = result.operations === 0 ? consecutiveZeroWorkJobs + 1 : 0
        if (consecutiveZeroWorkJobs >= jobs.length) break
      }
      advanceResult.operations = operations
      advanceResult.pendingCount = jobs.length
      return advanceResult
    },
    dispose() {
      disposed = true
      jobs.length = 0
      jobByState.clear()
      cursor = 0
    },
    getSnapshot() {
      return {
        jobs: jobs.map((job) => ({ operations: job.operations, seed: job.state.seed })),
        pendingCount: jobs.length,
      }
    },
    request(state) {
      if (disposed || state.phase !== 'idle' || state.idleSeconds > NPC_WAYPOINT_RADIUS_METERS) {
        return false
      }
      if (jobByState.has(state)) return true
      const job: LandrushIslandAmbientNpcJourneyJob = {
        advanceResult: { done: false, operations: 0 },
        attempt: 0,
        baseSequence: state.destinationSequence,
        operations: 0,
        origin: { ...state.position },
        search: null,
        state,
      }
      jobs.push(job)
      jobByState.set(state, job)
      return true
    },
  }
}

export function reconcileLandrushIslandAmbientNpcMotionStateForWorld(
  state: LandrushIslandAmbientNpcMotionState,
  index: number,
  world: LandrushIslandAmbientNavigationWorld,
) {
  if (!isLandrushIslandAmbientPointWalkable(world, state.position)) {
    return createLandrushIslandAmbientNpcMotionState(index, world)
  }
  state.idleSeconds = 0
  state.path = []
  state.pathIndex = 0
  state.phase = 'idle'
  state.speedMetersPerSecond = 0
  state.target = null
  return state
}

function resolveInitialNpcPosition(
  requestedIndex: number,
  world: LandrushIslandAmbientNavigationWorld,
) {
  const accepted: LandrushPoint2[] = []
  for (let index = 0; index <= requestedIndex; index += 1) {
    const seed = `ambient-npc-${index}`
    let selected: LandrushPoint2 | null = null
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const candidate = resolveLandrushIslandAmbientDestination(world, seed, attempt, 'grass')
      if (
        candidate &&
        accepted.every(
          (position) =>
            Math.hypot(candidate.x - position.x, candidate.z - position.z) >=
            NPC_SPAWN_CLEARANCE_METERS,
        )
      ) {
        selected = candidate
        break
      }
    }
    selected ??= world.surfacePoints.find((point) =>
      isLandrushIslandAmbientSegmentPassable(world, point, point),
    ) ?? { x: 0, z: 0 }
    accepted.push(selected)
  }
  return accepted[requestedIndex] ?? { x: 0, z: 0 }
}

export function advanceLandrushIslandAmbientNpcMotion(
  state: LandrushIslandAmbientNpcMotionState,
  deltaSeconds: number,
  world: LandrushIslandAmbientNavigationWorld,
  neighbors: LandrushIslandAmbientNpcNeighborSource = EMPTY_AMBIENT_NPC_NEIGHBORS,
  journeyPlanner?: LandrushIslandAmbientNpcJourneyPlanner,
) {
  let remainingSeconds = Math.min(NPC_MAX_FRAME_DELTA_SECONDS, Math.max(0, deltaSeconds))
  let iterations = 0
  while (remainingSeconds > 0.000_001 && iterations < 16) {
    iterations += 1
    if (state.phase === 'idle') {
      const consumed = Math.min(state.idleSeconds, remainingSeconds)
      state.idleSeconds -= consumed
      remainingSeconds -= consumed
      if (state.idleSeconds <= 0.000_001) {
        if (journeyPlanner) {
          if (!journeyPlanner.request(state)) state.idleSeconds = 0.8
          remainingSeconds = 0
        } else if (!beginNextJourney(state, world)) {
          state.idleSeconds = 0.8
        }
      }
      continue
    }

    const waypoint = state.path[state.pathIndex]
    if (!waypoint) {
      enterDestinationIdle(state)
      continue
    }
    const dx = waypoint.x - state.position.x
    const dz = waypoint.z - state.position.z
    const distance = Math.hypot(dx, dz)
    if (distance <= NPC_WAYPOINT_RADIUS_METERS) {
      setLandrushIslandAmbientNpcPoint(state.position, waypoint.x, waypoint.z)
      state.pathIndex += 1
      continue
    }

    const scratch = resolveLandrushIslandAmbientNpcMotionScratch(state)
    scratch.direction.x = dx / distance
    scratch.direction.z = dz / distance
    const travelDistance = Math.min(distance, state.speedMetersPerSecond * remainingSeconds)
    scratch.desired.x = state.position.x + scratch.direction.x * travelDistance
    scratch.desired.z = state.position.z + scratch.direction.z * travelDistance
    const resolved = resolveNpcCollisionStep(state, scratch, world, neighbors)
    if (!resolved) {
      state.phase = 'idle'
      state.idleSeconds =
        0.55 + hashUnit(`${state.seed}:${state.destinationSequence}:blocked`) * 0.5
      state.path = []
      state.pathIndex = 0
      state.target = null
      continue
    }

    const movedX = resolved.x - state.position.x
    const movedZ = resolved.z - state.position.z
    const movedDistance = Math.hypot(movedX, movedZ)
    setLandrushIslandAmbientNpcPoint(state.position, resolved.x, resolved.z)
    if (movedDistance > 0.000_001) state.yaw = Math.atan2(movedX, movedZ)
    remainingSeconds -= movedDistance / state.speedMetersPerSecond
    if (travelDistance >= distance - 0.000_001) state.pathIndex += 1
  }
  return state
}

function beginNextJourney(
  state: LandrushIslandAmbientNpcMotionState,
  world: LandrushIslandAmbientNavigationWorld,
) {
  for (let attempt = 0; attempt < NPC_JOURNEY_ATTEMPT_COUNT; attempt += 1) {
    const sequence = state.destinationSequence + 1 + attempt
    const preference: LandrushIslandAmbientDestinationPreference =
      sequence % 3 === 0 ? 'mixed' : 'grass'
    const target = resolveLandrushIslandAmbientDestination(world, state.seed, sequence, preference)
    if (!target || Math.hypot(target.x - state.position.x, target.z - state.position.z) < 2.5) {
      continue
    }
    const path = findLandrushIslandAmbientWalkablePath(world, state.position, target)
    if (path.length < 2) continue

    applyLandrushIslandAmbientNpcJourney(state, {
      path,
      preference,
      running: hashUnit(`${state.seed}:${sequence}:run`) < 0.18,
      sequence,
      speedMetersPerSecond: resolveLandrushIslandAmbientNpcJourneySpeed(state.seed, sequence),
      target,
    })
    return true
  }
  return false
}

function advanceLandrushIslandAmbientNpcJourneyJob(
  job: LandrushIslandAmbientNpcJourneyJob,
  world: LandrushIslandAmbientNavigationWorld,
  operationBudget: number,
): { done: boolean; operations: number } {
  let operations = 0
  while (operations < operationBudget) {
    if (!isLandrushIslandAmbientNpcJourneyJobCurrent(job)) {
      return updateLandrushIslandAmbientNpcJourneyJobAdvanceResult(job, true, operations)
    }
    if (!job.search) {
      if (job.attempt >= NPC_JOURNEY_ATTEMPT_COUNT) {
        job.state.idleSeconds = 0.8
        return updateLandrushIslandAmbientNpcJourneyJobAdvanceResult(job, true, operations)
      }
      const sequence = job.baseSequence + 1 + job.attempt
      job.attempt += 1
      operations += 1
      const preference: LandrushIslandAmbientDestinationPreference =
        sequence % 3 === 0 ? 'mixed' : 'grass'
      const target = resolveLandrushIslandAmbientDestination(
        world,
        job.state.seed,
        sequence,
        preference,
      )
      if (!target || Math.hypot(target.x - job.origin.x, target.z - job.origin.z) < 2.5) {
        continue
      }
      const running = hashUnit(`${job.state.seed}:${sequence}:run`) < 0.18
      job.search = {
        preference,
        running,
        search: createLandrushIslandAmbientWalkablePathSearch(world, job.origin, target),
        sequence,
        speedMetersPerSecond: resolveLandrushIslandAmbientNpcJourneySpeed(
          job.state.seed,
          sequence,
          running,
        ),
        target,
      }
      if (operations >= operationBudget) {
        return updateLandrushIslandAmbientNpcJourneyJobAdvanceResult(job, false, operations)
      }
    }

    const search = job.search
    const result = advanceLandrushIslandAmbientWalkablePathSearch(
      search.search,
      Math.max(1, operationBudget - operations),
    )
    operations += result.operations
    if (!result.done) {
      return updateLandrushIslandAmbientNpcJourneyJobAdvanceResult(job, false, operations)
    }
    if (result.path.length >= 2) {
      if (isLandrushIslandAmbientNpcJourneyJobCurrent(job)) {
        applyLandrushIslandAmbientNpcJourney(job.state, {
          path: result.path,
          preference: search.preference,
          running: search.running,
          sequence: search.sequence,
          speedMetersPerSecond: search.speedMetersPerSecond,
          target: search.target,
        })
      }
      return updateLandrushIslandAmbientNpcJourneyJobAdvanceResult(job, true, operations)
    }
    job.search = null
  }
  return updateLandrushIslandAmbientNpcJourneyJobAdvanceResult(job, false, operations)
}

function updateLandrushIslandAmbientNpcJourneyJobAdvanceResult(
  job: LandrushIslandAmbientNpcJourneyJob,
  done: boolean,
  operations: number,
) {
  job.advanceResult.done = done
  job.advanceResult.operations = operations
  return job.advanceResult
}

function isLandrushIslandAmbientNpcJourneyJobCurrent(job: LandrushIslandAmbientNpcJourneyJob) {
  return (
    job.state.phase === 'idle' &&
    job.state.destinationSequence === job.baseSequence &&
    Math.abs(job.state.position.x - job.origin.x) <= NPC_WAYPOINT_RADIUS_METERS &&
    Math.abs(job.state.position.z - job.origin.z) <= NPC_WAYPOINT_RADIUS_METERS
  )
}

function applyLandrushIslandAmbientNpcJourney(
  state: LandrushIslandAmbientNpcMotionState,
  journey: {
    path: readonly LandrushPoint2[]
    preference: LandrushIslandAmbientDestinationPreference
    running: boolean
    sequence: number
    speedMetersPerSecond: number
    target: LandrushPoint2
  },
) {
  state.destinationPreference = journey.preference
  state.destinationSequence = journey.sequence
  state.path = journey.path.slice(1)
  state.pathIndex = 0
  state.phase = journey.running ? 'run' : 'walk'
  state.speedMetersPerSecond = journey.speedMetersPerSecond
  state.target = journey.target
}

function resolveLandrushIslandAmbientNpcJourneySpeed(
  seed: string,
  sequence: number,
  running = hashUnit(`${seed}:${sequence}:run`) < 0.18,
) {
  return running
    ? 2.35 + hashUnit(`${seed}:${sequence}:speed`) * 0.65
    : 1.05 + hashUnit(`${seed}:${sequence}:speed`) * 0.55
}

function enterDestinationIdle(state: LandrushIslandAmbientNpcMotionState) {
  state.phase = 'idle'
  state.idleSeconds =
    2.1 + hashUnit(`${state.seed}:${state.destinationSequence}:arrival-idle`) * 3.4
  state.path = []
  state.pathIndex = 0
  state.speedMetersPerSecond = 0
  state.target = null
}

function resolveNpcCollisionStep(
  state: LandrushIslandAmbientNpcMotionState,
  scratch: LandrushIslandAmbientNpcMotionScratch,
  world: LandrushIslandAmbientNavigationWorld,
  neighbors: LandrushIslandAmbientNpcNeighborSource,
) {
  const { desired, direction, sidestep } = scratch
  if (
    isLandrushIslandAmbientSegmentPassable(world, state.position, desired) &&
    npcPositionHasClearance(desired, state.seed, neighbors)
  ) {
    return desired
  }

  if (scratch.sideSequence !== state.destinationSequence) {
    scratch.side = hashUnit(`${state.seed}:${state.destinationSequence}:side`) < 0.5 ? -1 : 1
    scratch.sideSequence = state.destinationSequence
  }
  const travelDistance = Math.hypot(desired.x - state.position.x, desired.z - state.position.z)
  sidestep.x =
    state.position.x +
    direction.x * travelDistance * 0.55 -
    direction.z * travelDistance * scratch.side
  sidestep.z =
    state.position.z +
    direction.z * travelDistance * 0.55 +
    direction.x * travelDistance * scratch.side
  if (
    isLandrushIslandAmbientSegmentPassable(world, state.position, sidestep) &&
    npcPositionHasClearance(sidestep, state.seed, neighbors)
  ) {
    return sidestep
  }
  return null
}

function npcPositionHasClearance(
  point: LandrushPoint2,
  ownId: string,
  neighbors: LandrushIslandAmbientNpcNeighborSource,
) {
  if (isLandrushIslandAmbientNpcNeighborQuery(neighbors)) {
    return neighbors.positionHasClearance(point)
  }
  for (const neighbor of neighbors) {
    if (neighbor.id === ownId) continue
    const dx = point.x - neighbor.position.x
    const dz = point.z - neighbor.position.z
    if (dx * dx + dz * dz < NPC_COLLISION_DISTANCE_SQUARED) return false
  }
  return true
}

function isLandrushIslandAmbientNpcNeighborQuery(
  source: LandrushIslandAmbientNpcNeighborSource,
): source is LandrushIslandAmbientNpcNeighborQuery {
  return !Array.isArray(source)
}

function setLandrushIslandAmbientNpcPoint(point: LandrushPoint2, x: number, z: number) {
  const mutablePoint = point as MutableLandrushPoint2
  mutablePoint.x = x
  mutablePoint.z = z
}

function createLandrushIslandAmbientNpcMotionScratch(): LandrushIslandAmbientNpcMotionScratch {
  return {
    desired: { x: 0, z: 0 },
    direction: { x: 0, z: 0 },
    side: 1,
    sideSequence: -1,
    sidestep: { x: 0, z: 0 },
  }
}

function resolveLandrushIslandAmbientNpcMotionScratch(state: LandrushIslandAmbientNpcMotionState) {
  let scratch = AMBIENT_NPC_MOTION_SCRATCH.get(state)
  if (!scratch) {
    scratch = createLandrushIslandAmbientNpcMotionScratch()
    AMBIENT_NPC_MOTION_SCRATCH.set(state, scratch)
  }
  return scratch
}

function resolveLandrushIslandAmbientNpcGridBounds(world: LandrushIslandAmbientNavigationWorld) {
  let minimumX = Number.POSITIVE_INFINITY
  let minimumZ = Number.POSITIVE_INFINITY
  let maximumX = Number.NEGATIVE_INFINITY
  let maximumZ = Number.NEGATIVE_INFINITY
  for (const point of world.surfacePoints) {
    minimumX = Math.min(minimumX, point.x)
    minimumZ = Math.min(minimumZ, point.z)
    maximumX = Math.max(maximumX, point.x)
    maximumZ = Math.max(maximumZ, point.z)
  }
  if (!Number.isFinite(minimumX)) {
    minimumX = -NPC_COLLISION_DISTANCE_METERS
    minimumZ = -NPC_COLLISION_DISTANCE_METERS
    maximumX = NPC_COLLISION_DISTANCE_METERS
    maximumZ = NPC_COLLISION_DISTANCE_METERS
  }
  const minimumCellX = Math.floor(minimumX / NPC_COLLISION_DISTANCE_METERS) - 1
  const minimumCellZ = Math.floor(minimumZ / NPC_COLLISION_DISTANCE_METERS) - 1
  const maximumCellX = Math.floor(maximumX / NPC_COLLISION_DISTANCE_METERS) + 1
  const maximumCellZ = Math.floor(maximumZ / NPC_COLLISION_DISTANCE_METERS) + 1
  return {
    columnCount: maximumCellX - minimumCellX + 1,
    minimumCellX,
    minimumCellZ,
    rowCount: maximumCellZ - minimumCellZ + 1,
  }
}

function hashUnit(value: string) {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0) / 4_294_967_296
}
