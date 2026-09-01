'use client'

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  DoubleSide,
  Euler,
  type InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  NormalBlending,
  Quaternion,
  StaticDrawUsage,
  Vector3,
} from 'three'
import type { LandrushZombieNightBeaconRuntime } from './landrush-zombie-night-presentation-runtime'
import {
  LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS,
  LANDRUSH_ZOMBIE_NIGHT_GLOW_DRAW_CALL_BUDGET,
  type LandrushZombieNightBeaconPlacement,
} from './landrush-zombie-night-presentation-state'
import { LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAMP_POSITION } from './landrush-zombie-night-street-lightpost'

const LANDRUSH_ZOMBIE_NIGHT_GLOW_RADII = Object.freeze({
  core: 0.16,
  inner: 0.34,
  outer: 0.62,
})

export function LandrushZombieNightBeaconGlowInstances({
  placements,
  runtime,
}: {
  placements: readonly LandrushZombieNightBeaconPlacement[]
  runtime: LandrushZombieNightBeaconRuntime
}) {
  const resources = useMemo(createGlowResources, [])
  const colors = useMemo(() => placements.map(({ color }) => new Color(color)), [placements])
  const coreMatrices = useMemo(
    () => createGlowInstanceMatrices(placements, LANDRUSH_ZOMBIE_NIGHT_GLOW_RADII.core),
    [placements],
  )
  const innerMatrices = useMemo(
    () => createGlowInstanceMatrices(placements, LANDRUSH_ZOMBIE_NIGHT_GLOW_RADII.inner),
    [placements],
  )
  const outerMatrices = useMemo(
    () => createGlowInstanceMatrices(placements, LANDRUSH_ZOMBIE_NIGHT_GLOW_RADII.outer),
    [placements],
  )
  const coreRef = useRef<InstancedMesh>(null)
  const innerRef = useRef<InstancedMesh>(null)
  const outerRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    populateGlowInstances(coreRef.current, coreMatrices, colors)
    populateGlowInstances(innerRef.current, innerMatrices, colors)
    populateGlowInstances(outerRef.current, outerMatrices, colors)
  }, [colors, coreMatrices, innerMatrices, outerMatrices])

  useLayoutEffect(() => {
    runtime.coreMaterial = resources.coreMaterial
    runtime.innerGlowMaterial = resources.innerMaterial
    runtime.outerGlowMaterial = resources.outerMaterial
    runtime.lastEnvelope = Number.NaN
    return () => {
      if (runtime.coreMaterial === resources.coreMaterial) runtime.coreMaterial = null
      if (runtime.innerGlowMaterial === resources.innerMaterial) runtime.innerGlowMaterial = null
      if (runtime.outerGlowMaterial === resources.outerMaterial) runtime.outerGlowMaterial = null
    }
  }, [resources, runtime])

  useEffect(
    () => () => {
      resources.geometry.dispose()
      resources.coreMaterial.dispose()
      resources.innerMaterial.dispose()
      resources.outerMaterial.dispose()
    },
    [resources],
  )

  if (placements.length === 0) return null

  const userData = {
    drawCallBudget: LANDRUSH_ZOMBIE_NIGHT_GLOW_DRAW_CALL_BUDGET,
    instanceBudget: LANDRUSH_ZOMBIE_NIGHT_BEACON_COUNTS.high,
    landrushZombieNight: true,
    placementScan: 'setup-only',
  }

  return (
    <>
      <instancedMesh
        args={[resources.geometry, resources.coreMaterial, placements.length]}
        dispose={null}
        frustumCulled={false}
        name="landrush-zombie-night-beacon-glow-core"
        ref={coreRef}
        renderOrder={31}
        userData={userData}
      />
      <instancedMesh
        args={[resources.geometry, resources.innerMaterial, placements.length]}
        dispose={null}
        frustumCulled={false}
        name="landrush-zombie-night-beacon-glow-inner"
        ref={innerRef}
        renderOrder={30}
        userData={userData}
      />
      <instancedMesh
        args={[resources.geometry, resources.outerMaterial, placements.length]}
        dispose={null}
        frustumCulled={false}
        name="landrush-zombie-night-beacon-glow-outer"
        ref={outerRef}
        renderOrder={29}
        userData={userData}
      />
    </>
  )
}

function createGlowResources() {
  const geometry = new CircleGeometry(1, 16)
  const coreMaterial = createGlowMaterial(false)
  const innerMaterial = createGlowMaterial(true)
  const outerMaterial = createGlowMaterial(true)
  return { coreMaterial, geometry, innerMaterial, outerMaterial }
}

function createGlowMaterial(additive: boolean) {
  const material = new MeshBasicMaterial({
    blending: additive ? AdditiveBlending : NormalBlending,
    color: '#ffffff',
    depthWrite: false,
    opacity: 0,
    side: DoubleSide,
    transparent: true,
  })
  material.toneMapped = false
  return material
}

function createGlowInstanceMatrices(
  placements: readonly LandrushZombieNightBeaconPlacement[],
  radius: number,
) {
  const lampMatrix = new Matrix4().compose(
    new Vector3(...LANDRUSH_ZOMBIE_NIGHT_STREET_LIGHTPOST_LAMP_POSITION),
    new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0)),
    new Vector3(radius, radius, radius),
  )
  return placements.map((placement) =>
    new Matrix4()
      .compose(
        new Vector3(...placement.position),
        new Quaternion().setFromEuler(new Euler(0, placement.rotationY, 0)),
        new Vector3(1, 1, 1),
      )
      .multiply(lampMatrix),
  )
}

function populateGlowInstances(
  mesh: InstancedMesh | null,
  matrices: readonly Matrix4[],
  colors: readonly Color[],
) {
  if (!mesh) return
  mesh.count = matrices.length
  mesh.instanceMatrix.setUsage(StaticDrawUsage)
  for (let index = 0; index < matrices.length; index += 1) {
    mesh.setMatrixAt(index, matrices[index]!)
    mesh.setColorAt(index, colors[index]!)
  }
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) {
    mesh.instanceColor.setUsage(StaticDrawUsage)
    mesh.instanceColor.needsUpdate = true
  }
}
