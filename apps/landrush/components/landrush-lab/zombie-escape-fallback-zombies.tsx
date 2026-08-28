'use client'

import { useFrame } from '@react-three/fiber'
import { type MutableRefObject, useMemo, useRef } from 'react'
import { type Group, type InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three'
import {
  ZOMBIE_ESCAPE_FALLBACK_RENDER_REPRESENTATIVE_KEY,
  type ZombieEscapeRenderReadinessRegistry,
} from './zombie-escape-render-readiness'
import { useZombieEscapeRenderRepresentative } from './zombie-escape-render-readiness-react'
import type { ZombieEscapeSimulation } from './zombie-escape-simulation'

export function shouldRenderZombieEscapeFallback(
  active: number,
  variant: number,
  presentationReadyVariants: ReadonlySet<number>,
) {
  return active !== 0 && !presentationReadyVariants.has(variant)
}

export function ZombieEscapeFallbackZombies({
  framePriority,
  presentationReadyVariantsRef,
  renderReadinessRegistry,
  simulationRef,
}: {
  framePriority: number
  presentationReadyVariantsRef: MutableRefObject<Set<number>>
  renderReadinessRegistry?: ZombieEscapeRenderReadinessRegistry
  simulationRef: MutableRefObject<ZombieEscapeSimulation>
}) {
  const rootRef = useRef<Group>(null)
  const instancesRef = useRef<InstancedMesh>(null)
  const capacity = simulationRef.current.zombies.pool.capacity
  const scratch = useMemo(
    () => ({
      matrix: new Matrix4(),
      position: new Vector3(),
      quaternion: new Quaternion(),
      fall: new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI * 0.48),
      scale: new Vector3(0.78, 0.94, 0.72),
      up: new Vector3(0, 1, 0),
    }),
    [],
  )

  useZombieEscapeRenderRepresentative(
    renderReadinessRegistry,
    ZOMBIE_ESCAPE_FALLBACK_RENDER_REPRESENTATIVE_KEY,
    rootRef,
  )

  useFrame(() => {
    const instances = instancesRef.current
    if (!instances) return
    const zombies = simulationRef.current.zombies
    const readyVariants = presentationReadyVariantsRef.current
    let count = 0
    for (let slot = 0; slot < zombies.pool.capacity; slot += 1) {
      const variant = zombies.variant[slot] ?? 0
      if (
        !shouldRenderZombieEscapeFallback(zombies.pool.active[slot] ?? 0, variant, readyVariants)
      ) {
        continue
      }

      scratch.position.set(
        zombies.x[slot] ?? 0,
        (zombies.y[slot] ?? 0) + 0.82,
        zombies.z[slot] ?? 0,
      )
      scratch.quaternion.setFromAxisAngle(scratch.up, zombies.heading[slot] ?? 0)
      if ((zombies.health[slot] ?? 0) <= 0) {
        scratch.quaternion.multiply(scratch.fall)
        scratch.position.y = (zombies.y[slot] ?? 0) + 0.34
      }
      scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale)
      instances.setMatrixAt(count, scratch.matrix)
      count += 1
    }
    instances.count = count
    instances.instanceMatrix.needsUpdate = true
  }, framePriority)

  return (
    <group ref={rootRef} userData={{ role: 'zombie-fallback-presentation' }}>
      <instancedMesh
        args={[undefined, undefined, capacity]}
        frustumCulled={false}
        ref={instancesRef}
      >
        <capsuleGeometry args={[0.38, 0.95, 2, 6]} />
        <meshBasicMaterial color="#75a89c" />
      </instancedMesh>
    </group>
  )
}
