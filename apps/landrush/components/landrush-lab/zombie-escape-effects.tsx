'use client'

import { resolveZombieEscapeDeathNormalizedPhase } from '@landrush/zombie-gameplay/zombie-escape-character-motion'
import {
  getZombieEscapeZombieCatalogEntry,
  ZOMBIE_ESCAPE_CAPACITY,
  ZOMBIE_ESCAPE_SIMULATION,
} from '@landrush/zombie-gameplay/zombie-escape-config'
import {
  createZombieEscapeBallisticSample,
  createZombieEscapeImpactAttachment,
  resolveZombieEscapeBallisticSample,
  resolveZombieEscapeImpactAttachment,
} from '@landrush/zombie-gameplay/zombie-escape-impact-attachment'
import {
  createZombieEscapePresentationPoint,
  createZombieEscapePresentationPose,
  resolveZombieEscapePresentationPose,
  transformZombieEscapePresentationPoint,
} from '@landrush/zombie-gameplay/zombie-escape-presentation-pose'
import {
  ZOMBIE_ESCAPE_SHOT_IMPACT_KIND,
  ZOMBIE_ESCAPE_SHOT_PHASE,
  ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND,
  type ZombieEscapeShotImpactKind,
  type ZombieEscapeShotPhase,
  type ZombieEscapeSimulation,
  type ZombieEscapeWeaponImpactEffectKind,
} from '@landrush/zombie-gameplay/zombie-escape-simulation'
import { useFrame } from '@react-three/fiber'
import {
  type MutableRefObject,
  memo,
  type ReactNode,
  Suspense,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  type Group,
  type InstancedMesh,
  Object3D,
  Quaternion,
  Vector3,
} from 'three'
import {
  createZombieEscapeBloodEventPool,
  createZombieEscapeBloodEventSeed,
  spawnZombieEscapeBloodEvent,
  type ZombieEscapeBloodEvent,
} from './zombie-escape-blood-effects'
import {
  isZombieEscapeBloodAttachmentGenerationCurrent,
  ZombieEscapeBloodPresentation,
  type ZombieEscapeBloodWorldAttachmentResolver,
} from './zombie-escape-blood-presentation'
import { resolveZombieEscapeBloodHitVariantCode } from './zombie-escape-blood-variants'
import {
  createZombieEscapeDeathDustEventPool,
  createZombieEscapeDeathDustEventSeed,
  DEFAULT_ZOMBIE_ESCAPE_DEATH_DUST_VARIANT,
  reconcileZombieEscapeDeathDustEventPool,
  resolveZombieEscapeDeathDustSpawnElapsedSeconds,
  shouldSpawnZombieEscapeDeathDust,
  spawnZombieEscapeDeathDustEvent,
  type ZombieEscapeDeathDustEvent,
  type ZombieEscapeDeathDustVariant,
} from './zombie-escape-death-dust'
import { ZombieEscapeDeathDustPresentation } from './zombie-escape-death-dust-presentation'
import {
  createZombieEscapeMuzzleFlashTransform,
  resolveZombieEscapeMuzzleFlashTransform,
  resolveZombieEscapeShotMuzzleFlashTransform,
} from './zombie-escape-muzzle-flash'
import type {
  ZombieEscapeRenderReadinessRegistry,
  ZombieEscapeRenderRepresentativeKey,
} from './zombie-escape-render-readiness'
import { useZombieEscapeRenderRepresentative } from './zombie-escape-render-readiness-react'
import {
  captureZombieEscapeSkinnedImpact,
  createZombieEscapeSkinnedImpactAttachment,
  resolveZombieEscapeSkinnedImpact,
  type ZombieEscapeImpactVisualRegistry,
} from './zombie-escape-skinned-impact-attachment'
import {
  resolveZombieEscapeCoilArcPoint,
  resolveZombieEscapeScattergunMuzzlePetalEnvelope,
  resolveZombieEscapeVfxBlastScale,
  resolveZombieEscapeVfxImpactEnvelope,
  resolveZombieEscapeVfxNormalizedAge,
  resolveZombieEscapeWeaponVfxStyle,
  ZOMBIE_ESCAPE_BLAST_CLOUD_PUFF_COUNT,
  ZOMBIE_ESCAPE_COIL_ARC_BRANCH_COUNT,
  ZOMBIE_ESCAPE_COIL_ARC_NODE_COUNT,
  ZOMBIE_ESCAPE_COIL_ARC_SEGMENT_COUNT,
  ZOMBIE_ESCAPE_IMPACT_DETAIL_COUNT,
  ZOMBIE_ESCAPE_SCATTERGUN_MUZZLE_PETAL_COUNT,
  ZOMBIE_ESCAPE_TRAVEL_DETAIL_COUNT,
  type ZombieEscapeWeaponVfxPoint,
} from './zombie-escape-weapon-vfx'

const TWO_PI = Math.PI * 2
const Y_AXIS = new Vector3(0, 1, 0)

export function shouldRenderZombieEscapeTracer(
  phase: ZombieEscapeShotPhase,
  impactKind: ZombieEscapeShotImpactKind,
) {
  return (
    phase === ZOMBIE_ESCAPE_SHOT_PHASE.travel ||
    (phase === ZOMBIE_ESCAPE_SHOT_PHASE.impact &&
      impactKind !== ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.expired)
  )
}

export function shouldRenderZombieEscapeMuzzle(primary: number) {
  return primary !== 0
}

export function shouldRenderZombieEscapeImpactFlash(
  effectKind: ZombieEscapeWeaponImpactEffectKind,
  impactKind: ZombieEscapeShotImpactKind,
) {
  return (
    (impactKind === ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment ||
      impactKind === ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy) &&
    effectKind !== ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.chain &&
    effectKind !== ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.blastVictim
  )
}

export function shouldRenderZombieEscapeImpactSparks(
  effectKind: ZombieEscapeWeaponImpactEffectKind,
  impactKind: ZombieEscapeShotImpactKind,
) {
  return (
    (impactKind === ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment ||
      impactKind === ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy) &&
    effectKind !== ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.blastVictim
  )
}

export function shouldRenderZombieEscapeChainArc(effectKind: ZombieEscapeWeaponImpactEffectKind) {
  return effectKind === ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.chain
}

export function shouldScanZombieEscapeEffectPool(activeCount: number) {
  return Number.isFinite(activeCount) && activeCount > 0
}

export function shouldScanZombieEscapeDeathDustCandidates(kills: number, spawnedCount: number) {
  return Number.isFinite(kills) && Number.isFinite(spawnedCount) && kills > spawnedCount
}

export function shouldScanZombieEscapeSharedDeathDustCandidates(
  revision: number,
  observedRevision: number,
  pendingCollapse: boolean,
) {
  return pendingCollapse || (Number.isFinite(revision) && revision !== observedRevision)
}

type ZombieEscapeEffectRenderBoundaryProps = {
  children: ReactNode
  registry: ZombieEscapeRenderReadinessRegistry | undefined
  representativeKey: ZombieEscapeRenderRepresentativeKey
}

export function ZombieEscapeEffectRenderBoundary(props: ZombieEscapeEffectRenderBoundaryProps) {
  return (
    <Suspense fallback={null}>
      <MountedZombieEscapeEffectRenderRepresentative {...props} />
    </Suspense>
  )
}

function MountedZombieEscapeEffectRenderRepresentative({
  children,
  registry,
  representativeKey,
}: ZombieEscapeEffectRenderBoundaryProps) {
  const rootRef = useRef<Group>(null)
  // The registration must suspend with its resources, not publish an empty outer group.
  useZombieEscapeRenderRepresentative(registry, representativeKey, rootRef)
  return <group ref={rootRef}>{children}</group>
}

export const ZombieEscapeEffects = memo(function ZombieEscapeEffects({
  authoritativeShots = false,
  deathDustVariant = DEFAULT_ZOMBIE_ESCAPE_DEATH_DUST_VARIANT,
  framePriority = -16,
  getDeathPresentationRevision,
  impactVisualRegistry,
  renderReadinessRegistry,
  simulationRef,
  vfxVariantIndex,
}: {
  authoritativeShots?: boolean
  deathDustVariant?: ZombieEscapeDeathDustVariant
  framePriority?: number
  getDeathPresentationRevision?: () => number
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
  vfxVariantIndex?: number
}) {
  const shotCapacity = simulationRef.current.shots.pool.capacity
  const impactCapacity = simulationRef.current.impactEvents.pool.capacity
  const sparkCapacity = impactCapacity * ZOMBIE_ESCAPE_CAPACITY.impactSparksPerShot
  const arcCapacity =
    impactCapacity * ZOMBIE_ESCAPE_COIL_ARC_SEGMENT_COUNT * ZOMBIE_ESCAPE_COIL_ARC_BRANCH_COUNT
  const travelDetailCapacity = shotCapacity * ZOMBIE_ESCAPE_TRAVEL_DETAIL_COUNT
  const muzzlePetalCapacity = shotCapacity * ZOMBIE_ESCAPE_SCATTERGUN_MUZZLE_PETAL_COUNT
  const impactDetailCapacity = impactCapacity * ZOMBIE_ESCAPE_IMPACT_DETAIL_COUNT
  const blastCloudCapacity = impactCapacity * ZOMBIE_ESCAPE_BLAST_CLOUD_PUFF_COUNT
  const effectsRootRef = useRef<Group>(null)
  const travelRef = useRef<InstancedMesh>(null)
  const carrierAccentRef = useRef<InstancedMesh>(null)
  const travelDetailRef = useRef<InstancedMesh>(null)
  const travelRibbonRef = useRef<InstancedMesh>(null)
  const muzzleRef = useRef<InstancedMesh>(null)
  const muzzlePetalRef = useRef<InstancedMesh>(null)
  const impactFlashRef = useRef<InstancedMesh>(null)
  const impactDetailRef = useRef<InstancedMesh>(null)
  const impactShardRef = useRef<InstancedMesh>(null)
  const blastCloudRef = useRef<InstancedMesh>(null)
  const chainArcRef = useRef<InstancedMesh>(null)
  const impactRootRef = useRef<Group>(null)
  const bloodRootRef = useRef<Group>(null)
  const bloodEvents = useMemo(
    () => createZombieEscapeBloodEventPool(simulationRef.current.impactEvents.pool.capacity),
    [simulationRef],
  )
  const deathDustEvents = useMemo(
    () => createZombieEscapeDeathDustEventPool(simulationRef.current.zombies.pool.capacity),
    [simulationRef],
  )
  const observedBloodImpactGenerationRef = useRef(new Uint32Array(impactCapacity))
  const observedDeathZombieGenerationRef = useRef(
    new Uint32Array(simulationRef.current.zombies.pool.capacity),
  )
  const spawnedDeathDustKillCountRef = useRef(simulationRef.current.kills)
  const observedSharedDeathRevisionRef = useRef(-1)
  const pendingSharedDeathCollapseRef = useRef(false)
  const previousSimulationElapsedRef = useRef(simulationRef.current.elapsedSeconds)
  const skinnedBloodAttachments = useMemo(
    () =>
      Array.from({ length: bloodEvents.pool.capacity }, () =>
        createZombieEscapeSkinnedImpactAttachment(),
      ),
    [bloodEvents.pool.capacity],
  )
  const sparkRef = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const colorScratch = useMemo(() => new Color(), [])
  const direction = useMemo(() => new Vector3(), [])
  const impactTravelDirection = useMemo(() => new Vector3(), [])
  const sparkLateral = useMemo(() => new Vector3(), [])
  const travelSide = useMemo(() => new Vector3(), [])
  const travelUp = useMemo(() => new Vector3(), [])
  const impactSide = useMemo(() => new Vector3(), [])
  const impactUp = useMemo(() => new Vector3(), [])
  const detailDirection = useMemo(() => new Vector3(), [])
  const ballisticSample = useMemo(() => createZombieEscapeBallisticSample(), [])
  const impactAttachment = useMemo(() => createZombieEscapeImpactAttachment(), [])
  const impactNormal = useMemo(() => new Vector3(), [])
  const impactPoint = useMemo(() => new Vector3(), [])
  const worldImpactNormal = useMemo(() => new Vector3(), [])
  const worldImpactPoint = useMemo(() => new Vector3(), [])
  const attachmentWorldDirection = useMemo(() => new Vector3(), [])
  const attachmentWorldNormal = useMemo(() => new Vector3(), [])
  const attachmentWorldPoint = useMemo(() => new Vector3(), [])
  const attachmentWorldRayEnd = useMemo(() => new Vector3(), [])
  const attachmentWorldRayStart = useMemo(() => new Vector3(), [])
  const presentationPose = useMemo(() => createZombieEscapePresentationPose(), [])
  const deathDustContactPoint = useMemo(() => createZombieEscapePresentationPoint(), [])
  const muzzleFlashTransform = useMemo(() => createZombieEscapeMuzzleFlashTransform(), [])
  const arcStart = useMemo<ZombieEscapeWeaponVfxPoint>(() => ({ x: 0, y: 0, z: 0 }), [])
  const arcEnd = useMemo<ZombieEscapeWeaponVfxPoint>(() => ({ x: 0, y: 0, z: 0 }), [])
  const bloodEventScratch = useMemo<ZombieEscapeBloodEvent>(
    () => ({
      directionX: 0,
      directionY: 0,
      directionZ: -1,
      normalX: 0,
      normalY: 0,
      normalZ: 1,
      originX: 0,
      originY: 0,
      originZ: 0,
      seed: 0,
      spawnElapsedSeconds: 0,
      targetGeneration: 0,
      targetSlot: -1,
      variantCode: 0,
    }),
    [],
  )
  const deathDustEventScratch = useMemo<ZombieEscapeDeathDustEvent>(
    () => ({
      directionX: 0,
      directionZ: 1,
      groundY: 0,
      originX: 0,
      originZ: 0,
      seed: 0,
      spawnElapsedSeconds: 0,
      targetGeneration: 0,
      targetSlot: -1,
    }),
    [],
  )
  const quaternion = useMemo(() => new Quaternion(), [])
  const effectsWorldQuaternion = useMemo(() => new Quaternion(), [])
  const getBloodElapsedSeconds = useMemo(
    () => () => simulationRef.current.elapsedSeconds,
    [simulationRef],
  )
  const getDeathDustElapsedSeconds = useMemo(
    () => () => simulationRef.current.elapsedSeconds,
    [simulationRef],
  )
  const resolveBloodWorldAttachment = useMemo<ZombieEscapeBloodWorldAttachmentResolver>(
    () => (eventSlot, eventGeneration, targetSlot, targetGeneration, outputPoint, outputNormal) => {
      const attachment = skinnedBloodAttachments[eventSlot]
      return Boolean(
        attachment &&
          attachment.targetSlot === targetSlot &&
          attachment.targetGeneration === targetGeneration &&
          isZombieEscapeBloodAttachmentGenerationCurrent(
            eventGeneration,
            attachment.shotGeneration,
          ) &&
          resolveZombieEscapeSkinnedImpact(
            impactVisualRegistry,
            attachment,
            outputPoint,
            outputNormal,
          ),
      )
    },
    [impactVisualRegistry, skinnedBloodAttachments],
  )

  useLayoutEffect(() => {
    initializeEffectInstanceMesh(travelRef.current, shotCapacity, colorScratch)
    initializeEffectInstanceMesh(carrierAccentRef.current, shotCapacity, colorScratch)
    initializeEffectInstanceMesh(travelDetailRef.current, travelDetailCapacity, colorScratch)
    initializeEffectInstanceMesh(travelRibbonRef.current, shotCapacity, colorScratch)
    initializeEffectInstanceMesh(muzzleRef.current, shotCapacity, colorScratch)
    initializeEffectInstanceMesh(muzzlePetalRef.current, muzzlePetalCapacity, colorScratch)
    initializeEffectInstanceMesh(impactFlashRef.current, impactCapacity, colorScratch)
    initializeEffectInstanceMesh(impactDetailRef.current, impactDetailCapacity, colorScratch)
    initializeEffectInstanceMesh(impactShardRef.current, impactDetailCapacity, colorScratch)
    initializeEffectInstanceMesh(blastCloudRef.current, blastCloudCapacity, colorScratch)
    initializeEffectInstanceMesh(chainArcRef.current, arcCapacity, colorScratch)
    initializeEffectInstanceMesh(sparkRef.current, sparkCapacity, colorScratch)
  }, [
    arcCapacity,
    blastCloudCapacity,
    colorScratch,
    impactCapacity,
    impactDetailCapacity,
    muzzlePetalCapacity,
    shotCapacity,
    sparkCapacity,
    travelDetailCapacity,
  ])

  useZombieEscapeRenderRepresentative(renderReadinessRegistry, 'effect:tracer', travelRef)
  useZombieEscapeRenderRepresentative(renderReadinessRegistry, 'effect:muzzle', muzzleRef)
  useZombieEscapeRenderRepresentative(renderReadinessRegistry, 'effect:impact', impactRootRef)
  useZombieEscapeRenderRepresentative(renderReadinessRegistry, 'effect:blood', bloodRootRef)
  useZombieEscapeRenderRepresentative(renderReadinessRegistry, 'effect:sparks', sparkRef)
  useZombieEscapeRenderRepresentative(
    renderReadinessRegistry,
    'effect:carrier-accent',
    carrierAccentRef,
  )
  useZombieEscapeRenderRepresentative(
    renderReadinessRegistry,
    'effect:travel-detail',
    travelDetailRef,
  )
  useZombieEscapeRenderRepresentative(
    renderReadinessRegistry,
    'effect:travel-ribbon',
    travelRibbonRef,
  )
  useZombieEscapeRenderRepresentative(
    renderReadinessRegistry,
    'effect:muzzle-petals',
    muzzlePetalRef,
  )

  useFrame(() => {
    const simulation = simulationRef.current
    const shots = simulation.shots
    const impactEvents = simulation.impactEvents
    const previousSimulationElapsed = previousSimulationElapsedRef.current
    const simulationRewound = simulation.elapsedSeconds < previousSimulationElapsed
    if (
      simulationRewound ||
      (!authoritativeShots && simulation.kills < spawnedDeathDustKillCountRef.current)
    ) {
      observedBloodImpactGenerationRef.current.fill(0)
      observedDeathZombieGenerationRef.current.fill(0)
      spawnedDeathDustKillCountRef.current = Math.max(0, simulation.kills)
      observedSharedDeathRevisionRef.current = -1
      pendingSharedDeathCollapseRef.current = false
    }
    if (simulationRewound || shouldScanZombieEscapeEffectPool(deathDustEvents.pool.activeCount)) {
      reconcileZombieEscapeDeathDustEventPool(
        deathDustEvents,
        simulation.elapsedSeconds,
        previousSimulationElapsed,
      )
    }
    previousSimulationElapsedRef.current = simulation.elapsedSeconds
    const zombies = simulation.zombies
    const sharedDeathRevision = getDeathPresentationRevision?.() ?? 0
    if (
      authoritativeShots
        ? shouldScanZombieEscapeSharedDeathDustCandidates(
            sharedDeathRevision,
            observedSharedDeathRevisionRef.current,
            pendingSharedDeathCollapseRef.current,
          )
        : shouldScanZombieEscapeDeathDustCandidates(
            simulation.kills,
            spawnedDeathDustKillCountRef.current,
          )
    ) {
      observedSharedDeathRevisionRef.current = sharedDeathRevision
      pendingSharedDeathCollapseRef.current = false
      for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
        const generation = zombies.pool.generation[slot]!
        if (
          zombies.pool.active[slot] === 0 ||
          zombies.health[slot]! > 0 ||
          generation === observedDeathZombieGenerationRef.current[slot]!
        )
          continue
        const deathPhase = resolveZombieEscapeDeathNormalizedPhase(
          zombies.deathPresentationSeconds[slot]!,
        )
        if (
          !shouldSpawnZombieEscapeDeathDust({
            active: zombies.pool.active[slot] !== 0,
            deathPhase,
            generation,
            health: zombies.health[slot]!,
            observedGeneration: observedDeathZombieGenerationRef.current[slot]!,
          })
        ) {
          pendingSharedDeathCollapseRef.current = true
          continue
        }
        observedDeathZombieGenerationRef.current[slot] = generation
        const bodyCenterY =
          getZombieEscapeZombieCatalogEntry(zombies.variant[slot]!).characterHeightMeters * 0.5
        resolveZombieEscapePresentationPose(
          zombies.x[slot]!,
          zombies.y[slot]!,
          zombies.z[slot]!,
          zombies.heading[slot]!,
          0,
          zombies.hitImpulseX[slot]!,
          0,
          zombies.hitImpulseZ[slot]!,
          presentationPose,
          bodyCenterY,
          1,
          zombies.spawnOrdinal[slot]!,
        )
        transformZombieEscapePresentationPoint(
          presentationPose,
          0,
          bodyCenterY,
          0,
          deathDustContactPoint,
        )
        deathDustEventScratch.directionX = deathDustContactPoint.x - zombies.x[slot]!
        deathDustEventScratch.directionZ = deathDustContactPoint.z - zombies.z[slot]!
        deathDustEventScratch.groundY = zombies.y[slot]!
        deathDustEventScratch.originX = deathDustContactPoint.x
        deathDustEventScratch.originZ = deathDustContactPoint.z
        deathDustEventScratch.seed = createZombieEscapeDeathDustEventSeed(
          generation,
          slot,
          zombies.spawnOrdinal[slot]!,
        )
        deathDustEventScratch.spawnElapsedSeconds = resolveZombieEscapeDeathDustSpawnElapsedSeconds(
          simulation.elapsedSeconds,
          zombies.deathPresentationSeconds[slot]!,
        )
        deathDustEventScratch.targetGeneration = generation
        deathDustEventScratch.targetSlot = slot
        spawnZombieEscapeDeathDustEvent(deathDustEvents, deathDustEventScratch)
        spawnedDeathDustKillCountRef.current += 1
      }
    }
    const effectsRoot = effectsRootRef.current
    if (effectsRoot) {
      effectsRoot.updateWorldMatrix(true, false)
      effectsRoot.getWorldQuaternion(effectsWorldQuaternion)
    }

    let renderedTravelCount = 0
    let renderedCarrierAccentCount = 0
    let renderedTravelDetailCount = 0
    let renderedTravelRibbonCount = 0
    let renderedMuzzleCount = 0
    let renderedMuzzlePetalCount = 0
    const shotScanCapacity = shouldScanZombieEscapeEffectPool(shots.pool.activeCount)
      ? shots.pool.capacity
      : 0
    for (let slot = 0; slot < shotScanCapacity; slot += 1) {
      if (shots.pool.active[slot] === 0) continue
      const phase = shots.phase[slot] as ZombieEscapeShotPhase
      const style = resolveZombieEscapeWeaponVfxStyle(shots.weaponIndex[slot]!, vfxVariantIndex)
      direction.set(shots.directionX[slot]!, shots.directionY[slot]!, shots.directionZ[slot]!)
      if (direction.lengthSq() <= 0.000_001) direction.set(0, 0, -1)
      else direction.normalize()
      const shotAge = shots.travelAge[slot]! + shots.impactAge[slot]!
      if (
        shouldRenderZombieEscapeMuzzle(shots.primary[slot]!) &&
        shotAge < ZOMBIE_ESCAPE_SIMULATION.muzzleFlashSeconds
      ) {
        const muzzleProgress = shotAge / ZOMBIE_ESCAPE_SIMULATION.muzzleFlashSeconds
        const muzzleEnvelope = Math.sin(Math.PI * muzzleProgress) * (1 - muzzleProgress * 0.25)
        if (authoritativeShots)
          resolveZombieEscapeShotMuzzleFlashTransform(
            shots,
            slot,
            muzzleEnvelope,
            muzzleFlashTransform,
          )
        else
          resolveZombieEscapeMuzzleFlashTransform(
            simulation.player,
            muzzleEnvelope,
            muzzleFlashTransform,
          )
        direction.set(
          muzzleFlashTransform.directionX,
          muzzleFlashTransform.directionY,
          muzzleFlashTransform.directionZ,
        )
        const muzzleSocketX = muzzleFlashTransform.x - direction.x * muzzleFlashTransform.scaleY
        const muzzleSocketY = muzzleFlashTransform.y - direction.y * muzzleFlashTransform.scaleY
        const muzzleSocketZ = muzzleFlashTransform.z - direction.z * muzzleFlashTransform.scaleY
        const muzzleHalfLength = muzzleFlashTransform.scaleY * style.muzzleLengthScale
        quaternion.setFromUnitVectors(Y_AXIS, direction)
        applyEffectInstance(
          muzzleRef.current,
          renderedMuzzleCount,
          dummy,
          muzzleSocketX + direction.x * muzzleHalfLength,
          muzzleSocketY + direction.y * muzzleHalfLength,
          muzzleSocketZ + direction.z * muzzleHalfLength,
          quaternion,
          muzzleFlashTransform.scaleX * style.muzzleRadiusScale,
          muzzleHalfLength,
          muzzleFlashTransform.scaleZ * style.muzzleRadiusScale,
        )
        setEffectInstanceColor(
          muzzleRef.current,
          renderedMuzzleCount,
          style.muzzleColor,
          colorScratch,
        )
        renderedMuzzleCount += 1
        if (style.id === 'scattergun' && style.travelPattern === 'boom') {
          const petalEnvelope = Math.sqrt(
            resolveZombieEscapeScattergunMuzzlePetalEnvelope(muzzleProgress),
          )
          if (petalEnvelope > 0.001) {
            travelSide.crossVectors(direction, Y_AXIS)
            if (travelSide.lengthSq() <= 0.000_001) travelSide.set(1, 0, 0)
            else travelSide.normalize()
            travelUp.crossVectors(travelSide, direction).normalize()
            const shotSeed = shots.pool.generation[slot]! ^ Math.imul(slot + 1, 0x9e37_79b1)
            for (let petal = 0; petal < ZOMBIE_ESCAPE_SCATTERGUN_MUZZLE_PETAL_COUNT; petal += 1) {
              const seed = shotSeed ^ Math.imul(petal + 1, 0x85eb_ca6b)
              const angle =
                (petal / ZOMBIE_ESCAPE_SCATTERGUN_MUZZLE_PETAL_COUNT) * TWO_PI +
                (hashUnit(seed) - 0.5) * 0.46
              const splay = 0.58 + hashUnit(seed ^ 0xc2b2_ae35) * 0.32
              detailDirection
                .copy(direction)
                .addScaledVector(travelSide, Math.cos(angle) * splay)
                .addScaledVector(travelUp, Math.sin(angle) * splay)
                .normalize()
              const petalLength = (0.42 + hashUnit(seed ^ 0x27d4_eb2f) * 0.2) * petalEnvelope
              const petalRadius = (0.085 + hashUnit(seed ^ 0x1656_67b1) * 0.035) * petalEnvelope
              quaternion.setFromUnitVectors(Y_AXIS, detailDirection)
              applyEffectInstance(
                muzzlePetalRef.current,
                renderedMuzzlePetalCount,
                dummy,
                muzzleSocketX + detailDirection.x * petalLength * 0.5,
                muzzleSocketY + detailDirection.y * petalLength * 0.5,
                muzzleSocketZ + detailDirection.z * petalLength * 0.5,
                quaternion,
                petalRadius,
                petalLength,
                petalRadius,
              )
              setEffectInstanceColorScaled(
                muzzlePetalRef.current,
                renderedMuzzlePetalCount,
                petal % 2 === 0 ? style.detailColorA : style.detailColorB,
                0.72 + petalEnvelope * 0.12,
                colorScratch,
              )
              renderedMuzzlePetalCount += 1
            }
          }
        }
      }

      if (
        !shouldRenderZombieEscapeTracer(phase, shots.impactKind[slot] as ZombieEscapeShotImpactKind)
      ) {
        continue
      }
      direction.set(
        shots.x[slot]! - shots.previousX[slot]!,
        shots.y[slot]! - shots.previousY[slot]!,
        shots.z[slot]! - shots.previousZ[slot]!,
      )
      const travelLength = direction.length()
      if (travelLength <= 0.000_1) {
        direction.set(shots.directionX[slot]!, shots.directionY[slot]!, shots.directionZ[slot]!)
        if (direction.lengthSq() <= 0.000_001) direction.set(0, 0, -1)
        else direction.normalize()
      } else {
        direction.multiplyScalar(1 / travelLength)
      }
      const tracerEnvelope =
        phase === ZOMBIE_ESCAPE_SHOT_PHASE.impact
          ? Math.sqrt(
              Math.max(
                0,
                1 - shots.impactAge[slot]! / ZOMBIE_ESCAPE_SIMULATION.impactLifetimeSeconds,
              ),
            )
          : 1
      const midpointX = (shots.previousX[slot]! + shots.x[slot]!) * 0.5
      const midpointY = (shots.previousY[slot]! + shots.y[slot]!) * 0.5
      const midpointZ = (shots.previousZ[slot]! + shots.z[slot]!) * 0.5
      const tracerHalfLength = Math.max(
        style.tracerMinimumHalfLength,
        (travelLength * 0.5 + 0.055) * style.tracerLengthScale,
      )
      quaternion.setFromUnitVectors(Y_AXIS, direction)
      applyEffectInstance(
        travelRef.current,
        renderedTravelCount,
        dummy,
        midpointX,
        midpointY,
        midpointZ,
        quaternion,
        style.tracerRadius * tracerEnvelope,
        tracerHalfLength,
        style.tracerRadius * tracerEnvelope,
      )
      setEffectInstanceColor(
        travelRef.current,
        renderedTravelCount,
        style.tracerColor,
        colorScratch,
      )
      renderedTravelCount += 1
      if (style.accentRadius > 0) {
        applyEffectInstance(
          carrierAccentRef.current,
          renderedCarrierAccentCount,
          dummy,
          midpointX + direction.x * style.accentOffsetMeters,
          midpointY + direction.y * style.accentOffsetMeters,
          midpointZ + direction.z * style.accentOffsetMeters,
          quaternion,
          style.accentRadius * tracerEnvelope,
          tracerHalfLength * style.accentLengthScale,
          style.accentRadius * tracerEnvelope,
        )
        setEffectInstanceColor(
          carrierAccentRef.current,
          renderedCarrierAccentCount,
          style.accentColor,
          colorScratch,
        )
        renderedCarrierAccentCount += 1
      }
      if (style.travelPattern === 'ribbon') {
        applyEffectInstance(
          travelRibbonRef.current,
          renderedTravelRibbonCount,
          dummy,
          midpointX,
          midpointY,
          midpointZ,
          quaternion,
          0.16 * tracerEnvelope,
          tracerHalfLength * 1.28,
          0.014 * tracerEnvelope,
        )
        setEffectInstanceColor(
          travelRibbonRef.current,
          renderedTravelRibbonCount,
          style.detailColorA,
          colorScratch,
        )
        renderedTravelRibbonCount += 1
      }
      const travelDetailCount =
        style.travelPattern === 'helix'
          ? ZOMBIE_ESCAPE_TRAVEL_DETAIL_COUNT
          : style.travelPattern === 'prism'
            ? 7
            : style.travelPattern === 'pulse'
              ? 5
              : style.travelPattern === 'salt'
                ? 3
                : 0
      if (travelDetailCount > 0) {
        travelSide.crossVectors(direction, Y_AXIS)
        if (travelSide.lengthSq() <= 0.000_001) travelSide.set(1, 0, 0)
        else travelSide.normalize()
        travelUp.crossVectors(travelSide, direction).normalize()
        const shotSeed = shots.pool.generation[slot]! ^ Math.imul(slot + 1, 0x9e37_79b1)
        for (let detail = 0; detail < travelDetailCount; detail += 1) {
          const progress = (detail + 0.5) / travelDetailCount
          const longitudinal = (progress - 0.5) * tracerHalfLength * 2
          let lateral = 0
          let vertical = 0
          let detailScale = 0.038
          let detailLengthScale = 1
          if (style.travelPattern === 'helix') {
            const angle = progress * TWO_PI * 2 + shotAge * 16
            lateral = Math.cos(angle) * 0.1
            vertical = Math.sin(angle) * 0.1
            detailScale = 0.043
          } else if (style.travelPattern === 'prism') {
            detailScale = detail % 2 === 0 ? 0.047 : 0.033
            detailLengthScale = 1.9
          } else if (style.travelPattern === 'pulse') {
            detailScale = 0.027 + 0.035 * Math.max(0, Math.sin(progress * Math.PI + shotAge * 19))
          } else {
            lateral = (hashUnit(shotSeed ^ Math.imul(detail + 1, 0x85eb_ca6b)) * 2 - 1) * 0.075
            vertical = (hashUnit(shotSeed ^ Math.imul(detail + 1, 0xc2b2_ae35)) * 2 - 1) * 0.06
            detailScale = 0.019 + hashUnit(shotSeed ^ detail) * 0.018
          }
          applyEffectInstance(
            travelDetailRef.current,
            renderedTravelDetailCount,
            dummy,
            midpointX + direction.x * longitudinal + travelSide.x * lateral + travelUp.x * vertical,
            midpointY + direction.y * longitudinal + travelSide.y * lateral + travelUp.y * vertical,
            midpointZ + direction.z * longitudinal + travelSide.z * lateral + travelUp.z * vertical,
            quaternion,
            detailScale * tracerEnvelope,
            detailScale * detailLengthScale * tracerEnvelope,
            detailScale * tracerEnvelope,
          )
          setEffectInstanceColor(
            travelDetailRef.current,
            renderedTravelDetailCount,
            detail % 2 === 0 ? style.detailColorA : style.detailColorB,
            colorScratch,
          )
          renderedTravelDetailCount += 1
        }
      }
    }

    let renderedImpactFlashCount = 0
    let renderedImpactDetailCount = 0
    let renderedImpactShardCount = 0
    let renderedBlastCloudCount = 0
    let renderedChainArcCount = 0
    let renderedSparkCount = 0
    const impactScanCapacity = shouldScanZombieEscapeEffectPool(impactEvents.pool.activeCount)
      ? impactEvents.pool.capacity
      : 0
    for (let slot = 0; slot < impactScanCapacity; slot += 1) {
      if (impactEvents.pool.active[slot] === 0) continue

      const effectKind = impactEvents.effectKind[slot] as ZombieEscapeWeaponImpactEffectKind
      const impactKind = impactEvents.impactKind[slot] as ZombieEscapeShotImpactKind
      const weaponIndex = impactEvents.weaponIndex[slot]!
      const style = resolveZombieEscapeWeaponVfxStyle(weaponIndex, vfxVariantIndex)
      direction.set(
        impactEvents.x[slot]! - impactEvents.sourceX[slot]!,
        impactEvents.y[slot]! - impactEvents.sourceY[slot]!,
        impactEvents.z[slot]! - impactEvents.sourceZ[slot]!,
      )
      if (direction.lengthSq() <= 0.000_001) direction.set(0, 0, -1)
      else direction.normalize()
      impactTravelDirection.copy(direction)
      worldImpactPoint.set(impactEvents.x[slot]!, impactEvents.y[slot]!, impactEvents.z[slot]!)
      worldImpactNormal.set(
        impactEvents.normalX[slot]!,
        impactEvents.normalY[slot]!,
        impactEvents.normalZ[slot]!,
      )
      impactPoint.copy(worldImpactPoint)
      impactNormal.copy(worldImpactNormal)
      const targetSlot = impactEvents.targetSlot[slot]!
      const targetGeneration = impactEvents.targetGeneration[slot]!
      if (
        impactKind === ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy &&
        targetSlot >= 0 &&
        zombies.pool.active[targetSlot] !== 0 &&
        zombies.pool.generation[targetSlot] === targetGeneration
      ) {
        resolveZombieEscapePresentationPose(
          zombies.x[targetSlot]!,
          zombies.y[targetSlot]!,
          zombies.z[targetSlot]!,
          zombies.heading[targetSlot]!,
          zombies.hitReaction[targetSlot]!,
          zombies.hitImpulseX[targetSlot]!,
          zombies.hitImpulseY[targetSlot]!,
          zombies.hitImpulseZ[targetSlot]!,
          presentationPose,
          getZombieEscapeZombieCatalogEntry(zombies.variant[targetSlot]!).characterHeightMeters *
            0.5,
          zombies.health[targetSlot]! <= 0
            ? resolveZombieEscapeDeathNormalizedPhase(zombies.deathPresentationSeconds[targetSlot]!)
            : 0,
          zombies.spawnOrdinal[targetSlot]!,
        )
        resolveZombieEscapeImpactAttachment(
          impactEvents.hitLocalX[slot]!,
          impactEvents.hitLocalY[slot]!,
          impactEvents.hitLocalZ[slot]!,
          impactEvents.hitLocalNormalX[slot]!,
          impactEvents.hitLocalNormalY[slot]!,
          impactEvents.hitLocalNormalZ[slot]!,
          presentationPose,
          impactAttachment,
        )
        impactPoint.set(impactAttachment.x, impactAttachment.y, impactAttachment.z)
        impactNormal.set(
          impactAttachment.normalX,
          impactAttachment.normalY,
          impactAttachment.normalZ,
        )
      }
      if (impactNormal.lengthSq() <= 0.000_001) impactNormal.copy(direction).multiplyScalar(-1)
      if (impactNormal.lengthSq() <= 0.000_001) impactNormal.set(0, 0, 1)
      else impactNormal.normalize()
      if (worldImpactNormal.lengthSq() <= 0.000_001) {
        worldImpactNormal.copy(direction).multiplyScalar(-1)
      }
      if (worldImpactNormal.lengthSq() <= 0.000_001) worldImpactNormal.set(0, 0, 1)
      else worldImpactNormal.normalize()

      const impactGeneration = impactEvents.pool.generation[slot]!
      if (
        impactKind === ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy &&
        observedBloodImpactGenerationRef.current[slot] !== impactGeneration
      ) {
        observedBloodImpactGenerationRef.current[slot] = impactGeneration
        bloodEventScratch.directionX = direction.x
        bloodEventScratch.directionY = direction.y
        bloodEventScratch.directionZ = direction.z
        bloodEventScratch.normalX = impactNormal.x
        bloodEventScratch.normalY = impactNormal.y
        bloodEventScratch.normalZ = impactNormal.z
        bloodEventScratch.originX = impactPoint.x
        bloodEventScratch.originY = impactPoint.y
        bloodEventScratch.originZ = impactPoint.z
        bloodEventScratch.seed = createZombieEscapeBloodEventSeed(
          impactGeneration,
          slot,
          targetGeneration,
        )
        bloodEventScratch.spawnElapsedSeconds = Math.max(
          0,
          simulation.elapsedSeconds - impactEvents.age[slot]!,
        )
        bloodEventScratch.targetGeneration = targetGeneration
        bloodEventScratch.targetSlot = targetSlot
        const bloodTravelX = impactEvents.x[slot]! - impactEvents.sourceX[slot]!
        const bloodTravelY = impactEvents.y[slot]! - impactEvents.sourceY[slot]!
        const bloodTravelZ = impactEvents.z[slot]! - impactEvents.sourceZ[slot]!
        bloodEventScratch.variantCode = resolveZombieEscapeBloodHitVariantCode(
          impactEvents.damage[slot]!,
          bloodTravelX * bloodTravelX + bloodTravelY * bloodTravelY + bloodTravelZ * bloodTravelZ,
        )
        const bloodEventSlot = spawnZombieEscapeBloodEvent(bloodEvents, bloodEventScratch)
        const skinnedAttachment = skinnedBloodAttachments[bloodEventSlot]!
        if (
          effectsRoot &&
          targetSlot >= 0 &&
          zombies.pool.active[targetSlot] !== 0 &&
          zombies.pool.generation[targetSlot] === targetGeneration
        ) {
          effectsRoot.localToWorld(attachmentWorldPoint.copy(impactPoint))
          attachmentWorldNormal
            .copy(impactNormal)
            .applyQuaternion(effectsWorldQuaternion)
            .normalize()
          attachmentWorldDirection
            .copy(direction)
            .applyQuaternion(effectsWorldQuaternion)
            .normalize()
          attachmentWorldRayStart
            .copy(attachmentWorldPoint)
            .addScaledVector(attachmentWorldDirection, -1.25)
          attachmentWorldRayEnd
            .copy(attachmentWorldPoint)
            .addScaledVector(attachmentWorldDirection, 2.5)
          captureZombieEscapeSkinnedImpact(
            impactVisualRegistry,
            targetSlot,
            targetGeneration,
            bloodEvents.pool.generation[bloodEventSlot]!,
            attachmentWorldRayStart,
            attachmentWorldRayEnd,
            attachmentWorldNormal,
            skinnedAttachment,
          )
        }
      }

      const impactProgress = resolveZombieEscapeVfxNormalizedAge(
        impactEvents.age[slot]!,
        ZOMBIE_ESCAPE_SIMULATION.impactLifetimeSeconds,
      )
      const impactEnvelope = resolveZombieEscapeVfxImpactEnvelope(impactProgress)
      const isBlastImpact = effectKind === ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.blast
      if (shouldRenderZombieEscapeImpactFlash(effectKind, impactKind)) {
        const flashDirection =
          effectKind === ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.piercing
            ? impactTravelDirection
            : isBlastImpact
              ? Y_AXIS
              : impactNormal
        quaternion.setFromUnitVectors(Y_AXIS, flashDirection)
        const flashScale =
          style.impactFlashScale *
          (isBlastImpact ? resolveZombieEscapeVfxBlastScale(impactProgress) : impactEnvelope)
        const flashPoint = isBlastImpact ? worldImpactPoint : impactPoint
        applyEffectInstance(
          impactFlashRef.current,
          renderedImpactFlashCount,
          dummy,
          flashPoint.x + (isBlastImpact ? 0 : impactNormal.x * 0.012),
          flashPoint.y + (isBlastImpact ? 0.16 : impactNormal.y * 0.012),
          flashPoint.z + (isBlastImpact ? 0 : impactNormal.z * 0.012),
          quaternion,
          flashScale,
          flashScale * style.impactStretchScale,
          flashScale,
        )
        setEffectInstanceColor(
          impactFlashRef.current,
          renderedImpactFlashCount,
          style.impactColor,
          colorScratch,
        )
        renderedImpactFlashCount += 1
      }

      if (
        !isBlastImpact &&
        effectKind !== ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.chain &&
        effectKind !== ZOMBIE_ESCAPE_WEAPON_IMPACT_EFFECT_KIND.blastVictim
      ) {
        impactSide.crossVectors(impactNormal, Y_AXIS)
        if (impactSide.lengthSq() <= 0.000_001) impactSide.set(1, 0, 0)
        else impactSide.normalize()
        impactUp.crossVectors(impactSide, impactNormal).normalize()
        const nodeCount =
          style.impactPattern === 'sun-flare'
            ? 7
            : style.impactPattern === 'facets'
              ? 5
              : style.impactPattern === 'salt'
                ? 6
                : style.impactPattern === 'coral'
                  ? 5
                  : 0
        for (let detail = 0; detail < nodeCount; detail += 1) {
          const seed =
            impactGeneration ^ Math.imul(slot + 1, 0x9e37_79b1) ^ Math.imul(detail + 1, 0x85eb_ca6b)
          const angle = (detail / Math.max(1, nodeCount)) * TWO_PI + hashUnit(seed) * 0.35
          const expansion =
            style.impactPattern === 'sun-flare'
              ? 0.1 + impactProgress * 0.38
              : style.impactPattern === 'salt'
                ? 0.04 + impactProgress * 0.24
                : 0.06 + impactProgress * 0.3
          const radius = expansion * (0.7 + hashUnit(seed ^ 0xc2b2_ae35) * 0.55)
          const detailScale =
            (style.impactPattern === 'sun-flare'
              ? 0.12
              : style.impactPattern === 'coral'
                ? 0.1
                : style.impactPattern === 'salt'
                  ? 0.035
                  : 0.07) *
            Math.sqrt(impactEnvelope) *
            (0.76 + hashUnit(seed ^ 0x27d4_eb2f) * 0.46)
          quaternion.setFromAxisAngle(impactNormal, angle)
          applyEffectInstance(
            impactDetailRef.current,
            renderedImpactDetailCount,
            dummy,
            impactPoint.x +
              impactSide.x * Math.cos(angle) * radius +
              impactUp.x * Math.sin(angle) * radius,
            impactPoint.y +
              impactSide.y * Math.cos(angle) * radius +
              impactUp.y * Math.sin(angle) * radius,
            impactPoint.z +
              impactSide.z * Math.cos(angle) * radius +
              impactUp.z * Math.sin(angle) * radius,
            quaternion,
            detailScale * (style.impactPattern === 'coral' ? 1.35 : 1),
            detailScale,
            detailScale * (style.impactPattern === 'facets' ? 0.7 : 1),
          )
          setEffectInstanceColor(
            impactDetailRef.current,
            renderedImpactDetailCount,
            detail % 2 === 0 ? style.detailColorA : style.detailColorB,
            colorScratch,
          )
          renderedImpactDetailCount += 1
        }

        const shardCount =
          style.impactPattern === 'star'
            ? 4
            : style.impactPattern === 'splinters'
              ? 8
              : style.impactPattern === 'ricochet'
                ? 5
                : style.impactPattern === 'driftwood'
                  ? 7
                  : 0
        for (let detail = 0; detail < shardCount; detail += 1) {
          const seed =
            impactGeneration ^ Math.imul(slot + 1, 0x9e37_79b1) ^ Math.imul(detail + 1, 0x85eb_ca6b)
          const angle = (detail / Math.max(1, shardCount)) * TWO_PI + hashUnit(seed) * 0.28
          let shardX = impactPoint.x
          let shardY = impactPoint.y
          let shardZ = impactPoint.z
          let shardLength = 0.2
          if (style.impactPattern === 'star') {
            detailDirection
              .copy(impactSide)
              .multiplyScalar(Math.cos(angle))
              .addScaledVector(impactUp, Math.sin(angle))
              .normalize()
            const distance = (0.1 + impactProgress * 0.12) * impactEnvelope
            shardX += detailDirection.x * distance
            shardY += detailDirection.y * distance
            shardZ += detailDirection.z * distance
            shardLength = 0.34 * Math.sqrt(impactEnvelope)
          } else {
            const sideVelocity =
              (hashUnit(seed ^ 0xc2b2_ae35) * 2 - 1) *
              (style.impactPattern === 'ricochet' ? 3.8 : 2.5)
            const upVelocity =
              style.impactPattern === 'ricochet'
                ? 4.4 + hashUnit(seed ^ 0x27d4_eb2f) * 2.2
                : 1.8 + hashUnit(seed ^ 0x27d4_eb2f) * 3
            const normalVelocity =
              style.impactPattern === 'driftwood'
                ? 2 + hashUnit(seed) * 2.6
                : 1.2 + hashUnit(seed) * 2
            detailDirection
              .copy(impactNormal)
              .multiplyScalar(normalVelocity)
              .addScaledVector(impactSide, sideVelocity)
              .addScaledVector(impactUp, upVelocity)
            const age = impactEvents.age[slot]!
            shardX += detailDirection.x * age
            shardY += detailDirection.y * age - 3.4 * age * age
            shardZ += detailDirection.z * age
            detailDirection.y -= 6.8 * age
            detailDirection.normalize()
            shardLength =
              (style.impactPattern === 'driftwood' ? 0.32 : 0.24) * Math.sqrt(impactEnvelope)
          }
          quaternion.setFromUnitVectors(Y_AXIS, detailDirection)
          applyEffectInstance(
            impactShardRef.current,
            renderedImpactShardCount,
            dummy,
            shardX,
            shardY,
            shardZ,
            quaternion,
            0.027 * Math.sqrt(impactEnvelope),
            shardLength,
            0.027 * Math.sqrt(impactEnvelope),
          )
          setEffectInstanceColor(
            impactShardRef.current,
            renderedImpactShardCount,
            detail % 2 === 0 ? style.detailColorA : style.detailColorB,
            colorScratch,
          )
          renderedImpactShardCount += 1
        }
      }

      if (isBlastImpact) {
        const cloudEnvelope = (1 - impactProgress) ** 1.25
        const puffCount = style.blastPattern === 'shards' ? 4 : ZOMBIE_ESCAPE_BLAST_CLOUD_PUFF_COUNT
        for (let puff = 0; puff < puffCount; puff += 1) {
          const seed =
            impactGeneration ^ Math.imul(slot + 1, 0x9e37_79b1) ^ Math.imul(puff + 1, 0x85eb_ca6b)
          const angle = hashUnit(seed) * TWO_PI
          let radius = 0
          let height = 0
          let puffScale = 0
          if (style.blastPattern === 'geyser') {
            radius = 0.06 + hashUnit(seed ^ 0xc2b2_ae35) * 0.24
            height =
              0.08 +
              (puff / ZOMBIE_ESCAPE_BLAST_CLOUD_PUFF_COUNT) * 0.7 +
              impactProgress * (1.25 + hashUnit(seed ^ 0xd3a2_646c) * 1.15)
            puffScale =
              (0.13 + hashUnit(seed ^ 0x27d4_eb2f) * 0.22) *
              (0.85 + impactProgress * 0.72) *
              cloudEnvelope
          } else if (style.blastPattern === 'mushroom') {
            const isStem = puff < 4
            radius = isStem
              ? 0.04 + hashUnit(seed ^ 0xc2b2_ae35) * 0.1
              : 0.22 + hashUnit(seed ^ 0xc2b2_ae35) * 0.48 + impactProgress * 0.52
            height = isStem
              ? 0.08 + puff * 0.16 + impactProgress * 0.58
              : 0.52 + impactProgress * 0.72 + hashUnit(seed ^ 0xd3a2_646c) * 0.24
            puffScale =
              (isStem ? 0.16 : 0.24 + hashUnit(seed ^ 0x27d4_eb2f) * 0.24) *
              (0.72 + impactProgress * 0.9) *
              cloudEnvelope
          } else if (style.blastPattern === 'implosion') {
            const contraction = Math.max(0, 1 - impactProgress * 1.85)
            const release = Math.max(0, (impactProgress - 0.48) / 0.52)
            radius = (0.28 + hashUnit(seed ^ 0xc2b2_ae35) * 0.82) * (contraction + release * 0.46)
            height = 0.16 + hashUnit(seed ^ 0xd3a2_646c) * 0.48 + release * 0.14
            puffScale =
              (0.15 + hashUnit(seed ^ 0x27d4_eb2f) * 0.22) *
              (0.7 + Math.sin(impactProgress * Math.PI) * 1.35) *
              cloudEnvelope
          } else {
            const expansion = 0.18 + impactProgress * 0.92
            radius = (0.08 + hashUnit(seed ^ 0xc2b2_ae35) * 0.62) * expansion
            height =
              0.08 +
              hashUnit(seed ^ 0x1656_67b1) * 0.38 +
              impactProgress * (0.15 + hashUnit(seed ^ 0xd3a2_646c) * 0.32)
            puffScale =
              (0.2 + hashUnit(seed ^ 0x27d4_eb2f) * 0.3) *
              (0.52 + impactProgress * 1.42) *
              cloudEnvelope
          }
          quaternion.setFromAxisAngle(Y_AXIS, angle)
          applyEffectInstance(
            blastCloudRef.current,
            renderedBlastCloudCount,
            dummy,
            worldImpactPoint.x + Math.cos(angle) * radius,
            worldImpactPoint.y + height,
            worldImpactPoint.z + Math.sin(angle) * radius,
            quaternion,
            puffScale * style.blastCloudScale * (0.78 + hashUnit(seed ^ 0xa5a3_58cf) * 0.45),
            puffScale * style.blastCloudScale,
            puffScale * style.blastCloudScale * (0.82 + hashUnit(seed ^ 0x3c6e_f372) * 0.38),
          )
          setEffectInstanceColorScaled(
            blastCloudRef.current,
            renderedBlastCloudCount,
            puff % 3 === 0 ? style.detailColorB : style.detailColorA,
            0.28 + cloudEnvelope * 0.72,
            colorScratch,
          )
          renderedBlastCloudCount += 1
        }
        if (style.blastPattern === 'shards') {
          for (let detail = 0; detail < ZOMBIE_ESCAPE_IMPACT_DETAIL_COUNT; detail += 1) {
            const seed =
              impactGeneration ^
              Math.imul(slot + 1, 0x9e37_79b1) ^
              Math.imul(detail + 1, 0x85eb_ca6b)
            const angle = (detail / ZOMBIE_ESCAPE_IMPACT_DETAIL_COUNT) * TWO_PI
            detailDirection
              .set(Math.cos(angle), 0.25 + hashUnit(seed ^ 0xc2b2_ae35) * 0.85, Math.sin(angle))
              .normalize()
            const distance = 0.08 + impactProgress * (0.9 + hashUnit(seed) * 0.72)
            quaternion.setFromUnitVectors(Y_AXIS, detailDirection)
            const shardEnvelope = Math.sqrt(impactEnvelope)
            applyEffectInstance(
              impactShardRef.current,
              renderedImpactShardCount,
              dummy,
              worldImpactPoint.x + detailDirection.x * distance,
              worldImpactPoint.y + 0.18 + detailDirection.y * distance,
              worldImpactPoint.z + detailDirection.z * distance,
              quaternion,
              0.055 * shardEnvelope,
              (0.26 + hashUnit(seed ^ 0x27d4_eb2f) * 0.36) * shardEnvelope,
              0.055 * shardEnvelope,
            )
            setEffectInstanceColor(
              impactShardRef.current,
              renderedImpactShardCount,
              detail % 2 === 0 ? style.detailColorA : style.detailColorB,
              colorScratch,
            )
            renderedImpactShardCount += 1
          }
        }
      }

      if (shouldRenderZombieEscapeChainArc(effectKind)) {
        const arcEnvelope = Math.sqrt(impactEnvelope)
        const arcSeed = impactGeneration ^ Math.imul(slot + 1, 0x9e37_79b1)
        if (style.arcPattern === 'pulse-nodes') {
          for (let node = 0; node < ZOMBIE_ESCAPE_COIL_ARC_NODE_COUNT; node += 1) {
            resolveZombieEscapeCoilArcPoint(
              impactEvents.sourceX[slot]!,
              impactEvents.sourceY[slot]!,
              impactEvents.sourceZ[slot]!,
              impactPoint.x,
              impactPoint.y,
              impactPoint.z,
              arcSeed,
              node,
              ZOMBIE_ESCAPE_COIL_ARC_NODE_COUNT - 1,
              arcStart,
            )
            const nodePulse =
              0.55 + Math.max(0, Math.sin(node * 1.7 - impactEvents.age[slot]! * 34)) * 0.72
            const nodeScale = 0.055 * arcEnvelope * nodePulse
            quaternion.identity()
            applyEffectInstance(
              impactDetailRef.current,
              renderedImpactDetailCount,
              dummy,
              arcStart.x,
              arcStart.y,
              arcStart.z,
              quaternion,
              nodeScale,
              nodeScale,
              nodeScale,
            )
            setEffectInstanceColor(
              impactDetailRef.current,
              renderedImpactDetailCount,
              node % 2 === 0 ? style.arcColorA : style.arcColorB,
              colorScratch,
            )
            renderedImpactDetailCount += 1
          }
        } else {
          const branchCount = style.arcPattern === 'twin-fork' ? 2 : 1
          for (let branch = 0; branch < branchCount; branch += 1) {
            const branchSeed = arcSeed ^ Math.imul(branch + 1, 0xc2b2_ae35)
            for (let segment = 0; segment < ZOMBIE_ESCAPE_COIL_ARC_SEGMENT_COUNT; segment += 1) {
              if (
                style.arcPattern === 'copper-strobe' &&
                (segment + Math.floor(impactProgress * 10)) % 2 !== 0
              ) {
                continue
              }
              resolveZombieEscapeCoilArcPoint(
                impactEvents.sourceX[slot]!,
                impactEvents.sourceY[slot]!,
                impactEvents.sourceZ[slot]!,
                impactPoint.x,
                impactPoint.y,
                impactPoint.z,
                branchSeed,
                segment,
                ZOMBIE_ESCAPE_COIL_ARC_SEGMENT_COUNT,
                arcStart,
              )
              resolveZombieEscapeCoilArcPoint(
                impactEvents.sourceX[slot]!,
                impactEvents.sourceY[slot]!,
                impactEvents.sourceZ[slot]!,
                impactPoint.x,
                impactPoint.y,
                impactPoint.z,
                branchSeed,
                segment + 1,
                ZOMBIE_ESCAPE_COIL_ARC_SEGMENT_COUNT,
                arcEnd,
              )
              if (style.arcPattern === 'ion-ribbon') {
                const startProgress = segment / ZOMBIE_ESCAPE_COIL_ARC_SEGMENT_COUNT
                const endProgress = (segment + 1) / ZOMBIE_ESCAPE_COIL_ARC_SEGMENT_COUNT
                arcStart.x =
                  arcStart.x * 0.28 +
                  (impactEvents.sourceX[slot]! +
                    (impactPoint.x - impactEvents.sourceX[slot]!) * startProgress) *
                    0.72
                arcStart.y =
                  arcStart.y * 0.28 +
                  (impactEvents.sourceY[slot]! +
                    (impactPoint.y - impactEvents.sourceY[slot]!) * startProgress) *
                    0.72
                arcStart.z =
                  arcStart.z * 0.28 +
                  (impactEvents.sourceZ[slot]! +
                    (impactPoint.z - impactEvents.sourceZ[slot]!) * startProgress) *
                    0.72
                arcEnd.x =
                  arcEnd.x * 0.28 +
                  (impactEvents.sourceX[slot]! +
                    (impactPoint.x - impactEvents.sourceX[slot]!) * endProgress) *
                    0.72
                arcEnd.y =
                  arcEnd.y * 0.28 +
                  (impactEvents.sourceY[slot]! +
                    (impactPoint.y - impactEvents.sourceY[slot]!) * endProgress) *
                    0.72
                arcEnd.z =
                  arcEnd.z * 0.28 +
                  (impactEvents.sourceZ[slot]! +
                    (impactPoint.z - impactEvents.sourceZ[slot]!) * endProgress) *
                    0.72
              }
              direction.set(arcEnd.x - arcStart.x, arcEnd.y - arcStart.y, arcEnd.z - arcStart.z)
              const arcLength = direction.length()
              if (arcLength <= 0.000_001) continue
              direction.multiplyScalar(1 / arcLength)
              quaternion.setFromUnitVectors(Y_AXIS, direction)
              const arcRadius =
                style.arcPattern === 'ion-ribbon'
                  ? 0.055
                  : style.arcPattern === 'twin-fork'
                    ? 0.015
                    : style.arcPattern === 'copper-strobe'
                      ? 0.03
                      : 0.021
              applyEffectInstance(
                chainArcRef.current,
                renderedChainArcCount,
                dummy,
                (arcStart.x + arcEnd.x) * 0.5,
                (arcStart.y + arcEnd.y) * 0.5,
                (arcStart.z + arcEnd.z) * 0.5,
                quaternion,
                arcRadius * arcEnvelope,
                arcLength,
                arcRadius * arcEnvelope,
              )
              setEffectInstanceColor(
                chainArcRef.current,
                renderedChainArcCount,
                (segment + branch) % 2 === 0 ? style.arcColorA : style.arcColorB,
                colorScratch,
              )
              renderedChainArcCount += 1
            }
          }
        }
      }

      if (!shouldRenderZombieEscapeImpactSparks(effectKind, impactKind)) continue
      sparkLateral.set(-impactTravelDirection.z, 0, impactTravelDirection.x)
      if (sparkLateral.lengthSq() <= 0.000_001) sparkLateral.set(1, 0, 0)
      else sparkLateral.normalize()
      for (let spark = 0; spark < style.sparkCount; spark += 1) {
        const seed =
          impactGeneration ^ Math.imul(slot + 1, 0x9e37_79b1) ^ Math.imul(spark + 1, 0x85eb_ca6b)
        const angle = hashUnit(seed) * TWO_PI
        let speed = 1.7 + hashUnit(seed ^ 0xc2b2_ae35) * 2.8
        let velocityX = 0
        let velocityY = 0
        let velocityZ = 0
        if (style.id === 'carbine') {
          const forwardSpeed = (spark % 2 === 0 ? 1 : -0.34) * (3.8 + hashUnit(seed) * 2.2)
          const sideSpeed = (hashUnit(seed ^ 0x1656_67b1) * 2 - 1) * 1.15
          velocityX = impactTravelDirection.x * forwardSpeed + sparkLateral.x * sideSpeed
          velocityY = impactTravelDirection.y * forwardSpeed + 0.4 + hashUnit(seed) * 1.1
          velocityZ = impactTravelDirection.z * forwardSpeed + sparkLateral.z * sideSpeed
          speed = Math.hypot(velocityX, velocityY, velocityZ)
        } else if (style.id === 'scattergun') {
          const normalSpeed = 1.55 + hashUnit(seed) * 1.85
          const sideSpeed = (hashUnit(seed ^ 0x1656_67b1) * 2 - 1) * 2.15
          velocityX = worldImpactNormal.x * normalSpeed + sparkLateral.x * sideSpeed
          velocityY = 0.72 + hashUnit(seed ^ 0x27d4_eb2f) * 1.65
          velocityZ = worldImpactNormal.z * normalSpeed + sparkLateral.z * sideSpeed
          speed = Math.hypot(velocityX, velocityY, velocityZ)
        } else if (style.id === 'launcher') {
          if (style.blastPattern === 'geyser') {
            speed = 1.2 + hashUnit(seed ^ 0xc2b2_ae35) * 2
            velocityX = Math.cos(angle) * speed * 0.42
            velocityY = 5.2 + hashUnit(seed ^ 0x27d4_eb2f) * 4.6
            velocityZ = Math.sin(angle) * speed * 0.42
          } else if (style.blastPattern === 'mushroom') {
            speed = 2.2 + hashUnit(seed ^ 0xc2b2_ae35) * 2.6
            velocityX = Math.cos(angle) * speed * 0.7
            velocityY = 3.7 + hashUnit(seed ^ 0x27d4_eb2f) * 3.2
            velocityZ = Math.sin(angle) * speed * 0.7
          } else if (style.blastPattern === 'implosion') {
            speed = 2.8 + hashUnit(seed ^ 0xc2b2_ae35) * 2.4
            velocityX = -Math.cos(angle) * speed * 0.58
            velocityY = 2.6 + hashUnit(seed ^ 0x27d4_eb2f) * 2.8
            velocityZ = -Math.sin(angle) * speed * 0.58
          } else {
            speed = 4.2 + hashUnit(seed ^ 0xc2b2_ae35) * 3.2
            velocityX = Math.cos(angle) * speed
            velocityY = 2.1 + hashUnit(seed ^ 0x27d4_eb2f) * 3.8
            velocityZ = Math.sin(angle) * speed
          }
        } else if (style.id === 'coil') {
          velocityX = Math.cos(angle) * speed * 0.58 + worldImpactNormal.x * 1.1
          velocityY = 2.15 + hashUnit(seed ^ 0x27d4_eb2f) * 2.25
          velocityZ = Math.sin(angle) * speed * 0.58 + worldImpactNormal.z * 1.1
        } else {
          const normalSpeed = 1.1 + hashUnit(seed) * 1.5
          const sideSpeed = Math.cos(angle) * speed * 0.42
          velocityX = worldImpactNormal.x * normalSpeed + sparkLateral.x * sideSpeed
          velocityY = 0.82 + hashUnit(seed ^ 0x27d4_eb2f) * 1.5
          velocityZ = worldImpactNormal.z * normalSpeed + sparkLateral.z * sideSpeed
          speed = Math.hypot(velocityX, velocityY, velocityZ)
        }
        const age = impactEvents.age[slot]!
        const decay = 1 - impactProgress
        resolveZombieEscapeBallisticSample(
          worldImpactPoint.x,
          worldImpactPoint.y,
          worldImpactPoint.z,
          worldImpactNormal.x,
          worldImpactNormal.y,
          worldImpactNormal.z,
          0.015,
          velocityX,
          velocityY,
          velocityZ,
          style.id === 'launcher' ? 6.2 : 8.4,
          age,
          ballisticSample,
        )
        direction.set(
          ballisticSample.velocityX,
          ballisticSample.velocityY,
          ballisticSample.velocityZ,
        )
        if (direction.lengthSq() <= 0.000_001) direction.set(0, 1, 0)
        else direction.normalize()
        quaternion.setFromUnitVectors(Y_AXIS, direction)
        applyEffectInstance(
          sparkRef.current,
          renderedSparkCount,
          dummy,
          ballisticSample.x,
          ballisticSample.y,
          ballisticSample.z,
          quaternion,
          0.025 * decay * style.sparkScale,
          (0.1 + speed * 0.015) * decay * style.sparkScale,
          0.025 * decay * style.sparkScale,
        )
        setEffectInstanceColor(sparkRef.current, renderedSparkCount, style.sparkColor, colorScratch)
        renderedSparkCount += 1
      }
    }

    finalizeEffectInstanceMesh(travelRef.current, renderedTravelCount)
    finalizeEffectInstanceMesh(carrierAccentRef.current, renderedCarrierAccentCount)
    finalizeEffectInstanceMesh(travelDetailRef.current, renderedTravelDetailCount)
    finalizeEffectInstanceMesh(travelRibbonRef.current, renderedTravelRibbonCount)
    finalizeEffectInstanceMesh(muzzleRef.current, renderedMuzzleCount)
    finalizeEffectInstanceMesh(muzzlePetalRef.current, renderedMuzzlePetalCount)
    finalizeEffectInstanceMesh(impactFlashRef.current, renderedImpactFlashCount)
    finalizeEffectInstanceMesh(impactDetailRef.current, renderedImpactDetailCount)
    finalizeEffectInstanceMesh(impactShardRef.current, renderedImpactShardCount)
    finalizeEffectInstanceMesh(blastCloudRef.current, renderedBlastCloudCount)
    finalizeEffectInstanceMesh(chainArcRef.current, renderedChainArcCount)
    finalizeEffectInstanceMesh(sparkRef.current, renderedSparkCount)
  }, framePriority)

  const simulation = simulationRef.current
  return (
    <group
      ref={effectsRootRef}
      userData={{
        allocation: 'fixed-projectile-impact-and-blood-event-pools',
        authoritativeLifecycle: 'projectile-carriers-and-immutable-impact-events',
        bloodEventCapacity: bloodEvents.pool.capacity,
        deathDustEventCapacity: deathDustEvents.pool.capacity,
        deathDustVariant,
        impactEventCapacity: simulation.impactEvents.pool.capacity,
        muzzleOwnership: 'primary-carrier-per-volley',
        scattergunMuzzlePetalCount: ZOMBIE_ESCAPE_SCATTERGUN_MUZZLE_PETAL_COUNT,
        perEventObjectAllocation: false,
        travelingCarriersPerTrigger: 'weapon-profile',
        vfxVariantIndex,
      }}
    >
      <instancedMesh
        args={[undefined, undefined, simulation.shots.pool.capacity]}
        frustumCulled={false}
        ref={carrierAccentRef}
      >
        <sphereGeometry args={[1, 10, 6]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color="#ffffff"
          depthWrite={false}
          opacity={0.38}
          toneMapped={false}
          transparent
        />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, simulation.shots.pool.capacity]}
        frustumCulled={false}
        ref={travelRef}
      >
        <sphereGeometry args={[1, 10, 6]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color="#ffffff"
          depthWrite={false}
          opacity={0.92}
          toneMapped={false}
          transparent
        />
      </instancedMesh>
      <instancedMesh
        args={[
          undefined,
          undefined,
          simulation.shots.pool.capacity * ZOMBIE_ESCAPE_TRAVEL_DETAIL_COUNT,
        ]}
        frustumCulled={false}
        ref={travelDetailRef}
      >
        <icosahedronGeometry args={[1, 0]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color="#ffffff"
          depthWrite={false}
          opacity={0.8}
          toneMapped={false}
          transparent
        />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, simulation.shots.pool.capacity]}
        frustumCulled={false}
        ref={travelRibbonRef}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color="#ffffff"
          depthWrite={false}
          opacity={0.42}
          side={DoubleSide}
          toneMapped={false}
          transparent
        />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, simulation.shots.pool.capacity]}
        frustumCulled={false}
        ref={muzzleRef}
      >
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color="#ffffff"
          depthWrite={false}
          toneMapped={false}
          transparent
        />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, muzzlePetalCapacity]}
        frustumCulled={false}
        ref={muzzlePetalRef}
      >
        <coneGeometry args={[1, 1, 5, 1, true]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color="#ffffff"
          depthWrite={false}
          opacity={0.62}
          side={DoubleSide}
          transparent
        />
      </instancedMesh>
      <group ref={impactRootRef}>
        <instancedMesh
          args={[undefined, undefined, simulation.impactEvents.pool.capacity]}
          frustumCulled={false}
          ref={impactFlashRef}
        >
          <octahedronGeometry args={[1, 0]} />
          <meshBasicMaterial
            blending={AdditiveBlending}
            color="#ffffff"
            depthWrite={false}
            toneMapped={false}
            transparent
          />
        </instancedMesh>
        <instancedMesh
          args={[
            undefined,
            undefined,
            simulation.impactEvents.pool.capacity * ZOMBIE_ESCAPE_IMPACT_DETAIL_COUNT,
          ]}
          frustumCulled={false}
          ref={impactDetailRef}
        >
          <icosahedronGeometry args={[1, 0]} />
          <meshBasicMaterial
            blending={AdditiveBlending}
            color="#ffffff"
            depthWrite={false}
            opacity={0.72}
            toneMapped={false}
            transparent
          />
        </instancedMesh>
        <instancedMesh
          args={[
            undefined,
            undefined,
            simulation.impactEvents.pool.capacity * ZOMBIE_ESCAPE_IMPACT_DETAIL_COUNT,
          ]}
          frustumCulled={false}
          ref={impactShardRef}
        >
          <tetrahedronGeometry args={[1, 0]} />
          <meshBasicMaterial
            blending={AdditiveBlending}
            color="#ffffff"
            depthWrite={false}
            toneMapped={false}
            transparent
          />
        </instancedMesh>
        <instancedMesh
          args={[
            undefined,
            undefined,
            simulation.impactEvents.pool.capacity * ZOMBIE_ESCAPE_BLAST_CLOUD_PUFF_COUNT,
          ]}
          frustumCulled={false}
          ref={blastCloudRef}
        >
          <icosahedronGeometry args={[1, 0]} />
          <meshBasicMaterial
            blending={AdditiveBlending}
            color="#ffffff"
            depthWrite={false}
            opacity={0.42}
            toneMapped={false}
            transparent
          />
        </instancedMesh>
        <instancedMesh
          args={[
            undefined,
            undefined,
            simulation.impactEvents.pool.capacity *
              ZOMBIE_ESCAPE_COIL_ARC_SEGMENT_COUNT *
              ZOMBIE_ESCAPE_COIL_ARC_BRANCH_COUNT,
          ]}
          frustumCulled={false}
          ref={chainArcRef}
        >
          <cylinderGeometry args={[1, 1, 1, 6, 1, false]} />
          <meshBasicMaterial
            blending={AdditiveBlending}
            color="#ffffff"
            depthWrite={false}
            toneMapped={false}
            transparent
          />
        </instancedMesh>
      </group>
      <group ref={bloodRootRef}>
        <ZombieEscapeBloodPresentation
          events={bloodEvents}
          filterEventsByVariant
          getElapsedSeconds={getBloodElapsedSeconds}
          producerFramePriority={framePriority}
          resolveWorldAttachment={resolveBloodWorldAttachment}
          variant="wet-hybrid"
        />
        <ZombieEscapeBloodPresentation
          events={bloodEvents}
          filterEventsByVariant
          getElapsedSeconds={getBloodElapsedSeconds}
          ownsLifecycle={false}
          producerFramePriority={framePriority}
          resolveWorldAttachment={resolveBloodWorldAttachment}
          variant="heavy-clots"
        />
        <ZombieEscapeBloodPresentation
          events={bloodEvents}
          filterEventsByVariant
          getElapsedSeconds={getBloodElapsedSeconds}
          ownsLifecycle={false}
          producerFramePriority={framePriority}
          resolveWorldAttachment={resolveBloodWorldAttachment}
          variant="viscous-strings"
        />
      </group>
      <ZombieEscapeEffectRenderBoundary
        key={deathDustVariant}
        registry={renderReadinessRegistry}
        representativeKey="effect:death-dust"
      >
        <ZombieEscapeDeathDustPresentation
          events={deathDustEvents}
          framePriority={framePriority + 0.001}
          getElapsedSeconds={getDeathDustElapsedSeconds}
          variant={deathDustVariant}
        />
      </ZombieEscapeEffectRenderBoundary>
      <instancedMesh
        args={[
          undefined,
          undefined,
          simulation.impactEvents.pool.capacity * ZOMBIE_ESCAPE_CAPACITY.impactSparksPerShot,
        ]}
        frustumCulled={false}
        ref={sparkRef}
      >
        <tetrahedronGeometry args={[1, 0]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color="#ffffff"
          depthWrite={false}
          toneMapped={false}
          transparent
        />
      </instancedMesh>
    </group>
  )
})

function initializeEffectInstanceMesh(
  mesh: InstancedMesh | null,
  capacity: number,
  colorScratch: Color,
) {
  if (!mesh) return
  mesh.instanceMatrix.setUsage(DynamicDrawUsage)
  mesh.count = 0
  if (capacity > 0) setEffectInstanceColor(mesh, 0, 0xffffff, colorScratch)
  mesh.instanceColor?.setUsage(DynamicDrawUsage)
}

function applyEffectInstance(
  mesh: InstancedMesh | null,
  index: number,
  dummy: Object3D,
  x: number,
  y: number,
  z: number,
  quaternion: Quaternion,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
) {
  if (!mesh) return
  dummy.position.set(x, y, z)
  dummy.quaternion.copy(quaternion)
  dummy.scale.set(scaleX, scaleY, scaleZ)
  dummy.updateMatrix()
  mesh.setMatrixAt(index, dummy.matrix)
}

function setEffectInstanceColor(
  mesh: InstancedMesh | null,
  index: number,
  color: number,
  colorScratch: Color,
) {
  if (!mesh) return
  colorScratch.setHex(color)
  mesh.setColorAt(index, colorScratch)
}

function setEffectInstanceColorScaled(
  mesh: InstancedMesh | null,
  index: number,
  color: number,
  intensity: number,
  colorScratch: Color,
) {
  if (!mesh) return
  colorScratch.setHex(color).multiplyScalar(Math.max(0, intensity))
  mesh.setColorAt(index, colorScratch)
}

function finalizeEffectInstanceMesh(mesh: InstancedMesh | null, count: number) {
  if (!mesh) return
  mesh.count = Math.min(mesh.instanceMatrix.count, Math.max(0, count))
  if (mesh.count === 0) return
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

function hashUnit(seed: number) {
  let value = seed >>> 0
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d)
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b)
  value ^= value >>> 16
  return (value >>> 0) / 4_294_967_296
}
