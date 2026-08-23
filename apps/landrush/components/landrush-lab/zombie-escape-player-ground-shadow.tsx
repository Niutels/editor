'use client'

import { useFrame } from '@react-three/fiber'
import { type MutableRefObject, useMemo, useRef } from 'react'
import type { Mesh, MeshBasicMaterial } from 'three'
import {
  resolveZombieEscapeGroundShadowEnvelope,
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
  color = '#12131a',
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

  useFrame(() => {
    const mesh = meshRef.current
    const material = materialRef.current
    if (!(mesh && material)) return
    const pose = poseRef.current
    const visible = pose.visible !== false && Number.isFinite(pose.x) && Number.isFinite(pose.z)
    mesh.visible = visible
    if (!visible) return

    resolveZombieEscapeGroundShadowEnvelope(pose.playerY, pose.supportY, envelope)
    mesh.position.set(pose.x, envelope.y, pose.z)
    mesh.scale.setScalar(envelope.radius)
    material.opacity = envelope.opacity
  }, framePriority)

  return (
    <mesh
      ref={meshRef}
      renderOrder={1}
      rotation={[-Math.PI / 2, 0, 0]}
      userData={{ anchor: 'support-plane', role: 'player-ground-shadow' }}
    >
      <circleGeometry args={[1, 32]} />
      <meshBasicMaterial
        color={color}
        depthWrite={false}
        opacity={0}
        polygonOffset
        polygonOffsetFactor={-1}
        transparent
      />
    </mesh>
  )
}
