import {
  MAX_MULTIPLAYER_COMBAT_SHOTS,
  type MultiplayerPlayerCombatSnapshot,
  type MultiplayerPlayerShotSnapshot,
} from '@landrush/protocol'
import {
  getZombieEscapeMeleeProgress,
  ZOMBIE_ESCAPE_SHOT_IMPACT_KIND,
  ZOMBIE_ESCAPE_SHOT_PHASE,
  type ZombieEscapeSimulation,
} from '@landrush/zombie-gameplay/zombie-escape-simulation'

export type LandrushZombieEscapeCombatSnapshotReader = () =>
  | MultiplayerPlayerCombatSnapshot
  | undefined

export function createLandrushZombieEscapeCombatSnapshot(
  simulation: ZombieEscapeSimulation,
  origin: Readonly<{ x: number; y: number; z: number }>,
  includeShots = true,
): MultiplayerPlayerCombatSnapshot {
  const shots: MultiplayerPlayerShotSnapshot[] = []
  const pool = simulation.shots
  for (
    let slot = 0;
    includeShots && slot < pool.pool.capacity && shots.length < MAX_MULTIPLAYER_COMBAT_SHOTS;
    slot += 1
  ) {
    if (!pool.pool.active[slot]) continue
    const phase = pool.phase[slot]
    if (
      phase !== ZOMBIE_ESCAPE_SHOT_PHASE.travel &&
      !(
        phase === ZOMBIE_ESCAPE_SHOT_PHASE.impact &&
        pool.impactKind[slot] !== ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.expired
      )
    ) {
      continue
    }
    shots.push({
      id: pool.volleySequence[slot]! * 8 + pool.volleyOrdinal[slot]!,
      impactAge: phase === ZOMBIE_ESCAPE_SHOT_PHASE.impact ? pool.impactAge[slot]! : null,
      position: [pool.x[slot]! + origin.x, pool.y[slot]! + origin.y, pool.z[slot]! + origin.z],
      previousPosition: [
        pool.previousX[slot]! + origin.x,
        pool.previousY[slot]! + origin.y,
        pool.previousZ[slot]! + origin.z,
      ],
      weaponIndex: pool.weaponIndex[slot]!,
    })
  }
  return {
    aimAngle: simulation.player.aimAngle,
    ammo: simulation.player.ammo,
    meleePhase: simulation.player.meleePhase,
    meleeProgress: getZombieEscapeMeleeProgress(simulation.player),
    shotSequence: simulation.nextShotVolleySequence,
    shots,
    weaponIndex: simulation.player.weaponIndex,
  }
}
