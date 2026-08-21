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
import { ZOMBIE_ESCAPE_CAPACITY, ZOMBIE_ESCAPE_SIMULATION } from './zombie-escape-config'
import {
  createZombieEscapeBallisticSample,
  createZombieEscapeImpactAttachment,
  resolveZombieEscapeBallisticSample,
  resolveZombieEscapeImpactAttachment,
} from './zombie-escape-impact-attachment'
import {
  createZombieEscapePresentationPose,
  resolveZombieEscapePresentationPose,
} from './zombie-escape-presentation-pose'
import {
  ZOMBIE_ESCAPE_SHOT_IMPACT_KIND,
  ZOMBIE_ESCAPE_SHOT_PHASE,
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
const BLOOD_BLOTS_PER_SHOT = 2
const BLOOD_DROPLETS_PER_SHOT = 6
const Y_AXIS = new Vector3(0, 1, 0)
const Z_AXIS = new Vector3(0, 0, 1)

export function ZombieEscapeEffects({
  framePriority = -16,
  impactVisualRegistry,
  simulationRef,
}: {
  framePriority?: number
  impactVisualRegistry: ZombieEscapeImpactVisualRegistry
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}) {
  const effectsRootRef = useRef<Group>(null)
  const travelRef = useRef<InstancedMesh>(null)
  const muzzleRef = useRef<InstancedMesh>(null)
  const impactFlashRef = useRef<InstancedMesh>(null)
  const impactRingRef = useRef<InstancedMesh>(null)
  const bloodBlotRef = useRef<InstancedMesh>(null)
  const bloodDropletRef = useRef<InstancedMesh>(null)
  const bloodVisibleRef = useRef(new Uint8Array(simulationRef.current.shots.pool.capacity))
  const skinnedImpactAttachments = useMemo(
    () =>
      Array.from({ length: simulationRef.current.shots.pool.capacity }, () =>
        createZombieEscapeSkinnedImpactAttachment(),
      ),
    [simulationRef],
  )
  const sparkRef = useRef<InstancedMesh>(null)
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
  const splashTangent = useMemo(() => new Vector3(), [])
  const splashBitangent = useMemo(() => new Vector3(), [])
  const quaternion = useMemo(() => new Quaternion(), [])
  const effectsWorldQuaternion = useMemo(() => new Quaternion(), [])
  const inverseEffectsWorldQuaternion = useMemo(() => new Quaternion(), [])
  const rollQuaternion = useMemo(() => new Quaternion(), [])

  useLayoutEffect(() => {
    for (const mesh of [
      travelRef.current,
      muzzleRef.current,
      impactFlashRef.current,
      impactRingRef.current,
      bloodBlotRef.current,
      bloodDropletRef.current,
      sparkRef.current,
    ]) {
      mesh?.instanceMatrix.setUsage(DynamicDrawUsage)
    }
    for (let slot = 0; slot < simulationRef.current.shots.pool.capacity; slot += 1) {
      for (let blot = 0; blot < BLOOD_BLOTS_PER_SHOT; blot += 1) {
        hideEffectInstance(bloodBlotRef.current, slot * BLOOD_BLOTS_PER_SHOT + blot, dummy)
      }
      for (let droplet = 0; droplet < BLOOD_DROPLETS_PER_SHOT; droplet += 1) {
        hideEffectInstance(bloodDropletRef.current, slot * BLOOD_DROPLETS_PER_SHOT + droplet, dummy)
      }
    }
    markEffectInstanceMeshDirty(bloodBlotRef.current)
    markEffectInstanceMeshDirty(bloodDropletRef.current)
  }, [dummy, simulationRef])

  useFrame(() => {
    const simulation = simulationRef.current
    const shots = simulation.shots
    const effectsRoot = effectsRootRef.current
    if (effectsRoot) {
      effectsRoot.updateWorldMatrix(true, false)
      effectsRoot.getWorldQuaternion(effectsWorldQuaternion)
      inverseEffectsWorldQuaternion.copy(effectsWorldQuaternion).invert()
    }
    let bloodBlotDirty = false
    let bloodDropletDirty = false
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
              0,
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
          const skinnedAttachment = skinnedImpactAttachments[slot]!
          if (
            effectsRoot &&
            shots.impactKind[slot] === ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy &&
            targetSlot >= 0 &&
            simulation.zombies.pool.active[targetSlot] !== 0 &&
            simulation.zombies.pool.generation[targetSlot] === targetGeneration &&
            skinnedAttachment.shotGeneration !== shotGeneration
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
              shotGeneration,
              attachmentWorldRayStart,
              attachmentWorldRayEnd,
              attachmentWorldNormal,
              skinnedAttachment,
            )
          }
          if (
            effectsRoot &&
            shots.impactKind[slot] === ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy &&
            skinnedAttachment.shotGeneration === shotGeneration &&
            resolveZombieEscapeSkinnedImpact(
              impactVisualRegistry,
              skinnedAttachment,
              attachmentWorldPoint,
              attachmentWorldNormal,
            )
          ) {
            effectsRoot.worldToLocal(attachmentWorldPoint)
            impactPoint.copy(attachmentWorldPoint)
            impactNormal
              .copy(attachmentWorldNormal)
              .applyQuaternion(inverseEffectsWorldQuaternion)
              .normalize()
          }
        }
        if (shotAge < ZOMBIE_ESCAPE_SIMULATION.muzzleFlashSeconds) {
          const muzzleProgress = shotAge / ZOMBIE_ESCAPE_SIMULATION.muzzleFlashSeconds
          const muzzleEnvelope = Math.sin(Math.PI * muzzleProgress) * (1 - muzzleProgress * 0.25)
          quaternion.setFromUnitVectors(Y_AXIS, direction)
          applyEffectInstance(
            muzzleRef.current,
            slot,
            dummy,
            shots.originX[slot]! + direction.x * 0.08,
            shots.originY[slot]! + direction.y * 0.08,
            shots.originZ[slot]! + direction.z * 0.08,
            quaternion,
            0.14 * muzzleEnvelope,
            0.38 * muzzleEnvelope,
            0.14 * muzzleEnvelope,
          )
        }

        if (phase === ZOMBIE_ESCAPE_SHOT_PHASE.travel) {
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
          quaternion.setFromUnitVectors(Y_AXIS, direction)
          applyEffectInstance(
            travelRef.current,
            slot,
            dummy,
            (shots.previousX[slot]! + shots.x[slot]!) * 0.5,
            (shots.previousY[slot]! + shots.y[slot]!) * 0.5,
            (shots.previousZ[slot]! + shots.z[slot]!) * 0.5,
            quaternion,
            0.065,
            Math.max(0.12, travelLength * 0.5 + 0.055),
            0.065,
          )
        } else if (
          phase === ZOMBIE_ESCAPE_SHOT_PHASE.impact &&
          shots.impactKind[slot] !== ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.expired
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

          if (shots.impactKind[slot] === ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy) {
            if (Math.abs(impactNormal.y) < 0.92) {
              splashTangent.crossVectors(Y_AXIS, impactNormal).normalize()
            } else {
              splashTangent.crossVectors(Z_AXIS, impactNormal).normalize()
            }
            splashBitangent.crossVectors(impactNormal, splashTangent).normalize()

            const generation = shots.pool.generation[slot] ?? 0
            const splashEnvelope = Math.sqrt(impactEnvelope)
            for (let blot = 0; blot < BLOOD_BLOTS_PER_SHOT; blot += 1) {
              const instance = slot * BLOOD_BLOTS_PER_SHOT + blot
              const seed =
                generation ^ Math.imul(slot + 1, 0x632b_e59b) ^ Math.imul(blot + 1, 0x8515_7af5)
              const angle = hashUnit(seed) * TWO_PI
              const spread =
                (0.025 + hashUnit(seed ^ 0xa511_e9b3) * 0.09) * (0.25 + impactProgress * 0.75)
              const blotScale =
                (0.085 + hashUnit(seed ^ 0x63d8_35f1) * 0.055) *
                Math.min(1, 0.45 + impactProgress * 8) *
                splashEnvelope
              quaternion.setFromUnitVectors(Z_AXIS, impactNormal)
              rollQuaternion.setFromAxisAngle(Z_AXIS, angle)
              quaternion.multiply(rollQuaternion)
              applyEffectInstance(
                bloodBlotRef.current,
                instance,
                dummy,
                impactPoint.x +
                  impactNormal.x * 0.026 +
                  splashTangent.x * Math.cos(angle) * spread +
                  splashBitangent.x * Math.sin(angle) * spread,
                impactPoint.y +
                  impactNormal.y * 0.026 +
                  splashTangent.y * Math.cos(angle) * spread +
                  splashBitangent.y * Math.sin(angle) * spread,
                impactPoint.z +
                  impactNormal.z * 0.026 +
                  splashTangent.z * Math.cos(angle) * spread +
                  splashBitangent.z * Math.sin(angle) * spread,
                quaternion,
                blotScale,
                blotScale * (0.58 + hashUnit(seed ^ 0xc2b2_ae35) * 0.24),
                1,
              )
            }
            bloodBlotDirty = true

            if (Math.abs(worldImpactNormal.y) < 0.92) {
              splashTangent.crossVectors(Y_AXIS, worldImpactNormal).normalize()
            } else {
              splashTangent.crossVectors(Z_AXIS, worldImpactNormal).normalize()
            }
            splashBitangent.crossVectors(worldImpactNormal, splashTangent).normalize()
            for (let droplet = 0; droplet < BLOOD_DROPLETS_PER_SHOT; droplet += 1) {
              const instance = slot * BLOOD_DROPLETS_PER_SHOT + droplet
              const seed =
                generation ^ Math.imul(slot + 1, 0x9e37_79b1) ^ Math.imul(droplet + 1, 0x85eb_ca6b)
              const angle = hashUnit(seed) * TWO_PI
              const radialSpeed = 0.55 + hashUnit(seed ^ 0x27d4_eb2f) * 1.05
              const outwardSpeed = 0.25 + hashUnit(seed ^ 0x1656_67b1) * 0.55
              const upwardSpeed = 0.35 + hashUnit(seed ^ 0xd3a2_646c) * 0.95
              const radialX =
                splashTangent.x * Math.cos(angle) + splashBitangent.x * Math.sin(angle)
              const radialY =
                splashTangent.y * Math.cos(angle) + splashBitangent.y * Math.sin(angle)
              const radialZ =
                splashTangent.z * Math.cos(angle) + splashBitangent.z * Math.sin(angle)
              const velocityX = radialX * radialSpeed + worldImpactNormal.x * outwardSpeed
              const velocityY =
                radialY * radialSpeed + worldImpactNormal.y * outwardSpeed + upwardSpeed
              const velocityZ = radialZ * radialSpeed + worldImpactNormal.z * outwardSpeed
              const age = shots.impactAge[slot]!
              resolveZombieEscapeBallisticSample(
                worldImpactPoint.x,
                worldImpactPoint.y,
                worldImpactPoint.z,
                worldImpactNormal.x,
                worldImpactNormal.y,
                worldImpactNormal.z,
                0.03,
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
              const dropletRadius = (0.018 + hashUnit(seed ^ 0xfd70_46c5) * 0.018) * splashEnvelope
              applyEffectInstance(
                bloodDropletRef.current,
                instance,
                dummy,
                ballisticSample.x,
                ballisticSample.y,
                ballisticSample.z,
                quaternion,
                dropletRadius,
                dropletRadius * (1.5 + hashUnit(seed ^ 0xb55a_4f09) * 1.15),
                dropletRadius,
              )
            }
            bloodDropletDirty = true
            bloodVisibleRef.current[slot] = 1
          }
        }
      }

      const bloodVisible =
        active &&
        phase === ZOMBIE_ESCAPE_SHOT_PHASE.impact &&
        shots.impactKind[slot] === ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.enemy
      if (!bloodVisible && bloodVisibleRef.current[slot] !== 0) {
        for (let blot = 0; blot < BLOOD_BLOTS_PER_SHOT; blot += 1) {
          hideEffectInstance(bloodBlotRef.current, slot * BLOOD_BLOTS_PER_SHOT + blot, dummy)
        }
        for (let droplet = 0; droplet < BLOOD_DROPLETS_PER_SHOT; droplet += 1) {
          hideEffectInstance(
            bloodDropletRef.current,
            slot * BLOOD_DROPLETS_PER_SHOT + droplet,
            dummy,
          )
        }
        bloodBlotDirty = true
        bloodDropletDirty = true
        bloodVisibleRef.current[slot] = 0
      }

      for (let spark = 0; spark < ZOMBIE_ESCAPE_CAPACITY.impactSparksPerShot; spark += 1) {
        const instance = slot * ZOMBIE_ESCAPE_CAPACITY.impactSparksPerShot + spark
        if (
          !active ||
          phase !== ZOMBIE_ESCAPE_SHOT_PHASE.impact ||
          shots.impactKind[slot] === ZOMBIE_ESCAPE_SHOT_IMPACT_KIND.expired
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
    if (bloodBlotDirty) markEffectInstanceMeshDirty(bloodBlotRef.current)
    if (bloodDropletDirty) markEffectInstanceMeshDirty(bloodDropletRef.current)
    markEffectInstanceMeshDirty(sparkRef.current)
  }, framePriority)

  const simulation = simulationRef.current
  return (
    <group
      ref={effectsRootRef}
      userData={{
        allocation: 'fixed-shot-event-pool',
        authoritativeLifecycle: 'inactive-travel-impact',
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
      <instancedMesh
        args={[undefined, undefined, simulation.shots.pool.capacity * BLOOD_BLOTS_PER_SHOT]}
        frustumCulled={false}
        ref={bloodBlotRef}
      >
        <circleGeometry args={[1, 7]} />
        <meshBasicMaterial color="#981b36" side={DoubleSide} toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, simulation.shots.pool.capacity * BLOOD_DROPLETS_PER_SHOT]}
        frustumCulled={false}
        ref={bloodDropletRef}
      >
        <dodecahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color="#c4264d" toneMapped={false} />
      </instancedMesh>
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
