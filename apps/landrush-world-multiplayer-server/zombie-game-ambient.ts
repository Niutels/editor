import type { LandrushIslandAmbientNavigationWorld } from '@landrush/runtime/landrush-island-ambient-navigation'
import {
  advanceLandrushIslandAmbientNpcMotion,
  createLandrushIslandAmbientNpcJourneyPlanner,
  createLandrushIslandAmbientNpcMotionState,
  createLandrushIslandAmbientNpcNeighborIndex,
  LANDRUSH_ISLAND_AMBIENT_NPC_PLANNING_OPERATIONS_PER_FRAME,
  reconcileLandrushIslandAmbientNpcMotionStateForWorld,
} from '@landrush/runtime/landrush-island-ambient-npc-motion'
import {
  ZOMBIE_ESCAPE_AMBIENT_HANDOFF_LOCOMOTION,
  type ZombieEscapeAmbientHandoffSource,
} from '@landrush/zombie-gameplay/zombie-escape-ambient-handoff'
import {
  createZombieEscapeZombieRoster,
  ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS,
} from '@landrush/zombie-gameplay/zombie-escape-zombie-roster'

export function createZombieGameAmbient(
  initialWorld: LandrushIslandAmbientNavigationWorld,
  origin: Readonly<{ x: number; y: number; z: number }>,
  seed: number,
  clipDurations: readonly Readonly<{ idle: number; walk: number; run: number }>[],
) {
  let world = initialWorld
  let planner = createLandrushIslandAmbientNpcJourneyPlanner(world)
  const ids = ZOMBIE_ESCAPE_AMBIENT_NPC_SOURCE_IDS
  if (
    clipDurations.length !== ids.length ||
    clipDurations.some((durations) =>
      Object.values(durations).some((duration) => !Number.isFinite(duration) || duration <= 0),
    )
  )
    throw new Error('Invalid canonical NPC animation durations')
  const states = ids.map((_, index) => createLandrushIslandAmbientNpcMotionState(index, world))
  let neighbors = createLandrushIslandAmbientNpcNeighborIndex(world, states.length)
  let queries = ids.map((id) => neighbors.createQuery(id))
  const phaseSeconds = new Float32Array(states.length)
  const snapshots = states.map((state, index) => ({
    index,
    x: state.position.x,
    y: 0,
    z: state.position.z,
    yaw: state.yaw,
    phase: state.phase,
    locomotionPhase: 0,
  }))
  const handoff: ZombieEscapeAmbientHandoffSource = {
    sourceNpcIds: ids,
    valid: new Uint8Array(ids.length).fill(1),
    variant: createZombieEscapeZombieRoster(seed).variantByPoolSlot.slice(0, ids.length),
    x: new Float32Array(ids.length),
    y: new Float32Array(ids.length),
    z: new Float32Array(ids.length),
    yaw: new Float32Array(ids.length),
    locomotionMode: new Uint8Array(ids.length),
    locomotionPhase: new Float32Array(ids.length),
  }
  function refresh() {
    for (let index = 0; index < states.length; index++) {
      const state = states[index]!
      const snapshot = snapshots[index]!
      snapshot.x = state.position.x
      snapshot.z = state.position.z
      snapshot.yaw = state.yaw
      snapshot.phase = state.phase
      snapshot.locomotionPhase =
        ((phaseSeconds[index]! / clipDurations[index]![state.phase]) % 1) * Math.PI * 2
      neighbors.set(ids[index]!, state.position)
      handoff.x[index] = snapshot.x - origin.x
      handoff.y[index] = snapshot.y
      handoff.z[index] = snapshot.z - origin.z
      handoff.yaw[index] = snapshot.yaw
      handoff.locomotionMode[index] = ZOMBIE_ESCAPE_AMBIENT_HANDOFF_LOCOMOTION[state.phase]
      handoff.locomotionPhase[index] = snapshot.locomotionPhase
    }
  }
  refresh()
  return {
    handoff,
    snapshots,
    step(deltaSeconds: number) {
      const delta = Math.min(0.1, Math.max(0, deltaSeconds))
      const result = planner.advance(LANDRUSH_ISLAND_AMBIENT_NPC_PLANNING_OPERATIONS_PER_FRAME)
      for (let index = 0; index < states.length; index++) {
        const state = states[index]!
        const previousPhase = state.phase
        advanceLandrushIslandAmbientNpcMotion(state, delta, world, queries[index], planner)
        phaseSeconds[index] = previousPhase === state.phase ? phaseSeconds[index]! + delta : 0
        neighbors.set(ids[index]!, state.position)
      }
      refresh()
      return result.operations
    },
    setWorld(nextWorld: LandrushIslandAmbientNavigationWorld) {
      planner.dispose()
      world = nextWorld
      planner = createLandrushIslandAmbientNpcJourneyPlanner(world)
      neighbors = createLandrushIslandAmbientNpcNeighborIndex(world, states.length)
      queries = ids.map((id) => neighbors.createQuery(id))
      for (let index = 0; index < states.length; index++) {
        states[index] = reconcileLandrushIslandAmbientNpcMotionStateForWorld(
          states[index]!,
          index,
          world,
        )
      }
      refresh()
    },
    dispose() {
      planner.dispose()
    },
  }
}
