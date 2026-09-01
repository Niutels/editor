'use client'

import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo, useRef } from 'react'
import {
  Euler,
  type InstancedMesh,
  Matrix4,
  type Mesh,
  type Object3D,
  Quaternion,
  StaticDrawUsage,
  Vector3,
} from 'three'
import type { LandrushZombieNightBeaconPlacement } from './landrush-zombie-night-presentation-state'
import {
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_ASSET_PATH,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_MODEL_POSITION,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_MODEL_ROTATION_Y,
  LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_MODEL_SCALE,
} from './landrush-zombie-night-street-lightpost'

export const LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_INSTANCE_DRAW_CALL_BUDGET = 1

export function LandrushZombieNightStreetLightpostInstances({
  placements,
}: {
  placements: readonly LandrushZombieNightBeaconPlacement[]
}) {
  const { scene } = useGLTF(LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_ASSET_PATH)
  const sourceMesh = useMemo(() => readStreetLightpostSourceMesh(scene), [scene])
  const matrices = useMemo(
    () => createStreetLightpostInstanceMatrices(placements, sourceMesh),
    [placements, sourceMesh],
  )
  const meshRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.instanceMatrix.setUsage(StaticDrawUsage)
    mesh.count = matrices.length
    for (let index = 0; index < matrices.length; index += 1) {
      mesh.setMatrixAt(index, matrices[index]!)
    }
    mesh.instanceMatrix.needsUpdate = true
  }, [matrices])

  if (matrices.length === 0) return null

  return (
    <instancedMesh
      args={[sourceMesh.geometry, sourceMesh.material, matrices.length]}
      castShadow={false}
      dispose={null}
      frustumCulled={false}
      name="landrush-zombie-night-street-lightposts"
      receiveShadow={false}
      ref={meshRef}
      userData={{
        drawCallBudget: LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_INSTANCE_DRAW_CALL_BUDGET,
        landrushZombieNight: true,
        placementScan: 'setup-only',
      }}
    />
  )
}

function readStreetLightpostSourceMesh(scene: Object3D) {
  scene.updateMatrixWorld(true)
  const sourceMeshes: Mesh[] = []
  scene.traverse((object) => {
    if ((object as Mesh).isMesh) sourceMeshes.push(object as Mesh)
  })
  if (sourceMeshes.length !== 1) {
    throw new Error(
      `Street-lightpost instancing contract requires exactly one renderable mesh; received ${sourceMeshes.length}.`,
    )
  }
  return sourceMeshes[0]!
}

function createStreetLightpostInstanceMatrices(
  placements: readonly LandrushZombieNightBeaconPlacement[],
  sourceMesh: Mesh,
) {
  const sourceMatrix = sourceMesh.matrixWorld.clone()
  const modelMatrix = new Matrix4().compose(
    new Vector3(...LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_MODEL_POSITION),
    new Quaternion().setFromEuler(
      new Euler(0, LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_MODEL_ROTATION_Y, 0),
    ),
    new Vector3(...LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_MODEL_SCALE),
  )
  return placements.map((placement) =>
    new Matrix4()
      .compose(
        new Vector3(...placement.position),
        new Quaternion().setFromEuler(new Euler(0, placement.rotationY, 0)),
        new Vector3(1, 1, 1),
      )
      .multiply(modelMatrix)
      .multiply(sourceMatrix),
  )
}

useGLTF.preload(LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_ASSET_PATH)
