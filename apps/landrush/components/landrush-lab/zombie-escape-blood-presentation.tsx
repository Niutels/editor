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
  Vector3,
} from 'three'
import {
  deriveZombieEscapeBloodParticleSeed,
  reconcileZombieEscapeBloodEventPool,
  resolveZombieEscapeBloodEnvelope,
  ZOMBIE_ESCAPE_BLOOD_EFFECT,
  type ZombieEscapeBloodEnvelope,
  type ZombieEscapeBloodEventPool,
  zombieEscapeBloodHashUnit,
} from './zombie-escape-blood-effects'
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
  producerFramePriority,
  renderReadinessRegistry,
  resolveWorldAttachment,
}: {
  events: ZombieEscapeBloodEventPool
  getElapsedSeconds: () => number
  producerFramePriority: number
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  resolveWorldAttachment?: ZombieEscapeBloodWorldAttachmentResolver
}) {
  const rootRef = useRef<Group>(null)
  const splashRef = useRef<InstancedMesh>(null)
  const residueRef = useRef<InstancedMesh>(null)
  const dropletRef = useRef<InstancedMesh>(null)
  useZombieEscapeRenderRepresentative(renderReadinessRegistry, 'effect:blood', rootRef)
  const visible = useMemo(() => new Uint8Array(events.pool.capacity), [events])
  const previousElapsedRef = useRef(getElapsedSeconds())
  const priorities = useMemo(
    () => resolveZombieEscapeBloodFramePriorities(producerFramePriority),
    [producerFramePriority],
  )
  const dummy = useMemo(() => new Object3D(), [])
  const ballisticSample = useMemo(() => createZombieEscapeBallisticSample(), [])
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
      rootRef.current.visible = isZombieEscapeBloodPoolVisible(events.pool.activeCount)
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
  }, [dummy, events, getElapsedSeconds])

  useFrame(() => {
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

    for (let eventSlot = 0; eventSlot < events.pool.capacity; eventSlot += 1) {
      const action = resolveZombieEscapeBloodSlotAction(
        events.pool.active[eventSlot] !== 0,
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

      for (let splash = 0; splash < ZOMBIE_ESCAPE_BLOOD_EFFECT.splashLobesPerEvent; splash += 1) {
        const instance = eventSlot * ZOMBIE_ESCAPE_BLOOD_EFFECT.splashLobesPerEvent + splash
        const seed = deriveZombieEscapeBloodParticleSeed(eventSeed, 0, splash)
        const angle = zombieEscapeBloodHashUnit(seed) * TWO_PI
        const radialSpeed = 0.7 + zombieEscapeBloodHashUnit(seed ^ 0x27d4_eb2f) * 1.1
        const outwardSpeed = 1.3 + zombieEscapeBloodHashUnit(seed ^ 0x1656_67b1) * 1.25
        const upwardSpeed = 0.15 + zombieEscapeBloodHashUnit(seed ^ 0xd3a2_646c) * 0.55
        const flowSpeed = 0.25 + zombieEscapeBloodHashUnit(seed ^ 0x94d0_49bb) * 0.45
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
          0.035,
          radialX * radialSpeed + impactNormal.x * outwardSpeed + flowDirection.x * flowSpeed,
          radialY * radialSpeed +
            impactNormal.y * outwardSpeed +
            flowDirection.y * flowSpeed +
            upwardSpeed,
          radialZ * radialSpeed + impactNormal.z * outwardSpeed + flowDirection.z * flowSpeed,
          7.6,
          Math.min(age, 0.2),
          ballisticSample,
        )
        direction.set(
          ballisticSample.velocityX,
          ballisticSample.velocityY,
          ballisticSample.velocityZ,
        )
        normalizeBloodDirection(direction, impactNormal)
        quaternion.setFromUnitVectors(Y_AXIS, direction)
        const radius =
          (0.045 + zombieEscapeBloodHashUnit(seed ^ 0xfd70_46c5) * 0.025) * envelope.splash
        applyBloodInstance(
          splashRef.current,
          instance,
          dummy,
          ballisticSample.x,
          ballisticSample.y,
          ballisticSample.z,
          quaternion,
          radius,
          radius * (2.8 + zombieEscapeBloodHashUnit(seed ^ 0xb55a_4f09) * 1.8),
          radius,
        )
      }
      splashDirty = true

      for (let droplet = 0; droplet < ZOMBIE_ESCAPE_BLOOD_EFFECT.dropletsPerEvent; droplet += 1) {
        const instance = eventSlot * ZOMBIE_ESCAPE_BLOOD_EFFECT.dropletsPerEvent + droplet
        const seed = deriveZombieEscapeBloodParticleSeed(eventSeed, 1, droplet)
        const angle = zombieEscapeBloodHashUnit(seed) * TWO_PI
        const radialSpeed = 0.5 + zombieEscapeBloodHashUnit(seed ^ 0x27d4_eb2f) * 1.45
        const outwardSpeed = 0.35 + zombieEscapeBloodHashUnit(seed ^ 0x1656_67b1) * 0.9
        const upwardSpeed = 0.25 + zombieEscapeBloodHashUnit(seed ^ 0xd3a2_646c) * 1.15
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
        const radius =
          (0.022 + zombieEscapeBloodHashUnit(seed ^ 0xfd70_46c5) * 0.024) * envelope.droplet
        applyBloodInstance(
          dropletRef.current,
          instance,
          dummy,
          ballisticSample.x,
          ballisticSample.y,
          ballisticSample.z,
          quaternion,
          radius,
          radius * (1.7 + zombieEscapeBloodHashUnit(seed ^ 0xb55a_4f09) * 1.4),
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

      for (
        let residue = 0;
        residue < ZOMBIE_ESCAPE_BLOOD_EFFECT.residueBlotsPerEvent;
        residue += 1
      ) {
        const instance = eventSlot * ZOMBIE_ESCAPE_BLOOD_EFFECT.residueBlotsPerEvent + residue
        const seed = deriveZombieEscapeBloodParticleSeed(eventSeed, 2, residue)
        const angle = zombieEscapeBloodHashUnit(seed) * TWO_PI
        const spread =
          (0.03 + zombieEscapeBloodHashUnit(seed ^ 0xa511_e9b3) * 0.13) *
          Math.min(1, envelope.normalizedAge * 12)
        const scale =
          (0.12 + zombieEscapeBloodHashUnit(seed ^ 0x63d8_35f1) * 0.085) * envelope.residue
        quaternion.setFromUnitVectors(Z_AXIS, impactNormal)
        rollQuaternion.setFromAxisAngle(Z_AXIS, angle)
        quaternion.multiply(rollQuaternion)
        applyBloodInstance(
          residueRef.current,
          instance,
          dummy,
          impactPoint.x +
            impactNormal.x * 0.028 +
            tangent.x * Math.cos(angle) * spread +
            bitangent.x * Math.sin(angle) * spread,
          impactPoint.y +
            impactNormal.y * 0.028 +
            tangent.y * Math.cos(angle) * spread +
            bitangent.y * Math.sin(angle) * spread,
          impactPoint.z +
            impactNormal.z * 0.028 +
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
    }

    if (root) root.visible = isZombieEscapeBloodPoolVisible(events.pool.activeCount)
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
        perEventObjectAllocation: false,
      }}
      visible={isZombieEscapeBloodPoolVisible(events.pool.activeCount)}
    >
      <instancedMesh
        args={[
          undefined,
          undefined,
          events.pool.capacity * ZOMBIE_ESCAPE_BLOOD_EFFECT.splashLobesPerEvent,
        ]}
        frustumCulled={false}
        ref={splashRef}
      >
        <coneGeometry args={[0.55, 1, 5, 1, true]} />
        <meshBasicMaterial
          color="#d62d4f"
          depthWrite={false}
          opacity={0.88}
          toneMapped={false}
          transparent
        />
      </instancedMesh>
      <instancedMesh
        args={[
          undefined,
          undefined,
          events.pool.capacity * ZOMBIE_ESCAPE_BLOOD_EFFECT.residueBlotsPerEvent,
        ]}
        frustumCulled={false}
        ref={residueRef}
      >
        <circleGeometry args={[1, 7]} />
        <meshBasicMaterial
          color="#85162d"
          depthWrite={false}
          opacity={0.82}
          side={DoubleSide}
          toneMapped={false}
          transparent
        />
      </instancedMesh>
      <instancedMesh
        args={[
          undefined,
          undefined,
          events.pool.capacity * ZOMBIE_ESCAPE_BLOOD_EFFECT.dropletsPerEvent,
        ]}
        frustumCulled={false}
        ref={dropletRef}
      >
        <dodecahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color="#bd2445" depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </group>
  )
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
  for (let splash = 0; splash < ZOMBIE_ESCAPE_BLOOD_EFFECT.splashLobesPerEvent; splash += 1) {
    hideBloodInstance(
      splashMesh,
      eventSlot * ZOMBIE_ESCAPE_BLOOD_EFFECT.splashLobesPerEvent + splash,
      dummy,
    )
  }
  for (let residue = 0; residue < ZOMBIE_ESCAPE_BLOOD_EFFECT.residueBlotsPerEvent; residue += 1) {
    hideBloodInstance(
      residueMesh,
      eventSlot * ZOMBIE_ESCAPE_BLOOD_EFFECT.residueBlotsPerEvent + residue,
      dummy,
    )
  }
  for (let droplet = 0; droplet < ZOMBIE_ESCAPE_BLOOD_EFFECT.dropletsPerEvent; droplet += 1) {
    hideBloodInstance(
      dropletMesh,
      eventSlot * ZOMBIE_ESCAPE_BLOOD_EFFECT.dropletsPerEvent + droplet,
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
