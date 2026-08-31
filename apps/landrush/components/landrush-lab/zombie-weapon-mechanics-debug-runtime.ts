import { ZOMBIE_ESCAPE_SIMULATION, ZOMBIE_ESCAPE_WEAPON_PROFILES } from './zombie-escape-config'
import { createZombieEscapeControlState } from './zombie-escape-controls'
import {
  createZombieEscapeSimulation,
  setZombieEscapeExternalPlayerPose,
  setZombieEscapeGamePhase,
  setZombieEscapePlayerMuzzlePose,
  spawnZombieEscapeZombie,
  stepZombieEscapeSimulationPhysics,
  ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND,
  type ZombieEscapeSimulation,
} from './zombie-escape-simulation'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'
import { createZombieEscapeArena, type ZombieEscapeArenaData } from './zombie-escape-world'
import {
  createZombieWeaponMechanicsHealthSnapshot,
  type ZombieWeaponMechanicsScenario,
} from './zombie-weapon-mechanics-debug-state'

const SCENARIO_SEED = 0x77ea_2026
const FIRE_AT_SECONDS = 0.35
const TARGET_INITIAL_HEALTH = 500

export type ZombieWeaponMechanicsScenarioReport = Readonly<{
  contactCount: number
  damage: number
  damagedTargetCount: number
  effectContacts: Readonly<Record<string, number>>
  formation: string
  id: ZombieWeaponMechanicsScenario['id']
  label: string
  mechanic: string
  projectileCount: number
  remainingHealth: readonly number[]
  shotsFired: number
  timeSeconds: number
  volleySize: number
}>

export type ZombieWeaponMechanicsScenarioRuntime = {
  arena: ZombieEscapeArenaData
  fired: boolean
  initialHealth: readonly number[]
  initialPlayerAmmo: number
  maximumVolleySize: number
  observedCarrierKeys: Set<string>
  observedEffectContacts: Record<string, number>
  observedImpactKeys: Set<string>
  scenario: ZombieWeaponMechanicsScenario
  simulation: ZombieEscapeSimulation
  targetSlots: readonly number[]
  weaponIndex: number
}

export function createZombieWeaponMechanicsScenarioRuntime(
  scenario: ZombieWeaponMechanicsScenario,
): ZombieWeaponMechanicsScenarioRuntime {
  const weaponIndex = ZOMBIE_ESCAPE_WEAPON_CATALOG.findIndex((weapon) => weapon.id === scenario.id)
  if (weaponIndex < 0) throw new Error(`Unknown weapon mechanics scenario: ${scenario.id}`)

  const arena = createProofArena(SCENARIO_SEED + weaponIndex)
  const simulation = createZombieEscapeSimulation(arena, SCENARIO_SEED + weaponIndex, [], {
    zombieCapacity: 16,
  })
  setZombieEscapeGamePhase(simulation, 'night')
  setZombieEscapeExternalPlayerPose(simulation, true)
  simulation.phaseSecondsRemaining = 999
  simulation.player.aimAngle = Math.PI
  const weaponAmmo = ZOMBIE_ESCAPE_WEAPON_PROFILES[weaponIndex]!.ammoGranted
  simulation.player.weaponAmmoByIndex[weaponIndex] = weaponAmmo
  simulation.player.weaponIndex = weaponIndex
  simulation.player.weaponInventoryMask |= 1 << weaponIndex
  simulation.player.ammo = weaponAmmo
  simulation.player.x = 0
  simulation.player.y = 0
  simulation.player.z = 5
  simulation.player.vx = 0
  simulation.player.vz = 0
  simulation.wave = 1
  simulation.waveSpawnRemaining = 0
  simulation.replacementSpawnRemaining = 0
  simulation.waveSpawnTimerSeconds = 999
  simulation.waveState = 'active'
  setZombieEscapePlayerMuzzlePose(simulation, {
    directionX: 0,
    directionY: 0,
    directionZ: -1,
    x: 0,
    y: 1.15,
    z: 4.65,
  })

  const targetSlots = scenario.targetPositions.map(({ x, z }) => {
    const slot = spawnZombieEscapeZombie(simulation, x, z, TARGET_INITIAL_HEALTH)
    if (slot < 0) throw new Error(`Could not spawn ${scenario.id} proof target at ${x}, ${z}.`)
    simulation.zombies.speedScale[slot] = 0
    simulation.zombies.vx[slot] = 0
    simulation.zombies.vz[slot] = 0
    return slot
  })
  const initialHealth = targetSlots.map((slot) => simulation.zombies.health[slot]!)

  return {
    arena,
    fired: false,
    initialHealth,
    initialPlayerAmmo: simulation.player.ammo,
    maximumVolleySize: 0,
    observedCarrierKeys: new Set(),
    observedEffectContacts: {},
    observedImpactKeys: new Set(),
    scenario,
    simulation,
    targetSlots,
    weaponIndex,
  }
}

export function advanceZombieWeaponMechanicsScenarioRuntime(
  runtime: ZombieWeaponMechanicsScenarioRuntime,
  targetTimeSeconds: number,
) {
  const simulation = runtime.simulation
  const target = Math.max(simulation.elapsedSeconds, targetTimeSeconds)
  const controls = createZombieEscapeControlState()
  controls.aimStrength = 1
  controls.aimX = 0
  controls.aimZ = -1

  while (simulation.elapsedSeconds + 0.000_001 < target) {
    const remaining = target - simulation.elapsedSeconds
    const delta = Math.min(ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds, remaining)
    controls.fire = !runtime.fired && simulation.elapsedSeconds + delta >= FIRE_AT_SECONDS
    stepZombieEscapeSimulationPhysics(simulation, controls, delta, runtime.arena)
    if (controls.fire) runtime.fired = true
    controls.fire = false
    observeWeaponMechanicsEvents(runtime)
  }
  return createZombieWeaponMechanicsScenarioReport(runtime)
}

export function createZombieWeaponMechanicsScenarioReport(
  runtime: ZombieWeaponMechanicsScenarioRuntime,
): ZombieWeaponMechanicsScenarioReport {
  observeWeaponMechanicsEvents(runtime)
  const simulation = runtime.simulation
  const health = createZombieWeaponMechanicsHealthSnapshot(
    runtime.initialHealth,
    runtime.targetSlots.map((slot) => simulation.zombies.health[slot]!),
  )
  const profile = ZOMBIE_ESCAPE_WEAPON_PROFILES[runtime.weaponIndex]!
  return {
    contactCount: runtime.observedImpactKeys.size,
    damage: health.damage,
    damagedTargetCount: health.damagedTargetCount,
    effectContacts: { ...runtime.observedEffectContacts },
    formation: runtime.scenario.formation,
    id: runtime.scenario.id,
    label: runtime.scenario.label,
    mechanic: profile.mechanic,
    projectileCount: runtime.observedCarrierKeys.size,
    remainingHealth: health.remainingHealth,
    shotsFired: simulation.shotsFired,
    timeSeconds: Number(simulation.elapsedSeconds.toFixed(6)),
    volleySize: runtime.maximumVolleySize,
  }
}

function observeWeaponMechanicsEvents(runtime: ZombieWeaponMechanicsScenarioRuntime) {
  const shots = runtime.simulation.shots
  for (let slot = 0; slot < shots.pool.capacity; slot += 1) {
    const generation = shots.pool.generation[slot] ?? 0
    if (generation === 0) continue
    runtime.observedCarrierKeys.add(`${slot}:${generation}`)
    runtime.maximumVolleySize = Math.max(runtime.maximumVolleySize, shots.volleySize[slot] ?? 0)
  }

  const impacts = runtime.simulation.impactEvents
  for (let slot = 0; slot < impacts.pool.capacity; slot += 1) {
    if (impacts.pool.active[slot] === 0) continue
    const generation = impacts.pool.generation[slot] ?? 0
    const key = `${slot}:${generation}`
    if (generation === 0 || runtime.observedImpactKeys.has(key)) continue
    runtime.observedImpactKeys.add(key)
    const effect = weaponImpactEffectName(impacts.effectKind[slot] ?? 0)
    runtime.observedEffectContacts[effect] = (runtime.observedEffectContacts[effect] ?? 0) + 1
  }
}

function weaponImpactEffectName(effectKind: number) {
  if (effectKind === ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.piercing) return 'piercing'
  if (effectKind === ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.chain) return 'chain'
  if (effectKind === ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.blast) return 'blast'
  if (effectKind === ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.blastVictim) return 'blast-victim'
  return 'projectile'
}

function createProofArena(seed: number): ZombieEscapeArenaData {
  const arena = createZombieEscapeArena(seed)
  return {
    ...arena,
    decorationCount: 0,
    decorationRotation: new Float32Array(0),
    decorationScale: new Float32Array(0),
    decorationX: new Float32Array(0),
    decorationZ: new Float32Array(0),
    escapeX: 0,
    escapeZ: -100,
    obstacleCount: 0,
    obstacleKind: new Uint8Array(0),
    obstacleRadius: new Float32Array(0),
    obstacleScale: new Float32Array(0),
    obstacleX: new Float32Array(0),
    obstacleZ: new Float32Array(0),
    playerStartX: 0,
    playerStartZ: 5,
    playRadius: 28,
    radius: 30,
  }
}
