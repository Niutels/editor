'use client'

import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  DoubleSide,
  DynamicDrawUsage,
  type Group,
  type InstancedMesh,
  Matrix3,
  Matrix4,
  Object3D,
  Quaternion,
  Shape,
  Vector3,
} from 'three'
import {
  deriveZombieEscapeBloodParticleSeed,
  reconcileZombieEscapeBloodEventPool,
  resolveZombieEscapeBloodEnvelope,
  type ZombieEscapeBloodEnvelope,
  type ZombieEscapeBloodEventPool,
  zombieEscapeBloodHashUnit,
} from './zombie-escape-blood-effects'
import {
  DEFAULT_ZOMBIE_ESCAPE_BLOOD_VARIANT,
  getZombieEscapeBloodVariantProfile,
  ZOMBIE_ESCAPE_BLOOD_MAX_DROPLET_COUNT,
  ZOMBIE_ESCAPE_BLOOD_MAX_RESIDUE_COUNT,
  ZOMBIE_ESCAPE_BLOOD_MAX_SPLASH_COUNT,
  type ZombieEscapeBloodVariant,
  type ZombieEscapeBloodVariantProfile,
} from './zombie-escape-blood-variants'
import {
  createZombieEscapeBallisticSample,
  resolveZombieEscapeBallisticSample,
} from './zombie-escape-impact-attachment'
import type { ZombieEscapeRenderReadinessRegistry } from './zombie-escape-render-readiness'
import { useZombieEscapeRenderRepresentative } from './zombie-escape-render-readiness-react'

const BLOOD_FRAME_PHASE_OFFSET = 0.01
const HIDDEN_Y = -100
const TWO_PI = Math.PI * 2
const Y_AXIS = new Vector3(0, 1, 0)
const Z_AXIS = new Vector3(0, 0, 1)
const BLOOD_STAIN_SHAPE = createBloodStainShape()

export type ZombieEscapeBloodPresentationLayer = 'droplet' | 'residue' | 'splash'

export type ZombieEscapeBloodWorldAttachmentResolver = (
  eventSlot: number,
  eventGeneration: number,
  targetSlot: number,
  targetGeneration: number,
  outputWorldPoint: Vector3,
  outputWorldNormal: Vector3,
) => boolean

export function resolveZombieEscapeBloodFramePriorities(producerFramePriority: number) {
  return {
    lifecycle: producerFramePriority - BLOOD_FRAME_PHASE_OFFSET,
    presentation: producerFramePriority + BLOOD_FRAME_PHASE_OFFSET,
  }
}

export function resolveZombieEscapeBloodSlotAction(active: boolean, wasVisible: boolean) {
  if (active) return 'render' as const
  return wasVisible ? ('hide' as const) : ('idle' as const)
}

export function isZombieEscapeBloodPoolVisible(activeCount: number) {
  return Number.isFinite(activeCount) && activeCount > 0
}

export function doesZombieEscapeBloodEventMatchVariant(
  eventVariantCode: number,
  presentationVariantCode: number,
) {
  return eventVariantCode === presentationVariantCode
}

export function shouldAttachZombieEscapeBloodLayer(layer: ZombieEscapeBloodPresentationLayer) {
  return layer === 'residue'
}

export function isZombieEscapeBloodAttachmentGenerationCurrent(
  eventGeneration: number,
  attachmentGeneration: number,
) {
  return eventGeneration !== 0 && eventGeneration === attachmentGeneration
}

export function transformZombieEscapeBloodWorldAttachmentToLocal(
  rootWorldMatrix: Matrix4,
  worldPoint: Vector3,
  worldNormal: Vector3,
  outputLocalPoint: Vector3,
  outputLocalNormal: Vector3,
  inverseWorldMatrix: Matrix4,
  worldToLocalNormalMatrix: Matrix3,
) {
  inverseWorldMatrix.copy(rootWorldMatrix).invert()
  outputLocalPoint.copy(worldPoint).applyMatrix4(inverseWorldMatrix)
  worldToLocalNormalMatrix.setFromMatrix4(rootWorldMatrix).transpose()
  outputLocalNormal.copy(worldNormal).applyMatrix3(worldToLocalNormalMatrix)
  if (outputLocalNormal.lengthSq() <= 0.000_001) return false
  outputLocalNormal.normalize()
  return true
}

export function ZombieEscapeBloodPresentation({
  events,
  getElapsedSeconds,
  filterEventsByVariant = false,
  ownsLifecycle = true,
  producerFramePriority,
  renderReadinessRegistry,
  resolveWorldAttachment,
  variant = DEFAULT_ZOMBIE_ESCAPE_BLOOD_VARIANT,
}: {
  events: ZombieEscapeBloodEventPool
  filterEventsByVariant?: boolean
  getElapsedSeconds: () => number
  ownsLifecycle?: boolean
  producerFramePriority: number
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  resolveWorldAttachment?: ZombieEscapeBloodWorldAttachmentResolver
  variant?: ZombieEscapeBloodVariant
}) {
  const rootRef = useRef<Group>(null)
  const splashRef = useRef<InstancedMesh>(null)
  const residueRef = useRef<InstancedMesh>(null)
  const dropletRef = useRef<InstancedMesh>(null)
  useZombieEscapeRenderRepresentative(renderReadinessRegistry, 'effect:blood', rootRef)
  const visible = useMemo(() => new Uint8Array(events.pool.capacity), [events])
  const previousElapsedRef = useRef(getElapsedSeconds())
  const profile = useMemo(() => getZombieEscapeBloodVariantProfile(variant), [variant])
  const priorities = useMemo(
    () => resolveZombieEscapeBloodFramePriorities(producerFramePriority),
    [producerFramePriority],
  )
  const dummy = useMemo(() => new Object3D(), [])
  const ballisticSample = useMemo(() => createZombieEscapeBallisticSample(), [])
  const previousBallisticSample = useMemo(() => createZombieEscapeBallisticSample(), [])
  const envelope = useMemo<ZombieEscapeBloodEnvelope>(
    () => ({ droplet: 0, normalizedAge: 0, residue: 0, splash: 0 }),
    [],
  )
  const worldImpactPoint = useMemo(() => new Vector3(), [])
  const worldImpactNormal = useMemo(() => new Vector3(), [])
  const impactPoint = useMemo(() => new Vector3(), [])
  const impactNormal = useMemo(() => new Vector3(), [])
  const attachedLocalPoint = useMemo(() => new Vector3(), [])
  const attachedLocalNormal = useMemo(() => new Vector3(), [])
  const flowDirection = useMemo(() => new Vector3(), [])
  const direction = useMemo(() => new Vector3(), [])
  const tangent = useMemo(() => new Vector3(), [])
  const bitangent = useMemo(() => new Vector3(), [])
  const quaternion = useMemo(() => new Quaternion(), [])
  const rollQuaternion = useMemo(() => new Quaternion(), [])
  const inverseWorldMatrix = useMemo(() => new Matrix4(), [])
  const worldToLocalNormalMatrix = useMemo(() => new Matrix3(), [])

  useLayoutEffect(() => {
    previousElapsedRef.current = getElapsedSeconds()
    if (rootRef.current) {
      rootRef.current.visible =
        !filterEventsByVariant && isZombieEscapeBloodPoolVisible(events.pool.activeCount)
    }
    for (const mesh of [splashRef.current, residueRef.current, dropletRef.current]) {
      mesh?.instanceMatrix.setUsage(DynamicDrawUsage)
    }
    for (let slot = 0; slot < events.pool.capacity; slot += 1) {
      hideZombieEscapeBloodEventInstances(
        slot,
        splashRef.current,
        residueRef.current,
        dropletRef.current,
        dummy,
      )
    }
    markInstanceMeshDirty(splashRef.current)
    markInstanceMeshDirty(residueRef.current)
    markInstanceMeshDirty(dropletRef.current)
  }, [dummy, events, filterEventsByVariant, getElapsedSeconds])

  useFrame(() => {
    if (!ownsLifecycle) return
    const elapsedSeconds = getElapsedSeconds()
    reconcileZombieEscapeBloodEventPool(events, elapsedSeconds, previousElapsedRef.current)
    previousElapsedRef.current = elapsedSeconds
  }, priorities.lifecycle)

  useFrame(() => {
    const elapsedSeconds = getElapsedSeconds()
    const root = rootRef.current
    root?.updateWorldMatrix(true, false)
    let splashDirty = false
    let residueDirty = false
    let dropletDirty = false
    let renderedEventCount = 0

    for (let eventSlot = 0; eventSlot < events.pool.capacity; eventSlot += 1) {
      const matchesVariant =
        !filterEventsByVariant ||
        doesZombieEscapeBloodEventMatchVariant(events.variantCode[eventSlot]!, profile.code)
      const action = resolveZombieEscapeBloodSlotAction(
        events.pool.active[eventSlot] !== 0 && matchesVariant,
        visible[eventSlot] !== 0,
      )
      if (action === 'idle') continue
      if (action === 'hide') {
        hideZombieEscapeBloodEventInstances(
          eventSlot,
          splashRef.current,
          residueRef.current,
          dropletRef.current,
          dummy,
        )
        visible[eventSlot] = 0
        splashDirty = true
        residueDirty = true
        dropletDirty = true
        continue
      }

      const age = elapsedSeconds - events.spawnElapsedSeconds[eventSlot]!
      if (!resolveZombieEscapeBloodEnvelope(age, envelope)) {
        hideZombieEscapeBloodEventInstances(
          eventSlot,
          splashRef.current,
          residueRef.current,
          dropletRef.current,
          dummy,
        )
        visible[eventSlot] = 0
        splashDirty = true
        residueDirty = true
        dropletDirty = true
        continue
      }

      impactPoint.set(
        events.originX[eventSlot]!,
        events.originY[eventSlot]!,
        events.originZ[eventSlot]!,
      )
      impactNormal.set(
        events.normalX[eventSlot]!,
        events.normalY[eventSlot]!,
        events.normalZ[eventSlot]!,
      )
      normalizeBloodDirection(impactNormal, Z_AXIS)
      flowDirection.set(
        events.directionX[eventSlot]!,
        events.directionY[eventSlot]!,
        events.directionZ[eventSlot]!,
      )
      if (flowDirection.lengthSq() <= 0.000_001) {
        flowDirection.copy(impactNormal).multiplyScalar(-1)
      } else {
        flowDirection.normalize()
      }
      resolveBloodTangentFrame(impactNormal, tangent, bitangent)
      const eventSeed = events.seed[eventSlot]!

      for (let splash = 0; splash < profile.splashCount; splash += 1) {
        const instance = eventSlot * ZOMBIE_ESCAPE_BLOOD_MAX_SPLASH_COUNT + splash
        const seed = deriveZombieEscapeBloodParticleSeed(eventSeed, 0, splash)
        const angle = zombieEscapeBloodHashUnit(seed) * TWO_PI
        const speedScale =
          variant === 'fine-mist'
            ? 1.42
            : variant === 'heavy-clots'
              ? 0.68
              : variant === 'surface-splat'
                ? 0.82
                : 1
        const radialSpeed = (0.7 + zombieEscapeBloodHashUnit(seed ^ 0x27d4_eb2f) * 1.1) * speedScale
        const outwardSpeed =
          (1.3 + zombieEscapeBloodHashUnit(seed ^ 0x1656_67b1) * 1.25) * speedScale
        const upwardSpeed =
          (0.15 + zombieEscapeBloodHashUnit(seed ^ 0xd3a2_646c) * 0.55) * speedScale
        const flowSpeed = 0.25 + zombieEscapeBloodHashUnit(seed ^ 0x94d0_49bb) * 0.45
        const radialX = tangent.x * Math.cos(angle) + bitangent.x * Math.sin(angle)
        const radialY = tangent.y * Math.cos(angle) + bitangent.y * Math.sin(angle)
        const radialZ = tangent.z * Math.cos(angle) + bitangent.z * Math.sin(angle)
        const velocityX =
          radialX * radialSpeed + impactNormal.x * outwardSpeed + flowDirection.x * flowSpeed
        const velocityY =
          radialY * radialSpeed +
          impactNormal.y * outwardSpeed +
          flowDirection.y * flowSpeed +
          upwardSpeed
        const velocityZ =
          radialZ * radialSpeed + impactNormal.z * outwardSpeed + flowDirection.z * flowSpeed
        const sampleAge = Math.min(age, 0.2)
        resolveZombieEscapeBallisticSample(
          impactPoint.x,
          impactPoint.y,
          impactPoint.z,
          impactNormal.x,
          impactNormal.y,
          impactNormal.z,
          0.035,
          velocityX,
          velocityY,
          velocityZ,
          7.6,
          sampleAge,
          ballisticSample,
        )
        if (variant === 'viscous-strings') {
          resolveZombieEscapeBallisticSample(
            impactPoint.x,
            impactPoint.y,
            impactPoint.z,
            impactNormal.x,
            impactNormal.y,
            impactNormal.z,
            0.035,
            velocityX,
            velocityY,
            velocityZ,
            7.6,
            Math.max(0, sampleAge - 0.055),
            previousBallisticSample,
          )
          direction.set(
            ballisticSample.x - previousBallisticSample.x,
            ballisticSample.y - previousBallisticSample.y,
            ballisticSample.z - previousBallisticSample.z,
          )
        } else {
          direction.set(
            ballisticSample.velocityX,
            ballisticSample.velocityY,
            ballisticSample.velocityZ,
          )
        }
        const segmentLength = direction.length()
        normalizeBloodDirection(direction, impactNormal)
        quaternion.setFromUnitVectors(Y_AXIS, direction)
        const splashUnit = zombieEscapeBloodHashUnit(seed ^ 0xfd70_46c5)
        const radius =
          (variant === 'fine-mist'
            ? 0.007 + splashUnit * 0.005
            : variant === 'heavy-clots'
              ? 0.028 + splashUnit * 0.014
              : variant === 'surface-splat'
                ? 0.018 + splashUnit * 0.009
                : variant === 'viscous-strings'
                  ? 0.014 + splashUnit * 0.008
                  : 0.022 + splashUnit * 0.012) * envelope.splash
        const instanceX =
          variant === 'viscous-strings'
            ? (ballisticSample.x + previousBallisticSample.x) * 0.5
            : ballisticSample.x
        const instanceY =
          variant === 'viscous-strings'
            ? (ballisticSample.y + previousBallisticSample.y) * 0.5
            : ballisticSample.y
        const instanceZ =
          variant === 'viscous-strings'
            ? (ballisticSample.z + previousBallisticSample.z) * 0.5
            : ballisticSample.z
        const lengthScale =
          variant === 'viscous-strings'
            ? Math.max(radius * 2.2, segmentLength)
            : radius *
              (variant === 'fine-mist'
                ? 6
                : variant === 'heavy-clots'
                  ? 1.3
                  : variant === 'surface-splat'
                    ? 3.2
                    : 3.2 + zombieEscapeBloodHashUnit(seed ^ 0xb55a_4f09) * 1.1)
        applyBloodInstance(
          splashRef.current,
          instance,
          dummy,
          instanceX,
          instanceY,
          instanceZ,
          quaternion,
          radius,
          lengthScale,
          radius,
        )
      }
      splashDirty = true

      for (let droplet = 0; droplet < profile.dropletCount; droplet += 1) {
        const instance = eventSlot * ZOMBIE_ESCAPE_BLOOD_MAX_DROPLET_COUNT + droplet
        const seed = deriveZombieEscapeBloodParticleSeed(eventSeed, 1, droplet)
        const angle = zombieEscapeBloodHashUnit(seed) * TWO_PI
        const speedScale =
          variant === 'fine-mist'
            ? 1.55
            : variant === 'heavy-clots'
              ? 0.7
              : variant === 'surface-splat'
                ? 0.58
                : variant === 'viscous-strings'
                  ? 0.88
                  : 1
        const radialSpeed =
          (0.5 + zombieEscapeBloodHashUnit(seed ^ 0x27d4_eb2f) * 1.45) * speedScale
        const outwardSpeed =
          (0.35 + zombieEscapeBloodHashUnit(seed ^ 0x1656_67b1) * 0.9) * speedScale
        const upwardSpeed =
          (0.25 + zombieEscapeBloodHashUnit(seed ^ 0xd3a2_646c) * 1.15) * speedScale
        const flowSpeed = 0.1 + zombieEscapeBloodHashUnit(seed ^ 0x94d0_49bb) * 0.3
        const radialX = tangent.x * Math.cos(angle) + bitangent.x * Math.sin(angle)
        const radialY = tangent.y * Math.cos(angle) + bitangent.y * Math.sin(angle)
        const radialZ = tangent.z * Math.cos(angle) + bitangent.z * Math.sin(angle)
        resolveZombieEscapeBallisticSample(
          impactPoint.x,
          impactPoint.y,
          impactPoint.z,
          impactNormal.x,
          impactNormal.y,
          impactNormal.z,
          0.03,
          radialX * radialSpeed + impactNormal.x * outwardSpeed + flowDirection.x * flowSpeed,
          radialY * radialSpeed +
            impactNormal.y * outwardSpeed +
            flowDirection.y * flowSpeed +
            upwardSpeed,
          radialZ * radialSpeed + impactNormal.z * outwardSpeed + flowDirection.z * flowSpeed,
          8.4,
          age,
          ballisticSample,
        )
        direction.set(
          ballisticSample.velocityX,
          ballisticSample.velocityY,
          ballisticSample.velocityZ,
        )
        normalizeBloodDirection(direction, impactNormal)
        quaternion.setFromUnitVectors(Y_AXIS, direction)
        const dropletUnit = zombieEscapeBloodHashUnit(seed ^ 0xfd70_46c5)
        const radius =
          (variant === 'fine-mist'
            ? 0.004 + dropletUnit * 0.005
            : variant === 'heavy-clots'
              ? 0.02 + dropletUnit * 0.015
              : variant === 'surface-splat'
                ? 0.012 + dropletUnit * 0.008
                : variant === 'viscous-strings'
                  ? 0.009 + dropletUnit * 0.009
                  : 0.009 + dropletUnit * 0.009) * envelope.droplet
        applyBloodInstance(
          dropletRef.current,
          instance,
          dummy,
          ballisticSample.x,
          ballisticSample.y,
          ballisticSample.z,
          quaternion,
          radius,
          radius *
            (variant === 'heavy-clots'
              ? 1.25
              : 1.7 + zombieEscapeBloodHashUnit(seed ^ 0xb55a_4f09) * 1.4),
          radius,
        )
      }
      dropletDirty = true

      if (
        root &&
        resolveWorldAttachment &&
        shouldAttachZombieEscapeBloodLayer('residue') &&
        resolveWorldAttachment(
          eventSlot,
          events.pool.generation[eventSlot]!,
          events.targetSlot[eventSlot]!,
          events.targetGeneration[eventSlot]!,
          worldImpactPoint,
          worldImpactNormal,
        ) &&
        transformZombieEscapeBloodWorldAttachmentToLocal(
          root.matrixWorld,
          worldImpactPoint,
          worldImpactNormal,
          attachedLocalPoint,
          attachedLocalNormal,
          inverseWorldMatrix,
          worldToLocalNormalMatrix,
        )
      ) {
        impactPoint.copy(attachedLocalPoint)
        impactNormal.copy(attachedLocalNormal)
        resolveBloodTangentFrame(impactNormal, tangent, bitangent)
      }

      for (let residue = 0; residue < profile.residueCount; residue += 1) {
        const instance = eventSlot * ZOMBIE_ESCAPE_BLOOD_MAX_RESIDUE_COUNT + residue
        const seed = deriveZombieEscapeBloodParticleSeed(eventSeed, 2, residue)
        const angle = zombieEscapeBloodHashUnit(seed) * TWO_PI
        const spreadScale = variant === 'surface-splat' ? 0.28 : variant === 'fine-mist' ? 0.68 : 1
        const spread =
          (0.03 + zombieEscapeBloodHashUnit(seed ^ 0xa511_e9b3) * 0.13) *
          spreadScale *
          Math.min(1, envelope.normalizedAge * 12)
        const scaleUnit = zombieEscapeBloodHashUnit(seed ^ 0x63d8_35f1)
        const scale =
          (variant === 'fine-mist'
            ? 0.02 + scaleUnit * 0.015
            : variant === 'surface-splat'
              ? 0.04 + scaleUnit * 0.02
              : variant === 'heavy-clots'
                ? 0.04 + scaleUnit * 0.02
                : 0.035 + scaleUnit * 0.02) * envelope.residue
        quaternion.setFromUnitVectors(Z_AXIS, impactNormal)
        rollQuaternion.setFromAxisAngle(Z_AXIS, angle)
        quaternion.multiply(rollQuaternion)
        applyBloodInstance(
          residueRef.current,
          instance,
          dummy,
          impactPoint.x +
            impactNormal.x * 0.007 +
            tangent.x * Math.cos(angle) * spread +
            bitangent.x * Math.sin(angle) * spread,
          impactPoint.y +
            impactNormal.y * 0.007 +
            tangent.y * Math.cos(angle) * spread +
            bitangent.y * Math.sin(angle) * spread,
          impactPoint.z +
            impactNormal.z * 0.007 +
            tangent.z * Math.cos(angle) * spread +
            bitangent.z * Math.sin(angle) * spread,
          quaternion,
          scale,
          scale * (0.62 + zombieEscapeBloodHashUnit(seed ^ 0xc2b2_ae35) * 0.28),
          1,
        )
      }
      residueDirty = true
      visible[eventSlot] = 1
      renderedEventCount += 1
    }

    if (root) root.visible = renderedEventCount > 0
    if (splashDirty) markInstanceMeshDirty(splashRef.current)
    if (residueDirty) markInstanceMeshDirty(residueRef.current)
    if (dropletDirty) markInstanceMeshDirty(dropletRef.current)
  }, priorities.presentation)

  return (
    <group
      ref={rootRef}
      userData={{
        allocation: 'fixed-capacity-instanced-blood-pool',
        capacity: events.pool.capacity,
        filterEventsByVariant,
        ownsLifecycle,
        perEventObjectAllocation: false,
        variant,
      }}
      visible={!filterEventsByVariant && isZombieEscapeBloodPoolVisible(events.pool.activeCount)}
    >
      <instancedMesh
        args={[undefined, undefined, events.pool.capacity * ZOMBIE_ESCAPE_BLOOD_MAX_SPLASH_COUNT]}
        frustumCulled={false}
        ref={splashRef}
      >
        <BloodSplashGeometry profile={profile} />
        <meshStandardMaterial color="#a50d27" metalness={0} roughness={0.2} />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, events.pool.capacity * ZOMBIE_ESCAPE_BLOOD_MAX_RESIDUE_COUNT]}
        frustumCulled={false}
        ref={residueRef}
      >
        <shapeGeometry args={[BLOOD_STAIN_SHAPE]} />
        <meshStandardMaterial
          color="#650612"
          metalness={0}
          polygonOffset
          polygonOffsetFactor={-2}
          roughness={0.3}
          side={DoubleSide}
        />
      </instancedMesh>
      <instancedMesh
        args={[undefined, undefined, events.pool.capacity * ZOMBIE_ESCAPE_BLOOD_MAX_DROPLET_COUNT]}
        frustumCulled={false}
        ref={dropletRef}
      >
        <BloodDropletGeometry profile={profile} />
        <meshStandardMaterial color="#8e0a20" metalness={0} roughness={0.16} />
      </instancedMesh>
    </group>
  )
}

function BloodSplashGeometry({ profile }: { profile: ZombieEscapeBloodVariantProfile }) {
  if (profile.splashGeometry === 'fan') return <coneGeometry args={[0.68, 1, 7, 1, true]} />
  if (profile.splashGeometry === 'clot') return <dodecahedronGeometry args={[1, 0]} />
  if (profile.splashGeometry === 'needle') return <capsuleGeometry args={[0.3, 0.72, 2, 5]} />
  if (profile.splashGeometry === 'string') return <capsuleGeometry args={[0.46, 0.16, 3, 6]} />
  return <coneGeometry args={[0.52, 1, 6, 1, true]} />
}

function BloodDropletGeometry({ profile }: { profile: ZombieEscapeBloodVariantProfile }) {
  if (profile.dropletGeometry === 'tetrahedron') return <tetrahedronGeometry args={[1, 0]} />
  if (profile.dropletGeometry === 'dodecahedron') return <dodecahedronGeometry args={[1, 0]} />
  return <icosahedronGeometry args={[1, 0]} />
}

function createBloodStainShape() {
  const shape = new Shape()
  const radii = [0.9, 1.12, 0.84, 1.03, 0.78, 1.08, 0.88, 1.15, 0.82, 1.05, 0.76, 1.1]
  for (let index = 0; index < radii.length; index += 1) {
    const angle = (index / radii.length) * TWO_PI
    const radius = radii[index]!
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    if (index === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return shape
}

function resolveBloodTangentFrame(normal: Vector3, tangent: Vector3, bitangent: Vector3) {
  if (Math.abs(normal.y) < 0.92) tangent.crossVectors(Y_AXIS, normal).normalize()
  else tangent.crossVectors(Z_AXIS, normal).normalize()
  bitangent.crossVectors(normal, tangent).normalize()
}

function normalizeBloodDirection(direction: Vector3, fallback: Vector3) {
  if (direction.lengthSq() <= 0.000_001) direction.copy(fallback)
  else direction.normalize()
}

function applyBloodInstance(
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

function hideZombieEscapeBloodEventInstances(
  eventSlot: number,
  splashMesh: InstancedMesh | null,
  residueMesh: InstancedMesh | null,
  dropletMesh: InstancedMesh | null,
  dummy: Object3D,
) {
  for (let splash = 0; splash < ZOMBIE_ESCAPE_BLOOD_MAX_SPLASH_COUNT; splash += 1) {
    hideBloodInstance(splashMesh, eventSlot * ZOMBIE_ESCAPE_BLOOD_MAX_SPLASH_COUNT + splash, dummy)
  }
  for (let residue = 0; residue < ZOMBIE_ESCAPE_BLOOD_MAX_RESIDUE_COUNT; residue += 1) {
    hideBloodInstance(
      residueMesh,
      eventSlot * ZOMBIE_ESCAPE_BLOOD_MAX_RESIDUE_COUNT + residue,
      dummy,
    )
  }
  for (let droplet = 0; droplet < ZOMBIE_ESCAPE_BLOOD_MAX_DROPLET_COUNT; droplet += 1) {
    hideBloodInstance(
      dropletMesh,
      eventSlot * ZOMBIE_ESCAPE_BLOOD_MAX_DROPLET_COUNT + droplet,
      dummy,
    )
  }
}

function hideBloodInstance(mesh: InstancedMesh | null, index: number, dummy: Object3D) {
  if (!mesh) return
  dummy.position.set(0, HIDDEN_Y, 0)
  dummy.quaternion.identity()
  dummy.scale.set(0, 0, 0)
  dummy.updateMatrix()
  mesh.setMatrixAt(index, dummy.matrix)
}

function markInstanceMeshDirty(mesh: InstancedMesh | null) {
  if (mesh) mesh.instanceMatrix.needsUpdate = true
}
