'use client'

import { useFrame } from '@react-three/fiber'
import { type MutableRefObject, useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
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
import { ZOMBIE_ESCAPE_CAPACITY, ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'
import {
  createZombieEscapeBallisticSample,
  createZombieEscapeImpactAttachment,
  resolveZombieEscapeBallisticSample,
  resolveZombieEscapeImpactAttachment,
} from './zombie-escape-impact-attachment'
import {
  createZombieEscapeMuzzleFlashTransform,
  resolveZombieEscapeMuzzleFlashTransform,
} from './zombie-escape-muzzle-flash'
import {
  createZombieEscapePresentationPose,
  resolveZombieEscapePresentationPose,
} from './zombie-escape-presentation-pose'
import type { ZombieEscapeRenderReadinessRegistry } from './zombie-escape-render-readiness'
import { useZombieEscapeRenderRepresentative } from './zombie-escape-render-readiness-react'
import {
  ZOMBIE_ESCAPE_SHOT_IMPACT_KIND,
  ZOMBIE_ESCAPE_SHOT_PHASE,
  type ZombieEscapeShotImpactKind,
  type ZombieEscapeShotPhase,
  type ZombieEscapeSimulation,
} from './zombie-escape-simulation'
import {
  captureZombieEscapeSkinnedImpact,
  createZombieEscapeSkinnedImpactAttachment,
  resolveZombieEscapeSkinnedImpact,
  type ZombieEscapeImpactVisualRegistry,
} from './zombie-escape-skinned-impact-attachment'

const HIDDEN_Y = -100
const TWO_PI = Math.PI * 2
const Y_AXIS = new Vector3(0, 1, 0)
const Z_AXIS = new Vector3(0, 0, 1)

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

export function shouldRenderZombieEscapeGenericImpact(impactKind: ZombieEscapeShotImpactKind) {
  return impactKind === ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.environment
}

export function ZombieEscapeEffects({
  framePriority = -16,
  impactVisualRegistry,
  renderReadinessRegistry,
  simulationRef,
}: {
  framePriority?: number
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}) {
  const effectsRootRef = useRef<Group>(null)
  const travelRef = useRef<InstancedMesh>(null)
  const muzzleRef = useRef<InstancedMesh>(null)
  const impactFlashRef = useRef<InstancedMesh>(null)
  const impactRingRef = useRef<InstancedMesh>(null)
  const impactRootRef = useRef<Group>(null)
  const bloodRootRef = useRef<Group>(null)
  const bloodEvents = useMemo(
    () => createZombieEscapeBloodEventPool(simulationRef.current.shots.pool.capacity),
    [simulationRef],
  )
  const observedBloodShotGenerationRef = useRef(
    new Uint32Array(simulationRef.current.shots.pool.capacity),
  )
  const previousSimulationElapsedRef = useRef(simulationRef.current.elapsedSeconds)
  const skinnedBloodAttachments = useMemo(
    () =>
      Array.from({ length: bloodEvents.pool.capacity }, () =>
        createZombieEscapeSkinnedImpactAttachment(),
      ),
    [bloodEvents.pool.capacity],
  )
  const sparkRef = useRef<InstancedMesh>(null)
  useZombieEscapeRenderRepresentative(renderReadinessRegistry, 'effect:tracer', travelRef)
  useZombieEscapeRenderRepresentative(renderReadinessRegistry, 'effect:muzzle', muzzleRef)
  useZombieEscapeRenderRepresentative(renderReadinessRegistry, 'effect:impact', impactRootRef)
  useZombieEscapeRenderRepresentative(renderReadinessRegistry, 'effect:blood', bloodRootRef)
  useZombieEscapeRenderRepresentative(renderReadinessRegistry, 'effect:sparks', sparkRef)
  const dummy = useMemo(() => new Object3D(), [])
  const direction = useMemo(() => new Vector3(), [])
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
  const muzzleFlashTransform = useMemo(() => createZombieEscapeMuzzleFlashTransform(), [])
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
  const quaternion = useMemo(() => new Quaternion(), [])
  const effectsWorldQuaternion = useMemo(() => new Quaternion(), [])
  const getBloodElapsedSeconds = useMemo(
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
    for (const mesh of [
      travelRef.current,
      muzzleRef.current,
      impactFlashRef.current,
      impactRingRef.current,
      sparkRef.current,
    ]) {
      mesh?.instanceMatrix.setUsage(DynamicDrawUsage)
    }
  }, [])

  useFrame(() => {
    const simulation = simulationRef.current
    const shots = simulation.shots
    if (simulation.elapsedSeconds < previousSimulationElapsedRef.current) {
      observedBloodShotGenerationRef.current.fill(0)
    }
    previousSimulationElapsedRef.current = simulation.elapsedSeconds
    const effectsRoot = effectsRootRef.current
    if (effectsRoot) {
      effectsRoot.updateWorldMatrix(true, false)
      effectsRoot.getWorldQuaternion(effectsWorldQuaternion)
    }
    for (let slot = 0; slot < shots.pool.capacity; slot += 1) {
      hideEffectInstance(travelRef.current, slot, dummy)
      hideEffectInstance(muzzleRef.current, slot, dummy)
      hideEffectInstance(impactFlashRef.current, slot, dummy)
      hideEffectInstance(impactRingRef.current, slot, dummy)

      const active = shots.pool.active[slot] !== 0
      const phase = shots.phase[slot]
      if (active) {
        direction.set(shots.directionX[slot]!, shots.directionY[slot]!, shots.directionZ[slot]!)
        if (direction.lengthSq() <= 0.000_001) direction.set(0, 0, -1)
        else direction.normalize()

        const shotAge = shots.travelAge[slot]! + shots.impactAge[slot]!
        if (phase === ZOMBIE_ESCAPE_SHOT_PHASE.impact) {
          worldImpactPoint.set(shots.hitX[slot]!, shots.hitY[slot]!, shots.hitZ[slot]!)
          worldImpactNormal.set(
            shots.hitNormalX[slot]!,
            shots.hitNormalY[slot]!,
            shots.hitNormalZ[slot]!,
          )
          impactPoint.copy(worldImpactPoint)
          impactNormal.copy(worldImpactNormal)
          const targetSlot = shots.hitTargetSlot[slot]!
          if (
            shots.impactKind[slot] === ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy &&
            targetSlot >= 0 &&
            simulation.zombies.pool.active[targetSlot] !== 0 &&
            simulation.zombies.pool.generation[targetSlot] === shots.hitTargetGeneration[slot]
          ) {
            resolveZombieEscapePresentationPose(
              simulation.zombies.x[targetSlot]!,
              simulation.zombies.y[targetSlot]!,
              simulation.zombies.z[targetSlot]!,
              simulation.zombies.heading[targetSlot]!,
              simulation.zombies.hitReaction[targetSlot]!,
              simulation.zombies.hitImpulseX[targetSlot]!,
              simulation.zombies.hitImpulseY[targetSlot]!,
              simulation.zombies.hitImpulseZ[targetSlot]!,
              presentationPose,
            )
            resolveZombieEscapeImpactAttachment(
              shots.hitLocalX[slot]!,
              shots.hitLocalY[slot]!,
              shots.hitLocalZ[slot]!,
              shots.hitLocalNormalX[slot]!,
              shots.hitLocalNormalY[slot]!,
              shots.hitLocalNormalZ[slot]!,
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

          const targetGeneration = shots.hitTargetGeneration[slot]!
          const shotGeneration = shots.pool.generation[slot]!
          if (
            shots.impactKind[slot] === ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy &&
            observedBloodShotGenerationRef.current[slot] !== shotGeneration
          ) {
            observedBloodShotGenerationRef.current[slot] = shotGeneration
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
              shotGeneration,
              slot,
              targetGeneration,
            )
            bloodEventScratch.spawnElapsedSeconds = Math.max(
              0,
              simulation.elapsedSeconds - shots.impactAge[slot]!,
            )
            bloodEventScratch.targetGeneration = targetGeneration
            bloodEventScratch.targetSlot = targetSlot
            const bloodTravelX = shots.hitX[slot]! - shots.originX[slot]!
            const bloodTravelY = shots.hitY[slot]! - shots.originY[slot]!
            const bloodTravelZ = shots.hitZ[slot]! - shots.originZ[slot]!
            bloodEventScratch.variantCode = resolveZombieEscapeBloodHitVariantCode(
              shots.damage[slot]!,
              bloodTravelX * bloodTravelX +
                bloodTravelY * bloodTravelY +
                bloodTravelZ * bloodTravelZ,
            )
            const bloodEventSlot = spawnZombieEscapeBloodEvent(bloodEvents, bloodEventScratch)
            const skinnedAttachment = skinnedBloodAttachments[bloodEventSlot]!
            if (
              effectsRoot &&
              targetSlot >= 0 &&
              simulation.zombies.pool.active[targetSlot] !== 0 &&
              simulation.zombies.pool.generation[targetSlot] === targetGeneration
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
        }
        if (shotAge < ZOMBIE_ESCAPE_SIMULATION.muzzleFlashSeconds) {
          const muzzleProgress = shotAge / ZOMBIE_ESCAPE_SIMULATION.muzzleFlashSeconds
          const muzzleEnvelope = Math.sin(Math.PI * muzzleProgress) * (1 - muzzleProgress * 0.25)
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
          quaternion.setFromUnitVectors(Y_AXIS, direction)
          applyEffectInstance(
            muzzleRef.current,
            slot,
            dummy,
            muzzleFlashTransform.x,
            muzzleFlashTransform.y,
            muzzleFlashTransform.z,
            quaternion,
            muzzleFlashTransform.scaleX,
            muzzleFlashTransform.scaleY,
            muzzleFlashTransform.scaleZ,
          )
        }

        if (
          shouldRenderZombieEscapeTracer(
            phase as ZombieEscapeShotPhase,
            shots.impactKind[slot] as ZombieEscapeShotImpactKind,
          )
        ) {
          direction.set(
            shots.x[slot]! - shots.previousX[slot]!,
            shots.y[slot]! - shots.previousY[slot]!,
            shots.z[slot]! - shots.previousZ[slot]!,
          )
          const travelLength = direction.length()
          if (travelLength <= 0.000_1) {
            direction.set(shots.directionX[slot]!, shots.directionY[slot]!, shots.directionZ[slot]!)
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
          quaternion.setFromUnitVectors(Y_AXIS, direction)
          applyEffectInstance(
            travelRef.current,
            slot,
            dummy,
            (shots.previousX[slot]! + shots.x[slot]!) * 0.5,
            (shots.previousY[slot]! + shots.y[slot]!) * 0.5,
            (shots.previousZ[slot]! + shots.z[slot]!) * 0.5,
            quaternion,
            0.065 * tracerEnvelope,
            Math.max(0.12, travelLength * 0.5 + 0.055),
            0.065 * tracerEnvelope,
          )
        }
        if (
          phase === ZOMBIE_ESCAPE_SHOT_PHASE.impact &&
          shouldRenderZombieEscapeGenericImpact(
            shots.impactKind[slot] as ZombieEscapeShotImpactKind,
          )
        ) {
          const impactProgress = Math.min(
            1,
            shots.impactAge[slot]! / ZOMBIE_ESCAPE_SIMULATION.impactLifetimeSeconds,
          )
          const impactEnvelope = 1 - impactProgress
          quaternion.setFromUnitVectors(Z_AXIS, impactNormal)
          applyEffectInstance(
            impactFlashRef.current,
            slot,
            dummy,
            impactPoint.x + impactNormal.x * 0.012,
            impactPoint.y + impactNormal.y * 0.012,
            impactPoint.z + impactNormal.z * 0.012,
            quaternion,
            0.34 * impactEnvelope,
            0.34 * impactEnvelope,
            1,
          )
          quaternion.setFromUnitVectors(Z_AXIS, impactNormal)
          const ringScale = (0.22 + impactProgress * 0.92) * Math.sqrt(impactEnvelope)
          applyEffectInstance(
            impactRingRef.current,
            slot,
            dummy,
            impactPoint.x + impactNormal.x * 0.014,
            impactPoint.y + impactNormal.y * 0.014,
            impactPoint.z + impactNormal.z * 0.014,
            quaternion,
            ringScale,
            ringScale,
            ringScale,
          )
        }
      }

      for (let spark = 0; spark < ZOMBIE_ESCAPE_CAPACITY.impactSparksPerShot; spark += 1) {
        const instance = slot * ZOMBIE_ESCAPE_CAPACITY.impactSparksPerShot + spark
        if (
          !active ||
          phase !== ZOMBIE_ESCAPE_SHOT_PHASE.impact ||
          !shouldRenderZombieEscapeGenericImpact(
            shots.impactKind[slot] as ZombieEscapeShotImpactKind,
          )
        ) {
          hideEffectInstance(sparkRef.current, instance, dummy)
          continue
        }
        const generation = shots.pool.generation[slot] ?? 0
        const seed =
          generation ^ Math.imul(slot + 1, 0x9e37_79b1) ^ Math.imul(spark + 1, 0x85eb_ca6b)
        const angle = hashUnit(seed) * TWO_PI
        const speed = 1.7 + hashUnit(seed ^ 0xc2b2_ae35) * 2.8
        const upwardSpeed = 1.25 + hashUnit(seed ^ 0x27d4_eb2f) * 2.15
        const age = shots.impactAge[slot]!
        const decay = Math.max(0, 1 - age / ZOMBIE_ESCAPE_SIMULATION.impactLifetimeSeconds)
        const velocityX = Math.cos(angle) * speed + worldImpactNormal.x * 0.72
        const velocityY = upwardSpeed + worldImpactNormal.y * 0.72
        const velocityZ = Math.sin(angle) * speed + worldImpactNormal.z * 0.72
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
          8.4,
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
          instance,
          dummy,
          ballisticSample.x,
          ballisticSample.y,
          ballisticSample.z,
          quaternion,
          0.025 * decay,
          (0.1 + speed * 0.015) * decay,
          0.025 * decay,
        )
      }
    }

    markEffectInstanceMeshDirty(travelRef.current)
    markEffectInstanceMeshDirty(muzzleRef.current)
    markEffectInstanceMeshDirty(impactFlashRef.current)
    markEffectInstanceMeshDirty(impactRingRef.current)
    markEffectInstanceMeshDirty(sparkRef.current)
  }, framePriority)

  const simulation = simulationRef.current
  return (
    <group
      ref={effectsRootRef}
      userData={{
        allocation: 'fixed-shot-and-blood-event-pools',
        authoritativeLifecycle: 'inactive-travel-impact',
        bloodEventCapacity: bloodEvents.pool.capacity,
        perShotObjectAllocation: false,
        travelingCarriersPerShot: 1,
      }}
    >
      <instancedMesh
        args={[undefined, undefined, simulation.shots.pool.capacity]}
        frustumCulled={false}
        ref={travelRef}
      >
        <sphereGeometry args={[1, 10, 6]} />
        <meshBasicMaterial
          blending={AdditiveBlending}
          color="#fff1a6"
          depthWrite={false}
          opacity={0.92}
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
          color="#fff7c4"
          depthWrite={false}
          toneMapped={false}
          transparent
        />
      </instancedMesh>
      <group ref={impactRootRef}>
        <instancedMesh
          args={[undefined, undefined, simulation.shots.pool.capacity]}
          frustumCulled={false}
          ref={impactFlashRef}
        >
          <circleGeometry args={[1, 12]} />
          <meshBasicMaterial
            blending={AdditiveBlending}
            color="#fff1a0"
            depthWrite={false}
            side={DoubleSide}
            toneMapped={false}
            transparent
          />
        </instancedMesh>
        <instancedMesh
          args={[undefined, undefined, simulation.shots.pool.capacity]}
          frustumCulled={false}
          ref={impactRingRef}
        >
          <ringGeometry args={[0.55, 1, 18]} />
          <meshBasicMaterial
            blending={AdditiveBlending}
            color="#ff8c5c"
            depthWrite={false}
            side={DoubleSide}
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
      <instancedMesh
        args={[
          undefined,
          undefined,
          simulation.shots.pool.capacity * ZOMBIE_ESCAPE_CAPACITY.impactSparksPerShot,
        ]}
        frustumCulled={false}
        ref={sparkRef}
      >
        <tetrahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color="#ffcb67" depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </group>
  )
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

function hideEffectInstance(mesh: InstancedMesh | null, index: number, dummy: Object3D) {
  if (!mesh) return
  dummy.position.set(0, HIDDEN_Y, 0)
  dummy.quaternion.identity()
  dummy.scale.set(0, 0, 0)
  dummy.updateMatrix()
  mesh.setMatrixAt(index, dummy.matrix)
}

function markEffectInstanceMeshDirty(mesh: InstancedMesh | null) {
  if (mesh) mesh.instanceMatrix.needsUpdate = true
}

function hashUnit(seed: number) {
  let value = seed >>> 0
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d)
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b)
  value ^= value >>> 16
  return (value >>> 0) / 4_294_967_296
}
