'use client'

import { useFrame } from '@react-three/fiber'
import { type MutableRefObject, useMemo, useRef } from 'react'
import type { Mesh, MeshBasicMaterial } from 'three'
import {
  resolveZombieEscapeGroundShadowEnvelope,
  resolveZombieEscapeGroundShadowMovementRotation,
  resolveZombieEscapeGroundShadowRenderSupportY,
  ZOMBIE_ESCAPE_GROUND_SHADOW,
  type ZombieEscapeGroundShadowEnvelope,
} from './zombie-escape-ground-shadow'

export type ZombieEscapePlayerGroundShadowPose = {
  playerY: number
  supportY: number
  visible?: boolean
  x: number
  z: number
}

export function ZombieEscapePlayerGroundShadow({
  color = '#050609',
  framePriority = -15,
  poseRef,
}: {
  color?: string
  framePriority?: number
  poseRef: MutableRefObject<ZombieEscapePlayerGroundShadowPose>
}) {
  const meshRef = useRef<Mesh>(null)
  const materialRef = useRef<MeshBasicMaterial>(null)
  const envelope = useMemo<ZombieEscapeGroundShadowEnvelope>(
    () => ({ altitude: 0, opacity: 0, radius: 0, y: 0 }),
    [],
  )
  const lastSupportYRef = useRef(poseRef.current.supportY)
  const lastPositionRef = useRef({ x: poseRef.current.x, z: poseRef.current.z })
  const movementRotationRef = useRef(0)

  useFrame((_, deltaSeconds) => {
    const mesh = meshRef.current
    const material = materialRef.current
    if (!(mesh && material)) return
    const pose = poseRef.current
    if (Number.isFinite(pose.x) && Number.isFinite(pose.z)) {
      const previousPosition = lastPositionRef.current
      movementRotationRef.current = resolveZombieEscapeGroundShadowMovementRotation({
        currentRotation: movementRotationRef.current,
        deltaSeconds,
        deltaX: pose.x - previousPosition.x,
        deltaZ: pose.z - previousPosition.z,
      })
      previousPosition.x = pose.x
      previousPosition.z = pose.z
    }
    const projectedVisible = pose.visible !== false
    const supportY = resolveZombieEscapeGroundShadowRenderSupportY({
      lastSupportY: lastSupportYRef.current,
      playerY: pose.playerY,
      projectedSupportY: pose.supportY,
      projectedVisible,
    })
    if (projectedVisible && Number.isFinite(pose.supportY)) {
      lastSupportYRef.current = pose.supportY
    }
    const visible = supportY !== null && Number.isFinite(pose.x) && Number.isFinite(pose.z)
    mesh.visible = visible
    if (!visible) return

    resolveZombieEscapeGroundShadowEnvelope(pose.playerY, supportY, envelope)
    mesh.position.set(pose.x, envelope.y, pose.z)
    mesh.rotation.z = movementRotationRef.current
    mesh.scale.set(envelope.radius, envelope.radius * ZOMBIE_ESCAPE_GROUND_SHADOW.aspectRatio, 1)
    material.opacity = envelope.opacity
  }, framePriority)

  return (
    <mesh
      ref={meshRef}
      renderOrder={1}
      rotation={[-Math.PI / 2, 0, 0]}
      userData={{ anchor: 'support-plane', role: 'player-ground-shadow' }}
    >
      <circleGeometry args={[1, 40]} />
      <meshBasicMaterial
        ref={materialRef}
        color={color}
        depthTest
        depthWrite={false}
        opacity={0}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
        toneMapped={false}
        transparent
      />
    </mesh>
  )
}
