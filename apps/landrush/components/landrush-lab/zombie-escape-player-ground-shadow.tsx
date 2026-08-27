'use client'

import { useFrame } from '@react-three/fiber'
import { type MutableRefObject, useEffect, useMemo, useRef } from 'react'
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  type Mesh,
  type MeshBasicMaterial,
  RGBAFormat,
  UnsignedByteType,
} from 'three'
import {
  createZombieEscapeGroundShadowAlphaMapData,
  resolveZombieEscapeGroundShadowEnvelope,
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
  const alphaMap = useMemo(() => {
    const { data, size } = createZombieEscapeGroundShadowAlphaMapData()
    const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
    texture.magFilter = LinearFilter
    texture.minFilter = LinearFilter
    texture.wrapS = ClampToEdgeWrapping
    texture.wrapT = ClampToEdgeWrapping
    texture.needsUpdate = true
    return texture
  }, [])

  useEffect(() => () => alphaMap.dispose(), [alphaMap])

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
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial
        alphaMap={alphaMap}
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
